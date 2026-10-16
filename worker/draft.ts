import { entityName, loadContext, maxFor, maxMap, usageCounts, usageKey, type Season } from './data';
import { entityPoints, POSITIONS, type Position } from './scoring';
import { helsinkiDate } from './data';

interface Guru { id: number; name: string; draft_number: number | null; remote_draft: number; user_id: number | null; lottery_order?: number | null }
interface Pick { id: number; pick_no: number; guru_id: number; position: Position; entity_id: number; auto: number }

/** Arvonnassa jokainen guru on ruudulla näin kauan (ms); numero paljastuu LOTTERY_REVEAL ms kohdalla. */
export const LOTTERY_STEP = 10_000;
export const LOTTERY_REVEAL = 4_000;

export async function draftState(db: D1Database, season: Season) {
  const [gurusR, picksR, poolR, prefsR] = await db.batch([
    db.prepare('SELECT id, name, draft_number, remote_draft, user_id, lottery_order FROM gurus WHERE season_id = ? ORDER BY draft_number IS NULL, draft_number, name').bind(season.id),
    db.prepare('SELECT * FROM draft_picks WHERE season_id = ? ORDER BY pick_no').bind(season.id),
    db.prepare('SELECT position, entity_id FROM draft_pool WHERE season_id = ?').bind(season.id),
    db.prepare('SELECT p.guru_id FROM draft_prefs p JOIN gurus g ON g.id = p.guru_id WHERE g.season_id = ?').bind(season.id),
  ]);
  let gurus = gurusR.results as unknown as Guru[];

  // Käynnissä oleva arvonta: numerot paljastetaan vasta vuorollaan (ei spoilata etukäteen)
  const paused = season.draft_lottery_paused ?? null;
  const now = paused ?? Date.now();
  const at = season.draft_lottery_at ?? null;
  let lottery: { at: number; now: number; step: number; reveal: number; paused: boolean; order: { id: number; name: string; draft_number: number | null }[] } | null = null;
  if (at && now < at + gurus.length * LOTTERY_STEP + 2000) {
    const order = gurus.filter((g) => g.lottery_order != null).sort((a, b) => a.lottery_order! - b.lottery_order!);
    const shown = (g: Guru) => now >= at + g.lottery_order! * LOTTERY_STEP + LOTTERY_REVEAL;
    lottery = {
      at, now, step: LOTTERY_STEP, reveal: LOTTERY_REVEAL, paused: paused != null,
      order: order.map((g) => ({ id: g.id, name: g.name, draft_number: shown(g) ? g.draft_number : null })),
    };
    gurus = gurus.map((g) => (g.lottery_order != null && !shown(g) ? { ...g, draft_number: null } : g))
      .sort((a, b) => (a.draft_number ?? 999) - (b.draft_number ?? 999) || a.name.localeCompare(b.name, 'fi'));
  }
  const picks = picksR.results as unknown as Pick[];
  const ctx = await loadContext(db, season);
  const perGuru = Object.values(season.roster).reduce((a, b) => a + b, 0);
  const total = gurus.length * perGuru;
  const pickNo = picks.length + 1;
  const onClock = pickNo <= total ? guruForPick(gurus, pickNo, !!season.draft_snake) : null;

  const usage = new Map<string, number>();
  for (const p of picks) usage.set(usageKey(p.position, p.entity_id), (usage.get(usageKey(p.position, p.entity_id)) ?? 0) + 1);

  const pool = (poolR.results as { position: Position; entity_id: number }[]).map((p) => ({
    ...p, ...entityName(ctx, p.position, p.entity_id),
    used: usage.get(usageKey(p.position, p.entity_id)) ?? 0,
  })).sort((a, b) => a.name.localeCompare(b.name, 'fi'));

  return {
    status: season.draft_status, snake: !!season.draft_snake, roster: season.roster,
    maxPicks: maxMap(season), total, pickNo, round: Math.ceil(pickNo / Math.max(gurus.length, 1)),
    onClock, gurus, hasPrefs: (prefsR.results as { guru_id: number }[]).map((r) => r.guru_id), lottery,
    picks: picks.map((p) => ({ ...p, ...entityName(ctx, p.position, p.entity_id) })),
    pool,
  };
}

