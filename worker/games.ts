// Ottelut: otteluohjelma ja tulokset liiga.fi:stä (välimuisti), ottelun pelaajatilastot omasta kannasta.
import { goaliePoints, skaterPoints, type Scoring } from './scoring';

export type Tournament = 'runkosarja' | 'playoffs';

interface LTeam { teamId: string; teamName: string; goals?: number; logos?: { darkBg?: string } }
interface LGame {
  id: number; start: string; ended: boolean; started: boolean; finishedType?: string;
  homeTeam: LTeam; awayTeam: LTeam; playOffPhase?: number; playOffPair?: number;
}

export interface GameRow {
  id: number; start: string; ended: boolean; started: boolean; ot: 'OT' | 'SO' | null;
  tournament: Tournament; phase: number | null;
  home: { id: string; name: string; logo: string | null; goals: number };
  away: { id: string; name: string; logo: string | null; goals: number };
}

async function cachedJson<T>(url: string, maxAge: number, waitUntil: (p: Promise<unknown>) => void): Promise<T> {
  const key = new Request(url);
  let res = await caches.default.match(key);
  if (!res) {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`liiga.fi ${r.status}`);
    res = new Response(await r.text(), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${maxAge}` } });
    waitUntil(caches.default.put(key, res.clone()));
  }
  return res.json() as Promise<T>;
}

const team = (t: LTeam) => ({ id: t.teamId, name: t.teamName, logo: t.logos?.darkBg ?? null, goals: t.goals ?? 0 });

export async function fetchGames(season: number, tournament: Tournament, waitUntil: (p: Promise<unknown>) => void): Promise<GameRow[]> {
  const data = await cachedJson<LGame[]>(`https://liiga.fi/api/v2/games?tournament=${tournament}&season=${season}`, 120, waitUntil);
  return (Array.isArray(data) ? data : [])
    .filter((g) => g.homeTeam?.teamId && g.awayTeam?.teamId)
    .map((g): GameRow => ({
      id: g.id, start: g.start, ended: !!g.ended, started: !!g.started,
      ot: g.finishedType?.includes('WINNING_SHOT') ? 'SO' : g.finishedType?.includes('EXTENDED') ? 'OT' : null,
      tournament, phase: g.playOffPhase || null, home: team(g.homeTeam), away: team(g.awayTeam),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Ottelun ennakko liiga.fi:stä: joukkuevertailu ja seurattavat pelaajat. */
export async function gamePreview(season: number, g: GameRow, waitUntil: (p: Promise<unknown>) => void) {
  const date = g.start.slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = await cachedJson<any>(`https://liiga.fi/api/v2/games/preview/${season}/${g.id}/?gameDate=${date}&homeTeam=${encodeURIComponent(g.home.id)}&awayTeam=${encodeURIComponent(g.away.id)}`, 1800, waitUntil);
  const key = (id: string) => id.split(':')[0];
  const cmp = (id: string) => d?.teamComparison?.[key(id)] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watch = (id: string) => ((d?.playersToWatch?.all?.[key(id)] ?? []) as any[]).slice(0, 5)
    .map((p) => ({ id: p.playerId, name: String(p.playerName ?? '').split(' ').reverse().join(' '), jersey: p.playerJersey ?? null, role: p.role ?? null, value: p.value, category: p.category }));
  return { home: cmp(g.home.id), away: cmp(g.away.id), watchHome: watch(g.home.id), watchAway: watch(g.away.id) };
}

interface StatRow {
  player_id: number; team_id: string; goals: number; assists: number; pim: number; plus_minus: number;
  saves: number; goals_against: number; shutout: number; win: number;
  name: string; role: string | null; picture: string | null;
}

/** Ottelun pelaajat joukkueittain HG-pisteineen. */
export async function gameDetail(db: D1Database, gameId: number, scoring: Scoring, mine: Set<number>) {
  const q = (table: string) => db.prepare(
    `SELECT s.player_id, s.team_id, s.goals, s.assists, s.pim, s.plus_minus, s.saves, s.goals_against, s.shutout, s.win,
            COALESCE(p.first_name || ' ' || p.last_name, '#' || s.player_id) AS name, p.role, p.picture
     FROM ${table} s LEFT JOIN players p ON p.id = s.player_id WHERE s.game_id = ?`,
  ).bind(gameId);
  const [a, b] = await db.batch([q('game_stats'), q('playoff_game_stats')]);
  const rows = [...(a.results as unknown as StatRow[]), ...(b.results as unknown as StatRow[])];
  const seen = new Set<number>();
  const players = rows.filter((r) => !seen.has(r.player_id) && seen.add(r.player_id)).map((r) => {
    const pos = r.role === 'MV' ? 'G' : r.role === 'P' ? 'D' : 'F';
    const base = { games: 1, goals: r.goals, assists: r.assists, pim: r.pim, plus_minus: r.plus_minus };
    const hg = pos === 'G'
      ? goaliePoints({ ...base, shutouts: r.shutout, saves: r.saves, goals_against: r.goals_against, wins: r.win }, scoring.G)
      : skaterPoints({ ...base, shutouts: 0, saves: 0, goals_against: 0, wins: 0 }, scoring[pos]);
    return { ...r, pos, hg: Math.round(hg * 100) / 100, mine: mine.has(r.player_id) };
  });
  return players.sort((x, y) => y.hg - x.hg || y.goals + y.assists - (x.goals + x.assists));
}

// ---------- Ottelun lisätilastot liiga.fi:stä ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
const GOAL_TYPES: Record<string, string> = { YV: 'YV', AV: 'AV', TM: 'TM', VT: 'VT', IM: 'IM', RL: 'RL', VL: 'VL', SR: 'SR' };

export async function gameExtra(season: number, id: number, ended: boolean, waitUntil: (p: Promise<unknown>) => void) {
  const ttl = ended ? 3600 : 30;
  const [d, s] = await Promise.all([
    cachedJson<any>(`https://liiga.fi/api/v2/games/${season}/${id}`, ttl, waitUntil),
    cachedJson<any>(`https://liiga.fi/api/v2/games/stats/${season}/${id}`, ttl, waitUntil).catch(() => null),
  ]);
  const g = d?.game;
  if (!g) return null;
  const names = new Map<number, { name: string; jersey: number | null; team: string }>();
  for (const p of [...(d.homeTeamPlayers ?? []), ...(d.awayTeamPlayers ?? [])]) names.set(p.id, { name: `${p.firstName} ${p.lastName}`, jersey: p.jersey ?? null, team: p.teamId });
  const nm = (pid: number) => names.get(pid)?.name ?? '';

  const events: any[] = [];
  for (const side of ['home', 'away'] as const) {
    const t = g[`${side}Team`];
    for (const e of t.goalEvents ?? []) events.push({
      type: 'goal', side, time: e.gameTime, period: e.period, scorer: nm(e.scorerPlayerId) || `${e.scorerPlayer?.firstName ?? ''} ${e.scorerPlayer?.lastName ?? ''}`.trim(),
      assists: (e.assistantPlayers ?? []).map((a: any) => `${a.firstName} ${a.lastName}`), score: `${e.homeTeamScore}–${e.awayTeamScore}`,
      types: (e.goalTypes ?? []).map((x: string) => GOAL_TYPES[x] ?? x), winning: !!e.winningGoal, video: e.videoClipUrl ?? null,
    });
    for (const e of t.penaltyEvents ?? []) events.push({ type: 'penalty', side, time: e.gameTime, period: e.period, player: nm(e.playerId), minutes: e.penaltyMinutes, reason: e.penaltyFaultName });
  }
  events.sort((a, b) => a.time - b.time);

  // Joukkueiden tilastot (summa pelaajien erätilastoista)
  const teamSum = (side: 'home' | 'away') => {
    const per = (s?.[`${side}Team`] ?? []) as { periodPlayerStats: any[] }[];
    const tot = { shots: 0, blocked: 0, fo: 0, foWon: 0, shotsByPeriod: [] as number[] };
    const players = new Map<number, any>();
    per.forEach((p, i) => {
      let sh = 0;
      for (const r of p.periodPlayerStats ?? []) {
        const x = r.period ?? {};
        sh += x.shots ?? 0; tot.blocked += x.blockedShots ?? 0; tot.fo += x.faceoffsTotal ?? 0; tot.foWon += x.faceoffsWon ?? 0;
        const pl = players.get(r.playerId) ?? { id: r.playerId, name: nm(r.playerId), jersey: r.jerseyId, toi: 0, shots: 0, blocked: 0, fo: 0, foWon: 0, xg: 0, speed: null, hardest: null };
        pl.toi += x.timeofice ?? 0; pl.shots += x.shots ?? 0; pl.blocked += x.blockedShots ?? 0; pl.fo += x.faceoffsTotal ?? 0; pl.foWon += x.faceoffsWon ?? 0; pl.xg += r.expectedGoalsPlayer ?? 0;
        players.set(r.playerId, pl);
      }
      tot.shotsByPeriod[i] = sh; tot.shots += sh;
    });
    for (const r of s?.[`${side}TeamGamePlayerStats`] ?? []) {
      const pl = players.get(r.playerId); if (!pl) continue;
      pl.speed = r.topSpeed ? Math.round(r.topSpeed * 3.6 * 10) / 10 : null;
      pl.hardest = r.hardestShot ? Math.round(r.hardestShot * 3.6 * 10) / 10 : null;
    }
    const t = g[`${side}Team`];
    return {
      ...tot, pp: `${t.powerplayGoals ?? 0}/${t.powerplayInstances ?? 0}`, sh: t.shortHandedInstances ?? 0, xg: t.expectedGoals ?? null,
      pim: (t.penaltyEvents ?? []).reduce((a: number, e: any) => a + (e.penaltyMinutes ?? 0), 0),
      players: [...players.values()].map((p) => ({ ...p, xg: Math.round(p.xg * 100) / 100 })),
    };
  };
  const puck = (s?.puckStats ?? []) as any[];
  const ctl = puck.reduce((a, p) => ({ h: a.h + (p.homeTeamControlDuration ?? 0), a: a.a + (p.awayTeamControlDuration ?? 0) }), { h: 0, a: 0 });
  const stars = ((d.awards ?? []) as any[]).filter((a) => a.awardCategory === 1).sort((a, b) => b.awardPoint - a.awardPoint)
    .map((a) => ({ stars: a.awardPoint, name: nm(a.playerId), team: a.teamId }));
  return {
    periods: (g.periods ?? []).map((p: any) => ({ index: p.index, home: p.homeTeamGoals, away: p.awayTeamGoals, category: p.category })),
    spectators: g.spectators ?? null, rink: g.iceRink?.name ?? null, city: g.iceRink?.city ?? null,
    referees: (g.referees ?? []).map((r: any) => ({ name: `${r.firstName} ${r.lastName}`, role: r.roleName })),
    events, home: teamSum('home'), away: teamSum('away'),
    possession: ctl.h + ctl.a ? Math.round((ctl.h / (ctl.h + ctl.a)) * 100) : null,
    stars,
  };
}
