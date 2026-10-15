// Play-Offs-gurukisa: kokoonpanot, pisteet, vaihtoikkunat ja leaderboard.
import { helsinkiDate } from './data';
import { aliveTeams, fetchBracket, GURU_PHASES, type Bracket } from './playoff';
import { goaliePoints, skaterPoints, type Scoring } from './scoring';

export type PoPos = 'F' | 'D' | 'G';
export const PO_POS: PoPos[] = ['F', 'D', 'G'];
export const PO_ROSTER: Record<PoPos, number> = { F: 3, D: 2, G: 1 };

export interface PoSeason {
  id: number; name: string; liiga_season: number; reg_open: number; draft_status: 'setup' | 'live' | 'done';
  max_picks_by_pos: string; max_swaps: number; swap_open: number; scoring: string; parent_season_id: number;
}

/** Joukkuetunnisteet vaihtelevat ("859884935:kalpa" vs "859884935") → vertaillaan numero-osaa. */
export const teamKey = (id: string | null | undefined) => String(id ?? '').split(':')[0];
export const posOfRole = (role: string): PoPos => (role === 'MV' ? 'G' : role === 'P' ? 'D' : 'F');

export async function playoffSeasonOf(db: D1Database, parentId: number) {
  return db.prepare("SELECT * FROM seasons WHERE kind = 'playoff' AND parent_season_id = ? ORDER BY id DESC LIMIT 1").bind(parentId).first<PoSeason>();
}

export const limitsOf = (po: PoSeason): Record<PoPos, number> => ({ F: 8, D: 8, G: 12, ...JSON.parse(po.max_picks_by_pos || '{}') });

export interface SwapWindow { open: boolean; reason: string; closesAt: string | null; round: string | null }

/** Vaihtoikkuna: auki kun gurukierros on ratkennut ja seuraavan kierroksen 1. otteluun on yli 2 h. */
export function swapWindow(po: PoSeason, b: Bracket, now = new Date()): SwapWindow {
  if (po.draft_status !== 'done') return { open: false, reason: 'Kokoonpanot eivät ole vielä lukittuja', closesAt: null, round: null };
  if (po.swap_open === 1) return { open: true, reason: 'Ylläpito avasi vaihdot', closesAt: null, round: null };
  if (po.swap_open === -1) return { open: false, reason: 'Ylläpito sulki vaihdot', closesAt: null, round: null };
  const rounds = b.rounds.filter((r) => r.guru && r.series.length);
  const finalDone = rounds.some((r) => r.phase === 5 && r.done);
  if (finalDone) return { open: false, reason: 'Kisa on päättynyt', closesAt: null, round: null };
  const last = rounds[rounds.length - 1];
  if (!last || !last.done) return { open: false, reason: 'Kierros on käynnissä – vaihdot aukeavat, kun kaikki sarjat ovat ratkenneet', closesAt: null, round: last?.name ?? null };
  const nextPhase = GURU_PHASES[GURU_PHASES.indexOf(last.phase) + 1];
  const next = b.rounds.find((r) => r.phase === nextPhase);
  const first = next?.series.flatMap((s) => s.games.map((g) => g.start)).sort()[0] ?? null;
  const closes = first ? new Date(new Date(first).getTime() - 2 * 3600_000) : null;
  if (closes && now >= closes) return { open: false, reason: 'Vaihtoikkuna on sulkeutunut', closesAt: closes.toISOString(), round: next?.name ?? null };
  return { open: true, reason: `${last.name} ratkesi`, closesAt: closes?.toISOString() ?? null, round: next?.name ?? null };
}

export interface Slot { id: number; guru_id: number; position: PoPos; player_id: number; start_date: string | null; end_date: string | null; free: number }
interface GameRow { player_id: number; date: string; phase: number; goals: number; assists: number; pim: number; plus_minus: number; saves: number; goals_against: number; shutout: number; win: number }

