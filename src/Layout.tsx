import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from './auth';
import { Logo } from './ui';

const nav = [
  { to: '/', label: 'Etusivu', end: true },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/sarjataulukko', label: 'Sarjataulukko' },
  { to: '/tilastot', label: 'Tilastot' },
  { to: '/hall-of-fame', label: 'Hall of Fame' },
];

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `relative px-3 py-2 text-sm font-semibold uppercase tracking-wider transition ${isActive ? 'text-white after:absolute after:inset-x-3 after:-bottom-[17px] after:h-0.5 after:bg-ice-400' : 'text-slate-400 hover:text-white'}`;

export default function Layout() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = me?.user;
  const extra = [
    ...(user ? [{ to: '/oma-joukkue', label: 'Oma joukkue' }, { to: '/draft', label: 'Draft' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Ylläpito' }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-white/6 bg-rink-900/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-2xl tracking-wider text-white">HOGI<span className="text-ice-400">GURU</span></span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 lg:flex">
            {[...nav, ...extra].map((n) => <NavLink key={n.to} to={n.to} end={'end' in n} className={linkCls}>{n.label}</NavLink>)}
          </nav>
          <div className="ml-auto hidden items-center gap-3 lg:flex">
            {user ? (
              <>
                <span className="text-sm text-slate-400">{me?.guru?.name ?? user.name}</span>
                <button className="btn btn-ghost" onClick={async () => { await logout(); navigate('/'); }}>Kirjaudu ulos</button>
              </>
            ) : <Link to="/kirjaudu" className="btn btn-primary">Kirjaudu</Link>}
          </div>
          <button className="ml-auto rounded-lg p-2 text-slate-300 lg:hidden" onClick={() => setOpen(!open)} aria-label="Valikko">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d={open ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
          </button>
        </div>
        {open && (
          <nav className="border-t border-white/6 px-4 py-3 lg:hidden" onClick={() => setOpen(false)}>
            {[...nav, ...extra].map((n) => (
              <NavLink key={n.to} to={n.to} end={'end' in n} className={({ isActive }) => `block rounded-lg px-3 py-2.5 font-semibold ${isActive ? 'bg-ice-500/10 text-ice-300' : 'text-slate-300'}`}>{n.label}</NavLink>
            ))}
            {user
              ? <button className="mt-2 w-full rounded-lg px-3 py-2.5 text-left font-semibold text-slate-400" onClick={() => logout()}>Kirjaudu ulos</button>
              : <Link to="/kirjaudu" className="btn btn-primary mt-2 w-full">Kirjaudu</Link>}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-white/6 py-8 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
          <span className="font-display tracking-widest text-slate-400">HOGIGURU</span>
          <span>Liigan All-Stars-veikkaus</span>
          <span>Tilastot: liiga.fi</span>
        </div>
      </footer>
    </div>
  );
}
