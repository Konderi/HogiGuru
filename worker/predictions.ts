import { computeLeaderboard, loadContext, type Season } from './data';

/** Veikkauskategoriat (ilmoittautumislomake) */
export const CATEGORIES = ['points', 'goals', 'assists', 'plusMinus', 'dPoints', 'pim', 'shutouts'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Override { standings?: string[]; topScorers?: Record<string, number[]>; categories?: Partial<Record<Category, number[]>> }
interface Prediction { standings: number[]; topScorer: number[]; category: number[]; shutoutFactor: number }
const DEF: Prediction = { standings: [6, 4, 1], topScorer: [7, 4, 2], category: [12, 6, 3], shutoutFactor: 0.5 };

interface P { id: number; name: string; team_id: string | null; role: string | null; goals: number; assists: number; plus_minus: number; pim: number; shutouts: number }
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Sijoitus tasatilanteet huomioiden: 1 + arvoltaan parempien määrä. */
function ranker(list: { id: number; v: number }[]) {
  const vals = list.map((x) => x.v);
  const m = new Map<number, { rank: number; v: number }>();
  for (const x of list) m.set(x.id, { rank: 1 + vals.filter((v) => v > x.v).length, v: x.v });
  return m;
}
/** Käsin annettu järjestys (ylläpidon korjaus) → sijat listan mukaan. */
const fromList = (ids: number[]) => new Map(ids.map((id, i) => [id, { rank: i + 1, v: NaN }]));

export async function computeResults(db: D1Database, season: Season) {
  const pr: Prediction = { ...DEF, ...((season.scoring as unknown as { prediction?: Prediction }).prediction ?? {}) };
  const ov: Override = season.results_override ?? {};
  const ctx = await loadContext(db, season);
  const [players, standings, teams, regs, leaderboard] = await Promise.all([
    db.prepare(
      `SELECT p.id, p.first_name || ' ' || p.last_name AS name, p.team_id, p.role, s.goals, s.assists, s.plus_minus, s.pim, s.shutouts
       FROM players p JOIN player_stats s ON s.player_id = p.id AND s.season = ?`,
    ).bind(season.liiga_season).all<P>(),
    db.prepare('SELECT team_id, ranking FROM standings WHERE season = ? ORDER BY ranking').bind(season.liiga_season).all<{ team_id: string; ranking: number }>(),
    db.prepare('SELECT id, name, logo FROM teams').all<{ id: string; name: string; logo: string | null }>(),
    db.prepare("SELECT guru_id, standings, top_scorers, categories FROM registrations WHERE season_id = ? AND status = 'accepted' AND guru_id IS NOT NULL").bind(season.id).all<Record<string, string> & { guru_id: number }>(),
    computeLeaderboard(db, season, ctx),
  ]);
  const pl = players.results;
  const pById = new Map(pl.map((p) => [p.id, p]));
  const teamName = new Map(teams.results.map((t) => [t.id, t.name]));
  const pname = (id?: number) => (id ? pById.get(id)?.name ?? ctx.names.player.get(id)?.name ?? `#${id}` : null);

  // --- Oikeat vastaukset ---
  const actualOrder = ov.standings?.length ? ov.standings : standings.results.map((s) => s.team_id);
  const actualRank = new Map(actualOrder.map((t, i) => [t, i + 1]));

  const skaters = pl.filter((p) => p.role !== 'MV');
  const teamRanks = new Map<string, Map<number, { rank: number; v: number }>>();
  for (const t of teams.results) {
    teamRanks.set(t.id, ov.topScorers?.[t.id]?.length ? fromList(ov.topScorers[t.id]) :
      ranker(skaters.filter((p) => p.team_id === t.id).map((p) => ({ id: p.id, v: p.goals + p.assists }))));
  }
  const catValue: Record<Category, (p: P) => number | null> = {
    points: (p) => (p.role === 'MV' ? null : p.goals + p.assists),
    goals: (p) => (p.role === 'MV' ? null : p.goals),
    assists: (p) => (p.role === 'MV' ? null : p.assists),
    plusMinus: (p) => (p.role === 'MV' ? null : p.plus_minus),
    dPoints: (p) => (p.role === 'P' ? p.goals + p.assists : null),
    pim: (p) => (p.role === 'MV' ? null : p.pim),
    shutouts: (p) => (p.role === 'MV' ? p.shutouts : null),
  };
  const catRanks = Object.fromEntries(CATEGORIES.map((k) => [k, ov.categories?.[k]?.length ? fromList(ov.categories[k]!) :
    ranker(pl.map((p) => ({ id: p.id, v: catValue[k](p) })).filter((x): x is { id: number; v: number } => x.v !== null))])) as Record<Category, Map<number, { rank: number; v: number }>>;

  const topN = (m: Map<number, { rank: number; v: number }>, n: number) =>
    [...m.entries()].filter(([, x]) => x.rank <= n).sort((a, b) => a[1].rank - b[1].rank).map(([id, x]) => ({ id, name: pname(id), rank: x.rank, value: Number.isNaN(x.v) ? null : x.v }));
  const answers = {
    standings: actualOrder.map((t, i) => ({ team: t, name: teamName.get(t) ?? t, rank: i + 1 })),
    topScorers: teams.results.map((t) => ({ team: t.id, name: t.name, top: topN(teamRanks.get(t.id)!, 3) })).sort((a, b) => a.name.localeCompare(b.name, 'fi')),
    categories: CATEGORIES.map((k) => ({ key: k, top: topN(catRanks[k], 5) })),
  };

  // --- Gurujen pisteet ---
  const regByGuru = new Map(regs.results.map((r) => [r.guru_id, r]));
  const rows = leaderboard.map((g) => {
    const r = regByGuru.get(g.id);
    const st: string[] = r ? JSON.parse(r.standings) : [];
    const ts: Record<string, number> = r ? JSON.parse(r.top_scorers) : {};
    const cs: Partial<Record<Category, number>> = r ? JSON.parse(r.categories) : {};
    const standingsD = st.map((t, i) => {
      const a = actualRank.get(t); const diff = a ? Math.abs(a - (i + 1)) : null;
      return { team: t, name: teamName.get(t) ?? t, guess: i + 1, actual: a ?? null, pts: diff !== null && diff < pr.standings.length ? pr.standings[diff] : 0 };
    });
    const topD = Object.entries(ts).map(([t, id]) => {
      const rk = teamRanks.get(t)?.get(id)?.rank ?? null;
      return { team: t, name: teamName.get(t) ?? t, player: pname(id), rank: rk, pts: rk && rk <= pr.topScorer.length ? pr.topScorer[rk - 1] : 0 };
    });
    const catD = CATEGORIES.filter((k) => cs[k]).map((k) => {
      const x = catRanks[k].get(cs[k]!); const rk = x?.rank ?? null;
      const base = !rk ? 0 : rk === 1 ? pr.category[0] : rk <= 3 ? pr.category[1] : rk <= 5 ? pr.category[2] : 0;
      return { key: k, player: pname(cs[k]), rank: rk, value: x && !Number.isNaN(x.v) ? x.v : null, pts: r2(k === 'shutouts' ? base * pr.shutoutFactor : base) };
    });
    const sum = (a: { pts: number }[]) => r2(a.reduce((s, x) => s + x.pts, 0));
    const parts = { allstars: g.points, standings: sum(standingsD), topScorers: sum(topD), categories: sum(catD) };
    return { id: g.id, name: g.name, registered: !!r, ...parts, total: r2(parts.allstars + parts.standings + parts.topScorers + parts.categories), details: { standings: standingsD, topScorers: topD, categories: catD } };
  });
  rows.sort((a, b) => b.total - a.total);
  const ranked = rows.map((x) => ({ ...x, rank: 1 + rows.filter((y) => y.total > x.total).length }));
  return { season: season.name, published: !!season.results_published, scoring: pr, answers, rows: ranked };
}