function guruForPick(gurus: Guru[], pickNo: number, snake: boolean): Guru {
  const n = gurus.length;
  const round = Math.floor((pickNo - 1) / n);
  let idx = (pickNo - 1) % n;
  if (snake && round % 2 === 1) idx = n - 1 - idx;
  return gurus[idx];
}

/** Tarkistaa ja tallentaa valinnan vuorossa olevalle gurulle. */
export async function makePick(db: D1Database, season: Season, position: Position, entityId: number, auto = false) {
  const st = await draftState(db, season);
  if (st.status !== 'live') throw new Error('Draft ei ole käynnissä');
  if (!st.onClock) throw new Error('Kaikki valinnat on tehty');
  const g = st.onClock;
  const mine = st.picks.filter((p) => p.guru_id === g.id);
  if (mine.filter((p) => p.position === position).length >= season.roster[position]) throw new Error(`${g.name}: paikka ${position} on jo täynnä`);
  if (!st.pool.some((p) => p.position === position && p.entity_id === entityId)) throw new Error('Valinta ei ole draft-listalla');
  if (mine.some((p) => usageKey(p.position, p.entity_id) === usageKey(position, entityId))) throw new Error('Guru on jo valinnut tämän');
  const used = st.picks.filter((p) => usageKey(p.position, p.entity_id) === usageKey(position, entityId)).length;
  if (used >= maxFor(season, position)) throw new Error(`Valittu jo ${used} kertaa (max ${maxFor(season, position)})`);
  await db.prepare('INSERT INTO draft_picks (season_id, pick_no, guru_id, position, entity_id, auto) VALUES (?,?,?,?,?,?)')
    .bind(season.id, st.pickNo, g.id, position, entityId, auto ? 1 : 0).run();
  return { guru: g.name, pickNo: st.pickNo };
}

/** Etädraftaajan valinta ennakkolistan perusteella. */
export async function autoPick(db: D1Database, season: Season) {
  const st = await draftState(db, season);
  if (!st.onClock) throw new Error('Kaikki valinnat on tehty');
  const g = st.onClock;
  const prefs = await db.prepare('SELECT position_order, rankings FROM draft_prefs WHERE guru_id = ?').bind(g.id).first<{ position_order: string; rankings: string }>();
  if (!prefs) throw new Error(`${g.name}: ei ennakkolistaa`);
  const order = JSON.parse(prefs.position_order) as Position[];
  const rankings = JSON.parse(prefs.rankings) as Partial<Record<Position, number[]>>;
  const mine = st.picks.filter((p) => p.guru_id === g.id);
  const left = (pos: Position) => season.roster[pos] - mine.filter((p) => p.position === pos).length;

  // Paikka: listan seuraava paikka, jolla on vielä tilaa; muuten ensimmäinen vajaa paikka
  const nth = mine.length;
  const candidates: Position[] = [...order.slice(nth), ...order.slice(0, nth), ...POSITIONS].filter((p) => left(p) > 0);
  for (const pos of candidates) {
    for (const id of rankings[pos] ?? []) {
      const inPool = st.pool.find((p) => p.position === pos && p.entity_id === id);
      if (!inPool || inPool.used >= maxFor(season, pos)) continue;
      if (mine.some((p) => usageKey(p.position, p.entity_id) === usageKey(pos, id))) continue;
      return makePick(db, season, pos, id, true);
    }
  }
  throw new Error(`${g.name}: ennakkolistalla ei ole vapaita vaihtoehtoja – valitse käsin`);
}

/** Ylläpitäjän korjaus: vaihtaa yksittäisen valinnan toiseen saman pelipaikan nimeen ennen kentällisiin vientiä. */
export async function replacePick(db: D1Database, season: Season, pickNo: number, entityId: number) {
  const st = await draftState(db, season);
  if (st.status !== 'live') throw new Error('Valintoja voi korjata vain ennen kentällisiin vientiä');
  const pick = st.picks.find((p) => p.pick_no === pickNo);
  if (!pick) throw new Error('Valintaa ei löydy');
  const pos = pick.position;
  if (!st.pool.some((p) => p.position === pos && p.entity_id === entityId)) throw new Error('Valinta ei ole draft-listalla');
  const others = st.picks.filter((p) => p.pick_no !== pickNo);
  if (others.some((p) => p.guru_id === pick.guru_id && usageKey(p.position, p.entity_id) === usageKey(pos, entityId))) throw new Error('Gurulla on jo tämä valinta');
  const used = others.filter((p) => usageKey(p.position, p.entity_id) === usageKey(pos, entityId)).length;
  if (used >= maxFor(season, pos)) throw new Error(`Valittu jo ${used} kertaa (max ${maxFor(season, pos)})`);
  await db.prepare('UPDATE draft_picks SET entity_id = ?, auto = 0 WHERE season_id = ? AND pick_no = ?').bind(entityId, season.id, pickNo).run();
  return { ok: true };
}

