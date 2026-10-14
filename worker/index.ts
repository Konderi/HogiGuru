import { Hono, type Context as HonoCtx, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { hashPassword, newSessionId, verifyPassword } from './auth';
import {
  computeLeaderboard, getActiveSeason, helsinkiDate, loadContext, maxFor, slotView, usageCounts, usageKey,
  type Season, type SlotRow,
} from './data';
import { autoPick, draftState, finalizeDraft, makePick, swapSlot } from './draft';
import { syncLiiga } from './liiga';
import { deadlineOf, helsinkiNow, nextOpenSwapDay, previewSwapDay, priorityOrder, processSwapDay, type SwapDay } from './swaps';
import { entityName } from './data';
import { computeResults } from './predictions';
import { goaliePoints, POSITIONS, skaterPoints, type Position, type StatRow } from './scoring';

interface Env { DB: D1Database }
interface User { id: number; email: string; name: string; role: 'admin' | 'guru' }
type App = { Bindings: Env; Variables: { user: User | null; season: Season } };
type C = HonoCtx<App>;

const SESSION = 'hg_session';
const SESSION_DAYS = 30;

const app = new Hono<App>().basePath('/api');

app.onError((err, c) => c.json({ error: err.message }, 400));

// --- Istunto ja aktiivinen kausi jokaiseen pyyntöön
app.use('*', async (c, next) => {
  const sid = getCookie(c, SESSION);
  let user: User | null = null;
  if (sid) {
    user = await c.env.DB.prepare(
      'SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.active = 1',
    ).bind(sid, Date.now()).first<User>();
  }
  c.set('user', user);
  const season = await getActiveSeason(c.env.DB);
  if (!season) return c.json({ error: 'Ei aktiivista kautta' }, 500);
  c.set('season', season);
  await next();
});

const requireUser = async (c: C, next: Next) => (c.get('user') ? next() : c.json({ error: 'Kirjaudu sisään' }, 401));
const requireAdmin = async (c: C, next: Next) => (c.get('user')?.role === 'admin' ? next() : c.json({ error: 'Vain ylläpitäjille' }, 403));

const num = (v: unknown) => (v === '' || v == null ? null : Number(v));
const isPos = (p: unknown): p is Position => POSITIONS.includes(p as Position);

// ================= JULKINEN =================

app.get('/public/overview', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const today = helsinkiDate();
  const nowHel = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const [leaderboard, nextSwap, lastSync, standings] = await Promise.all([
    computeLeaderboard(db, season),
    db.prepare("SELECT date, note, start_time, end_time FROM swap_days WHERE season_id = ? AND date || ' ' || end_time >= ? ORDER BY date LIMIT 1").bind(season.id, nowHel).first(),
    db.prepare('SELECT finished_at, ok, message FROM sync_log WHERE ok = 1 ORDER BY id DESC LIMIT 1').first(),
    standingsQuery(db, season),
  ]);
  return c.json({
    season: { name: season.name, draftStatus: season.draft_status, resultsPublished: !!season.results_published },
    registration: registrationInfo(season),
    leaderboard: leaderboard.map(({ user_id: _u, ...r }) => r),
    nextSwap, lastSync, standings,
  });
});

app.get('/leaderboard', async (c) => {
  const rows = await computeLeaderboard(c.env.DB, c.get('season'));
  return c.json(rows.map(({ user_id: _u, ...r }) => r));
});

app.get('/leaderboard/history', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT h.date, h.guru_id, h.points, h.rank FROM leaderboard_history h JOIN gurus g ON g.id = h.guru_id
     WHERE g.season_id = ? ORDER BY h.date`,
  ).bind(c.get('season').id).all();
  return c.json(res.results);
});

function standingsQuery(db: D1Database, season: Season) {
  return db.prepare(
    `SELECT s.*, t.name, t.short_name, t.logo FROM standings s JOIN teams t ON t.id = s.team_id
     WHERE s.season = ? ORDER BY s.ranking`,
  ).bind(season.liiga_season).all().then((r) => r.results);
}
app.get('/standings', async (c) => c.json(await standingsQuery(c.env.DB, c.get('season'))));

/** Pistepörssi HG-pisteillä + varaustilanne (x/5). Ei paljasta kenellä pelaaja on. */
app.get('/stats', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const reqPos = c.req.query('pos');
  const pos: 'F' | 'D' | 'G' = reqPos === 'D' || reqPos === 'G' ? reqPos : 'F';
  const roleFilter = pos === 'G' ? "p.role = 'MV'" : pos === 'D' ? "p.role = 'P'" : "p.role NOT IN ('MV','P')";
  const [rows, usage] = await Promise.all([
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.team_name, p.picture, p.role, s.*
       FROM player_stats s JOIN players p ON p.id = s.player_id WHERE s.season = ? AND ${roleFilter}`,
    ).bind(season.liiga_season).all<StatRow & { id: number; first_name: string; last_name: string; team_name: string; picture: string; role: string; save_pct: number }>(),
    usageCounts(db, season.id),
  ]);
  const out = rows.results.map((r) => ({
    id: r.id, name: `${r.first_name} ${r.last_name}`, team: r.team_name, picture: r.picture,
    games: r.games, goals: r.goals, assists: r.assists, pim: r.pim, plusMinus: r.plus_minus,
    shutouts: r.shutouts, saves: r.saves, goalsAgainst: r.goals_against, wins: r.wins, savePct: r.save_pct,
    hg: pos === 'G' ? goaliePoints(r, season.scoring.G) : skaterPoints(r, season.scoring[pos]),
    reserved: usage.get(usageKey(pos, r.id)) ?? 0,
  })).sort((a, b) => b.hg - a.hg);
  return c.json({ maxPicks: maxFor(season, pos), players: out });
});

app.get('/coaches', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const [res, usage] = await Promise.all([
    db.prepare(
      `SELECT c.id, c.name, c.fired, c.team_id, t.name AS team, t.logo, st.points AS team_points
       FROM coaches c JOIN teams t ON t.id = c.team_id LEFT JOIN standings st ON st.team_id = c.team_id AND st.season = ?
       WHERE c.season_id = ? ORDER BY t.name`,
    ).bind(season.liiga_season, season.id).all<{ id: number; team_points: number | null }>(),
    usageCounts(db, season.id),
  ]);
  return c.json(res.results.map((r) => ({
    ...r, hg: Math.round((r.team_points ?? 0) * season.scoring.C.teamPoints * 100) / 100,
    reserved: usage.get(usageKey('C', r.id)) ?? 0, max: maxFor(season, 'C'),
  })));
});

