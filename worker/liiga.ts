import { computeLeaderboard, getActiveSeason, helsinkiDate } from './data';

const BASE = 'https://liiga.fi/api/v2';
const HEADERS = { 'User-Agent': 'HogiGuru/1.0 (+https://guru.konderi.fi)', Accept: 'application/json' };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type ApiPlayer = Record<string, any>;

async function chunked(db: D1Database, stmts: D1PreparedStatement[], size = 80) {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}

/** Pelkkä ottelulokin täydennys (cron-ajot tilastopäivitysten välissä → historia täyttyy nopeasti). */
export async function syncGamesOnly(db: D1Database): Promise<number> {
  const season = await getActiveSeason(db);
  if (!season) return 0;
  const n = await syncGames(db, season.liiga_season);
  const p = await syncGames(db, season.liiga_season, 12, 'playoffs').catch(() => 0);
  return n + p;
}

/** Hakee pelaajat, maalivahdit ja sarjataulukon liiga.fi:stä ja päivittää kannan. */
export async function syncLiiga(db: D1Database): Promise<string> {
  const started = new Date().toISOString();
  const log = await db.prepare('INSERT INTO sync_log (started_at) VALUES (?) RETURNING id').bind(started).first<{ id: number }>();
  try {
    const season = await getActiveSeason(db);
    if (!season) throw new Error('Ei aktiivista kautta');
    const y = season.liiga_season;
    const [skaters, goalies, standings] = await Promise.all([
      getJson<ApiPlayer[]>(`${BASE}/players/stats/summed/${y}/${y}/runkosarja/true?dataType=basicStats`),
      getJson<ApiPlayer[]>(`${BASE}/players/stats/summed/${y}/${y}/runkosarja/true?dataType=basicStatsGk`),
      getJson<{ season: ApiPlayer[] }>(`${BASE}/standings/?season=${y}`),
    ]);
    const now = new Date().toISOString();
    const stmts: D1PreparedStatement[] = [];

    for (const t of standings.season ?? []) {
      const id = String(t.teamId);
      stmts.push(db.prepare(
        `INSERT INTO teams (id, name, short_name, logo) VALUES (?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, logo=excluded.logo`,
      ).bind(id, t.teamName, t.teamShortName ?? null, t.teamLogos?.darkBg ?? null));
      stmts.push(db.prepare(
        `INSERT OR REPLACE INTO standings (season, team_id, ranking, games, wins, ot_wins, ot_losses, losses, points, goals_for, goals_against, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(y, id, t.ranking, t.games, t.wins, t.overtimeWins ?? 0, t.overtimeLosses ?? 0, t.losses, t.points, t.goals, t.goalsAgainst, now));
    }

    const upsertPlayer = (p: ApiPlayer) => db.prepare(
      `INSERT INTO players (id, first_name, last_name, team_id, team_name, role, jersey, picture, nationality, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, team_id=excluded.team_id,
         team_name=excluded.team_name, role=excluded.role, jersey=excluded.jersey, picture=excluded.picture, updated_at=excluded.updated_at`,
    ).bind(p.playerId, p.firstName, p.lastName, String(p.teamId), p.teamName, p.role, p.jersey ?? null, p.pictureUrl ?? null, p.nationality ?? null, now);

    const upsertStats = (p: ApiPlayer, gk: boolean) => db.prepare(
      `INSERT OR REPLACE INTO player_stats (season, player_id, games, goals, assists, pim, plus_minus, shutouts, saves, goals_against, wins, save_pct, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      y, p.playerId, p.playedGames ?? 0, p.goals ?? 0, p.assists ?? 0, p.penaltyMinutes ?? 0, p.plusMinus ?? 0,
      gk ? p.shutOut ?? 0 : 0, gk ? p.blockedOrSavedShots ?? 0 : 0, gk ? p.goalsAgainst ?? 0 : 0, gk ? p.gkWins ?? 0 : 0,
      gk ? p.savePercentage ?? null : null, now,
    );

    // Pelaajamuutokset: verrataan edelliseen listaan ennen päivitystä
    // (active-liput asetetaan vasta upsertien jälkeen, jotta myös uudet pelaajat merkitään aktiivisiksi)
    const changes = await detectPlayerChanges(db, [...skaters, ...goalies], now);
    for (const p of skaters) { stmts.push(upsertPlayer(p), upsertStats(p, false)); }
    for (const p of goalies) { stmts.push(upsertPlayer(p), upsertStats(p, true)); }
    stmts.push(...changes);
    await chunked(db, stmts);

    // Päivän leaderboard-tilanne talteen (nousut/laskut, kehityskäyrät)
    const lb = await computeLeaderboard(db, season);
    const date = helsinkiDate();
    await chunked(db, lb.map((g) => db.prepare(
      'INSERT OR REPLACE INTO leaderboard_history (date, guru_id, points, rank) VALUES (?,?,?,?)',
    ).bind(date, g.id, g.points, g.rank)));

    const msg = `${skaters.length} pelaajaa, ${goalies.length} maalivahtia, ${standings.season?.length ?? 0} joukkuetta`;
    let gmsg = '';
    try { const n = await syncPlayoffStats(db, y); if (n) gmsg += `, ${n} playoff-tilastoa`; } catch (e) { gmsg += `, playoff: ${(e as Error).message}`; }
    try { const n = await syncGames(db, y); if (n) gmsg = `, ${n} ottelua`; } catch (e) { gmsg = `, ottelut: ${(e as Error).message}`; }
    try { const n = await syncGames(db, y, 12, 'playoffs'); if (n) gmsg += `, ${n} playoff-ottelua`; } catch (e) { gmsg += `, playoff-ottelut: ${(e as Error).message}`; }
    await db.prepare('UPDATE sync_log SET finished_at=?, ok=1, message=? WHERE id=?').bind(new Date().toISOString(), msg + gmsg, log!.id).run();
    return msg + gmsg;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.prepare('UPDATE sync_log SET finished_at=?, ok=0, message=? WHERE id=?').bind(new Date().toISOString(), msg, log!.id).run();
    throw e;
  }
}

/**
 * Vertaa liiga.fi:n pelaajalistaa edelliseen (players.active = 1) ja palauttaa lauseet, jotka kirjaavat
 * muutokset player_changes-tauluun ja päivittävät active-lipun. Ensimmäinen ajo merkitsee vain lähtötilanteen.
 * Vajaa lista (< 100) ohitetaan, ettei synny virheellisiä "poistumisia".
 */
async function detectPlayerChanges(db: D1Database, list: ApiPlayer[], now: string): Promise<D1PreparedStatement[]> {
  if (list.length < 100) return [];
  const prev = new Map((await db.prepare('SELECT id, first_name, last_name, team_id, team_name, role FROM players WHERE active = 1')
    .all<{ id: number; first_name: string; last_name: string; team_id: string; team_name: string; role: string }>()).results.map((r) => [r.id, r]));
  const cur = new Map(list.map((p) => [Number(p.playerId), p]));
  const out: D1PreparedStatement[] = [];
  const log = (id: number, kind: string, name: string, role: string | null, from: string | null, to: string | null) =>
    out.push(db.prepare('INSERT INTO player_changes (at, player_id, kind, name, role, team_from, team_to) VALUES (?,?,?,?,?,?,?)').bind(now, id, kind, name, role, from, to));
  if (prev.size) {
    for (const [id, p] of cur) {
      const o = prev.get(id);
      if (!o) log(id, 'new', `${p.firstName} ${p.lastName}`, p.role ?? null, null, p.teamName ?? null);
      else if (String(o.team_id) !== String(p.teamId)) log(id, 'moved', `${p.firstName} ${p.lastName}`, p.role ?? null, o.team_name, p.teamName ?? null);
    }
    for (const [id, o] of prev) if (!cur.has(id)) log(id, 'gone', `${o.first_name} ${o.last_name}`, o.role, o.team_name, null);
  }
  out.push(db.prepare('UPDATE players SET active = 0 WHERE active = 1'));
  const ids = [...cur.keys()];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    out.push(db.prepare(`UPDATE players SET active = 1 WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part));
  }
  return out;
}

/** Pudotuspelien summatilastot (tyhjä ennen pudotuspelejä). Palauttaa rivimäärän. */
export async function syncPlayoffStats(db: D1Database, y: number): Promise<number> {
  const [sk, gk] = await Promise.all([
    getJson<ApiPlayer[]>(`${BASE}/players/stats/summed/${y}/${y}/playoffs/true?dataType=basicStats`).catch(() => [] as ApiPlayer[]),
    getJson<ApiPlayer[]>(`${BASE}/players/stats/summed/${y}/${y}/playoffs/true?dataType=basicStatsGk`).catch(() => [] as ApiPlayer[]),
  ]);
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const row = (p: ApiPlayer, g: boolean) => db.prepare(
    `INSERT OR REPLACE INTO playoff_stats (season, player_id, games, goals, assists, pim, plus_minus, shutouts, saves, goals_against, wins, save_pct, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(y, p.playerId, p.playedGames ?? 0, p.goals ?? 0, p.assists ?? 0, p.penaltyMinutes ?? 0, p.plusMinus ?? 0,
    g ? p.shutOut ?? 0 : 0, g ? p.blockedOrSavedShots ?? 0 : 0, g ? p.goalsAgainst ?? 0 : 0, g ? p.gkWins ?? 0 : 0, g ? p.savePercentage ?? null : null, now);
  const upsertPlayer = (p: ApiPlayer) => db.prepare(
    `INSERT INTO players (id, first_name, last_name, team_id, team_name, role, jersey, picture, nationality, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
  ).bind(p.playerId, p.firstName, p.lastName, String(p.teamId), p.teamName, p.role, p.jersey ?? null, p.pictureUrl ?? null, p.nationality ?? null, now);
  for (const p of sk) stmts.push(upsertPlayer(p), row(p, false));
  for (const p of gk) stmts.push(upsertPlayer(p), row(p, true));
  await chunked(db, stmts);
  return sk.length + gk.length;
}

/**
 * Ottelukohtaiset tilastot: käsittelee päättyneet, vielä käsittelemättömät ottelut (max `max` kpl / ajo,
 * jotta Workerin alipyyntöraja ei ylity – loput jatkuvat seuraavalla ajolla).
 * Pelanneet = kokoonpanossa rivillä (line ≠ null). +/- jäsennetään maalitapahtumien numeroista.
 * Maalivahdeista aloittaja (line 1) saa koko ottelun torjunnat/päästetyt (vaihdot ovat harvinaisia).
 */
export async function syncGames(db: D1Database, y: number, max = 12, tournament: 'runkosarja' | 'playoffs' = 'runkosarja'): Promise<number> {
  const po = tournament === 'playoffs';
  const list = await getJson<ApiPlayer[]>(`${BASE}/games?tournament=${tournament}&season=${y}`);
  const done = new Set((await db.prepare('SELECT game_id FROM games_synced WHERE season = ?').bind(y).all<{ game_id: number }>()).results.map((r) => r.game_id));
  const todo = list.filter((g) => g.ended && !done.has(g.id)).sort((a, b) => String(a.start).localeCompare(String(b.start))).slice(0, max);
  for (const g of todo) {
    const [det, st] = await Promise.all([
      getJson<ApiPlayer>(`${BASE}/games/${y}/${g.id}`),
      getJson<ApiPlayer>(`${BASE}/games/stats/${y}/${g.id}`).catch(() => null),
    ]);
    const game = det.game;
    const date = helsinkiDate(new Date(game.start));
    const sides = [
      { key: 'homeTeam', opp: 'awayTeam', players: det.homeTeamPlayers as ApiPlayer[], home: 1 },
      { key: 'awayTeam', opp: 'homeTeam', players: det.awayTeamPlayers as ApiPlayer[], home: 0 },
    ] as const;
    const extended = game.finishedType && game.finishedType !== 'ENDED_DURING_REGULAR_GAME_TIME';
    const stmts: D1PreparedStatement[] = [];
    for (const s of sides) {
      const t = game[s.key], o = game[s.opp];
      const gf = t.goals ?? 0, ga = o.goals ?? 0;
      const won = gf > ga;
      const pts = won ? (extended ? 2 : 3) : extended ? 1 : 0;
      stmts.push(po
        ? db.prepare('SELECT 1')
        : db.prepare('INSERT OR REPLACE INTO team_games (season, game_id, date, team_id, opponent, home, gf, ga, points) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(y, g.id, date, String(t.teamId), o.teamName ?? null, s.home, gf, ga, pts));

      const played = (s.players ?? []).filter((p) => p.line != null && !p.removed);
      const byJersey = new Map(played.map((p) => [String(p.jersey), p.id as number]));
      const oppPlayers = (s.key === 'homeTeam' ? det.awayTeamPlayers : det.homeTeamPlayers) as ApiPlayer[];
      const oppByJersey = new Map((oppPlayers ?? []).filter((p) => p.line != null).map((p) => [String(p.jersey), p.id as number]));
      const row = new Map<number, { goals: number; assists: number; pim: number; pm: number; saves: number; ga: number; so: number; win: number }>();
      const get = (id: number) => { let r = row.get(id); if (!r) { r = { goals: 0, assists: 0, pim: 0, pm: 0, saves: 0, ga: 0, so: 0, win: 0 }; row.set(id, r); } return r; };
      for (const p of played) if (p.role !== 'GOALIE') get(p.id);
      for (const ev of t.goalEvents ?? []) {
        if (ev.scorerPlayerId && row.has(ev.scorerPlayerId)) get(ev.scorerPlayerId).goals++;
        for (const a of ev.assistantPlayerIds ?? []) if (row.has(a)) get(a).assists++;
        for (const j of String(ev.plusPlayerIds ?? '').split(/\s+/).filter(Boolean)) { const id = byJersey.get(j); if (id) get(id).pm++; }
      }
      for (const ev of o.goalEvents ?? []) {
        for (const j of String(ev.minusPlayerIds ?? '').split(/\s+/).filter(Boolean)) { const id = byJersey.get(j); if (id) get(id).pm--; }
      }
      void oppByJersey;
      for (const ev of t.penaltyEvents ?? []) if (ev.playerId && row.has(ev.playerId)) get(ev.playerId).pim += ev.penaltyMinutes ?? 0;
      // Maalivahdit: tarkat erätilastot (torjunnat, päästetyt, peliaika) – vain kentällä olleet
      const gkStats = new Map<number, { saves: number; ga: number; toi: number }>();
      for (const per of (st ? (st[s.key] as ApiPlayer[]) ?? [] : [])) {
        for (const gs of (per.goaliePeriodStats ?? []) as ApiPlayer[]) {
          const x = gkStats.get(gs.playerId) ?? { saves: 0, ga: 0, toi: 0 };
          x.saves += gs.period?.saves ?? 0; x.ga += gs.period?.goalsAllowed ?? 0; x.toi += gs.period?.timeofice ?? 0;
          gkStats.set(gs.playerId, x);
        }
      }
      const gks = [...gkStats.entries()].filter(([, x]) => x.toi > 0);
      if (!gks.length) { // varalla: aloittaja (line 1) ilman torjuntoja
        const gk = played.find((p) => p.role === 'GOALIE' && p.line === 1);
        if (gk) gks.push([gk.id, { saves: 0, ga, toi: 1 }]);
      }
      const mainGk = gks.reduce<number | null>((best, [id, x]) => (best == null || x.toi > gkStats.get(best)!.toi ? id : best), null);
      for (const [id, x] of gks) {
        const r = get(id);
        r.saves = x.saves; r.ga = x.ga;
        r.so = gks.length === 1 && ga === 0 ? 1 : 0;
        r.win = won && id === mainGk ? 1 : 0;
      }
      for (const [pid, r] of row) {
        stmts.push(po
          ? db.prepare(
            `INSERT OR REPLACE INTO playoff_game_stats (season, game_id, phase, date, player_id, team_id, opponent, home, goals, assists, pim, plus_minus, saves, goals_against, shutout, win)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ).bind(y, g.id, g.playOffPhase ?? 0, date, pid, String(t.teamId), o.teamName ?? null, s.home, r.goals, r.assists, r.pim, r.pm, r.saves, r.ga, r.so, r.win)
          : db.prepare(
          `INSERT OR REPLACE INTO game_stats (season, game_id, date, player_id, team_id, opponent, home, goals, assists, pim, plus_minus, saves, goals_against, shutout, win)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(y, g.id, date, pid, String(t.teamId), o.teamName ?? null, s.home, r.goals, r.assists, r.pim, r.pm, r.saves, r.ga, r.so, r.win));
      }
    }
    stmts.push(db.prepare('INSERT OR REPLACE INTO games_synced (game_id, season, synced_at) VALUES (?,?,?)').bind(g.id, y, new Date().toISOString()));
    await chunked(db, stmts);
  }
  return todo.length;
}
