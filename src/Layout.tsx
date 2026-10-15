import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { isAdminRole, useAuth } from './auth';
import { Logo } from './ui';

const nav = [
  { to: '/', label: 'Etusivu', end: true },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/gurukierros', label: 'Gurukierros' },
  { to: '/sarjataulukko', label: 'Sarjataulukko' },
  { to: '/tilastot', label: 'Tilastot' },
  { to: '/kokonaistulokset', label: 'Kokonaistulokset' },
  { to: '/hall-of-fame', label: 'Hall of Fame' },
];

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition ${isActive ? 'bg-ice-500/15 text-ice-200 ring-1 ring-ice-400/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`;

const initials = (n: string) => n.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();

export default function Layout() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = me?.user;
  const extra = [
    ...(user ? [{ to: '/oma-joukkue', label: 'Oma joukkue' }, { to: '/draft', label: 'Draft' }] : []),
    ...(isAdminRole(user?.role) ? [{ to: '/admin', label: 'Ylläpito' }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-white/6 bg-rink-900/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-2xl tracking-wider text-white">HOGI<span className="text-ice-400">GURU</span></span>
          </Link>
          <nav className="hidden flex-1 items-center gap-0.5 lg:flex">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end={'end' in n} className={linkCls}>{n.label}</NavLink>)}
            {extra.length > 0 && <span className="mx-2 h-5 w-px bg-white/10" />}
            {extra.map((n) => <NavLink key={n.to} to={n.to} className={linkCls}>{n.label}</NavLink>)}
          </nav>
          <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
            {user ? (
              <>
                <span title={me?.guru?.name ?? user.name} className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-ice-400 to-ice-600 text-xs font-bold text-rink-950">
                  {initials(me?.guru?.name ?? user.name)}
                </span>
                <button title="Kirjaudu ulos" aria-label="Kirjaudu ulos" className="rounded-full p-2 text-slate-400 transition hover:bg-white/5 hover:text-white" onClick={async () => { await logout(); navigate('/'); }}>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" /></svg>
                </button>
              </>
            ) : <><Link to="/ilmoittaudu" className="rounded-full px-3 py-1.5 text-[13px] font-medium text-slate-300 hover:text-white">Ilmoittaudu</Link><Link to="/kirjaudu" className="btn btn-primary">Kirjaudu</Link></>}
          </div>
          <button className="ml-auto rounded-lg p-2 text-slate-300 lg:hidden" onClick={() => setOpen(!open)} aria-label="Valikko">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d={open ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
          </button>
        </div>
        {open && (
          <nav className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/6 px-4 py-3 lg:hidden" onClick={() => setOpen(false)}>
            {[...nav, ...extra].map((n) => (
              <NavLink key={n.to} to={n.to} end={'end' in n} className={({ isActive }) => `block rounded-lg px-3 py-3 font-semibold ${isActive ? 'bg-ice-500/10 text-ice-300' : 'text-slate-300'}`}>{n.label}</NavLink>
            ))}
            {user
              ? <button className="mt-2 w-full rounded-lg px-3 py-3 text-left font-semibold text-slate-400" onClick={async () => { await logout(); navigate('/'); }}>Kirjaudu ulos{me?.guru ? ` (${me.guru.name})` : ''}</button>
              : <div className="mt-2 grid grid-cols-2 gap-2"><Link to="/ilmoittaudu" className="btn btn-ghost">Ilmoittaudu</Link><Link to="/kirjaudu" className="btn btn-primary">Kirjaudu</Link></div>}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-3 py-6 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-white/6 py-8 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
          <span className="font-display tracking-widest text-slate-400">HOGIGURU</span>
          <span>Liiga-veikkaus</span>
          <span>Tilastot: liiga.fi</span>
        </div>
      </footer>
    </div>
  );
}
