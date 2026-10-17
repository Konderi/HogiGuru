import { createContext, useCallback, useContext, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { Toast } from '../ui';

const links = [
  { to: '/admin', label: 'Yleiskatsaus', icon: '◎', end: true },
  { to: '/admin/ilmoittautuminen', label: 'Ilmoittautuminen', icon: '✎' },
  { to: '/admin/draft', label: 'Draft', icon: '◆' },
  { to: '/admin/vaihdot', label: 'Vaihdot', icon: '⇄' },
  { to: '/admin/gurut', label: 'Gurut & kentälliset', icon: '★' },
  { to: '/admin/pisteytys', label: 'Pisteytys & kausi', icon: '∑' },
  { to: '/admin/valmentajat', label: 'Valmentajat', icon: '♟' },
  { to: '/admin/kayttajat', label: 'Käyttäjät', icon: '☺' },
  { to: '/admin/tulokset', label: 'Kokonaistulokset', icon: '🏆' },
  { to: '/admin/hall-of-fame', label: 'Hall of Fame', icon: '♛' },
];

type Notify = (text: string, err?: boolean) => void;
const NotifyCtx = createContext<{ notify: Notify; run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | undefined> }>(null!);
export const useAdmin = () => useContext(NotifyCtx);
export { api };

export default function AdminLayout() {
  const { me } = useAuth();
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const notify = useCallback<Notify>((text, err) => setMsg({ text, err }), []);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string) => {
    try { const r = await fn(); if (ok) notify(ok); return r; } catch (e) { notify((e as Error).message, true); return undefined; }
  }, [notify]);

  const all = [...links, ...(me?.user?.role === 'superadmin' ? [{ to: '/admin/yllapito', label: 'Tekninen ylläpito', icon: '⚙', end: false }] : [])];
  const nav = useNavigate();
  const loc = useLocation();
  const current = [...all].sort((a, b) => b.to.length - a.to.length).find((l) => (l.end ? loc.pathname === l.to : loc.pathname.startsWith(l.to)));

  return (
    <NotifyCtx.Provider value={{ notify, run }}>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr] lg:gap-8">
        <aside>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-goal">Ylläpito</p>
          {/* Mobiili: valikko pudotuslistana */}
          <select className="input lg:hidden" value={current?.to ?? '/admin'} onChange={(e) => nav(e.target.value)} aria-label="Ylläpidon osio">
            {all.map((l) => <option key={l.to} value={l.to}>{l.icon} {l.label}</option>)}
          </select>
          <nav className="hidden flex-col gap-1 lg:flex">
            {all.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}
                className={({ isActive }) => `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-ice-500/15 text-ice-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                <span className="w-4 text-center opacity-70">{l.icon}</span>{l.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="admin-scope min-w-0"><Outlet /></div>
      </div>
      <Toast msg={msg} onDone={() => setMsg(null)} />
    </NotifyCtx.Provider>
  );
}
