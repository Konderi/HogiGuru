import { entityName, helsinkiDate, loadContext, maxFor, usageCounts, usageKey, type Season } from './data';
import { swapSlot } from './draft';
import type { Position } from './scoring';

export interface SwapDay { id: number; date: string; start_time: string; end_time: string; note: string | null; processed_at: string | null }
interface Req { id: number; guru_id: number; priority: number; slot_id: number; candidates: string }
interface ActiveSlot { id: number; guru_id: number; position: Position; entity_id: number }

/** Nykyhetki Helsingin aikaa muodossa "YYYY-MM-DD HH:MM". */
export const helsinkiNow = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
export const deadlineOf = (d: SwapDay) => `${d.date} ${d.end_time}`;

/** Seuraava käsittelemätön vaihtopäivä, jonka toiveaika ei ole vielä umpeutunut. */
export async function nextOpenSwapDay(db: D1Database, season: Season) {
  return db.prepare("SELECT * FROM swap_days WHERE season_id = ? AND processed_at IS NULL AND date || ' ' || end_time >= ? ORDER BY date LIMIT 1")
    .bind(season.id, helsinkiNow()).first<SwapDay>();
}

/** Etusijajärjestys: draft-numero; joka toisena vaihtopäivänä (2., 4., …) käänteinen. */
export async function priorityOrder(db: D1Database, season: Season, day: SwapDay) {
  const [idx, gurus] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM swap_days WHERE season_id = ? AND date < ?').bind(season.id, day.date),
    db.prepare('SELECT id, name, draft_number FROM gurus WHERE season_id = ? ORDER BY draft_number IS NULL, draft_number, name').bind(season.id),
  ]);
  const n = (idx.results[0] as { n: number }).n;
  const reversed = n % 2 === 1;
  const list = gurus.results as { id: number; name: string; draft_number: number | null }[];
  return { dayNumber: n + 1, reversed, order: reversed ? [...list].reverse() : list };
}

export interface SwapResult {
  request_id: number; guru_id: number; guru: string; round: number; slot_id: number; position: Position;
  out_id: number; out_name: string; in_id: number | null; in_name: string | null; ok: boolean; note: string;
}

