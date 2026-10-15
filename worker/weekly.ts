import { entityName, loadContext, type Season } from './data';
import { entityPoints, goaliePoints, skaterPoints, type Position, type StatRow } from './scoring';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Maanantai (YYYY-MM-DD) annetun päivän viikolta. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface GameRow {
  game_id: number; date: string; player_id: number; team_id: string; opponent: string | null; home: number;
  goals: number; assists: number; pim: number; plus_minus: number; saves: number; goals_against: number; shutout: number; win: number;
  role: string | null; first_name: string; last_name: string; team_name: string | null; picture: string | null;
}
interface TeamGame { game_id: number; date: string; team_id: string; opponent: string | null; gf: number; ga: number; points: number }
interface Slot { id: number; guru_id: number; position: Position; entity_id: number; start_date: string; end_date: string | null; replaced_slot_id: number | null }

const posOf = (role: string | null): Position => (role === 'MV' ? 'G' : role === 'P' ? 'D' : 'F');

/** Pelin HG annetussa paikassa. */
function gameHg(r: GameRow, pos: Position, sc: Season['scoring']): number {
  const s: StatRow = { games: 1, goals: r.goals, assists: r.assists, pim: r.pim, plus_minus: r.plus_minus, shutouts: r.shutout, saves: r.saves, goals_against: r.goals_against, wins: r.win };
  return pos === 'G' ? goaliePoints(s, sc.G) : skaterPoints(s, sc[pos === 'D' ? 'D' : 'F']);
}

/** Kuuluuko ottelupäivä paikan voimassaoloon (vaihto illalla → vaihtopäivän pelit vanhalle). */
function inSlot(s: Slot, date: string): boolean {
  const after = s.replaced_slot_id == null ? date >= s.start_date : date > s.start_date;
  return after && (s.end_date == null || date <= s.end_date);
}

/** Viikkokatsaus (ma–su). */
export async function weeklyReview(db: D1Database, season: Season, monday: string) {
  const sc = season.scoring; const y = season.liiga_season;
  const sunday = addDays(monday, 6);
  const [gamesR, teamR, slotsR, gurusR, coachesR, rangeR] = await db.batch([
    db.prepare(
      `SELECT gs.*, p.role, p.first_name, p.last_name, p.team_name, p.picture FROM game_stats gs
       JOIN players p ON p.id = gs.player_id WHERE gs.season = ? AND gs.date BETWEEN ? AND ?`,
    ).bind(y, monday, sunday),
    db.prepare('SELECT * FROM team_games WHERE season = ? AND date BETWEEN ? AND ?').bind(y, monday, sunday),
    db.prepare('SELECT s.id, s.guru_id, s.position, s.entity_id, s.start_date, s.end_date, s.replaced_slot_id FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.season_id = ?').bind(season.id),
    db.prepare('SELECT id, name FROM gurus WHERE season_id = ?').bind(season.id),
    db.prepare('SELECT c.id, c.name, c.team_id, t.name AS team FROM coaches c LEFT JOIN teams t ON t.id = c.team_id WHERE c.season_id = ?').bind(season.id),
    db.prepare('SELECT MIN(date) AS first, MAX(date) AS last FROM game_stats WHERE season = ?').bind(y),
  ]);
  const games = gamesR.results as unknown as GameRow[];
  const teamGames = teamR.results as unknown as TeamGame[];
  const slots = slotsR.results as unknown as Slot[];
  const gurus = gurusR.results as unknown as { id: number; name: string }[];
  const coaches = coachesR.results as unknown as { id: number; name: string; team_id: string; team: string | null }[];
  const range = (rangeR.results[0] ?? {}) as { first: string | null; last: string | null };

  // Pelaajat: viikon summa
  const byPlayer = new Map<number, { id: number; name: string; team: string | null; picture: string | null; pos: Position; hg: number; games: number; goals: number; assists: number }>();
  const best: { id: number; name: string; team: string | null; pos: Position; date: string; opponent: string | null; hg: number; line: string }[] = [];
  const gameHgBy = new Map<string, number>(); // `${player}:${date}` → hg
  for (const r of games) {
    const pos = posOf(r.role);
    const hg = gameHg(r, pos, sc);
    gameHgBy.set(`${r.player_id}:${r.date}`, (gameHgBy.get(`${r.player_id}:${r.date}`) ?? 0) + hg);
    const name = `${r.first_name} ${r.last_name}`;
    const p = byPlayer.get(r.player_id) ?? { id: r.player_id, name, team: r.team_name, picture: r.picture, pos, hg: 0, games: 0, goals: 0, assists: 0 };
    p.hg += hg; p.games++; p.goals += r.goals; p.assists += r.assists;
    byPlayer.set(r.player_id, p);
    const line = pos === 'G'
      ? `${r.saves} torjuntaa, ${r.goals_against} päästettyä${r.shutout ? ', nollapeli' : ''}`
      : `${r.goals}+${r.assists}, ${r.plus_minus > 0 ? '+' : ''}${r.plus_minus}${r.pim ? `, ${r.pim} min` : ''}`;
    best.push({ id: r.player_id, name, team: r.team_name, pos, date: r.date, opponent: r.opponent, hg: r2(hg), line });
  }
  const players = [...byPlayer.values()].map((p) => ({ ...p, hg: r2(p.hg) })).sort((a, b) => b.hg - a.hg);
  const topByPos = (pos: Position) => players.filter((p) => p.pos === pos).slice(0, 3);

  // Valmentajat
  const teamHg = new Map<string, { hg: number; games: number; record: string[] }>();
  const coachGame = new Map<string, number>(); // `${team}:${date}` → hg
  for (const t of teamGames) {
    const hg = t.points * sc.C.teamPoints;
    const x = teamHg.get(t.team_id) ?? { hg: 0, games: 0, record: [] };
    x.hg += hg; x.games++; x.record.push(`${t.gf}–${t.ga}`);
    teamHg.set(t.team_id, x);
    coachGame.set(`${t.team_id}:${t.date}`, (coachGame.get(`${t.team_id}:${t.date}`) ?? 0) + hg);
  }
  const coachTeam = new Map(coaches.map((c) => [c.id, c.team_id]));
  const coachList = coaches.map((c) => ({ id: c.id, name: c.name, team: c.team, hg: r2(teamHg.get(c.team_id)?.hg ?? 0), games: teamHg.get(c.team_id)?.games ?? 0 }))
    .filter((c) => c.games > 0).sort((a, b) => b.hg - a.hg);

  // Gurut: viikon pisteet ottelukohtaisesti voimassa olleista paikoista
  const guruPts = new Map<number, number>(gurus.map((g) => [g.id, 0]));
  const pickCount = new Map<string, number>();
  for (const s of slots) {
    if (s.end_date == null) pickCount.set(`${s.position}:${s.entity_id}`, (pickCount.get(`${s.position}:${s.entity_id}`) ?? 0) + 1);
    let sum = 0;
    if (s.position === 'C') {
      const team = coachTeam.get(s.entity_id);
      for (const t of teamGames) if (t.team_id === team && inSlot(s, t.date)) sum += t.points * sc.C.teamPoints;
    } else {
      for (const r of games) if (r.player_id === s.entity_id && inSlot(s, r.date)) sum += gameHg(r, s.position, sc);
    }
    if (!sum) continue;
    guruPts.set(s.guru_id, (guruPts.get(s.guru_id) ?? 0) + sum);
  }
  // Kentälliset ovat yksityisiä → ei paljasteta gurun pelaajia
  const guruList = gurus.map((g) => ({ id: g.id, name: g.name, points: r2(guruPts.get(g.id) ?? 0) }))
    .sort((a, b) => b.points - a.points);

  // Gurujen suosikit: eniten omistetut pelaajat ja niiden viikko
  const popTop = [...pickCount.entries()].filter(([k]) => !k.startsWith('C:')).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const popIds = popTop.map(([k]) => Number(k.split(':')[1]));
  const popNames = new Map(popIds.length ? (await db.prepare(`SELECT id, first_name || ' ' || last_name AS name FROM players WHERE id IN (${popIds.map(() => '?').join(',')})`)
    .bind(...popIds).all<{ id: number; name: string }>()).results.map((r) => [r.id, r.name]) : []);
  const popular = popTop.map(([k, n]) => { const id = Number(k.split(':')[1]); const p = byPlayer.get(id); return { id, name: popNames.get(id) ?? null, owners: n, hg: p?.hg ?? 0, games: p?.games ?? 0 }; });
  const hidden = players.filter((p) => !pickCount.has(`${p.pos}:${p.id}`)).slice(0, 3); // kukaan ei omista

  return {
    monday, sunday, first: range.first, last: range.last,
    games: new Set(teamGames.map((t) => t.game_id)).size,
    gurus: guruList,
    players: players.slice(0, 10),
    topF: topByPos('F'), topD: topByPos('D'), topG: topByPos('G'),
    coaches: coachList.slice(0, 3),
    bestGames: [...best].sort((a, b) => b.hg - a.hg).slice(0, 5),
    worstGames: [...best].sort((a, b) => a.hg - b.hg).slice(0, 3),
    popular, hidden,
  };
}