/** Pelaajakortti: liiga.fi:n pelaajatiedot (välimuistissa 6 h) */
app.get('/players/:id/info', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Virheellinen pelaaja' }, 400);
  const url = `https://liiga.fi/api/v2/players/info/${id}`;
  const cache = caches.default;
  const key = new Request(url);
  let res = await cache.match(key);
  if (!res) {
    const r = await fetch(url, { headers: { 'User-Agent': 'HogiGuru/1.0 (+https://guru.konderi.fi)' } });
    if (!r.ok) return c.json({ error: 'Pelaajatietoja ei saatu liiga.fi:stä' }, 502);
    res = new Response(r.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' } });
    c.executionCtx.waitUntil(cache.put(key, res.clone()));
  }
  type Hist = Record<string, string | number> & { season: number; tournament: string; teamName: string; teamShortName: string };
  type Info = {
    firstName: string; lastName: string; dateOfBirth: string | null; height: number | null; weight: number | null; handedness: string | null;
    nationality?: { code: string }; birthLocality?: { name?: string; country?: { code: string } };
    teams?: Record<string, { season: number; jersey: number | null; teamName: string; imageUrl: string | null; position: string | null }>;
    historical?: { regular?: Hist[] };
  };
  const d = await res.json<Info>();
  const seasons = Object.values(d.teams ?? {}).sort((a, b) => b.season - a.season);
  const cur = seasons[0];
  const num = (v: unknown) => (typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v ?? 0));
  const history = (d.historical?.regular ?? [])
    .filter((h) => h.tournament === 'RUNKOSARJA' && num(h.games) > 0)
    .sort((a, b) => b.season - a.season)
    .map((h) => ({
      season: h.season, team: h.teamShortName || h.teamName, games: num(h.games), goals: num(h.goals), assists: num(h.assists),
      points: num(h.points), pim: num(h.penaltyMinutes), plusMinus: num(h.plusMinus),
      saves: num(h.saves), savePct: num(h.savePercentage), gaa: num(h.goalsAgainstAverage), shutouts: num(h.shutOut), gkWins: num(h.gkWins),
    }));
  return c.json({
    id, name: `${d.firstName} ${d.lastName}`, dateOfBirth: d.dateOfBirth, height: d.height, weight: d.weight, handedness: d.handedness,
    nationality: d.nationality?.code ?? null, birthplace: [d.birthLocality?.name, d.birthLocality?.country?.code].filter(Boolean).join(', ') || null,
    team: cur?.teamName ?? null, jersey: cur?.jersey ?? null, position: cur?.position ?? null,
    picture: seasons.find((s) => s.imageUrl)?.imageUrl ?? null,
    history,
  });
});

app.get('/swap-days', async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM swap_days WHERE season_id = ? ORDER BY date').bind(c.get('season').id).all();
  return c.json(res.results);
});

app.get('/hall-of-fame', async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM hall_of_fame ORDER BY season_name DESC, rank').all();
  return c.json(res.results);
});

app.get('/teams', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM teams ORDER BY name').all()).results));

app.get('/results', async (c) => {
  const season = c.get('season');
  if (!season.results_published) return c.json({ published: false, season: season.name });
  return c.json(await computeResults(c.env.DB, season));
});

// ================= ILMOITTAUTUMINEN =================

const CATEGORIES = ['points', 'goals', 'assists', 'plusMinus', 'dPoints', 'pim', 'shutouts'] as const;

function registrationInfo(s: Season) {
  const deadlinePassed = !!s.registration_deadline && new Date(`${s.registration_deadline}:00+03:00`).getTime() < Date.now();
  return {
    open: !!s.registration_open && !deadlinePassed, enabled: !!s.registration_open,
    deadline: s.registration_deadline, fee: s.entry_fee, info: s.registration_info,
  };
}

/** Lomakkeen tarvitsemat tiedot: joukkueet, pelaajat joukkueittain, säännöt. */
app.get('/public/registration', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const [teams, players, swapDays, coaches, prevStandings] = await db.batch([
    db.prepare('SELECT t.id, t.name, t.logo FROM teams t ORDER BY t.name'),
    db.prepare(
      `SELECT p.id, p.first_name || ' ' || p.last_name AS name, p.team_id, p.team_name AS team, p.role
       FROM players p JOIN player_stats s ON s.player_id = p.id AND s.season = ? ORDER BY p.last_name, p.first_name`,
    ).bind(season.liiga_season),
    db.prepare('SELECT date, start_time, end_time FROM swap_days WHERE season_id = ? ORDER BY date').bind(season.id),
    db.prepare('SELECT c.id, c.name, c.team_id, t.name AS team FROM coaches c LEFT JOIN teams t ON t.id = c.team_id WHERE c.season_id = ? AND c.fired = 0 ORDER BY t.name').bind(season.id),
    // Korien oletusjako: edellisen kauden sarjataulukko (tai nykyinen, jos edellistä ei ole)
    db.prepare(`SELECT team_id FROM standings WHERE season = COALESCE((SELECT MAX(season) FROM standings WHERE season < ?), ?) ORDER BY ranking`).bind(season.liiga_season, season.liiga_season),
  ]);
  return c.json({
    season: { name: season.name, roster: season.roster, maxPicks: maxMapPublic(season), maxSwaps: season.max_swaps, scoring: season.scoring, selectionMode: season.selection_mode, baskets: season.baskets },
    registration: registrationInfo(season),
    teams: teams.results, players: players.results, swapDays: swapDays.results, coaches: coaches.results,
    standings: prevStandings.results,
  });
});
const maxMapPublic = (s: Season) => Object.fromEntries(POSITIONS.map((p) => [p, maxFor(s, p)]));

