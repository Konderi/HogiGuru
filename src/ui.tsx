import { useEffect, useState, type ReactNode } from 'react';
import { api, matchName, POS_SHORT, type Position } from './api';

export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7dd3fc" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient>
      </defs>
      <path d="M32 3 56 12v20c0 15-10.5 25-24 29C18.5 57 8 47 8 32V12z" fill="#0b1630" stroke="url(#lg)" strokeWidth="3" />
      <ellipse cx="32" cy="38" rx="14" ry="5" fill="#e2e8f0" />
      <path d="M18 38v4c0 2.8 6.3 5 14 5s14-2.2 14-5v-4" fill="#94a3b8" />
      <path d="M22 26 32 14l10 12" fill="none" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card animate-in ${className}`}>
      {(title || action) && <header className="card-header"><h2 className="card-title">{title}</h2>{action}</header>}
      {children}
    </section>
  );
}

export function PageHeader({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-in">
      <div>
        {kicker && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-ice-400">{kicker}</p>}
        <h1 className="text-4xl sm:text-5xl">{title}</h1>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh] backdrop-blur-sm" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} animate-in`} onClick={(e) => e.stopPropagation()}>
        <header className="card-header"><h2 className="card-title">{title}</h2><button className="text-slate-400 hover:text-white" onClick={onClose} aria-label="Sulje">✕</button></header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export interface SearchHit { id: number; name: string; team: string | null; picture?: string | null; reserved?: number; max?: number }

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
      <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? 'Hae nimellä…'} />
      {hits.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-rink-950/80">
          {hits.map((h) => (
            <li key={h.id}>
              <button className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ice-500/10 ${h.max != null && (h.reserved ?? 0) >= h.max ? 'opacity-50' : ''}`} onClick={() => { onPick(h); setQ(''); }}>
                <Avatar src={h.picture} name={h.name} size="h-7 w-7" />
                <span className="flex-1 text-sm text-white">{h.name}</span>
                <span className="text-xs text-slate-400">{h.team}</span>
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
    <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl animate-in ${msg.err ? 'bg-goal text-white' : 'bg-emerald-500 text-rink-950'}`}>
      {msg.text}
    </div>
  );
}