/** Simuloi vaihtopäivän käsittelyn: kierroksittain, jokaisen gurun n:s toive etusijajärjestyksessä. */
export async function previewSwapDay(db: D1Database, season: Season, day: SwapDay) {
  const [{ order, reversed, dayNumber }, reqR, slotsR, usedR, usage, ctx] = await Promise.all([
    priorityOrder(db, season, day),
    db.prepare('SELECT * FROM swap_requests WHERE swap_day_id = ? ORDER BY guru_id, priority').bind(day.id).all<Req>(),
    db.prepare('SELECT s.id, s.guru_id, s.position, s.entity_id FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.season_id = ? AND s.end_date IS NULL').bind(season.id).all<ActiveSlot>(),
    db.prepare('SELECT s.guru_id, COUNT(*) AS n FROM roster_slots s JOIN gurus g ON g.id = s.guru_id WHERE g.season_id = ? AND s.replaced_slot_id IS NOT NULL GROUP BY s.guru_id').bind(season.id).all<{ guru_id: number; n: number }>(),
    usageCounts(db, season.id),
    loadContext(db, season),
  ]);
  const name = (p: Position, id: number) => entityName(ctx, p, id).name;
  const active = new Map(slotsR.results.map((s) => [s.id, { ...s }]));
  const owned = new Map<number, Set<string>>();
  for (const s of active.values()) { if (!owned.has(s.guru_id)) owned.set(s.guru_id, new Set()); owned.get(s.guru_id)!.add(usageKey(s.position, s.entity_id)); }
  const used = new Map(usedR.results.map((r) => [r.guru_id, r.n]));
  const byGuru = new Map<number, Req[]>();
  for (const r of reqR.results) { if (!byGuru.has(r.guru_id)) byGuru.set(r.guru_id, []); byGuru.get(r.guru_id)!.push(r); }
  const rounds = Math.max(0, ...[...byGuru.values()].map((l) => l.length));

  const results: SwapResult[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const g of order) {
      const req = byGuru.get(g.id)?.[round];
      if (!req) continue;
      const slot = active.get(req.slot_id);
      const base = { request_id: req.id, guru_id: g.id, guru: g.name, round: round + 1, slot_id: req.slot_id };
      if (!slot || slot.guru_id !== g.id) {
        results.push({ ...base, position: 'F', out_id: 0, out_name: '–', in_id: null, in_name: null, ok: false, note: 'Paikka on jo vaihdettu' });
        continue;
      }
      const out = { position: slot.position, out_id: slot.entity_id, out_name: name(slot.position, slot.entity_id) };
      if (season.max_swaps != null && (used.get(g.id) ?? 0) >= season.max_swaps) {
        results.push({ ...base, ...out, in_id: null, in_name: null, ok: false, note: `Vaihdot käytetty (${season.max_swaps})` });
        continue;
      }
      const skipped: string[] = [];
      let pick: number | null = null;
      for (const cand of JSON.parse(req.candidates) as number[]) {
        const key = usageKey(slot.position, cand);
        if (owned.get(g.id)?.has(key)) { skipped.push(`${name(slot.position, cand)} jo omassa kentällisessä`); continue; }
        const u = usage.get(key) ?? 0;
        if (u >= maxFor(season, slot.position)) { skipped.push(`${name(slot.position, cand)} täynnä ${u}/${maxFor(season, slot.position)}`); continue; }
        pick = cand; break;
      }
      if (pick == null) {
        results.push({ ...base, ...out, in_id: null, in_name: null, ok: false, note: skipped.join(' · ') || 'Ei vaihtoehtoja' });
        continue;
      }
      const oldKey = usageKey(slot.position, slot.entity_id); const newKey = usageKey(slot.position, pick);
      usage.set(oldKey, Math.max(0, (usage.get(oldKey) ?? 1) - 1));
      usage.set(newKey, (usage.get(newKey) ?? 0) + 1);
      owned.get(g.id)!.delete(oldKey); owned.get(g.id)!.add(newKey);
      active.delete(slot.id);
      used.set(g.id, (used.get(g.id) ?? 0) + 1);
      results.push({ ...base, ...out, in_id: pick, in_name: name(slot.position, pick), ok: true, note: skipped.length ? `Varavaihtoehto (${skipped.join(' · ')})` : '' });
    }
  }
  return { day, dayNumber, reversed, order: order.map((g, i) => ({ pos: i + 1, id: g.id, name: g.name, draft_number: g.draft_number, requests: byGuru.get(g.id)?.length ?? 0 })), results };
}

/** Toteuttaa vaihtopäivän: tekee onnistuneet vaihdot järjestyksessä ja merkitsee päivän käsitellyksi. */
export async function processSwapDay(db: D1Database, season: Season, day: SwapDay) {
  if (day.processed_at) throw new Error('Vaihtopäivä on jo käsitelty');
  const pv = await previewSwapDay(db, season, day);
  const date = day.date <= helsinkiDate() ? day.date : helsinkiDate();
  for (const r of pv.results) {
    if (r.ok && r.in_id != null) {
      try { await swapSlot(db, season, r.slot_id, r.in_id, date); } catch (e) { r.ok = false; r.note = (e as Error).message; }
    }
    await db.prepare('UPDATE swap_requests SET status = ?, result_entity_id = ?, result_note = ? WHERE id = ?')
      .bind(r.ok ? 'done' : 'failed', r.ok ? r.in_id : null, r.note || null, r.request_id).run();
  }
  await db.prepare('UPDATE swap_days SET processed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(day.id).run();
  return pv;
}