app.post('/public/registration', async (c) => {
  const season = c.get('season');
  if (!registrationInfo(season).open) throw new Error('Ilmoittautuminen ei ole auki');
  const b = await c.req.json<{ name: string; phone?: string; email: string; standings: string[]; top_scorers: Record<string, number>; categories: Record<string, number>; website?: string; position_order?: string[]; rankings?: Record<string, number[]>; basket_picks?: { position: string; entity_id: number }[] }>();
  if (b.website) return c.json({ ok: true }); // roskapostiansa
  const name = b.name?.trim(); const email = b.email?.trim().toLowerCase();
  if (!name || name.length > 80) throw new Error('Kirjoita nimesi');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Tarkista sähköpostiosoite');
  const standings = (b.standings ?? []).map(String).slice(0, 40);
  if (new Set(standings).size !== standings.length) throw new Error('Sarjataulukossa on sama joukkue kahdesti');
  const top = Object.fromEntries(Object.entries(b.top_scorers ?? {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => v));
  const cats = Object.fromEntries(CATEGORIES.map((k) => [k, Number(b.categories?.[k]) || null]).filter(([, v]) => v));
  // All-Stars-toivelistat ja draftin valintajärjestys (pakollisia)
  const hasCoaches = !!(await c.env.DB.prepare('SELECT 1 FROM coaches WHERE season_id = ? LIMIT 1').bind(season.id).first());
  const need = POSITIONS.reduce((s, p) => s + (season.roster[p] ?? 0), 0);
  let rankings: Record<string, number[]> = {}; let order: Position[] = []; let picks: { position: Position; entity_id: number }[] = [];
  if (season.selection_mode === 'baskets') {
    // Korimalli: jokaisesta korista yksi valinta, paikkajakauma = kentällinen
    const bk = season.baskets;
    picks = bk.map((_, i) => b.basket_picks?.[i]).map((x) => ({ position: x?.position as Position, entity_id: Number(x?.entity_id) }));
    if (picks.some((x) => !isPos(x.position) || !x.entity_id)) throw new Error('Valitse yksi pelaaja jokaisesta korista');
    if (POSITIONS.some((p) => picks.filter((x) => x.position === p).length !== (season.roster[p] ?? 0)))
      throw new Error(`Kentällisessä pitää olla ${POSITIONS.map((p) => `${season.roster[p]} × ${POS_FI[p]}`).join(', ')}`);
    for (const [i, x] of picks.entries()) {
      const row = x.position === 'C'
        ? await c.env.DB.prepare('SELECT team_id FROM coaches WHERE id = ? AND season_id = ?').bind(x.entity_id, season.id).first<{ team_id: string }>()
        : await c.env.DB.prepare('SELECT team_id, role FROM players WHERE id = ?').bind(x.entity_id).first<{ team_id: string; role: string }>();
      if (!row || !bk[i].includes(row.team_id)) throw new Error(`Korin ${i + 1} valinta ei kuulu korin joukkueisiin`);
    }
  } else {
    rankings = Object.fromEntries(POSITIONS.map((p) => [p, [...new Set((b.rankings?.[p] ?? []).map(Number).filter(Boolean))].slice(0, 60)]));
    for (const p of POSITIONS) {
      if (p === 'C' && !hasCoaches) continue;
      if (rankings[p].length < (season.roster[p] ?? 0)) throw new Error(`Lisää All-Stars-toivelistaan vähintään ${season.roster[p]} × ${POS_FI[p]}`);
    }
    order = (b.position_order ?? []).filter(isPos);
    if (order.length !== need || POSITIONS.some((p) => order.filter((x) => x === p).length !== (season.roster[p] ?? 0)))
      throw new Error('Täytä draftin valintajärjestys kokonaan');
  }
  await c.env.DB.prepare(
    `INSERT INTO registrations (season_id, name, phone, email, standings, top_scorers, categories, position_order, rankings, basket_picks) VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(season_id, email) DO UPDATE SET name = excluded.name, phone = excluded.phone, standings = excluded.standings,
       top_scorers = excluded.top_scorers, categories = excluded.categories, position_order = excluded.position_order,
       rankings = excluded.rankings, basket_picks = excluded.basket_picks, updated_at = CURRENT_TIMESTAMP`,
  ).bind(season.id, name, b.phone?.trim().slice(0, 30) || null, email, JSON.stringify(standings), JSON.stringify(top), JSON.stringify(cats), JSON.stringify(order), JSON.stringify(rankings), JSON.stringify(picks)).run();
  return c.json({ ok: true });
});
const POS_FI: Record<Position, string> = { F: 'hyökkääjä', D: 'puolustaja', G: 'maalivahti', C: 'valmentaja' };

app.get('/players/search', requireUser, async (c) => {
  const q = `%${(c.req.query('q') ?? '').trim()}%`;
  const pos = c.req.query('pos') as Position | undefined;
  const role = pos === 'G' ? "AND role = 'MV'" : pos === 'D' ? "AND role = 'P'" : pos === 'F' ? "AND role NOT IN ('MV','P')" : '';
  const res = await c.env.DB.prepare(
    `SELECT id, first_name || ' ' || last_name AS name, team_name AS team, role, picture FROM players
     WHERE (first_name || ' ' || last_name) LIKE ? ${role} ORDER BY last_name LIMIT 25`,
  ).bind(q).all<{ id: number; role: string }>();
  const season = c.get('season');
  const usage = await usageCounts(c.env.DB, season.id);
  const posOf = (r: string): Position => pos ?? (r === 'MV' ? 'G' : r === 'P' ? 'D' : 'F');
  return c.json(res.results.map((r) => ({ ...r, reserved: usage.get(usageKey(posOf(r.role), r.id)) ?? 0, max: maxFor(season, posOf(r.role)) })));
});

// ================= KIRJAUTUMINEN =================

async function startSession(c: C, userId: number) {
  const id = newSessionId();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)').bind(id, userId, Date.now() + SESSION_DAYS * 864e5).run();
  setCookie(c, SESSION, id, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 });
}

app.get('/auth/me', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ user: null, needsSetup: !(await c.env.DB.prepare('SELECT 1 FROM users LIMIT 1').first()) });
  const guru = await c.env.DB.prepare('SELECT id, name FROM gurus WHERE user_id = ? AND season_id = ?').bind(user.id, c.get('season').id).first();
  return c.json({ user, guru });
});

app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  const u = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ? AND active = 1').bind(email?.trim()).first<{ id: number; password_hash: string }>();
  if (!u || !(await verifyPassword(password ?? '', u.password_hash))) return c.json({ error: 'Väärä sähköposti tai salasana' }, 401);
  await startSession(c, u.id);
  return c.json({ ok: true });
});

app.post('/auth/logout', async (c) => {
  const sid = getCookie(c, SESSION);
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  deleteCookie(c, SESSION, { path: '/' });
  return c.json({ ok: true });
});

app.post('/auth/password', requireUser, async (c) => {
  const { current, next } = await c.req.json<{ current: string; next: string }>();
  if (!next || next.length < 8) throw new Error('Salasanan pitää olla vähintään 8 merkkiä');
  const u = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(c.get('user')!.id).first<{ password_hash: string }>();
  if (!u || !(await verifyPassword(current, u.password_hash))) throw new Error('Nykyinen salasana on väärin');
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), c.get('user')!.id).run();
  return c.json({ ok: true });
});

