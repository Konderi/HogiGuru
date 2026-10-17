import { useEffect, useState, type ReactNode } from 'react';
import { api, matchName, POS_SHORT, type Position } from './api';

/** HogiGuru-vaakuna (public/hogiguru_vaakuna_ikoni_*.png). Vanha SVG-logo: src/legacy/LegacyLogo.tsx */
export function Trophy({ className = 'h-6 w-6', title = 'Mestari' }: { className?: string; title?: string }) {
  return (
    <img src="/hg_pokaali_ikoni_64.png" srcSet="/hg_pokaali_ikoni_32.png 0.5x, /hg_pokaali_ikoni_64.png 1x, /hg_pokaali_ikoni_128.png 2x, /hg_pokaali_ikoni_256.png 4x"
      alt={title} title={title} className={`inline-block align-middle object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] ${className}`} />
  );
}

export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <img src="/hogiguru_vaakuna_ikoni_64.png" srcSet="/hogiguru_vaakuna_ikoni_64.png 1x, /hogiguru_vaakuna_ikoni_128.png 2x, /hogiguru_vaakuna_ikoni_256.png 4x"
      alt="HogiGuru" className={`${className} object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]`} />
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card animate-in ${className}`}>
      {(title || action) && <header className="card-header"><h2 className="card-title">{title}</h2>{action}</header>}
      {/* Leveät taulukot vierivät sivuttain kortin sisällä mobiilissa */}
      <div className="overflow-x-auto overscroll-x-contain">{children}</div>
    </section>
  );
}

export function PageHeader({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-in sm:mb-8">
      <div className="min-w-0">
        {kicker && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-ice-400">{kicker}</p>}
        <h1 className="break-words text-3xl sm:text-5xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export const Spinner = () => (
  <div className="flex justify-center p-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-ice-400/20 border-t-ice-400" /></div>
);

export const ErrorBox = ({ error }: { error: string | null }) =>
  error ? <div className="rounded-xl border border-goal/40 bg-goal/10 px-4 py-3 text-sm text-red-200">{error}</div> : null;

export const Empty = ({ children }: { children: ReactNode }) => <div className="px-5 py-10 text-center text-sm text-slate-400">{children}</div>;

export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex h-8 w-8 items-center justify-center"><Trophy className="h-8 w-8" title="1." /></span>;
  const style = rank === 1 ? 'bg-gold text-rink-950 shadow-gold/40' : rank === 2 ? 'bg-silver text-rink-950' : rank === 3 ? 'bg-bronze text-white' : 'bg-white/5 text-slate-300';
  return <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg font-display text-sm shadow-lg ${style}`}>{rank}</span>;
}

export function RankDelta({ rank, prev }: { rank: number; prev: number | null }) {
  if (prev == null || prev === rank) return <span className="text-xs text-slate-600">–</span>;
  const up = prev > rank;
  return <span className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-goal'}`}>{up ? '▲' : '▼'} {Math.abs(prev - rank)}</span>;
}

export function PosBadge({ pos }: { pos: Position }) {
  const c: Record<Position, string> = { F: 'bg-ice-500/15 text-ice-300', D: 'bg-violet-500/15 text-violet-300', G: 'bg-amber-500/15 text-amber-300', C: 'bg-emerald-500/15 text-emerald-300' };
  return <span className={`chip ${c[pos]}`}>{POS_SHORT[pos]}</span>;
}

export function Avatar({ src, name, size = 'h-9 w-9' }: { src?: string | null; name: string; size?: string }) {
  const [err, setErr] = useState(false);
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('');
  return src && !err
    ? <img src={src} alt="" onError={() => setErr(true)} className={`${size} shrink-0 rounded-full bg-rink-700 object-cover object-top ring-1 ring-white/10`} />
    : <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-rink-700 text-xs font-semibold text-slate-300 ring-1 ring-white/10`}>{initials}</span>;
}

export function Countdown({ date }: { date: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = Math.max(0, new Date(date.length === 10 ? `${date}T00:00:00` : date).getTime() - now);
  const parts = [Math.floor(diff / 864e5), Math.floor(diff / 36e5) % 24, Math.floor(diff / 6e4) % 60, Math.floor(diff / 1e3) % 60];
  const labels = ['pv', 'h', 'min', 's'];
  return (
    <div className="flex gap-2">
      {parts.map((v, i) => (
        <div key={i} className="min-w-14 rounded-xl border border-white/10 bg-rink-950/70 px-2 py-2 text-center">
          <div className="scoreboard text-2xl">{String(v).padStart(2, '0')}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[8vh]" onClick={onClose}>
      <div className={`card w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92dvh] overflow-y-auto rounded-b-none pb-[env(safe-area-inset-bottom)] animate-in sm:max-h-[86dvh] sm:rounded-b-2xl sm:pb-0`} onClick={(e) => e.stopPropagation()}>
        <header className="card-header sticky top-0 z-10 bg-rink-850"><h2 className="card-title min-w-0 flex-1 truncate">{title}</h2><button className="-m-2 p-2 text-xl leading-none text-slate-400 hover:text-white" onClick={onClose} aria-label="Sulje">✕</button></header>
        <div className="overflow-x-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export interface SearchHit { id: number; name: string; team: string | null; picture?: string | null; reserved?: number; max?: number; hg?: number }

/** Varaustilanne-merkki: 2/5 (vihreä), 4/5 (keltainen), 5/5 täynnä (punainen). */
export function ReservedBadge({ n, max }: { n: number; max: number }) {
  const cls = n >= max ? 'bg-goal/20 text-goal' : n >= max - 1 ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300';
  return <span title={n >= max ? 'Täynnä' : `${max - n} vapaana`} className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${cls}`}>{n}/{max}</span>;
}

/** Pelaajahaku liiga-datasta. Valmentajille annetaan valmis lista `options`. */
export function EntityPicker({ pos, onPick, options, placeholder }: {
  pos: Position; onPick: (h: SearchHit) => void; options?: SearchHit[]; placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    if (options) { setHits(options.filter((o) => matchName(o.name, q)).slice(0, 30)); return; }
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api<SearchHit[]>(`/players/search?pos=${pos}&q=${encodeURIComponent(q)}`).then(setHits).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, pos, options]);
  return (
    <div>
      <input type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" className="input" autoFocus={window.matchMedia('(pointer: fine)').matches} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? 'Hae nimellä…'} />
      {hits.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-rink-950/80">
          {hits.map((h) => (
            <li key={h.id}>
              <button className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ice-500/10 ${h.max != null && (h.reserved ?? 0) >= h.max ? 'opacity-50' : ''}`} onClick={() => { onPick(h); setQ(''); }}>
                <Avatar src={h.picture} name={h.name} size="h-7 w-7" />
                <span className="min-w-0 flex-1 truncate text-sm text-white">{h.name}</span>
                <span className="max-w-[35%] shrink-0 truncate text-xs text-slate-400">{h.team}</span>
                {h.max != null && <ReservedBadge n={h.reserved ?? 0} max={h.max} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Toast({ msg, onDone }: { msg: { text: string; err?: boolean } | null; onDone: () => void }) {
  useEffect(() => { if (msg) { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); } }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div className={`fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[60] rounded-xl px-4 py-3 text-center text-sm font-medium shadow-2xl animate-in sm:inset-x-auto sm:bottom-6 sm:right-6 sm:text-left ${msg.err ? 'bg-goal text-white' : 'bg-emerald-500 text-rink-950'}`}>
      {msg.text}
    </div>
  );
}
