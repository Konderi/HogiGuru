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

    for (const p of skaters) { stmts.push(upsertPlayer(p), upsertStats(p, false)); }
    for (const p of goalies) { stmts.push(upsertPlayer(p), upsertStats(p, true)); }
    await chunked(db, stmts);

    // Päivän leaderboard-tilanne talteen (nousut/laskut, kehityskäyrät)
    const lb = await computeLeaderboard(db, season);
    const date = helsinkiDate();
    await chunked(db, lb.map((g) => db.prepare(
      'INSERT OR REPLACE INTO leaderboard_history (date, guru_id, points, rank) VALUES (?,?,?,?)',
    ).bind(date, g.id, g.points, g.rank)));

    const msg = `${skaters.length} pelaajaa, ${goalies.length} maalivahtia, ${standings.season?.length ?? 0} joukkuetta`;
    await db.prepare('UPDATE sync_log SET finished_at=?, ok=1, message=? WHERE id=?').bind(new Date().toISOString(), msg, log!.id).run();
    return msg;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.prepare('UPDATE sync_log SET finished_at=?, ok=0, message=? WHERE id=?').bind(new Date().toISOString(), msg, log!.id).run();
    throw e;
  }
}