/** Ensimmäisen pääkäyttäjän luonti – toimii vain kun käyttäjiä ei ole. */
app.post('/setup', async (c) => {
  if (await c.env.DB.prepare('SELECT 1 FROM users LIMIT 1').first()) return c.json({ error: 'Asennus on jo tehty' }, 403);
  const { email, name, password } = await c.req.json<{ email: string; name: string; password: string }>();
  if (!email || !name || !password || password.length < 8) throw new Error('Täytä kaikki kentät (salasana väh. 8 merkkiä)');
  const u = await c.env.DB.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,'admin') RETURNING id")
    .bind(email.trim(), name.trim(), await hashPassword(password)).first<{ id: number }>();
  await startSession(c, u!.id);
  return c.json({ ok: true });
});

// ================= GURU =================

async function guruTeam(c: C, guruId: number) {
  const db = c.env.DB; const season = c.get('season');
  const ctx = await loadContext(db, season);
  const [slots, adj, lb] = await Promise.all([
    db.prepare('SELECT * FROM roster_slots WHERE guru_id = ? ORDER BY position, start_date').bind(guruId).all<SlotRow>(),
    db.prepare('SELECT * FROM adjustments WHERE guru_id = ? ORDER BY created_at').bind(guruId).all(),
    computeLeaderboard(db, season, ctx),
  ]);
  const usedSwaps = slots.results.filter((s) => (s as SlotRow & { replaced_slot_id: number | null }).replaced_slot_id != null).length;
  return {
    slots: slots.results.map((s) => slotView(s, season, ctx)),
    adjustments: adj.results,
    standing: lb.find((r) => r.id === guruId) ?? null,
    swaps: { used: usedSwaps, max: season.max_swaps },
  };
}

app.get('/me/team', requireUser, async (c) => {
  const g = await c.env.DB.prepare('SELECT id, name FROM gurus WHERE user_id = ? AND season_id = ?').bind(c.get('user')!.id, c.get('season').id).first<{ id: number; name: string }>();
  if (!g) return c.json({ guru: null });
  return c.json({ guru: g, ...(await guruTeam(c, g.id)) });
});

app.get('/me/draft-prefs', requireUser, async (c) => {
  const g = await c.env.DB.prepare('SELECT id FROM gurus WHERE user_id = ? AND season_id = ?').bind(c.get('user')!.id, c.get('season').id).first<{ id: number }>();
  if (!g) return c.json(null);
  return c.json(await getPrefs(c, g.id));
});
app.put('/me/draft-prefs', requireUser, async (c) => {
  if (c.get('season').draft_status !== 'setup') throw new Error('Draft on jo alkanut');
  const g = await c.env.DB.prepare('SELECT id FROM gurus WHERE user_id = ? AND season_id = ?').bind(c.get('user')!.id, c.get('season').id).first<{ id: number }>();
  if (!g) throw new Error('Et ole mukana tällä kaudella');
  await savePrefs(c, g.id, await c.req.json());
  return c.json({ ok: true });
});

async function getPrefs(c: C, guruId: number) {
  const r = await c.env.DB.prepare('SELECT position_order, rankings, updated_at FROM draft_prefs WHERE guru_id = ?').bind(guruId).first<{ position_order: string; rankings: string; updated_at: string }>();
  return { positionOrder: JSON.parse(r?.position_order ?? '[]'), rankings: JSON.parse(r?.rankings ?? '{}'), updatedAt: r?.updated_at ?? null };
}
async function savePrefs(c: C, guruId: number, body: { positionOrder: Position[]; rankings: Record<string, number[]> }) {
  const order = (body.positionOrder ?? []).filter(isPos);
  const rankings = Object.fromEntries(POSITIONS.map((p) => [p, (body.rankings?.[p] ?? []).map(Number).filter(Boolean)]));
  await c.env.DB.prepare(
    `INSERT INTO draft_prefs (guru_id, position_order, rankings, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(guru_id) DO UPDATE SET position_order = excluded.position_order, rankings = excluded.rankings, updated_at = CURRENT_TIMESTAMP`,
  ).bind(guruId, JSON.stringify(order), JSON.stringify(rankings)).run();
}

app.get('/draft', requireUser, async (c) => c.json(await draftState(c.env.DB, c.get('season'))));

// --- Vaihtotoiveet
async function myGuru(c: C) {
  return c.env.DB.prepare('SELECT id, name, draft_number FROM gurus WHERE user_id = ? AND season_id = ?').bind(c.get('user')!.id, c.get('season').id)
    .first<{ id: number; name: string; draft_number: number | null }>();
}

app.get('/me/swaps', requireUser, async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const g = await myGuru(c);
  if (!g) return c.json({ guru: null });
  const day = await nextOpenSwapDay(db, season);
  const used = await db.prepare('SELECT COUNT(*) AS n FROM roster_slots WHERE guru_id = ? AND replaced_slot_id IS NOT NULL').bind(g.id).first<{ n: number }>();
  const history = await db.prepare(
    `SELECT r.*, d.date FROM swap_requests r JOIN swap_days d ON d.id = r.swap_day_id WHERE r.guru_id = ? AND d.processed_at IS NOT NULL ORDER BY d.date DESC, r.priority`,
  ).bind(g.id).all<{ candidates: string }>();
  let requests: unknown[] = []; let position = null; let reversed = false; let dayNumber = 0;
  if (day) {
    const po = await priorityOrder(db, season, day);
    reversed = po.reversed; dayNumber = po.dayNumber;
    position = po.order.findIndex((x) => x.id === g.id) + 1 || null;
    const r = await db.prepare('SELECT slot_id, candidates FROM swap_requests WHERE swap_day_id = ? AND guru_id = ? ORDER BY priority').bind(day.id, g.id).all<{ slot_id: number; candidates: string }>();
    requests = r.results.map((x) => ({ slot_id: x.slot_id, candidates: JSON.parse(x.candidates) }));
  }
  return c.json({
    guru: g, day, deadline: day ? deadlineOf(day) : null, now: helsinkiNow(), position, reversed, dayNumber,
    gurus: (await db.prepare('SELECT COUNT(*) AS n FROM gurus WHERE season_id = ?').bind(season.id).first<{ n: number }>())?.n ?? 0,
    swaps: { used: used?.n ?? 0, max: season.max_swaps },
    requests, history: history.results.map((h) => ({ ...h, candidates: JSON.parse(h.candidates) })),
  });
});

