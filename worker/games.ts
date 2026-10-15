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
