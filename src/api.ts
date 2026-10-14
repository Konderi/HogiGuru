export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Virhe ${res.status}`, res.status);
  return data as T;
}

export type Position = 'C' | 'G' | 'D' | 'F';
export const POS_LABEL: Record<Position, string> = { C: 'Valmentaja', G: 'Maalivahti', D: 'Puolustaja', F: 'Hyökkääjä' };
export const POS_PLURAL: Record<Position, string> = { C: 'Valmentajat', G: 'Maalivahdit', D: 'Puolustajat', F: 'Hyökkääjät' };
export const POS_SHORT: Record<Position, string> = { C: 'V', G: 'MV', D: 'P', F: 'H' };
export const POSITIONS: Position[] = ['F', 'D', 'G', 'C'];

export interface LeaderRow { id: number; name: string; points: number; rank: number; prevRank: number | null }
export interface Slot {
  id: number; position: Position; entity_id: number; name: string; team: string | null; picture?: string | null;
  start_date: string; end_date: string | null; start_points: number; end_points: number | null;
  current: number; value: number; active: boolean;
}
export interface Scoring {
  F: Record<'goals' | 'assists' | 'pim' | 'plusMinus' | 'games', number>;
  D: Record<'goals' | 'assists' | 'pim' | 'plusMinus' | 'games', number>;
  G: Record<'shutouts' | 'saves' | 'goalsAgainst' | 'wins', number>;
  C: { teamPoints: number };
  coachFiredPenalty: number;
  prediction?: { standings: number[]; topScorer: number[]; category: number[]; shutoutFactor: number };
}
export interface Season {
  id: number; name: string; liiga_season: number; max_swaps: number | null; max_picks_per_entity: number;
  roster: Record<Position, number>; scoring: Scoring; draft_status: 'setup' | 'live' | 'done'; draft_snake: number;
  max_picks_by_pos: Partial<Record<Position, number>>; registration_open: number; registration_deadline: string | null;
  entry_fee: string | null; registration_info: string | null;
  results_published?: number; selection_mode?: 'draft' | 'baskets'; baskets?: string[][];
}

/** Ääkkös- ja kirjainkoko-riippumaton vertailumuoto. */
export const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Nimihaku: jokaisen hakusanan pitää löytyä tekstistä, järjestyksellä ei väliä ("lööke", "jens lööke", "lööke jens"). */
export const matchName = (text: string, q: string) => {
  const t = normName(text);
  return normName(q).split(/\s+/).filter(Boolean).every((w) => t.includes(w));
};

export const fmt = (n: number | null | undefined, d = 1) =>
  n == null ? '–' : n.toLocaleString('fi-FI', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' }) : '–';
export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
