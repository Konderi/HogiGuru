import { Hono, type Context as HonoCtx, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { hashPassword, newSessionId, verifyPassword } from './auth';
import {
  computeLeaderboard, getActiveSeason, helsinkiDate, loadContext, maxFor, slotView, usageCounts, usageKey,
  type Season, type SlotRow,
} from './data';
import { autoPick, COUNTED_SWAP, draftState, finalizeDraft, makePick, replacePick, swapSlot } from './draft';
import { mondayOf, swapAnalysis, weeklyReview } from './weekly';
import { syncGamesOnly, syncLiiga, syncPlayoffStats } from './liiga';
import { deadlineOf, helsinkiNow, nextOpenSwapDay, previewSwapDay, priorityOrder, processSwapDay, type SwapDay } from './swaps';
import { entityName } from './data';
import { computeResults } from './predictions';
import { goaliePoints, POSITIONS, skaterPoints, type Position, type StatRow } from './scoring';
import { listBackups, makeBackup, pruneBackups } from './backup';
import { esc, layout, sendMail, SITE } from './mail';
import { adminDailyOn, getSetting, sendAdminReport, sendWeeklyReport } from './reports';
import { aliveTeams, fetchBracket } from './playoff';
import { leaderboard as poLeaderboard, limitsOf, loadContext as poContext, playoffSeasonOf, PO_POS, PO_ROSTER, posOfRole, reservedCounts, rosterOf, swapWindow, today, type PoPos } from './playoffGame';
import { fetchGames, gameDetail, gameExtra, gamePreview, type Tournament } from './games';
import { forecasts } from './forecast';

interface Env { DB: D1Database; BACKUPS: R2Bucket; RESEND_API_KEY?: string; MAIL_FROM?: string }
interface User { id: number; email: string; name: string; role: 'superadmin' | 'admin' | 'guru' }
/** Pääylläpitäjä = role 'admin' + maintainer-lippu (CHECK-rajoite sallii vain admin/guru). */
const ROLE_SQL = "CASE WHEN u.role = 'admin' AND u.maintainer = 1 THEN 'superadmin' ELSE u.role END";
const isAdmin = (u: User | null | undefined) => u?.role === 'admin' || u?.role === 'superadmin';
type App = { Bindings: Env; Variables: { user: User | null; season: Season } };
type C = HonoCtx<App>;

const SESSION = 'hg_session';
const SESSION_DAYS = 30;

const app = new Hono<App>().basePath('/api');

// Omat virheilmoitukset (suomeksi) näytetään sellaisenaan; tekniset virheet (SQL, ajonaikaiset) piilotetaan.
app.onError((err, c) => {
  const internal = /D1_|SQLITE|TypeError|ReferenceError|SyntaxError|Cannot read|undefined/i.test(err.message) || err.name !== 'Error';
  if (internal) console.error('API', c.req.method, c.req.path, err);
  return c.json({ error: internal ? 'Palvelinvirhe – yritä hetken päästä uudelleen' : err.message }, internal ? 500 : 400);
});

// --- Tietoturvaotsakkeet ja CSRF-suoja kaikille API-vastauksille
app.use('*', async (c, next) => {
  const m = c.req.method;
  // Muuttavat pyynnöt vain omasta originista (estää toisen sivuston, myös *.konderi.fi-alidomainien, väärennetyt pyynnöt)
  if (m !== 'GET' && m !== 'HEAD' && !c.req.path.endsWith('/unsubscribe')) {
    const origin = c.req.header('Origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: 'Kielletty' }, 403);
  }
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  if (/^\/api\/(auth|me|admin|draft|setup)/.test(c.req.path)) c.header('Cache-Control', 'no-store');
});

/** Yksinkertainen liukuvan ikkunan rajoitin D1:ssä. Palauttaa true, jos raja on ylitetty. */
async function rateLimited(db: D1Database, key: string, max: number, windowMs: number, record = true): Promise<boolean> {
  const since = Date.now() - windowMs;
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND at > ?').bind(key, since).first<{ n: number }>())?.n ?? 0;
  if (n >= max) return true;
  if (record) await db.prepare('INSERT INTO rate_limits (key, at) VALUES (?, ?)').bind(key, Date.now()).run();
  return false;
}
const clientIp = (c: C) => c.req.header('CF-Connecting-IP') ?? 'unknown';

// --- Istunto ja aktiivinen kausi jokaiseen pyyntöön
app.use('*', async (c, next) => {
  const sid = getCookie(c, SESSION);
  let user: User | null = null;
  if (sid) {
    user = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, ${ROLE_SQL} AS role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.active = 1`,
    ).bind(sid, Date.now()).first<User>();
  }
  c.set('user', user);
  const season = await getActiveSeason(c.env.DB);
  if (!season) return c.json({ error: 'Ei aktiivista kautta' }, 500);
  c.set('season', season);
  await next();
});

const requireUser = async (c: C, next: Next) => (c.get('user') ? next() : c.json({ error: 'Kirjaudu sisään' }, 401));
const requireAdmin = async (c: C, next: Next) => (isAdmin(c.get('user')) ? next() : c.json({ error: 'Vain ylläpitäjille' }, 403));
const requireSuper = async (c: C, next: Next) => (c.get('user')?.role === 'superadmin' ? next() : c.json({ error: 'Vain pääylläpitäjälle' }, 403));

const num = (v: unknown) => (v === '' || v == null ? null : Number(v));

/** Kirjaa muuttavat pyynnöt audit_logiin (salasanat piilotetaan). */
async function audit(c: C, next: Next) {
  if (c.req.method === 'GET') return next();
  let body = '';
  try { body = (await c.req.raw.clone().text()).slice(0, 2000).replace(/"(password|new_password|current_password|current|next|token)"\s*:\s*"[^"]*"/g, '"$1":"***"'); } catch { /* ei runkoa */ }
  await next();
  const u = c.get('user');
  c.executionCtx.waitUntil(c.env.DB.prepare('INSERT INTO audit_log (user_id, user_name, method, path, body, status) VALUES (?,?,?,?,?,?)')
    .bind(u?.id ?? null, u?.name ?? null, c.req.method, new URL(c.req.url).pathname, body || null, c.res.status).run().catch(() => undefined));
}
/** Tapahtumavarmistus ennen riskialtista toimintoa. */
const preBackup = (c: C, reason: string) => makeBackup(c.env.DB, c.env.BACKUPS, 'event', reason).catch((e) => console.error('pre-backup', e));
const isPos = (p: unknown): p is Position => POSITIONS.includes(p as Position);

// ================= JULKINEN =================

// Gurujen muuttavat toiminnot muutoshistoriaan
app.use('/me/*', audit);

// Sähköpostien peruutus (linkki viestissä; One-Click POST tai selain GET)
const unsubscribe = async (c: C) => {
  const t = c.req.query('t') ?? '';
  const r = t ? await c.env.DB.prepare("UPDATE users SET email_prefs = '{\"weekly\":false,\"swaps\":false,\"coach\":true}' WHERE unsub_token = ? RETURNING email").bind(t).first<{ email: string }>() : null;
  return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;background:#060b18;color:#e2e8f0;padding:40px;text-align:center">
    <h2>${r ? 'Tilaus peruttu' : 'Linkki ei kelpaa'}</h2><p>${r ? 'Et saa enää HogiGurun viikkokatsauksia. Voit ottaa ne takaisin Oma joukkue -sivun kohdasta Sähköposti-ilmoitukset.' : ''}</p>
    <p><a style="color:#7dd3fc" href="/">guru.konderi.fi</a></p></body>`);
};
app.get('/unsubscribe', unsubscribe);
app.post('/unsubscribe', unsubscribe);

app.get('/me/email-prefs', requireUser, async (c) => {
  const r = await c.env.DB.prepare('SELECT email_prefs FROM users WHERE id = ?').bind(c.get('user')!.id).first<{ email_prefs: string }>();
  return c.json(JSON.parse(r?.email_prefs || '{}'));
});
app.put('/me/email-prefs', requireUser, async (c) => {
  const b = await c.req.json<Record<string, boolean>>();
  const prefs = { weekly: !!b.weekly, swaps: !!b.swaps, coach: !!b.coach };
  await c.env.DB.prepare('UPDATE users SET email_prefs = ? WHERE id = ?').bind(JSON.stringify(prefs), c.get('user')!.id).run();
  return c.json(prefs);
});

// ---------- Ottelut (julkinen) ----------
app.get('/games', async (c) => {
  const season = c.get('season');
  const t: Tournament = c.req.query('tournament') === 'playoffs' ? 'playoffs' : 'runkosarja';
  const y = Number(c.req.query('season')) || season.liiga_season;
  try {
    const games = await fetchGames(y, t, (p) => c.executionCtx.waitUntil(p));
    const fc = t === 'runkosarja' ? forecasts(games) : new Map();
    return c.json({ season: y, tournament: t, games: games.map((g) => ({ ...g, forecast: fc.get(g.id) ?? null })) });
  } catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

app.get('/games/:id', async (c) => {
  const db = c.env.DB; const season = c.get('season'); const user = c.get('user');
  const id = Number(c.req.param('id'));
  const wu = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
  let game = null; let forecast = null;
  for (const t of ['runkosarja', 'playoffs'] as const) {
    try {
      const list = await fetchGames(season.liiga_season, t, wu);
      game = list.find((g) => g.id === id) ?? null;
      if (game && !game.started && t === 'runkosarja') forecast = forecasts(list).get(id) ?? null;
    } catch { /* ohitetaan */ }
    if (game) break;
  }
  const mine = new Set<number>();
  if (user) {
    const [a, b] = await db.batch([
      db.prepare("SELECT s.entity_id AS id FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.user_id = ? AND g.season_id = ? AND s.position <> 'C' AND s.end_date IS NULL").bind(user.id, season.id),
      db.prepare("SELECT s.player_id AS id FROM playoff_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.user_id = ? AND s.end_date IS NULL AND g.season_id IN (SELECT id FROM seasons WHERE parent_season_id = ?)").bind(user.id, season.id),
    ]);
    for (const r of [...a.results, ...b.results] as { id: number }[]) mine.add(r.id);
  }
  // Kaikkien gurujen nykyiset kentälliset: pelaaja → gurujen nimet
  const owners = await ownerNames(db, season.id, 'P');
  const [players0, extra, preview] = await Promise.all([
    gameDetail(db, id, season.scoring, mine),
    game?.started ? gameExtra(season.liiga_season, id, game.ended, wu).catch(() => null) : Promise.resolve(null),
    game && !game.started ? gamePreview(season.liiga_season, game, wu).catch(() => null) : Promise.resolve(null),
  ]);
  const players = players0.map((p) => ({ ...p, gurus: (owners.get(p.player_id) ?? []).sort((x, y) => x.localeCompare(y, 'fi')) }));
  if (!game && !players.length) return c.json({ error: 'Ottelua ei löytynyt' }, 404);
  return c.json({ game, players, extra, forecast, preview });
});

app.get('/public/overview', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const today = helsinkiDate();
  const nowHel = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const [leaderboard, nextSwap, lastSync, standings, playerChanges] = await Promise.all([
    computeLeaderboard(db, season),
    db.prepare("SELECT date, note, start_time, end_time FROM swap_days WHERE season_id = ? AND date || ' ' || end_time >= ? ORDER BY date LIMIT 1").bind(season.id, nowHel).first(),
    db.prepare('SELECT finished_at, ok, message FROM sync_log WHERE ok = 1 ORDER BY id DESC LIMIT 1').first(),
    standingsQuery(db, season),
    db.prepare("SELECT at, player_id, kind, name, role, team_from, team_to FROM player_changes WHERE at > ? ORDER BY at DESC LIMIT 30")
      .bind(new Date(Date.now() - 7 * 86400_000).toISOString()).all().then((r) => r.results).catch(() => []),
  ]);
  return c.json({
    season: { name: season.name, draftStatus: season.draft_status, resultsPublished: !!season.results_published },
    registration: registrationInfo(season),
    leaderboard: leaderboard.map(({ user_id: _u, ...r }) => r),
    nextSwap, lastSync, standings, playerChanges,
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
  const owners = await ownerNames(db, season.id, 'P');
  const all = reqPos === 'all';
  const pos: 'F' | 'D' | 'G' = reqPos === 'D' || reqPos === 'G' ? reqPos : 'F';
  const roleFilter = all ? '1=1' : pos === 'G' ? "p.role = 'MV'" : pos === 'D' ? "p.role = 'P'" : "p.role NOT IN ('MV','P')";
  const [rows, usage] = await Promise.all([
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.team_name, p.picture, p.role, p.injured, s.*
       FROM player_stats s JOIN players p ON p.id = s.player_id WHERE s.season = ? AND ${roleFilter}`,
    ).bind(season.liiga_season).all<StatRow & { id: number; first_name: string; last_name: string; team_name: string; picture: string; role: string; injured: number; save_pct: number }>(),
    usageCounts(db, season.id),
  ]);
  const out = rows.results.map((r) => {
    const pp: 'F' | 'D' | 'G' = r.role === 'MV' ? 'G' : r.role === 'P' ? 'D' : 'F';
    return {
      id: r.id, name: `${r.first_name} ${r.last_name}`, team: r.team_name, picture: r.picture, pos: pp, injured: !!r.injured,
      games: r.games, goals: r.goals, assists: r.assists, pim: r.pim, plusMinus: r.plus_minus,
      shutouts: r.shutouts, saves: r.saves, goalsAgainst: r.goals_against, wins: r.wins, savePct: r.save_pct,
      hg: pp === 'G' ? goaliePoints(r, season.scoring.G) : skaterPoints(r, season.scoring[pp]),
      reserved: usage.get(usageKey(pp, r.id)) ?? 0, max: maxFor(season, pp), gurus: owners.get(r.id) ?? [],
    };
  }).sort((a, b) => b.hg - a.hg);
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
  const owners = await ownerNames(db, season.id, 'C');
  return c.json(res.results.map((r) => ({
    ...r, hg: Math.round((r.team_points ?? 0) * season.scoring.C.teamPoints * 100) / 100,
    reserved: usage.get(usageKey('C', r.id)) ?? 0, max: maxFor(season, 'C'), gurus: owners.get(r.id) ?? [],
  })));
});

/** Gurujen nykyiset kentälliset: pelaaja/valmentaja-id → gurujen nimet (aakkosjärjestyksessä) */
async function ownerNames(db: D1Database, seasonId: number, kind: 'P' | 'C') {
  const stmts = kind === 'C'
    ? [db.prepare("SELECT s.entity_id AS id, g.name FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.season_id = ? AND s.position = 'C' AND s.end_date IS NULL").bind(seasonId)]
    : [
      db.prepare("SELECT s.entity_id AS id, g.name FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.season_id = ? AND s.position <> 'C' AND s.end_date IS NULL").bind(seasonId),
      db.prepare("SELECT s.player_id AS id, g.name FROM playoff_slots s JOIN gurus g ON g.id = s.guru_id WHERE s.end_date IS NULL AND g.season_id IN (SELECT id FROM seasons WHERE parent_season_id = ?)").bind(seasonId),
    ];
  const res = await db.batch(stmts);
  const m = new Map<number, string[]>();
  for (const r of res.flatMap((x) => x.results) as { id: number; name: string }[]) {
    const l = m.get(r.id) ?? []; if (!l.includes(r.name)) l.push(r.name); m.set(r.id, l);
  }
  for (const l of m.values()) l.sort((a, b) => a.localeCompare(b, 'fi'));
  return m;
}

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

/** Ottelukohtaiset HG-pisteet: ?pos=F|D|G|C (C = valmentajan id, muuten pelaajan id). */
app.get('/game-log/:id', async (c) => {
  const season = c.get('season'); const sc = season.scoring; const id = Number(c.req.param('id'));
  const pos = (c.req.query('pos') ?? 'F') as Position;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (pos === 'C') {
    const coach = await c.env.DB.prepare('SELECT team_id FROM coaches WHERE id = ?').bind(id).first<{ team_id: string }>();
    if (!coach) return c.json([]);
    const rows = (await c.env.DB.prepare('SELECT * FROM team_games WHERE season = ? AND team_id = ? ORDER BY date').bind(season.liiga_season, coach.team_id).all<Record<string, number | string>>()).results;
    return c.json(rows.map((r) => ({ ...r, hg: r2(Number(r.points) * sc.C.teamPoints) })));
  }
  const rows = (await c.env.DB.prepare('SELECT * FROM game_stats WHERE season = ? AND player_id = ? ORDER BY date').bind(season.liiga_season, id).all<StatRow & { date: string; shutout: number; win: number; plus_minus: number }>()).results;
  return c.json(rows.map((r) => {
    const s: StatRow = { games: 1, goals: r.goals, assists: r.assists, pim: r.pim, plus_minus: r.plus_minus, shutouts: r.shutout, saves: r.saves, goals_against: r.goals_against, wins: r.win };
    return { ...r, hg: pos === 'G' ? goaliePoints(s, sc.G) : skaterPoints(s, sc[pos === 'D' ? 'D' : 'F']) };
  }));
});

// Viikkokatsaus: ?week=YYYY-MM-DD (mikä tahansa viikon päivä). Oletus: viimeisimmän pelipäivän viikko.
app.get('/weekly', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const q = c.req.query('week');
  let monday = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? mondayOf(q) : null;
  if (!monday) monday = mondayOf(helsinkiDate()); // oletus: kuluva viikko
  return c.json(await weeklyReview(db, season, monday));
});
app.get('/swap-analysis', async (c) => c.json(await swapAnalysis(c.env.DB, c.get('season'))));

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
  if (await rateLimited(c.env.DB, `register:ip:${clientIp(c)}`, 20, 3600_000)) throw new Error('Liian monta lähetystä – yritä myöhemmin uudelleen');
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
    // Toivelistan minimit (rajattu kuitenkin tarjolla olevien määrään, esim. valmentajat)
    const WISH_MIN: Record<Position, number> = { F: 20, D: 20, G: 5, C: 5 };
    const nCoaches = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM coaches WHERE season_id = ? AND fired = 0').bind(season.id).first<{ n: number }>())?.n ?? 0;
    for (const p of POSITIONS) {
      if (p === 'C' && !hasCoaches) continue;
      const min = Math.max(season.roster[p] ?? 0, p === 'C' ? Math.min(WISH_MIN.C, nCoaches) : WISH_MIN[p]);
      if (rankings[p].length < min) throw new Error(`Lisää All-Stars-toivelistaan vähintään ${min} × ${POS_FI[p]}`);
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
  // Jokaisen hakusanan pitää löytyä nimestä (tai joukkueesta) – järjestyksellä ei väliä (esim. "lööke", "lööke jens")
  const words = (c.req.query('q') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const pos = c.req.query('pos') as Position | undefined;
  const role = pos === 'G' ? "AND role = 'MV'" : pos === 'D' ? "AND role = 'P'" : pos === 'F' ? "AND role NOT IN ('MV','P')" : '';
  const where = words.map(() => "(first_name || ' ' || last_name || ' ' || COALESCE(team_name, '')) LIKE ?").join(' AND ') || '1';
  const res = await c.env.DB.prepare(
    `SELECT id, first_name || ' ' || last_name AS name, team_name AS team, role, picture FROM players
     WHERE ${where} ${role} ORDER BY last_name LIMIT 25`,
  ).bind(...words.map((w) => `%${w}%`)).all<{ id: number; role: string }>();
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
  const favTeam = await c.env.DB.prepare('SELECT t.id, t.name, t.short_name, t.logo FROM users u JOIN teams t ON t.id = u.fav_team WHERE u.id = ?').bind(user.id).first();
  return c.json({ user, guru, favTeam, draftNav: c.get('season').draft_nav !== 0 });
});

app.put('/me/fav-team', requireUser, async (c) => {
  const { team_id } = await c.req.json<{ team_id: string | null }>();
  if (team_id && !(await c.env.DB.prepare('SELECT 1 FROM teams WHERE id = ?').bind(team_id).first())) throw new Error('Tuntematon joukkue');
  await c.env.DB.prepare('UPDATE users SET fav_team = ? WHERE id = ?').bind(team_id || null, c.get('user')!.id).run();
  return c.json({ ok: true });
});

// ================= PLAY-OFF (guru) =================
const poGuru = (db: D1Database, poId: number, userId: number) =>
  db.prepare('SELECT id, name FROM gurus WHERE season_id = ? AND user_id = ?').bind(poId, userId).first<{ id: number; name: string }>();

app.get('/playoff/state', requireUser, async (c) => {
  const db = c.env.DB; const user = c.get('user')!;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ season: null });
  const ctx = await poContext(db, po, (p: Promise<unknown>) => c.executionCtx.waitUntil(p));
  const guru = await poGuru(db, po.id, user.id);
  const win = swapWindow(po, ctx.bracket);
  return c.json({
    season: { id: po.id, name: po.name, draft_status: po.draft_status, max_swaps: po.max_swaps, limits: limitsOf(po), roster: PO_ROSTER },
    window: win, started: ctx.started, guru, roster: guru ? rosterOf(ctx, guru.id) : null,
  });
});

app.get('/playoff/leaderboard', requireUser, async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ season: null, rows: [] });
  const ctx = await poContext(db, po, (p: Promise<unknown>) => c.executionCtx.waitUntil(p));
  return c.json({ season: { name: po.name, draft_status: po.draft_status }, rows: poLeaderboard(ctx) });
});

app.get('/playoff/guru/:id', requireUser, async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ error: 'Ei kisaa' }, 404);
  const ctx = await poContext(db, po, (p: Promise<unknown>) => c.executionCtx.waitUntil(p));
  const g = ctx.gurus.find((x) => x.id === Number(c.req.param('id')));
  if (!g) return c.json({ error: 'Tuntematon guru' }, 404);
  // Kokoonpanot julki vasta lukituksen jälkeen
  if (po.draft_status !== 'done' && g.user_id !== c.get('user')!.id && !isAdmin(c.get('user'))) return c.json({ guru: g, roster: null });
  return c.json({ guru: { id: g.id, name: g.name }, roster: rosterOf(ctx, g.id) });
});

app.get('/playoff/search', requireUser, async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json([]);
  const pos = c.req.query('pos') as PoPos;
  const words = (c.req.query('q') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
  const role = pos === 'G' ? "role = 'MV'" : pos === 'D' ? "role = 'P'" : "role NOT IN ('MV','P')";
  const where = words.length ? words.map(() => "(first_name || ' ' || last_name) LIKE ?").join(' AND ') : '1=1';
  const ctx = await poContext(db, po, (p: Promise<unknown>) => c.executionCtx.waitUntil(p));
  const res = await db.prepare(
    `SELECT p.id, p.first_name || ' ' || p.last_name AS name, p.team_id, p.team_name AS team, p.picture, COALESCE(s.goals,0) + COALESCE(s.assists,0) AS pts
     FROM players p LEFT JOIN player_stats s ON s.player_id = p.id AND s.season = ?
     WHERE ${role} AND ${where} ORDER BY pts DESC, p.last_name LIMIT 200`,
  ).bind(po.liiga_season, ...words.map((w) => `%${w}%`)).all<{ id: number; name: string; team_id: string; team: string; picture: string | null }>();
  const guru = await poGuru(db, po.id, c.get('user')!.id);
  const reserved = reservedCounts(ctx, guru?.id);
  const max = limitsOf(po)[pos] ?? 99;
  return c.json(res.results.filter((r) => ctx.isAlive(r.team_id)).slice(0, 25).map((r) => ({ ...r, reserved: reserved.get(r.id) ?? 0, max })));
});

app.post('/playoff/picks', requireUser, async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po || po.draft_status !== 'live') return c.json({ error: 'Draft-lomake ei ole auki' }, 400);
  const guru = await poGuru(db, po.id, c.get('user')!.id);
  if (!guru) return c.json({ error: 'Ilmoittaudu ensin kisaan' }, 400);
  const body = await c.req.json<Partial<Record<PoPos, number[]>>>();
  const ctx = await poContext(db, po, (p: Promise<unknown>) => c.executionCtx.waitUntil(p));
  const reserved = reservedCounts(ctx, guru.id);
  const limits = limitsOf(po);
  const all: { pos: PoPos; id: number }[] = [];
  for (const pos of PO_POS) {
    const list = [...new Set(body[pos] ?? [])];
    if (list.length > PO_ROSTER[pos]) return c.json({ error: `Liikaa valintoja (${pos})` }, 400);
    for (const id of list) all.push({ pos, id });
  }
  for (const x of all) {
    const p = await db.prepare('SELECT first_name || \' \' || last_name AS name, team_id, role FROM players WHERE id = ?').bind(x.id).first<{ name: string; team_id: string; role: string }>();
    if (!p) return c.json({ error: `Tuntematon pelaaja ${x.id}` }, 400);
    if (posOfRole(p.role) !== x.pos) return c.json({ error: `${p.name}: väärä pelipaikka` }, 400);
    if (!ctx.isAlive(p.team_id)) return c.json({ error: `${p.name}: joukkue ei ole mukana` }, 400);
    if ((reserved.get(x.id) ?? 0) >= limits[x.pos]) return c.json({ error: `${p.name} on jo täynnä (${limits[x.pos]} gurua)` }, 409);
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('DELETE FROM playoff_slots WHERE season_id = ? AND guru_id = ?').bind(po.id, guru.id),
    ...all.map((x) => db.prepare('INSERT INTO playoff_slots (season_id, guru_id, position, player_id, created_at) VALUES (?,?,?,?,?)').bind(po.id, guru.id, x.pos, x.id, now)),
  ]);
  return c.json({ ok: true, saved: all.length });
});

app.post('/playoff/swap', requireUser, async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ error: 'Ei kisaa' }, 404);
  const guru = await poGuru(db, po.id, c.get('user')!.id);
  if (!guru) return c.json({ error: 'Et ole mukana kisassa' }, 400);
  const { slot_id, player_id } = await c.req.json<{ slot_id: number; player_id: number }>();
  const ctx = await poContext(db, po, (p: Promise<unknown>) => c.executionCtx.waitUntil(p));
  const win = swapWindow(po, ctx.bracket);
  if (!win.open) return c.json({ error: `Vaihtoikkuna ei ole auki: ${win.reason}` }, 400);
  const slot = ctx.slots.find((s) => s.id === slot_id && s.guru_id === guru.id && !s.end_date);
  if (!slot) return c.json({ error: 'Tuntematon paikka' }, 400);
  const outP = ctx.players.get(slot.player_id);
  const inP = await db.prepare('SELECT first_name || \' \' || last_name AS name, team_id, role FROM players WHERE id = ?').bind(player_id).first<{ name: string; team_id: string; role: string }>();
  if (!inP) return c.json({ error: 'Tuntematon pelaaja' }, 400);
  if (posOfRole(inP.role) !== slot.position) return c.json({ error: 'Väärä pelipaikka' }, 400);
  if (!ctx.isAlive(inP.team_id)) return c.json({ error: `${inP.name}: joukkue on pudonnut` }, 400);
  if (ctx.slots.some((s) => s.guru_id === guru.id && !s.end_date && s.player_id === player_id)) return c.json({ error: 'Pelaaja on jo joukkueessasi' }, 400);
  const free = !ctx.isAlive(outP?.team_id);
  const r = rosterOf(ctx, guru.id);
  if (!free && r.swapsUsed >= po.max_swaps) return c.json({ error: `Vaihdot käytetty (${po.max_swaps}). Pudonneen joukkueen pelaajan saa vaihtaa ilmaiseksi.` }, 400);
  const d = today(); const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE playoff_slots SET end_date = ? WHERE id = ?').bind(d, slot.id),
    db.prepare('INSERT INTO playoff_slots (season_id, guru_id, position, player_id, start_date, free, created_at) VALUES (?,?,?,?,?,?,?)').bind(po.id, guru.id, slot.position, player_id, d, free ? 1 : 0, now),
  ]);
  return c.json({ ok: true, free });
});
app.get('/playoff/me', requireUser, async (c) => {
  const db = c.env.DB; const user = c.get('user')!;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ season: null });
  const guru = await db.prepare('SELECT id, name FROM gurus WHERE season_id = ? AND user_id = ?').bind(po.id, user.id).first<{ id: number; name: string }>();
  const pred = guru ? await db.prepare('SELECT champion FROM playoff_predictions WHERE season_id = ? AND guru_id = ?').bind(po.id, guru.id).first<{ champion: string | null }>() : null;
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM gurus WHERE season_id = ?').bind(po.id).first<{ n: number }>())!.n;
  return c.json({ season: { id: po.id, name: po.name, reg_open: !!po.reg_open, draft_status: po.draft_status }, guru, champion: pred?.champion ?? null, count });
});
app.post('/playoff/join', requireUser, async (c) => {
  const db = c.env.DB; const user = c.get('user')!;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po || !po.reg_open) return c.json({ error: 'Ilmoittautuminen ei ole auki' }, 400);
  const { champion } = await c.req.json<{ champion?: string | null }>().catch(() => ({ champion: null }));
  let guru = await db.prepare('SELECT id FROM gurus WHERE season_id = ? AND user_id = ?').bind(po.id, user.id).first<{ id: number }>();
  if (!guru) {
    const main = await db.prepare('SELECT name FROM gurus WHERE season_id = ? AND user_id = ?').bind(c.get('season').id, user.id).first<{ name: string }>();
    let name = main?.name ?? user.name;
    if (await db.prepare('SELECT 1 FROM gurus WHERE season_id = ? AND name = ?').bind(po.id, name).first()) name = `${name} (${user.id})`;
    guru = await db.prepare('INSERT INTO gurus (season_id, user_id, name, remote_draft) VALUES (?,?,?,1) RETURNING id').bind(po.id, user.id, name).first<{ id: number }>();
  }
  if (champion !== undefined) {
    if (champion && !(await db.prepare('SELECT 1 FROM teams WHERE id = ?').bind(champion).first())) return c.json({ error: 'Tuntematon joukkue' }, 400);
    await db.prepare('INSERT OR REPLACE INTO playoff_predictions (season_id, guru_id, champion, updated_at) VALUES (?,?,?,?)')
      .bind(po.id, guru!.id, champion || null, new Date().toISOString()).run();
  }
  return c.json({ ok: true });
});
app.delete('/playoff/join', requireUser, async (c) => {
  const db = c.env.DB; const user = c.get('user')!;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po || !po.reg_open) return c.json({ error: 'Ilmoittautuminen ei ole auki' }, 400);
  const g = await db.prepare('SELECT id FROM gurus WHERE season_id = ? AND user_id = ?').bind(po.id, user.id).first<{ id: number }>();
  if (g) await db.batch([
    db.prepare('DELETE FROM playoff_predictions WHERE season_id = ? AND guru_id = ?').bind(po.id, g.id),
    db.prepare('DELETE FROM gurus WHERE id = ?').bind(g.id),
  ]);
  return c.json({ ok: true });
});

/** Liigan otteluohjelma (välimuistissa 10 min) */
async function liigaGames(waitUntil: (p: Promise<unknown>) => void, y: number) {
  const url = `https://liiga.fi/api/v2/games?tournament=runkosarja&season=${y}`;
  const key = new Request(url);
  let res = await caches.default.match(key);
  if (!res) {
    const r = await fetch(url, { headers: { 'User-Agent': 'HogiGuru/1.0 (+https://guru.konderi.fi)', Accept: 'application/json' } });
    if (!r.ok) return [];
    res = new Response(r.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } });
    waitUntil(caches.default.put(key, res.clone()));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.json<any[]>().catch(() => []);
}

/** Joukkuesivu: sarjatilanne, ottelut, vire, pistepörssi, maalivahdit, valmentaja ja HogiGuru-kulma. */
app.get('/teams/:id/overview', async (c) => {
  const db = c.env.DB; const season = c.get('season'); const y = season.liiga_season;
  const id = c.req.param('id');
  const pid = id.split(':')[0]; // pelaajien team_id on pelkkä numero-osa
  const team = await db.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first<{ id: string; name: string; short_name: string | null; logo: string | null }>();
  if (!team) return c.json({ error: 'Joukkuetta ei löydy' }, 404);
  const [teamsR, standingsR, playersR, tgR, coachR, fansR, pickedR, list] = await Promise.all([
    db.prepare('SELECT id, name, short_name, logo FROM teams').all<{ id: string; name: string; short_name: string | null; logo: string | null }>(),
    standingsQuery(db, season),
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.role, p.jersey, p.picture, s.games, s.goals, s.assists, s.pim, s.plus_minus,
              s.saves, s.goals_against, s.shutouts, s.wins, s.save_pct
       FROM players p JOIN player_stats s ON s.player_id = p.id AND s.season = ? WHERE p.team_id IN (?, ?)`,
    ).bind(y, id, pid).all<Record<string, number | string | null>>(),
    db.prepare('SELECT date, opponent, home, gf, ga, points FROM team_games WHERE team_id = ? AND season = ? ORDER BY date DESC, game_id DESC').bind(id, y)
      .all<{ date: string; opponent: string; home: number; gf: number; ga: number; points: number }>(),
    db.prepare('SELECT name, fired FROM coaches WHERE team_id = ? AND season_id = ? ORDER BY fired, id DESC').bind(id, season.id).all<{ name: string; fired: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM users WHERE fav_team = ?').bind(id).first<{ n: number }>(),
    db.prepare(
      `SELECT s.position, s.entity_id, COUNT(*) AS n FROM roster_slots s JOIN gurus g ON g.id = s.guru_id
       WHERE g.season_id = ?1 AND s.end_date IS NULL AND (
         (s.position = 'C' AND s.entity_id IN (SELECT id FROM coaches WHERE team_id = ?2)) OR
         (s.position <> 'C' AND s.entity_id IN (SELECT id FROM players WHERE team_id IN (?2, ?3))))
       GROUP BY s.position, s.entity_id`,
    ).bind(season.id, id, pid).all<{ position: string; entity_id: number; n: number }>(),
    liigaGames((p) => c.executionCtx.waitUntil(p), y),
  ]);
  const byId = new Map(teamsR.results.map((t) => [t.id, t]));
  const byName = new Map(teamsR.results.map((t) => [t.name, t]));
  const teamOf = (side: { teamId?: string | number; teamName?: string }) => byId.get(String(side?.teamId)) ?? byName.get(side?.teamName ?? '') ?? null;

  // Ottelut liiga.fi:stä (tuleva ohjelma + tulokset)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mine = list.filter((g: any) => String(g.homeTeam?.teamId) === id || String(g.awayTeam?.teamId) === id
    || g.homeTeam?.teamName === team.name || g.awayTeam?.teamName === team.name)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((g: any) => {
      const home = String(g.homeTeam?.teamId) === id || g.homeTeam?.teamName === team.name;
      const opp = home ? g.awayTeam : g.homeTeam;
      const o = teamOf(opp);
      return {
        id: g.id, start: g.start, home, ended: !!g.ended, started: !!g.started,
        opponent: o?.name ?? opp?.teamName ?? '?', opponentLogo: o?.logo ?? null, opponentId: o?.id ?? null,
        gf: (home ? g.homeTeam?.goals : g.awayTeam?.goals) ?? null, ga: (home ? g.awayTeam?.goals : g.homeTeam?.goals) ?? null,
        extra: g.ended && g.finishedType && g.finishedType !== 'ENDED_DURING_REGULAR_GAME_TIME' ? (String(g.finishedType).includes('WINNING_SHOT') ? 'VL' : 'JA') : null,
        venue: typeof g.iceRink === 'object' ? g.iceRink?.name ?? null : null, tickets: g.buyTicketsUrl || null,
      };
    })
    .sort((a: { start: string }, b: { start: string }) => String(a.start).localeCompare(String(b.start)));
  const upcoming = mine.filter((g: { ended: boolean }) => !g.ended).slice(0, 8);
  const recent = mine.filter((g: { ended: boolean }) => g.ended).slice(-10).reverse();

  // Vire omasta ottelulokista (varalla, jos liiga.fi:n lista ei vastaa)
  const tg = tgR.results;
  const res = (g: { gf: number; ga: number; points: number }) => (g.gf > g.ga ? (g.points === 3 ? 'V' : 'JV') : g.points === 1 ? 'JH' : 'H');
  let streak = 0;
  for (const g of tg) { if ((g.gf > g.ga) === (tg[0].gf > tg[0].ga)) streak++; else break; }
  const split = (h: number) => {
    const r = tg.filter((g) => g.home === h);
    return { games: r.length, points: r.reduce((a, g) => a + g.points, 0), gf: r.reduce((a, g) => a + g.gf, 0), ga: r.reduce((a, g) => a + g.ga, 0) };
  };

  const ps = playersR.results.map((p) => ({
    id: Number(p.id), name: `${p.first_name} ${p.last_name}`, role: String(p.role ?? ''), jersey: p.jersey, picture: p.picture,
    games: Number(p.games), goals: Number(p.goals), assists: Number(p.assists), points: Number(p.goals) + Number(p.assists),
    pim: Number(p.pim), plusMinus: Number(p.plus_minus), saves: Number(p.saves), goalsAgainst: Number(p.goals_against),
    shutouts: Number(p.shutouts), wins: Number(p.wins), savePct: p.save_pct == null ? null : Number(p.save_pct),
  }));
  const skaters = ps.filter((p) => p.role !== 'MV');
  const top = (k: 'points' | 'goals' | 'assists' | 'pim' | 'plusMinus', n = 5) => [...skaters].sort((a, b) => b[k] - a[k] || b.points - a.points).slice(0, n);
  const picked = pickedR.results;
  const nameOf = (pos: string, eid: number) => pos === 'C' ? coachR.results[0]?.name ?? 'Valmentaja' : ps.find((p) => p.id === eid)?.name ?? `#${eid}`;

  return c.json({
    team,
    standing: (standingsR as { team_id: string }[]).find((s) => s.team_id === id) ?? null,
    standings: standingsR,
    upcoming, recent,
    form: tg.slice(0, 10).map((g) => ({ ...g, result: res(g), opponentLogo: byName.get(g.opponent)?.logo ?? null })),
    streak: tg.length ? { n: streak, win: tg[0].gf > tg[0].ga } : null,
    homeAway: { home: split(1), away: split(0) },
    leaders: { points: top('points', 10), goals: top('goals'), assists: top('assists'), plusMinus: top('plusMinus'), pim: top('pim') },
    goalies: ps.filter((p) => p.role === 'MV' && p.games > 0).sort((a, b) => b.games - a.games),
    coach: coachR.results.find((x) => !x.fired) ?? coachR.results[0] ?? null,
    hogiguru: {
      fans: fansR?.n ?? 0,
      picks: picked.map((p) => ({ position: p.position, name: nameOf(p.position, p.entity_id), n: p.n })).sort((a, b) => b.n - a.n),
    },
  });
});

// Vertailuhash: tuntemattomalle käyttäjälle tehdään sama PBKDF2-laskenta, ettei vasteaika paljasta tunnuksia
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const LOGIN_WINDOW = 15 * 60_000;

app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  const db = c.env.DB;
  const mail = (email ?? '').trim().toLowerCase();
  const kEmail = `login:email:${mail}`; const kIp = `login:ip:${clientIp(c)}`;
  // Enintään 10 virheellistä yritystä / tunnus ja 30 / IP-osoite 15 minuutissa
  if (await rateLimited(db, kEmail, 10, LOGIN_WINDOW, false) || await rateLimited(db, kIp, 30, LOGIN_WINDOW, false))
    return c.json({ error: 'Liian monta epäonnistunutta yritystä. Odota 15 minuuttia tai palauta salasana.' }, 429);
  const u = await db.prepare('SELECT id, password_hash FROM users WHERE lower(email) = ? AND active = 1').bind(mail).first<{ id: number; password_hash: string }>();
  const ok = await verifyPassword(password ?? '', u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) {
    await db.batch([
      db.prepare('INSERT INTO rate_limits (key, at) VALUES (?, ?)').bind(kEmail, Date.now()),
      db.prepare('INSERT INTO rate_limits (key, at) VALUES (?, ?)').bind(kIp, Date.now()),
    ]);
    return c.json({ error: 'Väärä sähköposti tai salasana' }, 401);
  }
  await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(kEmail).run();
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

// --- Salasanan palautus: linkki sähköpostiin, voimassa 1 h, kertakäyttöinen
const RESET_MINUTES = 60;
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

app.post('/auth/forgot', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  const db = c.env.DB;
  // Vastaus on aina sama; IP-kohtainen raja estää sähköpostipommituksen
  if (await rateLimited(db, `forgot:ip:${clientIp(c)}`, 10, 3600_000)) return c.json({ ok: true });
  const u = await db.prepare('SELECT id, name, email FROM users WHERE lower(email) = lower(?) AND active = 1')
    .bind((email ?? '').trim()).first<{ id: number; name: string; email: string }>();
  // Vastaus on aina sama, ettei sähköpostiosoitteiden olemassaoloa voi kalastella
  if (u) {
    const recent = await db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > datetime('now','-1 hour')")
      .bind(u.id).first<{ n: number }>();
    if ((recent?.n ?? 0) < 3) {
      const token = newSessionId();
      await db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)')
        .bind(u.id, await sha256(token), Date.now() + RESET_MINUTES * 60_000).run();
      const url = `${SITE}/salasana?t=${token}`;
      await sendMail(c.env, 'auth:reset', u.email, 'HogiGuru – salasanan vaihto', layout('Salasanan vaihto', `
        <p>Hei ${esc(u.name)},</p>
        <p>Pyysit salasanan vaihtoa HogiGuruun. Valitse uusi salasana alla olevasta painikkeesta:</p>
        <p style="margin:24px 0"><a href="${url}" style="background:#0ea5e9;color:#040814;padding:12px 22px;border-radius:10px;font-weight:bold;text-decoration:none;display:inline-block">Vaihda salasana</a></p>
        <p style="font-size:13px;color:#94a3b8">Linkki on voimassa ${RESET_MINUTES} minuuttia ja toimii kerran. Jos et pyytänyt vaihtoa, voit jättää viestin huomiotta – salasanasi ei muutu.</p>
        <p style="font-size:12px;color:#64748b;word-break:break-all">${url}</p>`));
    }
  }
  return c.json({ ok: true });
});

app.get('/auth/reset', async (c) => {
  const t = c.req.query('t') ?? '';
  const r = t ? await c.env.DB.prepare('SELECT u.name, u.email FROM password_resets p JOIN users u ON u.id = p.user_id WHERE p.token_hash = ? AND p.used_at IS NULL AND p.expires_at > ? AND u.active = 1')
    .bind(await sha256(t), Date.now()).first<{ name: string; email: string }>() : null;
  return r ? c.json(r) : c.json({ error: 'Linkki on vanhentunut tai jo käytetty. Pyydä uusi linkki.' }, 400);
});

app.post('/auth/reset', async (c) => {
  const { token, password } = await c.req.json<{ token: string; password: string }>();
  if (!password || password.length < 8) throw new Error('Salasanan pitää olla vähintään 8 merkkiä');
  const db = c.env.DB;
  const r = await db.prepare('SELECT p.id, p.user_id FROM password_resets p JOIN users u ON u.id = p.user_id WHERE p.token_hash = ? AND p.used_at IS NULL AND p.expires_at > ? AND u.active = 1')
    .bind(await sha256(token ?? ''), Date.now()).first<{ id: number; user_id: number }>();
  if (!r) return c.json({ error: 'Linkki on vanhentunut tai jo käytetty. Pyydä uusi linkki.' }, 400);
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(password), r.user_id),
    // Kaikki saman käyttäjän avoimet linkit ja istunnot mitätöidään
    db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').bind(Date.now(), r.user_id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(r.user_id),
  ]);
  await startSession(c, r.user_id);
  return c.json({ ok: true });
});

/** Ensimmäisen pääkäyttäjän luonti – toimii vain kun käyttäjiä ei ole. */
app.post('/setup', async (c) => {
  if (await c.env.DB.prepare('SELECT 1 FROM users LIMIT 1').first()) return c.json({ error: 'Asennus on jo tehty' }, 403);
  const { email, name, password } = await c.req.json<{ email: string; name: string; password: string }>();
  if (!email || !name || !password || password.length < 8) throw new Error('Täytä kaikki kentät (salasana väh. 8 merkkiä)');
  const u = await c.env.DB.prepare("INSERT INTO users (email, name, password_hash, role, maintainer) VALUES (?,?,?,'admin',1) RETURNING id")
    .bind(email.trim(), name.trim(), await hashPassword(password)).first<{ id: number }>();
  await startSession(c, u!.id);
  return c.json({ ok: true });
});

// ================= GURU =================

async function guruTeam(c: C, guruId: number) {
  const db = c.env.DB; const season = c.get('season');
  const ctx = await loadContext(db, season);
  const [slots, adj, lb, firedR] = await Promise.all([
    db.prepare('SELECT * FROM roster_slots WHERE guru_id = ? ORDER BY position, start_date').bind(guruId).all<SlotRow>(),
    db.prepare('SELECT * FROM adjustments WHERE guru_id = ? ORDER BY created_at').bind(guruId).all(),
    computeLeaderboard(db, season, ctx),
    db.prepare('SELECT id FROM coaches WHERE season_id = ? AND fired = 1').bind(season.id).all<{ id: number }>(),
  ]);
  const fired = new Set(firedR.results.map((r) => r.id));
  type Row = SlotRow & { id: number; replaced_slot_id: number | null; end_date: string | null };
  const rows = slots.results as Row[];
  const byId = new Map(rows.map((s) => [s.id, s]));
  // Erotetun valmentajan korvaaminen ei kuluta vaihtoja
  const usedSwaps = rows.filter((s) => {
    if (s.replaced_slot_id == null) return false;
    const old = byId.get(s.replaced_slot_id);
    return !(old && old.position === 'C' && fired.has(old.entity_id));
  }).length;
  const firedCoach = rows.find((s) => s.position === 'C' && s.end_date == null && fired.has(s.entity_id));
  return {
    slots: slots.results.map((s) => slotView(s, season, ctx)),
    adjustments: adj.results,
    standing: lb.find((r) => r.id === guruId) ?? null,
    swaps: { used: usedSwaps, max: season.max_swaps },
    firedCoachSlot: firedCoach?.id ?? null,
  };
}

app.get('/me/team', requireUser, async (c) => {
  const g = await c.env.DB.prepare('SELECT id, name FROM gurus WHERE user_id = ? AND season_id = ?').bind(c.get('user')!.id, c.get('season').id).first<{ id: number; name: string }>();
  if (!g) return c.json({ guru: null });
  return c.json({ guru: g, ...(await guruTeam(c, g.id)) });
});

// Valmentaja sai potkut → guru valitsee uuden heti (ei vaihtopäivää, ei kuluta vaihtoja)
app.post('/me/coach', requireUser, async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const g = await myGuru(c);
  if (!g) throw new Error('Et ole mukana tällä kaudella');
  const { coach_id } = await c.req.json<{ coach_id: number }>();
  const slot = await db.prepare(
    `SELECT s.id FROM roster_slots s JOIN coaches c ON c.id = s.entity_id
     WHERE s.guru_id = ? AND s.position = 'C' AND s.end_date IS NULL AND c.fired = 1`,
  ).bind(g.id).first<{ id: number }>();
  if (!slot) throw new Error('Valmentajasi ei ole saanut potkuja');
  const nc = await db.prepare('SELECT fired FROM coaches WHERE id = ? AND season_id = ?').bind(Number(coach_id), season.id).first<{ fired: number }>();
  if (!nc || nc.fired) throw new Error('Valitse toimessa oleva valmentaja');
  await swapSlot(db, season, slot.id, Number(coach_id), helsinkiDate());
  return c.json({ ok: true });
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
  const used = await db.prepare(`SELECT COUNT(*) AS n FROM roster_slots s WHERE s.guru_id = ? AND ${COUNTED_SWAP}`).bind(g.id).first<{ n: number }>();
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

/**
 * Gurun omat vaihdot (uusi malli, oletuksena pois päältä):
 * draftin jälkeen freeze, kunnes jokainen joukkue on pelannut N ottelua (app_settings.self_swap_freeze, oletus 10),
 * sen jälkeen guru voi vaihtaa milloin tahansa. Kiintiö = kauden max_swaps, varausrajat normaalit.
 * Päälle kytkentä: app_settings.self_swaps = '1'. Ylläpitäjä näkee sivun esikatseluna.
 */
async function selfSwapState(db: D1Database, season: Season) {
  const [enabled, freeze, played] = await Promise.all([
    getSetting(db, 'self_swaps', '0'),
    getSetting(db, 'self_swap_freeze', '10'),
    db.prepare('SELECT MIN(games) AS n FROM standings WHERE season = ?').bind(season.liiga_season).first<{ n: number | null }>(),
  ]);
  const games = Number(freeze) || 0;
  const minPlayed = played?.n ?? 0;
  return { enabled: enabled === '1', freezeGames: games, minPlayed, open: season.draft_status === 'done' && minPlayed >= games };
}

app.get('/me/self-swap', requireUser, async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const st = await selfSwapState(db, season);
  const g = await myGuru(c);
  const used = g ? await db.prepare(`SELECT COUNT(*) AS n FROM roster_slots s WHERE s.guru_id = ? AND ${COUNTED_SWAP}`).bind(g.id).first<{ n: number }>() : null;
  return c.json({
    ...st, draftDone: season.draft_status === 'done', preview: !st.enabled && isAdmin(c.get('user')),
    guru: g, swaps: { used: used?.n ?? 0, max: season.max_swaps },
  });
});

app.post('/me/self-swap', requireUser, async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const st = await selfSwapState(db, season);
  if (!st.enabled) return c.json({ error: 'Omat vaihdot eivät ole vielä käytössä' }, 400);
  if (season.draft_status !== 'done') return c.json({ error: 'Vaihdot avautuvat draftin jälkeen' }, 400);
  if (!st.open) return c.json({ error: `Vaihdot avautuvat, kun jokainen joukkue on pelannut ${st.freezeGames} ottelua` }, 400);
  const g = await myGuru(c);
  if (!g) return c.json({ error: 'Et ole mukana tällä kaudella' }, 400);
  const b = await c.req.json<{ slot_id: number; entity_id: number }>();
  const own = await db.prepare('SELECT 1 FROM roster_slots WHERE id = ? AND guru_id = ? AND end_date IS NULL').bind(Number(b.slot_id), g.id).first();
  if (!own) return c.json({ error: 'Virheellinen paikka' }, 400);
  try { await swapSlot(db, season, Number(b.slot_id), Number(b.entity_id), helsinkiDate()); }
  catch (e) { return c.json({ error: (e as Error).message }, 400); }
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
// Muutoshistoria: kaikki ylläpidon muuttavat pyynnöt
admin.use('*', audit);

// Play-Offs (vaihe 1: vain ylläpidolle). ?season=YYYY, oletus nykyinen; jos tyhjä → edellinen kausi esikatseluun.
app.get('/playoff/bracket', requireUser, async (c) => {
  const wu = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
  const q = Number(c.req.query('season'));
  const cur = c.get('season').liiga_season;
  try {
    let b = await fetchBracket(q || cur, wu);
    if (!q && !b.rounds.length) b = await fetchBracket(cur - 1, wu);
    return c.json({ ...b, alive: [...aliveTeams(b)], current: cur });
  } catch (e) { return c.json({ error: (e as Error).message }, 502); }
});
admin.get('/playoff/season', async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ season: null, entries: [] });
  const entries = (await db.prepare(
    `SELECT g.id, g.name, u.email, p.champion, t.name AS champion_name FROM gurus g LEFT JOIN users u ON u.id = g.user_id
     LEFT JOIN playoff_predictions p ON p.season_id = g.season_id AND p.guru_id = g.id LEFT JOIN teams t ON t.id = p.champion
     WHERE g.season_id = ? ORDER BY g.name`,
  ).bind(po.id).all()).results;
  return c.json({ season: po, entries });
});
admin.post('/playoff/season', async (c) => {
  const db = c.env.DB; const parent = c.get('season');
  if (await playoffSeasonOf(db, parent.id)) return c.json({ error: 'Play-Offs-kisa on jo luotu' }, 400);
  await db.prepare(
    `INSERT INTO seasons (name, liiga_season, active, max_swaps, max_picks_per_entity, roster, scoring, draft_status, draft_snake, kind, parent_season_id, max_picks_by_pos, draft_nav)
     SELECT 'Play-Offs ' || name, liiga_season, 0, 4, 12, '{"G":1,"D":2,"F":3}', scoring, 'setup', 0, 'playoff', id, '{"G":12,"D":8,"F":8}', 0 FROM seasons WHERE id = ?`,
  ).bind(parent.id).run();
  return c.json({ ok: true });
});
/** Play-Offs-kisan lopputulos Hall of Fameen (top 3, kausinimi "<kausi> Play-Offs"). */
admin.post('/playoff/hall-of-fame', async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ error: 'Ei kisaa' }, 404);
  const ctx = await poContext(db, po, (p: Promise<unknown>) => c.executionCtx.waitUntil(p));
  const rows = poLeaderboard(ctx).filter((r) => r.rank <= 3);
  const name = po.name.includes('Play-Offs') ? po.name : `${po.name} Play-Offs`;
  await db.batch([
    db.prepare('DELETE FROM hall_of_fame WHERE season_name = ?').bind(name),
    ...rows.map((r) => db.prepare('INSERT INTO hall_of_fame (season_name, rank, name, points, note) VALUES (?,?,?,?,?)').bind(name, r.rank, r.name, r.points, 'Play-Offs')),
  ]);
  return c.json({ ok: true, count: rows.length });
});
admin.put('/playoff/season', async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ error: 'Ei Play-Offs-kisaa' }, 404);
  const b = await c.req.json<{ reg_open?: boolean; max_picks_by_pos?: Record<string, number>; max_swaps?: number; draft_status?: string; swap_open?: number }>();
  if (b.draft_status && !['setup', 'live', 'done'].includes(b.draft_status)) return c.json({ error: 'Virheellinen tila' }, 400);
  await db.prepare(`UPDATE seasons SET reg_open = COALESCE(?, reg_open), max_picks_by_pos = COALESCE(?, max_picks_by_pos), max_swaps = COALESCE(?, max_swaps),
    draft_status = COALESCE(?, draft_status), swap_open = COALESCE(?, swap_open) WHERE id = ?`)
    .bind(b.reg_open === undefined ? null : b.reg_open ? 1 : 0, b.max_picks_by_pos ? JSON.stringify(b.max_picks_by_pos) : null, b.max_swaps ?? null,
      b.draft_status ?? null, b.swap_open ?? null, po.id).run();
  return c.json({ ok: true });
});
admin.delete('/playoff/entry/:id', async (c) => {
  const db = c.env.DB;
  const po = await playoffSeasonOf(db, c.get('season').id);
  if (!po) return c.json({ error: 'Ei Play-Offs-kisaa' }, 404);
  const id = Number(c.req.param('id'));
  await db.batch([
    db.prepare('DELETE FROM playoff_predictions WHERE season_id = ? AND guru_id = ?').bind(po.id, id),
    db.prepare('DELETE FROM gurus WHERE season_id = ? AND id = ?').bind(po.id, id),
  ]);
  return c.json({ ok: true });
});
admin.post('/playoff/sync', async (c) => {
  const y = Number(c.req.query('season')) || c.get('season').liiga_season;
  return c.json({ ok: true, rows: await syncPlayoffStats(c.env.DB, y) });
});
admin.get('/playoff/top', async (c) => {
  const season = c.get('season');
  const y = Number(c.req.query('season')) || season.liiga_season;
  const rows = (await c.env.DB.prepare(
    `SELECT p.id, p.first_name || ' ' || p.last_name AS name, p.team_id, p.team_name AS team, p.role, p.picture, s.*
     FROM playoff_stats s JOIN players p ON p.id = s.player_id WHERE s.season = ?`,
  ).bind(y).all<StatRow & { id: number; name: string; team_id: string; team: string; role: string; picture: string | null }>()).results;
  const out: Record<string, unknown[]> = { F: [], D: [], G: [] };
  for (const r of rows) {
    const pos = r.role === 'MV' ? 'G' : r.role === 'P' ? 'D' : 'F';
    const hg = pos === 'G' ? goaliePoints(r, season.scoring.G) : skaterPoints(r, season.scoring[pos]);
    out[pos].push({ id: r.id, name: r.name, team: r.team, team_id: r.team_id, picture: r.picture, games: r.games, goals: r.goals, assists: r.assists, hg });
  }
  for (const k of Object.keys(out)) out[k] = (out[k] as { hg: number }[]).sort((a, b) => b.hg - a.hg).slice(0, 15);
  return c.json({ season: y, total: rows.length, top: out });
});

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
       results_published = ?, selection_mode = ?, baskets = ?, draft_nav = ? WHERE id = ?`,
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
    b.draft_nav === undefined ? (s.draft_nav ?? 1) : b.draft_nav ? 1 : 0,
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
/** Aiemmat gurunimet (Hall of Fame + aiemmat kaudet), joihin ilmoittautuja voidaan liittää. */
async function knownGuruNames(db: D1Database) {
  const r = await db.prepare('SELECT name FROM hall_of_fame UNION SELECT name FROM gurus').all<{ name: string }>();
  return [...new Set(r.results.map((x) => x.name.trim()))];
}
const normN = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
function lev(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let p = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; }
  }
  return d[b.length];
}
function nameMatches(name: string, known: string[]) {
  const n = normN(name); const nw = n.split(' ');
  const exact = known.find((k) => normN(k) === n) ?? null;
  const similar = known.filter((k) => {
    if (k === exact) return false;
    const m = normN(k); const mw = m.split(' ');
    return lev(n, m) <= 2 || m.includes(n) || n.includes(m) || (nw.length > 1 && mw.length > 1 && nw.at(-1) === mw.at(-1) && nw[0][0] === mw[0][0]) ||
      nw.some((w) => w.length > 3 && mw.includes(w));
  }).slice(0, 8);
  return { exact, similar };
}
admin.get('/registrations/:id/matches', async (c) => {
  const r = await c.env.DB.prepare('SELECT name FROM registrations WHERE id = ?').bind(Number(c.req.param('id'))).first<{ name: string }>();
  if (!r) throw new Error('Ilmoittautumista ei löydy');
  return c.json(nameMatches(r.name, await knownGuruNames(c.env.DB)));
});

/** Hyväksyntä: luo gurun (tai liittää samannimiseen) ja halutessa käyttäjätunnuksen. */
admin.post('/registrations/:id/accept', async (c) => {
  const db = c.env.DB; const season = c.get('season');
  const { password, name: chosen } = await c.req.json<{ password?: string; name?: string }>().catch(() => ({ password: undefined, name: undefined }));
  const r = await db.prepare('SELECT * FROM registrations WHERE id = ? AND season_id = ?').bind(Number(c.req.param('id')), season.id).first<{ id: number; name: string; email: string }>();
  if (!r) throw new Error('Ilmoittautumista ei löydy');
  // Nimi: ylläpidon valitsema aiempi nimi > automaattinen täsmäys aiempaan guruun > lomakkeen nimi
  const guruName = chosen?.trim() || nameMatches(r.name, await knownGuruNames(db)).exact || r.name;
  let guru = await db.prepare('SELECT id FROM gurus WHERE season_id = ? AND lower(name) = lower(?)').bind(season.id, guruName).first<{ id: number }>();
  if (!guru) guru = await db.prepare('INSERT INTO gurus (season_id, name, remote_draft) VALUES (?,?,1) RETURNING id').bind(season.id, guruName).first<{ id: number }>();
  // Olemassa oleva tunnus liitetään aina sähköpostin perusteella
  let u = await db.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(r.email.toLowerCase()).first<{ id: number }>();
  if (!u && password) {
    if (password.length < 8) throw new Error('Salasanan pitää olla vähintään 8 merkkiä');
    u = await db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,'guru') RETURNING id").bind(r.email, guruName, await hashPassword(password)).first<{ id: number }>();
  }
  if (u) await db.prepare('UPDATE gurus SET user_id = ? WHERE id = ?').bind(u.id, guru!.id).run();
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
/** Roolin tallennusmuoto. Pääylläpitäjän voi nimetä vain pääylläpitäjä. */
function roleCols(c: C, role: string): { role: 'admin' | 'guru'; maintainer: number } {
  if (role === 'superadmin') {
    if (c.get('user')!.role !== 'superadmin') throw new Error('Vain pääylläpitäjä voi nimetä pääylläpitäjän');
    return { role: 'admin', maintainer: 1 };
  }
  return { role: role === 'admin' ? 'admin' : 'guru', maintainer: 0 };
}
admin.get('/users', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, ${ROLE_SQL} AS role, u.active, u.created_at, g.id AS guru_id, g.name AS guru_name
     FROM users u LEFT JOIN gurus g ON g.user_id = u.id AND g.season_id = ? ORDER BY u.name`,
  ).bind(c.get('season').id).all();
  return c.json(res.results);
});
admin.post('/users', async (c) => {
  const b = await c.req.json<{ email: string; name: string; password: string; role: string; guruId?: number }>();
  if (!b.password || b.password.length < 8) throw new Error('Salasanan pitää olla vähintään 8 merkkiä');
  const r = roleCols(c, b.role);
  const u = await c.env.DB.prepare('INSERT INTO users (email, name, password_hash, role, maintainer) VALUES (?,?,?,?,?) RETURNING id')
    .bind(b.email.trim(), b.name.trim(), await hashPassword(b.password), r.role, r.maintainer).first<{ id: number }>();
  if (b.guruId) await c.env.DB.prepare('UPDATE gurus SET user_id = ? WHERE id = ?').bind(u!.id, b.guruId).run();
  return c.json(u);
});
admin.put('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ email?: string; name?: string; role?: string; active?: boolean; password?: string; guruId?: number | null }>();
  const db = c.env.DB;
  if (id === c.get('user')!.id && ((b.role && b.role !== c.get('user')!.role) || b.active === false)) throw new Error('Et voi muuttaa omaa rooliasi tai poistaa itseäsi käytöstä');
  if (c.get('user')!.role !== 'superadmin') {
    const t = await db.prepare(`SELECT ${ROLE_SQL} AS role FROM users u WHERE id = ?`).bind(id).first<{ role: string }>();
    if (t?.role === 'superadmin') throw new Error('Vain pääylläpitäjä voi muokata pääylläpitäjää');
  }
  const r = b.role ? roleCols(c, b.role) : null;
  if (b.email || b.name || r || b.active !== undefined) {
    await db.prepare('UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name), role = COALESCE(?, role), maintainer = COALESCE(?, maintainer), active = COALESCE(?, active) WHERE id = ?')
      .bind(b.email ?? null, b.name ?? null, r?.role ?? null, r?.maintainer ?? null, b.active === undefined ? null : b.active ? 1 : 0, id).run();
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
    .bind(c.get('season').id, b.name.trim(), num(b.draft_number), b.remote_draft === undefined || b.remote_draft ? 1 : 0).first();
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
  const b = await c.req.json<{ slot_id: number; entity_id: number; force?: boolean }>();
  // Käsivaihto vain vaihtopäivänä, aina kuluvalle päivälle
  const d = helsinkiDate();
  const day = await c.env.DB.prepare('SELECT 1 FROM swap_days WHERE season_id = ? AND date = ?').bind(c.get('season').id, d).first();
  if (!day) return c.json({ error: 'Vaihtoja voi tehdä vain vaihtopäivänä' }, 400);
  await swapSlot(c.env.DB, c.get('season'), b.slot_id, b.entity_id, d, !!b.force);
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
admin.post('/swap-days/:id/process', async (c) => { await preBackup(c, 'pre-swapday'); return c.json(await processSwapDay(c.env.DB, c.get('season'), await swapDayById(c))); });
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
  const b = await c.req.json<{ name: string; team_id: string; since?: string }>();
  const db = c.env.DB; const sid = c.get('season').id;
  const same = await db.prepare('SELECT 1 FROM coaches WHERE season_id = ? AND team_id = ? AND lower(name) = lower(?)').bind(sid, b.team_id, b.name.trim()).first();
  if (same) throw new Error('Valmentaja on jo lisätty tälle joukkueelle');
  // Erotetun seuraaja: toimikausi alkaa potkuja seuraavasta päivästä, ellei toisin annettu
  let since = b.since || null;
  if (!since) {
    const prev = await db.prepare('SELECT MAX(until) AS d FROM coaches WHERE season_id = ? AND team_id = ? AND fired = 1').bind(sid, b.team_id).first<{ d: string | null }>();
    if (prev?.d) since = new Date(Date.parse(prev.d) + 86400000).toISOString().slice(0, 10);
  }
  await db.prepare('INSERT INTO coaches (season_id, name, team_id, since) VALUES (?,?,?,?)').bind(sid, b.name.trim(), b.team_id, since).run();
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
  const fb = await c.req.json<{ date?: string }>().catch(() => ({} as { date?: string }));
  const until = /^\d{4}-\d{2}-\d{2}$/.test(fb.date ?? '') ? fb.date! : helsinkiDate();
  const coach = await db.prepare('SELECT name, fired FROM coaches WHERE id = ?').bind(id).first<{ name: string; fired: number }>();
  if (!coach) throw new Error('Valmentajaa ei löydy');
  if (coach.fired) throw new Error('Valmentaja on jo merkitty erotetuksi');
  const owners = await db.prepare(
    `SELECT DISTINCT s.guru_id FROM roster_slots s JOIN gurus g ON g.id = s.guru_id
     WHERE g.season_id = ? AND s.position = 'C' AND s.entity_id = ? AND s.end_date IS NULL`,
  ).bind(season.id, id).all<{ guru_id: number }>();
  await db.batch([
    db.prepare('UPDATE coaches SET fired = 1, until = ? WHERE id = ?').bind(until, id),
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
  const rnd = crypto.getRandomValues(new Uint32Array(gurus.length * 2));
  const order = gurus.map((g, i) => ({ g, r: rnd[i] })).sort((a, b) => a.r - b.r);
  // Paljastusjärjestys ruudulla arvotaan erikseen, jotta se ei kerro numeroita
  const reveal = gurus.map((g, i) => ({ g, r: rnd[gurus.length + i] })).sort((a, b) => a.r - b.r);
  const animate = !!(await c.req.json<{ animate?: boolean }>().catch(() => ({ animate: false }))).animate;
  await db.batch([
    ...order.map((o, i) => db.prepare('UPDATE gurus SET draft_number = ? WHERE id = ?').bind(i + 1, o.g.id)),
    ...reveal.map((o, i) => db.prepare('UPDATE gurus SET lottery_order = ? WHERE id = ?').bind(i, o.g.id)),
    db.prepare('UPDATE seasons SET draft_lottery_at = ?, draft_lottery_paused = NULL WHERE id = ?').bind(animate ? Date.now() + 10_000 : null, season.id),
  ]);
  return c.json({ ok: true });
});
admin.post('/draft/lottery', async (c) => {
  const { action } = await c.req.json<{ action: 'pause' | 'resume' }>();
  const s = c.get('season');
  if (!s.draft_lottery_at) throw new Error('Arvonta ei ole käynnissä');
  const now = Date.now();
  if (action === 'pause' && s.draft_lottery_paused == null)
    await c.env.DB.prepare('UPDATE seasons SET draft_lottery_paused = ? WHERE id = ?').bind(now, s.id).run();
  if (action === 'resume' && s.draft_lottery_paused != null)
    await c.env.DB.prepare('UPDATE seasons SET draft_lottery_at = draft_lottery_at + ?, draft_lottery_paused = NULL WHERE id = ?').bind(now - s.draft_lottery_paused, s.id).run();
  return c.json({ ok: true });
});
// Harjoitusdraftia varten: kaikkien gurujen draft-lomakkeet (vain luku)
admin.get('/draft/prefs-all', async (c) => {
  const r = await c.env.DB.prepare('SELECT p.guru_id, p.position_order, p.rankings FROM draft_prefs p JOIN gurus g ON g.id = p.guru_id WHERE g.season_id = ?')
    .bind(c.get('season').id).all<{ guru_id: number; position_order: string; rankings: string }>();
  return c.json(Object.fromEntries(r.results.map((x) => [x.guru_id, { positionOrder: JSON.parse(x.position_order || '[]'), rankings: JSON.parse(x.rankings || '{}') }])));
});
admin.post('/draft/attendance', async (c) => {
  const b = await c.req.json<{ id?: number; present: boolean; all?: boolean }>();
  const season = c.get('season');
  if (season.draft_status === 'done') throw new Error('Draft on jo päättynyt');
  if (b.all) await c.env.DB.prepare('UPDATE gurus SET remote_draft = ? WHERE season_id = ?').bind(b.present ? 0 : 1, season.id).run();
  else await c.env.DB.prepare('UPDATE gurus SET remote_draft = ? WHERE id = ? AND season_id = ?').bind(b.present ? 0 : 1, Number(b.id), season.id).run();
  return c.json({ ok: true });
});
admin.post('/draft/status', async (c) => {
  const { status } = await c.req.json<{ status: 'setup' | 'live' }>();
  const season = c.get('season');
  if (season.draft_status === 'done') throw new Error('Draft on jo viety kentällisiin');
  if (status === 'live') {
    const missing = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM gurus WHERE season_id = ? AND draft_number IS NULL').bind(season.id).first<{ n: number }>();
    if (missing?.n) throw new Error(`${missing.n} gurulta puuttuu draft-numero`);
    const st = await draftState(c.env.DB, season);
    if (st.lottery) throw new Error('Arvonta on vielä kesken');
    const noPrefs = st.gurus.filter((g) => g.remote_draft && !st.hasPrefs.includes(g.id));
    if (noPrefs.length) throw new Error(`Poissaolevilta puuttuu draft-lomake: ${noPrefs.map((g) => g.name).join(', ')}`);
  }
  await c.env.DB.prepare('UPDATE seasons SET draft_status = ? WHERE id = ?').bind(status === 'live' ? 'live' : 'setup', season.id).run();
  return c.json({ ok: true });
});
admin.post('/draft/pick', async (c) => {
  const b = await c.req.json<{ position: Position; entity_id: number }>();
  return c.json(await makePick(c.env.DB, c.get('season'), b.position, b.entity_id));
});
admin.post('/draft/auto', async (c) => c.json(await autoPick(c.env.DB, c.get('season'))));
admin.put('/draft/pick/:no', async (c) => {
  const b = await c.req.json<{ entity_id: number }>();
  return c.json(await replacePick(c.env.DB, c.get('season'), Number(c.req.param('no')), b.entity_id));
});
admin.post('/draft/undo', async (c) => {
  await c.env.DB.prepare('DELETE FROM draft_picks WHERE season_id = ?1 AND pick_no = (SELECT MAX(pick_no) FROM draft_picks WHERE season_id = ?1)').bind(c.get('season').id).run();
  return c.json({ ok: true });
});
admin.post('/draft/finalize', async (c) => { await preBackup(c, 'pre-draft-finalize'); await finalizeDraft(c.env.DB, c.get('season')); return c.json({ ok: true }); });

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

// ================= TEKNINEN YLLÄPITO (vain pääylläpitäjä) =================
// Varmistukset, sähköposti, muutoshistoria, järjestelmän tila: /api/admin/maint/*
const maint = new Hono<App>();
maint.use('*', requireSuper);
maint.get('/status', async (c) => {
  const db = c.env.DB;
  const [syncs, mails, audits, users, backups] = await Promise.all([
    db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 15').all(),
    db.prepare("SELECT ok, COUNT(*) AS n FROM mail_log WHERE at > datetime('now','-7 day') GROUP BY ok").all<{ ok: number; n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE at > datetime('now','-7 day')").first<{ n: number }>(),
    db.prepare(`SELECT ${ROLE_SQL} AS role, COUNT(*) AS n FROM users u WHERE active = 1 GROUP BY 1`).all<{ role: string; n: number }>(),
    listBackups(c.env.BACKUPS),
  ]);
  return c.json({
    mailConfigured: !!c.env.RESEND_API_KEY,
    mailFrom: c.env.MAIL_FROM ?? null,
    syncs: syncs.results,
    mail7d: Object.fromEntries(mails.results.map((m) => [m.ok ? 'ok' : 'fail', m.n])),
    audit7d: audits?.n ?? 0,
    users: Object.fromEntries(users.results.map((u) => [u.role, u.n])),
    lastBackup: backups[0] ?? null,
    backupCount: backups.length,
  });
});
maint.get('/backups', async (c) => c.json(await listBackups(c.env.BACKUPS)));
maint.post('/backups', async (c) => c.json(await makeBackup(c.env.DB, c.env.BACKUPS, 'manual')));
maint.get('/backups/file', async (c) => {
  const key = c.req.query('key') ?? '';
  const o = await c.env.BACKUPS.get(key);
  if (!o) return c.json({ error: 'Ei löydy' }, 404);
  return new Response(o.body, { headers: { 'Content-Type': 'application/sql; charset=utf-8', 'Content-Disposition': `attachment; filename="hogiguru-${key.replace(/\//g, '_')}"` } });
});
maint.get('/audit', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all()).results));
maint.get('/mail-log', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM mail_log ORDER BY id DESC LIMIT 200').all()).results));
maint.post('/mail/test', async (c) => {
  const to = c.get('user')!.email;
  const ok = await sendMail(c.env, 'admin:test', to, 'HogiGuru testiviesti', layout('Testiviesti', '<p>Sähköpostin lähetys toimii. ✅</p>'));
  if (!ok) throw new Error((await c.env.DB.prepare("SELECT error FROM mail_log WHERE kind = 'admin:test' ORDER BY id DESC LIMIT 1").first<{ error: string }>())?.error ?? 'Lähetys epäonnistui');
  return c.json({ ok, to });
});
maint.post('/mail/weekly', async (c) => {
  const { all } = await c.req.json<{ all?: boolean }>().catch(() => ({ all: false }));
  return c.json(await sendWeeklyReport(c.env, c.get('season'), all ? {} : { onlyTo: c.get('user')!.email }));
});
maint.post('/mail/admin-report', async (c) => c.json(await sendAdminReport(c.env, c.get('season'))));
/** Automaattisten raporttien asetukset ja päiväraportin vastaanottajat. */
maint.get('/mail/settings', async (c) => {
  const db = c.env.DB;
  const admins = (await db.prepare("SELECT id, name, email, maintainer, email_prefs FROM users WHERE role = 'admin' AND active = 1 ORDER BY name")
    .all<{ id: number; name: string; email: string; maintainer: number; email_prefs: string }>()).results;
  return c.json({
    admin_daily: (await getSetting(db, 'mail_admin_daily')) === '1',
    weekly: (await getSetting(db, 'mail_weekly')) === '1',
    admins: admins.map((a) => ({ id: a.id, name: a.name, email: a.email, maintainer: !!a.maintainer, admin_daily: adminDailyOn(a) })),
  });
});
maint.put('/mail/settings', async (c) => {
  const b = await c.req.json<{ admin_daily?: boolean; weekly?: boolean }>();
  const set = (k: string, v: boolean) => c.env.DB.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v ? '1' : '0');
  const stmts = [];
  if (b.admin_daily !== undefined) stmts.push(set('mail_admin_daily', b.admin_daily));
  if (b.weekly !== undefined) stmts.push(set('mail_weekly', b.weekly));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});
maint.put('/mail/settings/admin/:id', async (c) => {
  const { admin_daily } = await c.req.json<{ admin_daily: boolean }>();
  const u = await c.env.DB.prepare("SELECT email_prefs FROM users WHERE id = ? AND role = 'admin'").bind(Number(c.req.param('id'))).first<{ email_prefs: string }>();
  if (!u) return c.json({ error: 'Ylläpitäjää ei löydy' }, 404);
  const prefs = { ...JSON.parse(u.email_prefs || '{}'), admin_daily: !!admin_daily };
  await c.env.DB.prepare('UPDATE users SET email_prefs = ? WHERE id = ?').bind(JSON.stringify(prefs), Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

admin.route('/maint', maint);
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
    const dow = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short' }).format(new Date(e.scheduledTime));
    const slot = (hh: number) => h === hh && m < 15;
    // Yöllinen varmistus R2:een + vanhojen siivous (klo 03)
    if (slot(3)) ctx.waitUntil(makeBackup(env.DB, env.BACKUPS, 'daily').then(() => pruneBackups(env.BACKUPS)).catch((err) => console.error('backup', err)));
    // Ylläpidon viikkoraportti (ma klo 07) ja maanantain viikkokatsaus guruille (klo 09)
    if ((slot(7) || slot(9)) && dow === 'Mon') {
      ctx.waitUntil((async () => {
        const season = await getActiveSeason(env.DB);
        if (!season) return;
        if (slot(7) && dow === 'Mon' && (await getSetting(env.DB, 'mail_admin_daily')) === '1') await sendAdminReport(env, season);
        if (slot(9) && dow === 'Mon' && (await getSetting(env.DB, 'mail_weekly')) === '1') await sendWeeklyReport(env, season);
      })().catch((err) => console.error('mail', err)));
    }
    const run = (mins >= 17 * 60 && mins <= 23 * 60) || (m < 15 && (h === 5 || h === 11));
    // Muulloin täydennetään vain ottelulokia (käsittelemättömät ottelut, max 12 / ajo)
    if (!run) { ctx.waitUntil(syncGamesOnly(env.DB).catch((err) => { console.error('syncGames', err); return 0; })); return; }
    ctx.waitUntil(syncLiiga(env.DB).then(() => env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM rate_limits WHERE at < ?').bind(Date.now() - 86400_000),
      env.DB.prepare('DELETE FROM password_resets WHERE expires_at < ?').bind(Date.now() - 7 * 86400_000),
    ])));
  },
} satisfies ExportedHandler<Env>;