export async function loadContext(db: D1Database, po: PoSeason, waitUntil: (p: Promise<unknown>) => void) {
  const sc = JSON.parse(po.scoring) as Scoring;
  const [bracket, slotsR, gamesR, gurusR, predsR] = await Promise.all([
    fetchBracket(po.liiga_season, waitUntil).catch(() => ({ season: po.liiga_season, rounds: [] }) as Bracket),
    db.prepare('SELECT * FROM playoff_slots WHERE season_id = ?').bind(po.id).all<Slot>(),
    db.prepare(`SELECT player_id, date, phase, goals, assists, pim, plus_minus, saves, goals_against, shutout, win FROM playoff_game_stats
                WHERE season = ? AND phase IN (${GURU_PHASES.join(',')})`).bind(po.liiga_season).all<GameRow>(),
    db.prepare('SELECT id, name, user_id FROM gurus WHERE season_id = ?').bind(po.id).all<{ id: number; name: string; user_id: number | null }>(),
    db.prepare('SELECT p.guru_id, p.champion, t.name AS champion_name, t.logo AS champion_logo FROM playoff_predictions p LEFT JOIN teams t ON t.id = p.champion WHERE p.season_id = ?')
      .bind(po.id).all<{ guru_id: number; champion: string | null; champion_name: string | null; champion_logo: string | null }>(),
  ]);
  const slots = slotsR.results;
  const ids = [...new Set(slots.map((s) => s.player_id))];
  const players = new Map<number, { id: number; name: string; team_id: string; team: string; role: string; picture: string | null }>();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const r = await db.prepare(`SELECT id, first_name || ' ' || last_name AS name, team_id, team_name AS team, role, picture FROM players WHERE id IN (${part.map(() => '?').join(',')})`)
      .bind(...part).all<{ id: number; name: string; team_id: string; team: string; role: string; picture: string | null }>();
    for (const p of r.results) players.set(p.id, p);
  }
  const games = new Map<number, GameRow[]>();
  for (const g of gamesR.results) { const a = games.get(g.player_id) ?? []; a.push(g); games.set(g.player_id, a); }
  const alive = new Set([...aliveTeams(bracket)].map(teamKey));
  const started = bracket.rounds.some((r) => r.guru && r.series.length);
  const gamePts = (pos: PoPos, g: GameRow) => pos === 'G'
    ? goaliePoints({ games: 1, goals: g.goals, assists: g.assists, pim: g.pim, plus_minus: g.plus_minus, shutouts: g.shutout, saves: g.saves, goals_against: g.goals_against, wins: g.win }, sc.G)
    : skaterPoints({ games: 1, goals: g.goals, assists: g.assists, pim: g.pim, plus_minus: g.plus_minus, shutouts: 0, saves: 0, goals_against: 0, wins: 0 }, sc[pos]);
  const slotPoints = (s: Slot) => Math.round((games.get(s.player_id) ?? [])
    .filter((g) => (!s.start_date || g.date >= s.start_date) && (!s.end_date || g.date < s.end_date))
    .reduce((a, g) => a + gamePts(s.position, g), 0) * 100) / 100;
  const isAlive = (teamId: string | null | undefined) => !started || alive.has(teamKey(teamId));
  return { po, sc, bracket, slots, players, alive, started, isAlive, slotPoints, gurus: gurusR.results, preds: new Map(predsR.results.map((p) => [p.guru_id, p])) };
}
export type PoCtx = Awaited<ReturnType<typeof loadContext>>;

export function rosterOf(ctx: PoCtx, guruId: number) {
  const mine = ctx.slots.filter((s) => s.guru_id === guruId);
  const fmt = (s: Slot) => {
    const p = ctx.players.get(s.player_id);
    return { slot_id: s.id, position: s.position, player_id: s.player_id, name: p?.name ?? `#${s.player_id}`, team: p?.team ?? null, team_id: p?.team_id ?? null,
      picture: p?.picture ?? null, start_date: s.start_date, end_date: s.end_date, free: !!s.free, points: ctx.slotPoints(s), alive: ctx.isAlive(p?.team_id) };
  };
  const active = mine.filter((s) => !s.end_date).map(fmt).sort((a, b) => PO_POS.indexOf(a.position) - PO_POS.indexOf(b.position));
  const history = mine.filter((s) => s.end_date).map(fmt);
  const swapsUsed = mine.filter((s) => s.start_date && !s.free).length;
  const total = Math.round(mine.reduce((a, s) => a + ctx.slotPoints(s), 0) * 100) / 100;
  return { active, history, swapsUsed, total };
}

export function leaderboard(ctx: PoCtx) {
  const champ = ctx.bracket.rounds.find((r) => r.phase === 5 && r.done)?.series[0]?.winner ?? null;
  const rows = ctx.gurus.map((g) => {
    const r = rosterOf(ctx, g.id);
    const pred = ctx.preds.get(g.id);
    return {
      id: g.id, name: g.name, points: r.total, alive: r.active.filter((x) => x.alive).length, size: r.active.length, swaps: r.swapsUsed,
      champion: pred?.champion ?? null, champion_name: pred?.champion_name ?? null, champion_logo: pred?.champion_logo ?? null,
      champion_hit: champ && pred?.champion ? teamKey(champ) === teamKey(pred.champion) : null,
    };
  }).sort((a, b) => b.points - a.points || b.alive - a.alive || a.name.localeCompare(b.name, 'fi'));
  let rank = 0, prev = NaN;
  return rows.map((r, i) => { if (r.points !== prev) { rank = i + 1; prev = r.points; } return { ...r, rank }; });
}

/** Montako gurua omistaa pelaajan tällä hetkellä (voimassa olevat paikat). */
export function reservedCounts(ctx: PoCtx, exceptGuru?: number) {
  const m = new Map<number, number>();
  for (const s of ctx.slots) if (!s.end_date && s.guru_id !== exceptGuru) m.set(s.player_id, (m.get(s.player_id) ?? 0) + 1);
  return m;
}

export const today = () => helsinkiDate();