app.put('/me/swaps', requireUser, async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const g = await myGuru(c);
  if (!g) throw new Error('Et ole mukana tällä kaudella');
  if (season.draft_status !== 'done') throw new Error('Vaihtotoiveita voi tehdä vasta draftin jälkeen');
  const day = await nextOpenSwapDay(db, season);
  if (!day) throw new Error('Ei avointa vaihtopäivää');
  const body = await c.req.json<{ requests: { slot_id: number; candidates: number[] }[] }>();
  const reqs = (body.requests ?? []).slice(0, 10);
  const slots = await db.prepare('SELECT id, position FROM roster_slots WHERE guru_id = ? AND end_date IS NULL').bind(g.id).all<{ id: number; position: Position }>();
  const mine = new Map(slots.results.map((s) => [s.id, s.position]));
  const seen = new Set<number>();
  for (const r of reqs) {
    if (!mine.has(Number(r.slot_id))) throw new Error('Virheellinen paikka');
    if (seen.has(Number(r.slot_id))) throw new Error('Sama pelaaja ei voi lähteä kahdesti');
    seen.add(Number(r.slot_id));
    if (!r.candidates?.length) throw new Error('Valitse jokaiseen vaihtoon vähintään yksi tulija');
  }
  await db.batch([
    db.prepare('DELETE FROM swap_requests WHERE swap_day_id = ? AND guru_id = ?').bind(day.id, g.id),
    ...reqs.map((r, i) => db.prepare('INSERT INTO swap_requests (swap_day_id, guru_id, priority, slot_id, candidates) VALUES (?,?,?,?,?)')
      .bind(day.id, g.id, i + 1, Number(r.slot_id), JSON.stringify(r.candidates.map(Number).filter(Boolean).slice(0, 10)))),
  ]);
  return c.json({ ok: true });
});

/** Käsitellyt vaihdot julkisesti. */
app.get('/public/swaps', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const ctx = await loadContext(db, season);
  const res = await db.prepare(
    `SELECT d.date, g.name AS guru, s.position, s.entity_id AS out_id, r.result_entity_id AS in_id, r.status, r.result_note
     FROM swap_requests r JOIN swap_days d ON d.id = r.swap_day_id JOIN gurus g ON g.id = r.guru_id JOIN roster_slots s ON s.id = r.slot_id
     WHERE d.season_id = ? AND d.processed_at IS NOT NULL AND r.status = 'done' ORDER BY d.date DESC, g.name`,
  ).bind(season.id).all<{ position: Position; out_id: number; in_id: number }>();
  return c.json(res.results.map((r) => ({ ...r, out_name: entityName(ctx, r.position, r.out_id).name, in_name: entityName(ctx, r.position, r.in_id).name })));
});

// ================= YLLÄPITO =================
const admin = new Hono<App>();
admin.use('*', requireAdmin);

admin.get('/overview', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const [sync, counts] = await db.batch([
    db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 10'),
    db.prepare(`SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM gurus WHERE season_id = ?1) AS gurus,
      (SELECT COUNT(*) FROM players) AS players, (SELECT COUNT(*) FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.season_id = ?1 AND s.replaced_slot_id IS NOT NULL) AS swaps`).bind(season.id),
  ]);
  return c.json({ season, sync: sync.results, counts: counts.results[0] });
});

admin.post('/sync', async (c) => c.json({ message: await syncLiiga(c.env.DB) }));

// Kausi & pisteytys
admin.put('/season', async (c) => {
  const b = await c.req.json<Partial<Season>>();
  const s = c.get('season');
  await c.env.DB.prepare(
    `UPDATE seasons SET name = ?, liiga_season = ?, max_swaps = ?, max_picks_per_entity = ?, roster = ?, scoring = ?, draft_snake = ?,
       max_picks_by_pos = ?, registration_open = ?, registration_deadline = ?, entry_fee = ?, registration_info = ?,
       results_published = ?, selection_mode = ?, baskets = ? WHERE id = ?`,
  ).bind(
    b.name ?? s.name, b.liiga_season ?? s.liiga_season, b.max_swaps === undefined ? s.max_swaps : num(b.max_swaps),
    b.max_picks_per_entity ?? s.max_picks_per_entity, JSON.stringify(b.roster ?? s.roster), JSON.stringify(b.scoring ?? s.scoring),
    b.draft_snake === undefined ? s.draft_snake : b.draft_snake ? 1 : 0,
    JSON.stringify(b.max_picks_by_pos ?? s.max_picks_by_pos),
    b.registration_open === undefined ? s.registration_open : b.registration_open ? 1 : 0,
    b.registration_deadline === undefined ? s.registration_deadline : b.registration_deadline || null,
    b.entry_fee === undefined ? s.entry_fee : b.entry_fee || null,
    b.registration_info === undefined ? s.registration_info : b.registration_info || null,
    b.results_published === undefined ? s.results_published : b.results_published ? 1 : 0,
    b.selection_mode === 'baskets' || b.selection_mode === 'draft' ? b.selection_mode : s.selection_mode,
    JSON.stringify((b.baskets ?? s.baskets).map((x) => x.map(String)).filter((x) => x.length)),
    s.id,
  ).run();
  return c.json({ ok: true });
});

