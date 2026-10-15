import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, POS_LABEL, type Position } from '../api';
import { useApi, useAuth } from '../auth';
import { Avatar, Card, Empty, Spinner } from '../ui';

interface Game {
  id: number; start: string; home: boolean; ended: boolean; started: boolean; opponent: string; opponentLogo: string | null; opponentId: string | null;
  gf: number | null; ga: number | null; extra: 'JA' | 'VL' | null; venue: string | null; tickets: string | null;
}
interface P {
  id: number; name: string; role: string; jersey: number | null; picture: string | null; games: number; goals: number; assists: number; points: number;
  pim: number; plusMinus: number; saves: number; goalsAgainst: number; shutouts: number; wins: number; savePct: number | null;
}
interface Standing { team_id: string; ranking: number; name: string; short_name: string | null; logo: string | null; games: number; wins: number; ot_wins: number; ot_losses: number; losses: number; points: number; goals_for: number; goals_against: number }
interface Overview {
  team: { id: string; name: string; short_name: string | null; logo: string | null };
  standing: Standing | null; standings: Standing[];
  upcoming: Game[]; recent: Game[];
  form: { date: string; opponent: string; opponentLogo: string | null; home: number; gf: number; ga: number; result: 'V' | 'JV' | 'JH' | 'H' }[];
  streak: { n: number; win: boolean } | null;
  homeAway: Record<'home' | 'away', { games: number; points: number; gf: number; ga: number }>;
  leaders: Record<'points' | 'goals' | 'assists' | 'plusMinus' | 'pim', P[]>;
  goalies: P[];
  coach: { name: string; fired: number } | null;
  hogiguru: { fans: number; picks: { position: Position; name: string; n: number }[] };
}

const day = (s: string) => new Date(s).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Helsinki' });
const time = (s: string) => new Date(s).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' });
const RES: Record<string, string> = { V: 'bg-emerald-500 text-rink-950', JV: 'bg-emerald-500/60 text-rink-950', JH: 'bg-amber-400/70 text-rink-950', H: 'bg-goal text-white' };

function TeamLogo({ src, name, className = 'h-8 w-8' }: { src: string | null; name: string; className?: string }) {
  return src ? <img src={src} alt={name} className={`${className} object-contain`} /> : <span className={`${className} grid place-items-center rounded-full bg-white/10 text-xs font-bold`}>{name.slice(0, 2)}</span>;
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span className="font-semibold text-goal">● Käynnissä</span>;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  const box = (v: number, l: string) => <div className="min-w-14 rounded-xl bg-white/5 px-2 py-1.5 text-center"><div className="scoreboard text-2xl">{String(v).padStart(2, '0')}</div><div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div></div>;
  return <div className="flex gap-1.5">{d > 0 && box(d, 'pv')}{box(h, 'h')}{box(m, 'min')}{box(s, 's')}</div>;
}

