// Play-Off: liiga.fi-pudotuspeliotteluista laskettu hakemistopuu.

export const PHASE_NAMES: Record<number, string> = { 1: '1. kierros', 2: 'Puolivälierät', 3: 'Välierät', 4: 'Pronssiottelu', 5: 'Finaali' };
/** Gurukisaan kuuluvat vaiheet (alkaa puolivälieristä, ei pronssia). */
export const GURU_PHASES = [2, 3, 5];

interface LiigaTeam { teamId: string; teamName: string; goals: number; logos?: { darkBg?: string } }
interface LiigaGame {
  id: number; start: string; ended: boolean; started: boolean; finishedType?: string;
  homeTeam: LiigaTeam; awayTeam: LiigaTeam; playOffPhase: number; playOffPair: number; playOffReqWins: number;
}

export interface SeriesTeam { id: string; name: string; logo: string | null; wins: number }
export interface Series {
  phase: number; pair: number; reqWins: number; a: SeriesTeam; b: SeriesTeam;
  winner: string | null; done: boolean; played: number; next: string | null;
  games: { id: number; start: string; home: string; away: string; hg: number; ag: number; ended: boolean; ot: boolean }[];
}
export interface Bracket { season: number; rounds: { phase: number; name: string; guru: boolean; done: boolean; series: Series[] }[] }

export async function fetchBracket(season: number, waitUntil: (p: Promise<unknown>) => void): Promise<Bracket> {
  const url = `https://liiga.fi/api/v2/games?tournament=playoffs&season=${season}`;
  const key = new Request(url);
  let res = await caches.default.match(key);
  if (!res) {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`liiga.fi ${r.status}`);
    res = new Response(await r.text(), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=120' } });
    waitUntil(caches.default.put(key, res.clone()));
  }
  const games = (await res.json()) as LiigaGame[];
  return buildBracket(season, Array.isArray(games) ? games : []);
}

export function buildBracket(season: number, games: LiigaGame[]): Bracket {
  const map = new Map<string, Series>();
  for (const g of [...games].sort((x, y) => x.start.localeCompare(y.start))) {
    if (!g.playOffPhase || !g.homeTeam?.teamId || !g.awayTeam?.teamId) continue;
    const k = `${g.playOffPhase}-${g.playOffPair}`;
    let s = map.get(k);
    const team = (t: LiigaTeam): SeriesTeam => ({ id: t.teamId, name: t.teamName, logo: t.logos?.darkBg ?? null, wins: 0 });
    if (!s) {
      s = { phase: g.playOffPhase, pair: g.playOffPair, reqWins: g.playOffReqWins, a: team(g.homeTeam), b: team(g.awayTeam), winner: null, done: false, played: 0, next: null, games: [] };
      map.set(k, s);
    }
    const hg = g.homeTeam.goals ?? 0, ag = g.awayTeam.goals ?? 0;
    s.games.push({ id: g.id, start: g.start, home: g.homeTeam.teamId, away: g.awayTeam.teamId, hg, ag, ended: g.ended, ot: !!g.finishedType && g.finishedType.includes('EXTENDED') });
    if (g.ended) {
      s.played++;
      const w = hg > ag ? g.homeTeam.teamId : g.awayTeam.teamId;
      if (w === s.a.id) s.a.wins++; else if (w === s.b.id) s.b.wins++;
    } else if (!s.next) s.next = g.start;
  }
  for (const s of map.values()) {
    if (s.a.wins >= s.reqWins) s.winner = s.a.id;
    else if (s.b.wins >= s.reqWins) s.winner = s.b.id;
    s.done = !!s.winner;
    if (s.done) s.next = null;
  }
  const phases = [...new Set([...map.values()].map((s) => s.phase))].sort((a, b) => a - b);
  return {
    season,
    rounds: phases.map((p) => {
      const series = [...map.values()].filter((s) => s.phase === p).sort((a, b) => a.pair - b.pair);
      return { phase: p, name: PHASE_NAMES[p] ?? `Vaihe ${p}`, guru: GURU_PHASES.includes(p), done: series.every((s) => s.done), series };
    }),
  };
}

/** Joukkueet, jotka ovat vielä mukana gurukisan kannalta (eivät ole hävinneet sarjaa vaiheesta 2 alkaen). */
export function aliveTeams(b: Bracket): Set<string> {
  const out = new Set<string>();
  const guruRounds = b.rounds.filter((r) => r.guru);
  if (!guruRounds.length) return out;
  for (const s of guruRounds[0].series) { out.add(s.a.id); out.add(s.b.id); }
  for (const r of guruRounds) for (const s of r.series) if (s.winner) out.delete(s.winner === s.a.id ? s.b.id : s.a.id);
  return out;
}