// Ilmoittautumiset
admin.get('/registrations', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT r.*, g.name AS guru_name FROM registrations r LEFT JOIN gurus g ON g.id = r.guru_id WHERE r.season_id = ? ORDER BY r.created_at`,
  ).bind(c.get('season').id).all<Record<string, string>>();
  return c.json(res.results.map((r) => ({ ...r, standings: JSON.parse(r.standings), top_scorers: JSON.parse(r.top_scorers), categories: JSON.parse(r.categories), position_order: JSON.parse(r.position_order ?? '[]'), rankings: JSON.parse(r.rankings ?? '{}'), basket_picks: JSON.parse(r.basket_picks ?? '[]') })));
});
/** Hyväksyntä: luo gurun (tai liittää samannimiseen) ja halutessa käyttäjätunnuksen. */
admin.post('/registrations/:id/accept', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
  const r = await db.prepare('SELECT * FROM registrations WHERE id = ? AND season_id = ?').bind(Number(c.req.param('id')), season.id).first<{ id: number; name: string; email: string }>();
  if (!r) throw new Error('Ilmoittautumista ei löydy');
  let guru = await db.prepare('SELECT id FROM gurus WHERE season_id = ? AND lower(name) = lower(?)').bind(season.id, r.name).first<{ id: number }>();
  if (!guru) guru = await db.prepare('INSERT INTO gurus (season_id, name) VALUES (?,?) RETURNING id').bind(season.id, r.name).first<{ id: number }>();
  if (password) {
    if (password.length < 8) throw new Error('Salasanan pitää olla vähintään 8 merkkiä');
    let u = await db.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(r.email.toLowerCase()).first<{ id: number }>();
    if (!u) u = await db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,'guru') RETURNING id").bind(r.email, r.name, await hashPassword(password)).first<{ id: number }>();
    await db.prepare('UPDATE gurus SET user_id = ? WHERE id = ?').bind(u!.id, guru!.id).run();
  }
  await db.prepare("UPDATE registrations SET status = 'accepted', guru_id = ? WHERE id = ?").bind(guru!.id, r.id).run();
  // Lomakkeen toivelista ja valintajärjestys gurun draft-ennakkolistaksi (ei ylikirjoiteta olemassa olevaa)
  const reg = r as unknown as { position_order?: string; rankings?: string };
  if (reg.position_order && reg.position_order !== '[]') {
    await db.prepare('INSERT INTO draft_prefs (guru_id, position_order, rankings) VALUES (?,?,?) ON CONFLICT(guru_id) DO NOTHING')
      .bind(guru!.id, reg.position_order, reg.rankings ?? '{}').run();
  }
  // Korimalli: kentällinen suoraan lomakkeelta (vain jos gurulla ei vielä ole pelaajia)
  const bp: { position: Position; entity_id: number }[] = JSON.parse((r as unknown as { basket_picks?: string }).basket_picks ?? '[]');
  if (season.selection_mode === 'baskets' && bp.length && !(await db.prepare('SELECT 1 FROM roster_slots WHERE guru_id = ? LIMIT 1').bind(guru!.id).first())) {
    const ctx = await loadContext(db, season); const date = helsinkiDate();
    const { entityPoints } = await import('./scoring');
    await db.batch(bp.map((x) => db.prepare('INSERT INTO roster_slots (guru_id, position, entity_id, start_date, start_points) VALUES (?,?,?,?,?)')
      .bind(guru!.id, x.position, x.entity_id, date, entityPoints(x.position, x.entity_id, season.scoring, ctx.stats, ctx.coachTeam, ctx.teamPoints))));
  }
  return c.json({ guruId: guru!.id });
});

// Kokonaistulokset (All-Stars + veikkaukset). Ylläpito näkee aina, muut vasta julkaisun jälkeen.
admin.get('/results', async (c) => c.json(await computeResults(c.env.DB, c.get('season'))));
admin.put('/results/override', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare('UPDATE seasons SET results_override = ? WHERE id = ?').bind(JSON.stringify(b ?? {}), c.get('season').id).run();
  return c.json({ ok: true });
});
/** Tallentaa kauden kokonaistuloksen Hall of Fameen (korvaa saman kauden aiemmat rivit). */
admin.post('/results/hall-of-fame', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const res = await computeResults(db, season);
  await db.batch([
    db.prepare('DELETE FROM hall_of_fame WHERE season_name = ?').bind(season.name),
    ...res.rows.map((r) => db.prepare('INSERT INTO hall_of_fame (season_name, rank, name, points) VALUES (?,?,?,?)').bind(season.name, r.rank, r.name, r.total)),
  ]);
  return c.json({ ok: true, count: res.rows.length });
});
admin.post('/registrations/:id/reject', async (c) => {
  await c.env.DB.prepare("UPDATE registrations SET status = 'rejected' WHERE id = ?").bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
admin.delete('/registrations/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM registrations WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// Käyttäjät
admin.get('/users', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.active, u.created_at, g.id AS guru_id, g.name AS guru_name
     FROM users u LEFT JOIN gurus g ON g.user_id = u.id AND g.season_id = ? ORDER BY u.name`,
  ).bind(c.get('season').id).all();
  return c.json(res.results);
});
admin.post('/users', async (c) => {
  const b = await c.req.json<{ email: string; name: string; password: string; role: string; guruId?: number }>();
  if (!b.password || b.password.length < 8) throw new Error('Salasanan pitää olla vähintään 8 merkkiä');
  const u = await c.env.DB.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,?) RETURNING id')
    .bind(b.email.trim(), b.name.trim(), await hashPassword(b.password), b.role === 'admin' ? 'admin' : 'guru').first<{ id: number }>();
  if (b.guruId) await c.env.DB.prepare('UPDATE gurus SET user_id = ? WHERE id = ?').bind(u!.id, b.guruId).run();
  return c.json(u);
});
admin.put('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ email?: string; name?: string; role?: string; active?: boolean; password?: string; guruId?: number | null }>();
  const db = c.env.DB;
  if (id === c.get('user')!.id && (b.role === 'guru' || b.active === false)) throw new Error('Et voi poistaa omia ylläpito-oikeuksiasi');
  if (b.email || b.name || b.role || b.active !== undefined) {
    await db.prepare('UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?')
      .bind(b.email ?? null, b.name ?? null, b.role ?? null, b.active === undefined ? null : b.active ? 1 : 0, id).run();
  }
  if (b.password) {
    if (b.password.length < 8) throw new Error('Salasanan pitää olla vähintään 8 merkkiä');
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(b.password), id).run();
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  }
  if (b.guruId !== undefined) {
    await db.prepare('UPDATE gurus SET user_id = NULL WHERE user_id = ? AND season_id = ?').bind(id, c.get('season').id).run();
    if (b.guruId) await db.prepare('UPDATE gurus SET user_id = ? WHERE id = ?').bind(id, b.guruId).run();
  }
  return c.json({ ok: true });
});
admin.delete('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (id === c.get('user')!.id) throw new Error('Et voi poistaa itseäsi');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// Gurut (kauden kisaajat)
admin.get('/gurus', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT g.*, u.email, u.name AS user_name FROM gurus g LEFT JOIN users u ON u.id = g.user_id
     WHERE g.season_id = ? ORDER BY g.draft_number IS NULL, g.draft_number, g.name`,
  ).bind(c.get('season').id).all();
  return c.json(res.results);
});
admin.post('/gurus', async (c) => {
  const b = await c.req.json<{ name: string; draft_number?: number; remote_draft?: boolean }>();
  const r = await c.env.DB.prepare('INSERT INTO gurus (season_id, name, draft_number, remote_draft) VALUES (?,?,?,?) RETURNING id')
    .bind(c.get('season').id, b.name.trim(), num(b.draft_number), b.remote_draft ? 1 : 0).first();
  return c.json(r);
});
admin.put('/gurus/:id', async (c) => {
  const b = await c.req.json<{ name: string; draft_number?: number | null; remote_draft?: boolean }>();
  await c.env.DB.prepare('UPDATE gurus SET name = ?, draft_number = ?, remote_draft = ? WHERE id = ?')
    .bind(b.name.trim(), num(b.draft_number), b.remote_draft ? 1 : 0, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
admin.delete('/gurus/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM gurus WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
admin.get('/gurus/:id/team', async (c) => c.json(await guruTeam(c, Number(c.req.param('id')))));
admin.get('/gurus/:id/draft-prefs', async (c) => c.json(await getPrefs(c, Number(c.req.param('id')))));
admin.put('/gurus/:id/draft-prefs', async (c) => { await savePrefs(c, Number(c.req.param('id')), await c.req.json()); return c.json({ ok: true }); });

// Kentällisen suora muokkaus (korjaukset, tuonti Excelistä)
admin.post('/slots', async (c) => {
  const b = await c.req.json<{ guru_id: number; position: Position; entity_id: number; start_date?: string; start_points?: number }>();
  if (!isPos(b.position)) throw new Error('Virheellinen paikka');
  const r = await c.env.DB.prepare('INSERT INTO roster_slots (guru_id, position, entity_id, start_date, start_points) VALUES (?,?,?,?,?) RETURNING id')
    .bind(b.guru_id, b.position, b.entity_id, b.start_date ?? helsinkiDate(), b.start_points ?? 0).first();
  return c.json(r);
});
admin.put('/slots/:id', async (c) => {
  const b = await c.req.json<{ start_points: number; end_points: number | null; start_date: string; end_date: string | null }>();
  await c.env.DB.prepare('UPDATE roster_slots SET start_points = ?, end_points = ?, start_date = ?, end_date = ? WHERE id = ?')
    .bind(Number(b.start_points), num(b.end_points), b.start_date, b.end_date || null, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
admin.delete('/slots/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM roster_slots WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// Vaihdot
admin.post('/swaps', async (c) => {
  const b = await c.req.json<{ slot_id: number; entity_id: number; date?: string }>();
  await swapSlot(c.env.DB, c.get('season'), b.slot_id, b.entity_id, b.date || helsinkiDate());
  return c.json({ ok: true });
});
admin.get('/swaps', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const ctx = await loadContext(db, season);
  const res = await db.prepare(
    `SELECT n.id, n.start_date AS date, n.position, n.entity_id AS in_id, n.start_points AS in_points,
            o.entity_id AS out_id, o.end_points AS out_points, g.name AS guru
     FROM roster_slots n JOIN roster_slots o ON o.id = n.replaced_slot_id JOIN gurus g ON g.id = n.guru_id
     WHERE g.season_id = ? ORDER BY n.start_date DESC, n.id DESC`,
  ).bind(season.id).all<{ position: Position; in_id: number; out_id: number }>();
  const name = (p: Position, id: number) => (p === 'C' ? ctx.names.coach.get(id)?.name : ctx.names.player.get(id)?.name) ?? `#${id}`;
  return c.json(res.results.map((r) => ({ ...r, in_name: name(r.position, r.in_id), out_name: name(r.position, r.out_id) })));
});