export default function Team() {
  const { id = '' } = useParams();
  const { me, refresh } = useAuth();
  const { data, error } = useApi<Overview>(`/teams/${encodeURIComponent(id)}/overview`, [id]);
  const [saving, setSaving] = useState(false);
  if (error) return <Card><Empty>{error}</Empty></Card>;
  if (!data) return <Spinner />;
  const { team, standing: st, upcoming, recent, form, streak, homeAway, leaders, goalies, coach, hogiguru } = data;
  const isFav = me?.favTeam?.id === team.id;
  const next = upcoming[0];
  const setFav = async (v: string | null) => { setSaving(true); await api('/me/fav-team', { method: 'PUT', body: { team_id: v } }).catch(() => {}); await refresh(); setSaving(false); };

  // Sarjataulukon lähiympäristö
  const idx = data.standings.findIndex((s) => s.team_id === team.id);
  const around = data.standings.slice(Math.max(0, Math.min(idx - 3, data.standings.length - 7)), Math.max(7, idx + 4));
  const leader = data.standings[0];

  return (
    <div className="space-y-6">
      {/* Hero: logo ensimmäisenä */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-rink-850 animate-in">
        {team.logo && <img src={team.logo} alt="" aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-96 w-96 select-none object-contain opacity-[0.07] blur-[1px]" />}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.18),transparent_60%)]" />
        <div className="relative flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:p-10 sm:text-left">
          <div className="grid h-36 w-36 shrink-0 place-items-center rounded-full bg-white/[0.04] ring-1 ring-white/10 shadow-[0_0_80px_rgba(56,189,248,0.25)] sm:h-48 sm:w-48">
            <TeamLogo src={team.logo} name={team.name} className="h-28 w-28 sm:h-36 sm:w-36" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="label">{isFav ? '★ Lempijoukkueesi' : 'Liiga-joukkue'}</p>
            <h1 className="font-display text-5xl tracking-wide text-white sm:text-6xl">{team.name}</h1>
            {st && (
              <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-3 sm:justify-start">
                <Stat label="Sija" value={`${st.ranking}.`} big />
                <Stat label="Pisteet" value={st.points} big />
                <Stat label="Ottelut" value={st.games} />
                <Stat label="V-JV-JH-H" value={`${st.wins}-${st.ot_wins}-${st.ot_losses}-${st.losses}`} />
                <Stat label="Maalit" value={`${st.goals_for}–${st.goals_against}`} />
                <Stat label="P/ottelu" value={st.games ? (st.points / st.games).toFixed(2) : '–'} />
              </div>
            )}
            {form.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                <span className="mr-1 text-xs uppercase tracking-wider text-slate-400">Vire</span>
                {[...form].reverse().map((f, i) => <span key={i} title={`${f.home ? 'vs' : '@'} ${f.opponent} ${f.gf}–${f.ga}`} className={`grid h-7 min-w-7 place-items-center rounded-md px-1 text-[11px] font-bold ${RES[f.result]}`}>{f.result}</span>)}
                {streak && streak.n >= 2 && <span className="ml-2 text-sm text-slate-300">{streak.win ? '🔥' : '🧊'} {streak.n} {streak.win ? 'voittoa' : 'tappiota'} putkeen</span>}
              </div>
            )}
          </div>
          {me?.user && (
            <button disabled={saving} onClick={() => setFav(isFav ? null : team.id)} className={`btn shrink-0 ${isFav ? 'btn-ghost' : 'btn-primary'}`}>
              {isFav ? '☆ Poista lempijoukkue' : '★ Aseta lempijoukkueeksi'}
            </button>
          )}
        </div>
      </section>

      {/* Seuraava ottelu */}
      {next && (
        <section className="overflow-hidden rounded-3xl border border-ice-400/30 bg-gradient-to-r from-ice-500/15 via-rink-850 to-rink-850 p-6">
          <p className="label mb-4 text-center sm:text-left">Seuraava ottelu · {day(next.start)} klo {time(next.start)}{next.venue ? ` · ${next.venue}` : ''}</p>
          <div className="flex flex-col items-center gap-6 lg:flex-row">
            <div className="flex flex-1 items-center justify-center gap-4 sm:gap-8">
              <Side logo={next.home ? team.logo : next.opponentLogo} name={next.home ? team.name : next.opponent} id={next.home ? team.id : next.opponentId} />
              <span className="font-display text-3xl text-slate-500">VS</span>
              <Side logo={next.home ? next.opponentLogo : team.logo} name={next.home ? next.opponent : team.name} id={next.home ? next.opponentId : team.id} />
            </div>
            <div className="flex flex-col items-center gap-3">
              <Countdown to={next.start} />
              {next.tickets && <a href={next.tickets} target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-sm">🎟 Liput</a>}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tulevat ottelut">
          <ul>{upcoming.map((g) => <GameRow key={g.id} g={g} />)}{!upcoming.length && <li><Empty>Ei tulevia otteluita.</Empty></li>}</ul>
        </Card>
        <Card title="Viimeisimmät tulokset">
          <ul>{recent.map((g) => <GameRow key={g.id} g={g} />)}{!recent.length && <li><Empty>Ei pelattuja otteluita.</Empty></li>}</ul>
        </Card>
      </div>

      {/* Pistepörssi + kärkimiehet */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Pistepörssi">
          <table className="table">
            <thead><tr><th>#</th><th>Pelaaja</th><th className="num">O</th><th className="num">M</th><th className="num">S</th><th className="num">P</th><th className="num">+/-</th><th className="num">J</th></tr></thead>
            <tbody>
              {leaders.points.map((p, i) => (
                <tr key={p.id}>
                  <td className="text-slate-500">{i + 1}</td>
                  <td><span className="flex items-center gap-2"><Avatar src={p.picture} name={p.name} size="h-8 w-8" /><span className="text-white">{p.name}</span>{p.jersey != null && <span className="text-xs text-slate-500">#{p.jersey}</span>}</span></td>
                  <td className="num text-slate-400">{p.games}</td><td className="num">{p.goals}</td><td className="num">{p.assists}</td>
                  <td className="num scoreboard">{p.points}</td>
                  <td className={`num ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-goal' : ''}`}>{p.plusMinus > 0 ? '+' : ''}{p.plusMinus}</td>
                  <td className="num text-slate-400">{p.pim}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leaders.points.length && <Empty>Ei tilastoja vielä.</Empty>}
        </Card>
        <div className="grid grid-cols-2 gap-3 self-start">
          <Leader title="🎯 Maalikuningas" p={leaders.goals[0]} v={(p) => `${p.goals} maalia`} />
          <Leader title="🍎 Syöttökuningas" p={leaders.assists[0]} v={(p) => `${p.assists} syöttöä`} />
          <Leader title="📈 Paras +/-" p={leaders.plusMinus[0]} v={(p) => `${p.plusMinus > 0 ? '+' : ''}${p.plusMinus}`} />
          <Leader title="🥊 Jäähykuningas" p={leaders.pim[0]} v={(p) => `${p.pim} min`} />
          <div className="col-span-2 rounded-2xl border border-white/10 bg-rink-850/60 p-4">
            <p className="label">Kotona / vieraissa</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(['home', 'away'] as const).map((k) => {
                const s = homeAway[k];
                return (
                  <div key={k}>
                    <p className="text-sm text-slate-400">{k === 'home' ? '🏠 Koti' : '🚌 Vieras'}</p>
                    <p className="scoreboard text-2xl">{s.points} <span className="text-sm text-slate-500">p / {s.games} ott.</span></p>
                    <p className="text-xs text-slate-400">Maalit {s.gf}–{s.ga} · {s.games ? (s.points / s.games).toFixed(2) : '–'} p/ott.</p>
                  </div>
                );
              })}
            </div>
          </div>
          {coach && (
            <div className="col-span-2 rounded-2xl border border-white/10 bg-rink-850/60 p-4">
              <p className="label">Päävalmentaja</p>
              <p className="mt-1 text-lg font-semibold text-white">{coach.name}{coach.fired ? <span className="ml-2 text-sm text-goal">erotettu</span> : null}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Maalivahdit">
          <table className="table">
            <thead><tr><th>Maalivahti</th><th className="num">O</th><th className="num">V</th><th className="num">Torj-%</th><th className="num">PM</th><th className="num">NP</th></tr></thead>
            <tbody>
              {goalies.map((p) => (
                <tr key={p.id}>
                  <td><span className="flex items-center gap-2"><Avatar src={p.picture} name={p.name} size="h-8 w-8" /><span className="text-white">{p.name}</span></span></td>
                  <td className="num">{p.games}</td><td className="num">{p.wins}</td>
                  <td className="num scoreboard">{p.savePct != null ? p.savePct.toFixed(2) : '–'}</td>
                  <td className="num">{p.games ? (p.goalsAgainst / p.games).toFixed(2) : '–'}</td>
                  <td className="num">{p.shutouts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!goalies.length && <Empty>Ei tilastoja vielä.</Empty>}
        </Card>

        <Card title="Sarjataulukko" action={<Link to="/sarjataulukko" className="text-xs text-ice-300 hover:underline">Koko taulukko →</Link>}>
          <table className="table">
            <thead><tr><th>#</th><th>Joukkue</th><th className="num">O</th><th className="num">P</th><th className="num">Ero</th></tr></thead>
            <tbody>
              {around.map((s) => (
                <tr key={s.team_id} className={s.team_id === team.id ? 'bg-ice-500/15' : ''}>
                  <td className="text-slate-400">{s.ranking}</td>
                  <td><Link to={`/joukkue/${encodeURIComponent(s.team_id)}`} className="flex items-center gap-2 hover:underline"><TeamLogo src={s.logo} name={s.name} className="h-6 w-6" /><span className={s.team_id === team.id ? 'font-bold text-white' : 'text-slate-200'}>{s.name}</span></Link></td>
                  <td className="num text-slate-400">{s.games}</td>
                  <td className="num scoreboard">{s.points}</td>
                  <td className="num text-slate-400">{s.team_id === leader?.team_id ? '–' : s.points - (leader?.points ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="HogiGuru-kulma">
        <div className="grid gap-6 p-5 sm:grid-cols-[200px_1fr]">
          <div>
            <p className="label">Faneja guruissa</p>
            <p className="scoreboard text-4xl">{hogiguru.fans}</p>
            <p className="text-xs text-slate-400">on valinnut {team.short_name ?? team.name}:n lempijoukkueekseen</p>
          </div>
          <div>
            <p className="label mb-2">Joukkueen pelaajat gurujen kentällisissä</p>
            {hogiguru.picks.length ? (
              <div className="flex flex-wrap gap-2">
                {hogiguru.picks.map((p) => (
                  <span key={`${p.position}${p.name}`} className="chip bg-white/5 text-slate-200" title={POS_LABEL[p.position]}>{p.name} <b className="ml-1 text-ice-300">×{p.n}</b></span>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">Ei yhtään – aliarvostettu joukkue?</p>}
          </div>
        </div>
      </Card>
      <p className="text-center text-xs text-slate-500">Tiedot: <a href="https://liiga.fi" target="_blank" rel="noopener noreferrer" className="hover:underline">liiga.fi</a></p>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string | number; big?: boolean }) {
  return <div><p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p><p className={big ? 'scoreboard text-3xl' : 'font-display text-xl text-white'}>{value}</p></div>;
}

function Side({ logo, name, id }: { logo: string | null; name: string; id: string | null }) {
  const inner = <><TeamLogo src={logo} name={name} className="h-16 w-16 sm:h-24 sm:w-24" /><span className="mt-2 font-display text-lg text-white sm:text-2xl">{name}</span></>;
  return id ? <Link to={`/joukkue/${encodeURIComponent(id)}`} className="flex flex-col items-center hover:opacity-90">{inner}</Link> : <div className="flex flex-col items-center">{inner}</div>;
}

function GameRow({ g }: { g: Game }) {
  const won = g.gf != null && g.ga != null && g.gf > g.ga;
  return (
    <li className="flex items-center gap-3 border-t border-white/5 px-4 py-2.5 first:border-t-0">
      <div className="w-20 shrink-0 text-xs text-slate-400"><div className="capitalize">{day(g.start)}</div><div>{time(g.start)}</div></div>
      <span className="w-6 text-center text-xs text-slate-500">{g.home ? 'vs' : '@'}</span>
      <TeamLogo src={g.opponentLogo} name={g.opponent} className="h-7 w-7" />
      {g.opponentId ? <Link to={`/joukkue/${encodeURIComponent(g.opponentId)}`} className="flex-1 truncate text-white hover:underline">{g.opponent}</Link> : <span className="flex-1 truncate text-white">{g.opponent}</span>}
      {g.ended ? (
        <span className={`rounded-md px-2 py-0.5 font-mono text-sm font-bold ${won ? 'bg-emerald-500/20 text-emerald-300' : 'bg-goal/20 text-red-300'}`}>{g.gf}–{g.ga}{g.extra ? ` ${g.extra}` : ''}</span>
      ) : g.started ? <span className="font-mono text-sm text-goal">● {g.gf ?? 0}–{g.ga ?? 0}</span> : null}
    </li>
  );
}

function Leader({ title, p, v }: { title: string; p?: P; v: (p: P) => string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-rink-850/60 p-4">
      <p className="text-xs text-slate-400">{title}</p>
      {p ? <div className="mt-2 flex items-center gap-2"><Avatar src={p.picture} name={p.name} size="h-10 w-10" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{p.name}</p><p className="scoreboard text-lg">{v(p)}</p></div></div>
        : <p className="mt-2 text-sm text-slate-500">–</p>}
    </div>
  );
}
