import { POSITIONS, type Position } from './api';
import type { DraftState } from './pages/DraftBoard';

/** Harjoitusdraftin selainlogiikka – samat säännöt kuin palvelimen worker/draft.ts:ssä. */

export type Guru = DraftState['gurus'][number];
export type Pick = DraftState['picks'][number];
export interface Prefs { positionOrder: Position[]; rankings: Partial<Record<Position, number[]>> }

/** Harjoitusikkunoiden välinen kanava (hallinta → seinänäkymä, sama selain). */
export const DEMO_CHANNEL = 'hogiguru-draft-harjoitus';

export function guruForPick(gurus: Guru[], pickNo: number, snake: boolean) {
  const n = gurus.length;
  const round = Math.floor((pickNo - 1) / n);
  let idx = (pickNo - 1) % n;
  if (snake && round % 2 === 1) idx = n - 1 - idx;
  return gurus[idx];
}

/** Rakentaa DraftState-olion harjoituksen gurujen ja valintojen pohjalta. */
export function buildState(base: DraftState, gurus: Guru[], picks: Pick[], status: DraftState['status']): DraftState {
  const sorted = [...gurus].sort((a, b) => (a.draft_number ?? 999) - (b.draft_number ?? 999));
  const perGuru = Object.values(base.roster).reduce((a, b) => a + b, 0);
  const total = sorted.length * perGuru;
  const pickNo = picks.length + 1;
  const used = new Map<string, number>();
  for (const p of picks) used.set(`${p.position}:${p.entity_id}`, (used.get(`${p.position}:${p.entity_id}`) ?? 0) + 1);
  return {
    ...base, status, gurus: sorted, picks, total, pickNo, lottery: null,
    round: Math.ceil(pickNo / Math.max(sorted.length, 1)),
    onClock: status === 'live' && pickNo <= total ? guruForPick(sorted, pickNo, base.snake) : null,
    pool: base.pool.map((p) => ({ ...p, used: used.get(`${p.position}:${p.entity_id}`) ?? 0 })),
  };
}

/** Palauttaa virheilmoituksen tai null, jos valinta on sallittu. */
export function checkPick(st: DraftState, position: Position, entityId: number): string | null {
  const g = st.onClock;
  if (!g) return 'Kaikki valinnat on tehty';
  const mine = st.picks.filter((p) => p.guru_id === g.id);
  if (mine.filter((p) => p.position === position).length >= st.roster[position]) return `${g.name}: paikka on jo täynnä`;
  const item = st.pool.find((p) => p.position === position && p.entity_id === entityId);
  if (!item) return 'Valinta ei ole draft-listalla';
  if (mine.some((p) => p.position === position && p.entity_id === entityId)) return 'Guru on jo valinnut tämän';
  if (item.used >= st.maxPicks[position]) return `Valittu jo ${item.used} kertaa (max ${st.maxPicks[position]})`;
  return null;
}

export function makePick(st: DraftState, position: Position, entityId: number, auto: boolean): Pick {
  const item = st.pool.find((p) => p.position === position && p.entity_id === entityId)!;
  return { id: st.pickNo, pick_no: st.pickNo, guru_id: st.onClock!.id, position, entity_id: entityId, name: item.name, team: item.team, auto: auto ? 1 : 0 };
}

/** Lomakkeen mukainen valinta (sama logiikka kuin palvelimen autoPick). */
export function autoChoice(st: DraftState, prefs: Prefs | undefined): { position: Position; entityId: number } | null {
  const g = st.onClock;
  if (!g || !prefs) return null;
  const mine = st.picks.filter((p) => p.guru_id === g.id);
  const left = (pos: Position) => st.roster[pos] - mine.filter((p) => p.position === pos).length;
  const order = prefs.positionOrder ?? [];
  const nth = mine.length;
  const candidates = [...order.slice(nth), ...order.slice(0, nth), ...POSITIONS].filter((p) => left(p) > 0);
  for (const pos of candidates) {
    for (const id of prefs.rankings?.[pos] ?? []) {
      if (!checkPick(st, pos, id)) return { position: pos, entityId: id };
    }
  }
  return null;
}