/** Vaihtojen jälkianalyysi: tulleen tuotto vs. lähteneen tuotto vaihdon jälkeen. */
export async function swapAnalysis(db: D1Database, season: Season) {
  const ctx = await loadContext(db, season);
  const rows = (await db.prepare(
    `SELECT n.id, n.guru_id, g.name AS guru, n.position, n.entity_id AS in_id, n.start_date AS date, n.start_points AS in_start, n.end_points AS in_end,
            o.entity_id AS out_id, o.end_points AS out_end
     FROM roster_slots n JOIN roster_slots o ON o.id = n.replaced_slot_id JOIN gurus g ON g.id = n.guru_id
     WHERE g.season_id = ?`,
  ).bind(season.id).all<{ id: number; guru_id: number; guru: string; position: Position; in_id: number; date: string; in_start: number; in_end: number | null; out_id: number; out_end: number | null }>()).results;
  const pts = (p: Position, id: number) => entityPoints(p, id, season.scoring, ctx.stats, ctx.coachTeam, ctx.teamPoints);
  const swaps = rows.map((r) => {
    const gained = r2((r.in_end ?? pts(r.position, r.in_id)) - r.in_start);
    const missed = r2(pts(r.position, r.out_id) - (r.out_end ?? 0));
    return {
      id: r.id, guru_id: r.guru_id, guru: r.guru, position: r.position, date: r.date,
      in: entityName(ctx, r.position, r.in_id).name, out: entityName(ctx, r.position, r.out_id).name,
      gained, missed, net: r2(gained - missed),
    };
  }).sort((a, b) => b.net - a.net);
  const byGuru = new Map<number, { guru_id: number; guru: string; swaps: number; net: number }>();
  for (const s of swaps) {
    const x = byGuru.get(s.guru_id) ?? { guru_id: s.guru_id, guru: s.guru, swaps: 0, net: 0 };
    x.swaps++; x.net = r2(x.net + s.net);
    byGuru.set(s.guru_id, x);
  }
  return { swaps, gurus: [...byGuru.values()].sort((a, b) => b.net - a.net) };
}
