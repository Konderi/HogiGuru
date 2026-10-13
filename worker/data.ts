import { entityPoints, type Position, type Scoring, type StatRow } from './scoring';

export interface Season {
  id: number; name: string; liiga_season: number; active: number;
  max_swaps: number | null; max_picks_per_entity: number; max_picks_by_pos: Partial<Record<Position, number>>;
  roster: Record<Position, number>; scoring: Scoring;
  draft_status: 'setup' | 'live' | 'done'; draft_snake: number;
  registration_open: number; registration_deadline: string | null; entry_fee: string | null; registration_info: string | null;
  results_published: number; selection_mode: 'draft' | 'baskets'; baskets: string[][];
  results_override: import('./predictions').Override;
}

/** Montako gurua voi valita saman pelaajan/valmentajan tällä paikalla. */
export const maxFor = (s: Season, pos: Position) => s.max_picks_by_pos?.[pos] ?? s.max_picks_per_entity;
export const maxMap = (s: Season) => Object.fromEntries((['C', 'G', 'D', 'F'] as Position[]).map((p) => [p, maxFor(s, p)])) as Record<Position, number>;

export function helsinkiDate(d = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(d);
}

export async function getActiveSeason(db: D1Database): Promise<Season | null> {
  const row = await db.prepare('SELECT * FROM seasons WHERE active = 1 ORDER BY id DESC LIMIT 1').first<Record<string, unknown>>();
  if (!row) return null;
  return {
    ...row, roster: JSON.parse(row.roster as string), scoring: JSON.parse(row.scoring as string),
    max_picks_by_pos: JSON.parse((row.max_picks_by_pos as string) ?? '{}'),
    baskets: JSON.parse((row.baskets as string) ?? '[]'),
    results_override: JSON.parse((row.results_override as string) ?? '{}'),
    selection_mode: row.selection_mode === 'baskets' ? 'baskets' : 'draft',
  } as Season;
}

export interface Context {
  stats: Map<number, StatRow>;
  coachTeam: Map<number, string>;
  teamPoints: Map<string, number>;
  names: { player: Map<number, { name: string; team: string | null; picture: string | null }>; coach: Map<number, { name: string; team: string | null }> };
}

export async function loadContext(db: D1Database, season: Season): Promise<Context> {
  const [stats, coaches, standings, players] = await db.batch([
    db.prepare('SELECT * FROM player_stats WHERE season = ?').bind(season.liiga_season),
    db.prepare('SELECT c.id, c.name, c.team_id, t.name AS team FROM coaches c LEFT JOIN teams t ON t.id = c.team_id WHERE c.season_id = ?').bind(season.id),
    db.prepare('SELECT team_id, points FROM standings WHERE season = ?').bind(season.liiga_season),
    db.prepare('SELECT id, first_name, last_name, team_name, picture FROM players'),
  ]);
  const ctx: Context = { stats: new Map(), coachTeam: new Map(), teamPoints: new Map(), names: { player: new Map(), coach: new Map() } };
  for (const s of stats.results as unknown as (StatRow & { player_id: number })[]) ctx.stats.set(s.player_id, s);
  for (const c of coaches.results as { id: number; name: string; team_id: string; team: string | null }[]) {
    ctx.coachTeam.set(c.id, c.team_id);
    ctx.names.coach.set(c.id, { name: c.name, team: c.team });
  }
  for (const t of standings.results as { team_id: string; points: number }[]) ctx.teamPoints.set(t.team_id, t.points);
  for (const p of players.results as { id: number; first_name: string; last_name: string; team_name: string | null; picture: string | null }[]) {
    ctx.names.player.set(p.id, { name: `${p.first_name} ${p.last_name}`, team: p.team_name, picture: p.picture });
  }
  return ctx;
}

export function entityName(ctx: Context, pos: Position, id: number) {
  return pos === 'C' ? ctx.names.coach.get(id) ?? { name: `#${id}`, team: null } : ctx.names.player.get(id) ?? { name: `#${id}`, team: null, picture: null };
}

export interface SlotRow {
  id: number; guru_id: number; position: Position; entity_id: number;
  start_date: string; end_date: string | null; start_points: number; end_points: number | null;
}

export function slotView(s: SlotRow, season: Season, ctx: Context) {
  const current = entityPoints(s.position, s.entity_id, season.scoring, ctx.stats, ctx.coachTeam, ctx.teamPoints);
  const value = Math.round(((s.end_points ?? current) - s.start_points) * 100) / 100;
  return { ...s, ...entityName(ctx, s.position, s.entity_id), current, value, active: s.end_date === null };
}

export interface LeaderRow { id: number; name: string; points: number; rank: number; prevRank: number | null; user_id: number | null }

export async function computeLeaderboard(db: D1Database, season: Season, ctx?: Context): Promise<LeaderRow[]> {
  ctx ??= await loadContext(db, season);
  const [gurus, slots, adj, prev] = await db.batch([
    db.prepare('SELECT id, name, user_id FROM gurus WHERE season_id = ?').bind(season.id),
    db.prepare('SELECT s.* FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.season_id = ?').bind(season.id),
    db.prepare('SELECT a.guru_id, SUM(a.points) AS p FROM adjustments a JOIN gurus g ON g.id = a.guru_id WHERE g.season_id = ? GROUP BY a.guru_id').bind(season.id),
    db.prepare(`SELECT guru_id, rank FROM leaderboard_history WHERE date = (SELECT MAX(date) FROM leaderboard_history WHERE date < ?)`).bind(helsinkiDate()),
  ]);
  const totals = new Map<number, number>();
  for (const s of slots.results as unknown as SlotRow[]) {
    totals.set(s.guru_id, (totals.get(s.guru_id) ?? 0) + slotView(s, season, ctx).value);
  }
  for (const a of adj.results as { guru_id: number; p: number }[]) totals.set(a.guru_id, (totals.get(a.guru_id) ?? 0) + a.p);
  const prevRank = new Map((prev.results as { guru_id: number; rank: number }[]).map((r) => [r.guru_id, r.rank]));

  const rows = (gurus.results as { id: number; name: string; user_id: number | null }[])
    .map((g) => ({ ...g, points: Math.round((totals.get(g.id) ?? 0) * 10) / 10 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'fi'));
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.points !== rows[i - 1].points) rank = i + 1;
    return { ...r, rank, prevRank: prevRank.get(r.id) ?? null };
  });
}

/** Montako aktiivista kentällistä entiteetillä on (5 kerran sääntö). */
export async function usageCounts(db: D1Database, seasonId: number): Promise<Map<string, number>> {
  const res = await db.prepare(
    `SELECT CASE WHEN s.position = 'C' THEN 'C' ELSE 'P' END AS kind, s.entity_id, COUNT(*) AS n
     FROM roster_slots s JOIN gurus g ON g.id = s.guru_id
     WHERE g.season_id = ? AND s.end_date IS NULL GROUP BY kind, s.entity_id`,
  ).bind(seasonId).all<{ kind: string; entity_id: number; n: number }>();
  return new Map(res.results.map((r) => [`${r.kind}:${r.entity_id}`, r.n]));
}
export const usageKey = (pos: Position, id: number) => `${pos === 'C' ? 'C' : 'P'}:${id}`;
