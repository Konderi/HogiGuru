import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { fmt } from '../api';
import { useApi, useAuth } from '../auth';
import { Avatar, Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';

export interface GameTeam { id: string; name: string; logo: string | null; goals: number }
export interface Game {
  id: number; start: string; ended: boolean; started: boolean; ot: 'OT' | 'SO' | null;
  tournament: 'runkosarja' | 'playoffs'; phase: number | null; home: GameTeam; away: GameTeam;
}

const PHASE: Record<number, string> = { 1: '1. kierros', 2: 'Puolivälierät', 3: 'Välierät', 4: 'Pronssi', 5: 'Finaali' };
const tz = { timeZone: 'Europe/Helsinki' } as const;
const dayKey = (s: string) => new Intl.DateTimeFormat('sv-SE', { ...tz, dateStyle: 'short' }).format(new Date(s));
const dayLabel = (s: string) => new Date(s).toLocaleDateString('fi-FI', { ...tz, weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
const time = (s: string) => new Date(s).toLocaleTimeString('fi-FI', { ...tz, hour: '2-digit', minute: '2-digit' });
export const teamKey = (id: string) => id.split(':')[0];

function Logo({ t }: { t: GameTeam }) {
  return t.logo ? <img src={t.logo} alt="" className="h-7 w-7 shrink-0 object-contain" /> : <span className="h-7 w-7 shrink-0" />;
}

export function GameRow({ g, fav }: { g: Game; fav?: string | null }) {
  const live = g.started && !g.ended;
  const hl = fav && (teamKey(g.home.id) === teamKey(fav) || teamKey(g.away.id) === teamKey(fav));
  const win = (a: number, b: number) => (g.ended && a > b ? 'text-white' : g.ended ? 'text-slate-400' : 'text-slate-200');
  return (
    <Link to={`/ottelut/${g.id}`} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04] ${hl ? 'bg-ice-500/[0.06] ring-1 ring-ice-400/20' : ''}`}>
      <span className={`flex items-center justify-end gap-2 text-right text-sm font-medium ${win(g.home.goals, g.away.goals)}`}>
        <span className="truncate">{g.home.name}</span><Logo t={g.home} />
      </span>
      <span className="min-w-[84px] text-center">
        {g.started ? (
          <span className={`font-display text-xl tracking-wider ${live ? 'text-goal' : 'text-white'}`}>
            {g.home.goals}–{g.away.goals}
            {g.ot && <span className="ml-1 align-top text-[10px] text-slate-400">{g.ot === 'SO' ? 'VL' : 'JA'}</span>}
          </span>
        ) : <span className="font-display text-lg text-ice-300">{time(g.start)}</span>}
        {live && <span className="block text-[10px] font-semibold uppercase tracking-wider text-goal">käynnissä</span>}
        {g.phase && <span className="block text-[10px] text-slate-500">{PHASE[g.phase]}</span>}
      </span>
      <span className={`flex items-center gap-2 text-sm font-medium ${win(g.away.goals, g.home.goals)}`}>
        <Logo t={g.away} /><span className="truncate">{g.away.name}</span>
      </span>
    </Link>
  );
}

export default function Games() {
  const { me } = useAuth();
  const [tour, setTour] = useState<'runkosarja' | 'playoffs'>('runkosarja');
  const [team, setTeam] = useState<string>('');
  const [showPast, setShowPast] = useState(false);
  const { data, error, loading } = useApi<{ games: Game[] }>(`/games?tournament=${tour}`, [tour]);
  const fav = me?.favTeam?.id ?? null;
  const todayRef = useRef<HTMLDivElement>(null);

  const teams = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of data?.games ?? []) { m.set(teamKey(g.home.id), g.home.name); m.set(teamKey(g.away.id), g.away.name); }
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'fi'));
  }, [data]);

  const today = dayKey(new Date().toISOString());
  const groups = useMemo(() => {
    const list = (data?.games ?? []).filter((g) => !team || teamKey(g.home.id) === team || teamKey(g.away.id) === team);
    const m = new Map<string, Game[]>();
    for (const g of list) { const k = dayKey(g.start); m.set(k, [...(m.get(k) ?? []), g]); }
    return [...m];
  }, [data, team]);
  const past = groups.filter(([k]) => k < today).reverse();
  const upcoming = groups.filter(([k]) => k >= today);

  useEffect(() => { if (data) todayRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [data]);

  const Day = ([k, gs]: [string, Game[]]) => (
    <div key={k}>
      <h3 className={`mb-1 px-3 text-xs font-semibold uppercase tracking-wider ${k === today ? 'text-goal' : 'text-slate-400'}`}>{k === today ? 'Tänään · ' : ''}{dayLabel(gs[0].start)}</h3>
      <div className="space-y-0.5">{gs.map((g) => <GameRow key={g.id} g={g} fav={fav} />)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader kicker="Liiga" title="Ottelut" />
      <div className="flex flex-wrap items-center gap-2">
        {(['runkosarja', 'playoffs'] as const).map((t) => (
          <button key={t} onClick={() => setTour(t)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tour === t ? 'bg-ice-500/15 text-ice-200 ring-1 ring-ice-400/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
            {t === 'runkosarja' ? 'Runkosarja' : 'Play-Offs'}
          </button>
        ))}
        <select className="input ml-auto w-auto" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Kaikki joukkueet</option>
          {fav && <option value={teamKey(fav)}>★ Suosikkini</option>}
          {teams.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : !groups.length ? <Card><Empty>Ei otteluita.</Empty></Card> : (
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <Card title="Tulevat">
            <div ref={todayRef} className="space-y-4 p-3">{upcoming.length ? upcoming.slice(0, showPast ? undefined : 14).map(Day) : <Empty>Ei tulevia otteluita.</Empty>}</div>
          </Card>
          <Card title="Pelatut" action={<button className="text-xs text-ice-300 hover:text-ice-200" onClick={() => setShowPast(!showPast)}>{showPast ? 'Näytä vähemmän' : 'Näytä kaikki'}</button>}>
            <div className="space-y-4 p-3">{past.length ? past.slice(0, showPast ? undefined : 7).map(Day) : <Empty>Ei vielä pelattuja otteluita.</Empty>}</div>
          </Card>
        </div>
      )}
    </div>
  );
}

interface PRow {
  player_id: number; team_id: string; name: string; picture: string | null; pos: 'F' | 'D' | 'G';
  goals: number; assists: number; pim: number; plus_minus: number; saves: number; goals_against: number; shutout: number; win: number;
  hg: number; mine: boolean;
}

function TeamStats({ t, players }: { t: GameTeam; players: PRow[] }) {
  const sk = players.filter((p) => p.pos !== 'G');
  const gk = players.filter((p) => p.pos === 'G');
  const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <Card title={<span className="flex items-center gap-2"><Logo t={t} />{t.name}</span>}>
      {!players.length ? <Empty>Tilastot päivittyvät ottelun jälkeen.</Empty> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Pelaaja</th><th className="num">M</th><th className="num">S</th><th className="num">+/−</th><th className="num">J</th><th className="num">HG</th></tr></thead>
            <tbody>
              {sk.map((p) => (
                <tr key={p.player_id} className={p.mine ? 'bg-ice-500/[0.07]' : ''}>
                  <td><span className="flex items-center gap-2"><Avatar src={p.picture} name={p.name} size="h-6 w-6" /><span className="text-white">{p.name}</span>{p.pos === 'D' && <span className="text-[10px] text-slate-500">P</span>}{p.mine && <span title="Joukkueessasi">⭐</span>}</span></td>
                  <td className="num">{p.goals || ''}</td><td className="num">{p.assists || ''}</td>
                  <td className={`num ${p.plus_minus > 0 ? 'text-emerald-300' : p.plus_minus < 0 ? 'text-red-300' : 'text-slate-500'}`}>{p.plus_minus ? pm(p.plus_minus) : ''}</td>
                  <td className="num text-slate-400">{p.pim || ''}</td>
                  <td className="num font-semibold text-ice-300">{fmt(p.hg)}</td>
                </tr>
              ))}
            </tbody>
            {gk.length > 0 && (
              <tbody className="border-t border-white/10">
                {gk.map((p) => (
                  <tr key={p.player_id} className={p.mine ? 'bg-ice-500/[0.07]' : ''}>
                    <td><span className="flex items-center gap-2"><Avatar src={p.picture} name={p.name} size="h-6 w-6" /><span className="text-white">{p.name}</span><span className="text-[10px] text-slate-500">MV</span>{p.mine && <span>⭐</span>}</span></td>
                    <td colSpan={4} className="text-xs text-slate-400">{p.saves} torjuntaa, {p.goals_against} päästettyä{p.shutout ? ' · nollapeli' : ''}{p.win ? ' · voitto' : ''}</td>
                    <td className="num font-semibold text-ice-300">{fmt(p.hg)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      )}
    </Card>
  );
}

export function GameDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi<{ game: Game | null; players: PRow[] }>(`/games/${id}`, [id]);
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorBox error={error} />;
  const g = data.game;
  const of = (t?: GameTeam) => data.players.filter((p) => t && teamKey(p.team_id) === teamKey(t.id));
  return (
    <div className="space-y-6">
      <Link to="/ottelut" className="text-sm text-ice-300 hover:text-ice-200">← Ottelut</Link>
      {g ? (
        <section className="rounded-3xl border border-white/8 bg-gradient-to-br from-rink-800 to-rink-950 px-6 py-8">
          <p className="mb-4 text-center text-xs uppercase tracking-wider text-slate-400">
            {new Date(g.start).toLocaleString('fi-FI', { ...tz, weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {g.phase ? ` · ${PHASE[g.phase]}` : g.tournament === 'playoffs' ? ' · Play-Offs' : ''}
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <Link to={`/joukkue/${encodeURIComponent(g.home.id)}`} className="flex flex-col items-center gap-2 text-center">
              {g.home.logo && <img src={g.home.logo} alt="" className="h-16 w-16 object-contain" />}<span className="font-semibold text-white">{g.home.name}</span>
            </Link>
            <div className="text-center">
              {g.started ? <span className="font-display text-5xl tracking-wider text-white">{g.home.goals}–{g.away.goals}</span> : <span className="font-display text-3xl text-ice-300">{time(g.start)}</span>}
              <p className="mt-1 text-xs text-slate-400">{g.ended ? `Päättynyt${g.ot === 'OT' ? ' (jatkoaika)' : g.ot === 'SO' ? ' (voittolaukaukset)' : ''}` : g.started ? 'Käynnissä' : 'Tulossa'}</p>
            </div>
            <Link to={`/joukkue/${encodeURIComponent(g.away.id)}`} className="flex flex-col items-center gap-2 text-center">
              {g.away.logo && <img src={g.away.logo} alt="" className="h-16 w-16 object-contain" />}<span className="font-semibold text-white">{g.away.name}</span>
            </Link>
          </div>
        </section>
      ) : <PageHeader title="Ottelu" />}
      {g && !g.ended ? <Card><Empty>{g.started ? 'Ottelu on käynnissä – pelaajatilastot päivittyvät ottelun jälkeen.' : 'Ottelu ei ole vielä alkanut.'}</Empty></Card> : g ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <TeamStats t={g.home} players={of(g.home)} />
            <TeamStats t={g.away} players={of(g.away)} />
          </div>
          <p className="text-xs text-slate-500">HG = HogiGuru-pisteet kuluvan kauden säännöillä. ⭐ = pelaaja on joukkueessasi.</p>
        </>
      ) : null}
    </div>
  );
}