// Vaihtotoiveiden käsittely
async function swapDayById(c: C) {
  const d = await c.env.DB.prepare('SELECT * FROM swap_days WHERE id = ? AND season_id = ?').bind(Number(c.req.param('id')), c.get('season').id).first<SwapDay>();
  if (!d) throw new Error('Vaihtopäivää ei löydy');
  return d;
}
admin.get('/swap-days/:id/preview', async (c) => {
  const day = await swapDayById(c);
  if (day.processed_at) {
    const db = c.env.DB; const season = c.get('season');
    const ctx = await loadContext(db, season);
    const po = await priorityOrder(db, season, day);
    const res = await db.prepare(
      `SELECT r.*, g.name AS guru, s.position, s.entity_id AS out_id FROM swap_requests r JOIN gurus g ON g.id = r.guru_id JOIN roster_slots s ON s.id = r.slot_id
       WHERE r.swap_day_id = ? ORDER BY r.priority, g.name`,
    ).bind(day.id).all<{ id: number; guru_id: number; guru: string; priority: number; slot_id: number; position: Position; out_id: number; result_entity_id: number | null; status: string; result_note: string | null }>();
    const pos = new Map(po.order.map((g, i) => [g.id, i]));
    const results = res.results.sort((a, b) => a.priority - b.priority || (pos.get(a.guru_id) ?? 0) - (pos.get(b.guru_id) ?? 0)).map((r) => ({
      request_id: r.id, guru_id: r.guru_id, guru: r.guru, round: r.priority, slot_id: r.slot_id, position: r.position,
      out_id: r.out_id, out_name: entityName(ctx, r.position, r.out_id).name,
      in_id: r.result_entity_id, in_name: r.result_entity_id ? entityName(ctx, r.position, r.result_entity_id).name : null,
      ok: r.status === 'done', note: r.result_note ?? '',
    }));
    return c.json({ day, dayNumber: po.dayNumber, reversed: po.reversed, order: po.order.map((g, i) => ({ pos: i + 1, id: g.id, name: g.name, draft_number: g.draft_number, requests: 0 })), results });
  }
  return c.json(await previewSwapDay(c.env.DB, c.get('season'), day));
});
admin.post('/swap-days/:id/process', async (c) => c.json(await processSwapDay(c.env.DB, c.get('season'), await swapDayById(c))));
admin.post('/swaps/:id/undo', async (c) => {
  const db = c.env.DB;
  const s = await db.prepare('SELECT id, replaced_slot_id FROM roster_slots WHERE id = ?').bind(Number(c.req.param('id'))).first<{ id: number; replaced_slot_id: number | null }>();
  if (!s?.replaced_slot_id) throw new Error('Ei vaihto');
  await db.batch([
    db.prepare('DELETE FROM roster_slots WHERE id = ?').bind(s.id),
    db.prepare('UPDATE roster_slots SET end_date = NULL, end_points = NULL WHERE id = ?').bind(s.replaced_slot_id),
  ]);
  return c.json({ ok: true });
});