/** Vie valinnat kentällisiksi ja lukitsee draftin. */
export async function finalizeDraft(db: D1Database, season: Season) {
  const st = await draftState(db, season);
  if (st.picks.length < st.total) throw new Error(`Valintoja tehty ${st.picks.length}/${st.total}`);
  const ctx = await loadContext(db, season);
  const date = helsinkiDate();
  await db.batch([
    db.prepare('DELETE FROM roster_slots WHERE guru_id IN (SELECT id FROM gurus WHERE season_id = ?)').bind(season.id),
    ...st.picks.map((p) => db.prepare('INSERT INTO roster_slots (guru_id, position, entity_id, start_date, start_points) VALUES (?,?,?,?,?)')
      .bind(p.guru_id, p.position, p.entity_id, date, entityPoints(p.position, p.entity_id, season.scoring, ctx.stats, ctx.coachTeam, ctx.teamPoints))),
    db.prepare("UPDATE seasons SET draft_status = 'done' WHERE id = ?").bind(season.id),
  ]);
}

/** Vaihtokiintiöön laskettavat vaihdot (alias s). Erotetun valmentajan korvaaminen on ilmainen. */
export const COUNTED_SWAP = `s.replaced_slot_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM roster_slots o JOIN coaches c ON c.id = o.entity_id
  WHERE o.id = s.replaced_slot_id AND o.position = 'C' AND c.fired = 1)`;

/** Vaihto: suljetaan vanha paikka nykyisillä pisteillä ja avataan uusi. */
export async function swapSlot(db: D1Database, season: Season, slotId: number, entityId: number, date: string, force = false) {
  const slot = await db.prepare(
    'SELECT s.*, g.season_id FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE s.id = ?',
  ).bind(slotId).first<{ id: number; guru_id: number; position: Position; entity_id: number; end_date: string | null; season_id: number }>();
  if (!slot || slot.season_id !== season.id) throw new Error('Paikkaa ei löydy');
  if (slot.end_date) throw new Error('Paikka on jo vaihdettu');
  const usage = await usageCounts(db, season.id);
  const used = usage.get(usageKey(slot.position, entityId)) ?? 0;
  if (!force && used >= maxFor(season, slot.position)) throw new Error(`Varattu jo ${used} kertaa (max ${maxFor(season, slot.position)})`);
  const dup = await db.prepare('SELECT 1 FROM roster_slots WHERE guru_id = ? AND position = ? AND entity_id = ? AND end_date IS NULL')
    .bind(slot.guru_id, slot.position, entityId).first();
  if (dup) throw new Error('Gurulla on jo tämä valinta');
  const freeCoach = slot.position === 'C'
    && !!(await db.prepare('SELECT 1 FROM coaches WHERE id = ? AND fired = 1').bind(slot.entity_id).first());
  if (season.max_swaps != null && !freeCoach && !force) {
    const n = await db.prepare(`SELECT COUNT(*) AS n FROM roster_slots s WHERE s.guru_id = ? AND ${COUNTED_SWAP}`).bind(slot.guru_id).first<{ n: number }>();
    if ((n?.n ?? 0) >= season.max_swaps) throw new Error(`Vaihdot käytetty (${season.max_swaps})`);
  }
  const ctx = await loadContext(db, season);
  const pts = (pos: Position, id: number) => entityPoints(pos, id, season.scoring, ctx.stats, ctx.coachTeam, ctx.teamPoints);
  await db.batch([
    db.prepare('UPDATE roster_slots SET end_date = ?, end_points = ? WHERE id = ?').bind(date, pts(slot.position, slot.entity_id), slot.id),
    db.prepare('INSERT INTO roster_slots (guru_id, position, entity_id, start_date, start_points, replaced_slot_id) VALUES (?,?,?,?,?,?)')
      .bind(slot.guru_id, slot.position, entityId, date, pts(slot.position, entityId), slot.id),
  ]);
}