// Pistekorjaukset
admin.post('/adjustments', async (c) => {
  const b = await c.req.json<{ guru_id: number; points: number; reason: string }>();
  await c.env.DB.prepare('INSERT INTO adjustments (guru_id, points, reason) VALUES (?,?,?)').bind(b.guru_id, Number(b.points), b.reason).run();
  return c.json({ ok: true });
});
admin.delete('/adjustments/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM adjustments WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// Valmentajat
admin.post('/coaches', async (c) => {
  const b = await c.req.json<{ name: string; team_id: string }>();
  await c.env.DB.prepare('INSERT INTO coaches (season_id, name, team_id) VALUES (?,?,?)').bind(c.get('season').id, b.name.trim(), b.team_id).run();
  return c.json({ ok: true });
});
admin.put('/coaches/:id', async (c) => {
  const b = await c.req.json<{ name: string; team_id: string }>();
  await c.env.DB.prepare('UPDATE coaches SET name = ?, team_id = ? WHERE id = ?').bind(b.name.trim(), b.team_id, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
admin.delete('/coaches/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM coaches WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
/** Potkut: merkitään erotetuksi ja annetaan miinuspisteet kaikille, joilla valmentaja on kentällisessä. */
admin.post('/coaches/:id/fire', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const id = Number(c.req.param('id'));
  const coach = await db.prepare('SELECT name, fired FROM coaches WHERE id = ?').bind(id).first<{ name: string; fired: number }>();
  if (!coach) throw new Error('Valmentajaa ei löydy');
  if (coach.fired) throw new Error('Valmentaja on jo merkitty erotetuksi');
  const owners = await db.prepare(
    `SELECT DISTINCT s.guru_id FROM roster_slots s JOIN gurus g ON g.id = s.guru_id
     WHERE g.season_id = ? AND s.position = 'C' AND s.entity_id = ? AND s.end_date IS NULL`,
  ).bind(season.id, id).all<{ guru_id: number }>();
  await db.batch([
    db.prepare('UPDATE coaches SET fired = 1 WHERE id = ?').bind(id),
    ...owners.results.map((o) => db.prepare('INSERT INTO adjustments (guru_id, points, reason) VALUES (?,?,?)')
      .bind(o.guru_id, season.scoring.coachFiredPenalty, `Potkut: ${coach.name}`)),
  ]);
  return c.json({ affected: owners.results.length });
});

// Vaihtopäivät
admin.post('/swap-days', async (c) => {
  const b = await c.req.json<{ date: string; note?: string; start_time?: string; end_time?: string }>();
  await c.env.DB.prepare('INSERT INTO swap_days (season_id, date, note, start_time, end_time) VALUES (?,?,?,?,?)')
    .bind(c.get('season').id, b.date, b.note ?? null, b.start_time || '09:00', b.end_time || '21:00').run();
  return c.json({ ok: true });
});
admin.delete('/swap-days/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM swap_days WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// Draft
admin.post('/draft/pool', async (c) => {
  const b = await c.req.json<{ position: Position; ids: number[] }>();
  if (!isPos(b.position)) throw new Error('Virheellinen paikka');
  const db = c.env.DB;
  await db.batch(b.ids.map((id) => db.prepare('INSERT OR IGNORE INTO draft_pool (season_id, position, entity_id) VALUES (?,?,?)').bind(c.get('season').id, b.position, id)));
  return c.json({ ok: true });
});
admin.delete('/draft/pool/:pos/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM draft_pool WHERE season_id = ? AND position = ? AND entity_id = ?')
    .bind(c.get('season').id, c.req.param('pos'), Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
admin.post('/draft/shuffle', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  if (season.draft_status !== 'setup') throw new Error('Järjestys lukitaan, kun draft alkaa');
  const gurus = (await db.prepare('SELECT id FROM gurus WHERE season_id = ?').bind(season.id).all<{ id: number }>()).results;
  const rnd = crypto.getRandomValues(new Uint32Array(gurus.length));
  const order = gurus.map((g, i) => ({ g, r: rnd[i] })).sort((a, b) => a.r - b.r);
  await db.batch(order.map((o, i) => db.prepare('UPDATE gurus SET draft_number = ? WHERE id = ?').bind(i + 1, o.g.id)));
  return c.json({ ok: true });
});
admin.post('/draft/status', async (c) => {
  const { status } = await c.req.json<{ status: 'setup' | 'live' }>();
  const season = c.get('season');
  if (season.draft_status === 'done') throw new Error('Draft on jo viety kentällisiin');
  if (status === 'live') {
    const missing = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM gurus WHERE season_id = ? AND draft_number IS NULL').bind(season.id).first<{ n: number }>();
    if (missing?.n) throw new Error(`${missing.n} gurulta puuttuu draft-numero`);
  }
  await c.env.DB.prepare('UPDATE seasons SET draft_status = ? WHERE id = ?').bind(status === 'live' ? 'live' : 'setup', season.id).run();
  return c.json({ ok: true });
});
admin.post('/draft/pick', async (c) => {
  const b = await c.req.json<{ position: Position; entity_id: number }>();
  return c.json(await makePick(c.env.DB, c.get('season'), b.position, b.entity_id));
});
admin.post('/draft/auto', async (c) => c.json(await autoPick(c.env.DB, c.get('season'))));
admin.post('/draft/undo', async (c) => {
  await c.env.DB.prepare('DELETE FROM draft_picks WHERE season_id = ?1 AND pick_no = (SELECT MAX(pick_no) FROM draft_picks WHERE season_id = ?1)').bind(c.get('season').id).run();
  return c.json({ ok: true });
});
admin.post('/draft/finalize', async (c) => { await finalizeDraft(c.env.DB, c.get('season')); return c.json({ ok: true }); });

// Hall of Fame
admin.post('/hall-of-fame', async (c) => {
  const b = await c.req.json<{ season_name: string; rank: number; name: string; points?: number; note?: string }>();
  await c.env.DB.prepare('INSERT INTO hall_of_fame (season_name, rank, name, points, note) VALUES (?,?,?,?,?)')
    .bind(b.season_name, Number(b.rank), b.name, num(b.points), b.note ?? null).run();
  return c.json({ ok: true });
});
admin.delete('/hall-of-fame/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM hall_of_fame WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.route('/admin', admin);
app.notFound((c) => c.json({ error: 'Ei löydy' }, 404));

export default {
  fetch: app.fetch,
  async scheduled(e: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Cron herää 30 min välein; ajo rajataan Suomen ajan mukaan (kesä-/talviaika huomioiden):
    // klo 17.00–23.00 joka puoli tuntia, sen jälkeen 6 h välein (05.00 ja 11.00).
    const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(e.scheduledTime)).split(':').map(Number);
    const mins = h * 60 + m;
    const run = (mins >= 17 * 60 && mins <= 23 * 60) || (m < 15 && (h === 5 || h === 11));
    if (!run) return;
    ctx.waitUntil(syncLiiga(env.DB).then(() => env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run()));
  },
} satisfies ExportedHandler<Env>;
