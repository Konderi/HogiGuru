import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { fmt } from '../api';
import { useApi, useAuth } from '../auth';
import { Avatar, Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';

export interface GameTeam { id: string; name: string; logo: string | null; goals: number }
export interface Forecast {
  pHome: number; pDraw: number; pAway: number; odds: { home: number; draw: number; away: number };
  xgHome: number; xgAway: number; likely: string; formHome: string[]; formAway: string[];
}
export interface Game {
  id: number; start: string; ended: boolean; started: boolean; ot: 'OT' | 'SO' | null;
  tournament: 'runkosarja' | 'playoffs'; phase: number | null; home: GameTeam; away: GameTeam;
  forecast?: Forecast | null;
}

const pct = (p: number) => `${Math.round(p * 100)} %`;
/** Kapea 1–X–2-todennäköisyyspalkki */
function ProbBar({ f, big }: { f: Forecast; big?: boolean }) {
  return (
    <div className={`flex overflow-hidden rounded-full ${big ? 'h-3' : 'h-1.5'}`}>
      <span className="bg-ice-400" style={{ width: pct(f.pHome) }} />
      <span className="bg-slate-500" style={{ width: pct(f.pDraw) }} />
      <span className="bg-amber-400" style={{ width: pct(f.pAway) }} />
    </div>
  );
}
const FORM_CLS: Record<string, string> = { V: 'bg-emerald-500 text-rink-950', JV: 'bg-emerald-500/50 text-white', JH: 'bg-goal/50 text-white', H: 'bg-goal text-white' };
function Form({ f }: { f: string[] }) {
  return <span className="inline-flex gap-1">{f.map((x, i) => <span key={i} className={`grid h-5 min-w-5 place-items-center rounded px-1 text-[10px] font-bold ${FORM_CLS[x]}`}>{x}</span>)}</span>;
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
        {!g.started && g.forecast && (
          <span className="mt-1 block" title={`Ennuste: koti ${pct(g.forecast.pHome)} · tasapeli ${pct(g.forecast.pDraw)} · vieras ${pct(g.forecast.pAway)}`}>
            <ProbBar f={g.forecast} />
            <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{fmt(g.forecast.odds.home)} · {fmt(g.forecast.odds.draw)} · {fmt(g.forecast.odds.away)}</span>
          </span>
        )}
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
  const [view, setView] = useState<'past' | 'upcoming'>('past');
  const [showAll, setShowAll] = useState(false);
  const { data, error, loading } = useApi<{ games: Game[] }>(`/games?tournament=${tour}`, [tour]);
  const fav = me?.favTeam?.id ?? null;

  const teams = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of data?.games ?? []) { m.set(teamKey(g.home.id), g.home.name); m.set(teamKey(g.away.id), g.away.name); }
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'fi'));
  }, [data]);

  const today = dayKey(new Date().toISOString());
  const group = (list: Game[]) => {
    const m = new Map<string, Game[]>();
    for (const g of list) { const k = dayKey(g.start); m.set(k, [...(m.get(k) ?? []), g]); }
    return [...m];
  };
  const { past, upcoming } = useMemo(() => {
    const list = (data?.games ?? []).filter((g) => !team || teamKey(g.home.id) === team || teamKey(g.away.id) === team);
    return { past: group(list.filter((g) => g.ended)).reverse(), upcoming: group(list.filter((g) => !g.ended)) };
  }, [data, team]);
  const shown = view === 'past' ? past : upcoming;
  const limit = view === 'past' ? 10 : 14;

  const Day = ([k, gs]: [string, Game[]]) => (
    <div key={k}>
      <h3 className={`mb-1 px-3 text-xs font-semibold uppercase tracking-wider ${k === today ? 'text-goal' : 'text-slate-400'}`}>{k === today ? 'Tänään · ' : ''}{dayLabel(gs[0].start)}</h3>
      <div className="space-y-0.5">{gs.map((g) => <GameRow key={g.id} g={g} fav={fav} />)}</div>
    </div>
  );
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-medium ${on ? 'bg-ice-500/15 text-ice-200 ring-1 ring-ice-400/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Liiga" title="Ottelut" />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['runkosarja', 'playoffs'] as const).map((t) => (
            <button key={t} onClick={() => { setTour(t); setShowAll(false); }} className={pill(tour === t)}>
              {t === 'runkosarja' ? 'Runkosarja' : 'Play-Offs'}
            </button>
          ))}
          <select className="input ml-auto w-auto" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Kaikki joukkueet</option>
            {fav && <option value={teamKey(fav)}>★ Suosikkini</option>}
            {teams.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </div>
        <div className="inline-flex gap-1 rounded-2xl border border-white/8 bg-rink-850/60 p-1">
          {([['past', 'Pelatut'], ['upcoming', 'Tulevat']] as const).map(([v, l]) => (
            <button key={v} onClick={() => { setView(v); setShowAll(false); }}
              className={`rounded-xl px-5 py-1.5 text-sm font-semibold transition ${view === v ? 'bg-ice-500 text-rink-950' : 'text-slate-400 hover:text-white'}`}>{l}</button>
          ))}
        </div>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : (
        <Card>
          <div className="space-y-4 p-3">
            {shown.length ? shown.slice(0, showAll ? undefined : limit).map(Day) : <Empty>{view === 'past' ? 'Ei vielä pelattuja otteluita.' : 'Ei tulevia otteluita.'}</Empty>}
            {shown.length > limit && (
              <button className="btn btn-ghost w-full" onClick={() => setShowAll(!showAll)}>{showAll ? 'Näytä vähemmän' : `Näytä kaikki (${shown.length} pelipäivää)`}</button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

interface PRow {
  player_id: number; team_id: string; name: string; picture: string | null; pos: 'F' | 'D' | 'G';
  goals: number; assists: number; pim: number; plus_minus: number; saves: number; goals_against: number; shutout: number; win: number;
  hg: number; mine: boolean;
}

interface XPlayer { id: number; toi: number; shots: number; blocked: number; fo: number; foWon: number; xg: number; speed: number | null; hardest: number | null }
interface XTeam { shots: number; blocked: number; fo: number; foWon: number; shotsByPeriod: number[]; pp: string; sh: number; xg: number | null; pim: number; players: XPlayer[] }
interface XEvent { type: 'goal' | 'penalty'; side: 'home' | 'away'; time: number; period: number; scorer?: string; assists?: string[]; score?: string; types?: string[]; winning?: boolean; video?: string | null; player?: string; minutes?: number; reason?: string }
interface Extra {
  periods: { index: number; home: number; away: number; category: string }[];
  spectators: number | null; rink: string | null; city: string | null; referees: { name: string; role: string }[];
  events: XEvent[]; home: XTeam; away: XTeam; possession: number | null; stars: { stars: number; name: string; team: string }[];
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const periodName = (i: number, cat?: string) => (cat === 'WINNING_SHOT' ? 'VL' : i > 3 ? 'JA' : `${i}. erä`);

function Compare({ label, h, a, fmtV = String, pct }: { label: string; h: number; a: number; fmtV?: (n: number) => string; pct?: boolean }) {
  const tot = h + a || 1;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-semibold text-white">{fmtV(h)}</span><span className="text-xs text-slate-400">{label}</span><span className="font-semibold text-white">{fmtV(a)}</span></div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="bg-ice-400" style={{ width: `${pct ? h : (h / tot) * 100}%` }} />
        <div className="ml-auto bg-goal/70" style={{ width: `${pct ? a : (a / tot) * 100}%` }} />
      </div>
    </div>
  );
}

function ExtraView({ g, x }: { g: Game; x: Extra }) {
  const foPct = (t: XTeam) => (t.fo ? Math.round((t.foWon / t.fo) * 100) : 0);
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title="Joukkuevertailu">
          <div className="space-y-3 p-4">
            {x.periods.length > 0 && (
              <table className="table mb-2">
                <thead><tr><th /> {x.periods.map((p) => <th key={p.index} className="num">{periodName(p.index, p.category)}</th>)}<th className="num">Yht.</th></tr></thead>
                <tbody>
                  {(['home', 'away'] as const).map((s) => (
                    <tr key={s}><td className="text-white">{g[s].name}</td>{x.periods.map((p) => <td key={p.index} className="num">{p[s]}</td>)}<td className="num font-semibold text-white">{g[s].goals}</td></tr>
                  ))}
                  {x.home.shotsByPeriod.length > 0 && (['home', 'away'] as const).map((s) => (
                    <tr key={`sh-${s}`} className="text-xs text-slate-400"><td>laukaukset · {g[s].name}</td>{x.periods.map((p, i) => <td key={p.index} className="num">{x[s].shotsByPeriod[i] ?? ''}</td>)}<td className="num">{x[s].shots}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <Compare label="Laukaukset" h={x.home.shots} a={x.away.shots} />
            {x.home.xg != null && x.away.xg != null && <Compare label="Odotetut maalit (xG)" h={x.home.xg} a={x.away.xg} fmtV={(n) => n.toFixed(2)} />}
            {x.possession != null && <Compare label="Kiekonhallinta %" h={x.possession} a={100 - x.possession} pct />}
            {x.home.fo + x.away.fo > 0 && <Compare label="Aloitukset %" h={foPct(x.home)} a={foPct(x.away)} pct />}
            <Compare label="Blokit" h={x.home.blocked} a={x.away.blocked} />
            <Compare label="Jäähyminuutit" h={x.home.pim} a={x.away.pim} />
            <div className="flex justify-between text-sm"><span className="text-white">{x.home.pp}</span><span className="text-xs text-slate-400">Ylivoima (maalit/kerrat)</span><span className="text-white">{x.away.pp}</span></div>
          </div>
        </Card>
        <Card title="Tapahtumat">
          {!x.events.length ? <Empty>Ei tapahtumia.</Empty> : (
            <ul className="divide-y divide-white/5 p-2 text-sm">
              {x.events.map((e, i) => (
                <li key={i} className={`flex items-start gap-3 px-2 py-2 ${e.side === 'away' ? 'flex-row-reverse text-right' : ''}`}>
                  <span className="w-12 shrink-0 font-mono text-xs text-slate-500">{clock(e.time)}</span>
                  {e.type === 'goal' ? (
                    <span className="flex-1">
                      <span className="font-display text-base text-white">{e.score}</span>{' '}
                      <span className="font-semibold text-white">🚨 {e.scorer}</span>
                      {e.types?.length ? <span className="ml-1 rounded bg-white/10 px-1 text-[10px] text-slate-300">{e.types.join(' ')}</span> : null}
                      {e.winning && <span className="ml-1 text-[10px] text-amber-300">VM</span>}
                      {e.assists?.length ? <span className="block text-xs text-slate-400">{e.assists.join(', ')}</span> : null}
                      {e.video && <a href={e.video} target="_blank" rel="noreferrer" className="text-xs text-ice-300 hover:underline">▶ video</a>}
                    </span>
                  ) : (
                    <span className="flex-1 text-slate-400">⏱ {e.player} {e.minutes} min <span className="text-xs">({e.reason})</span></span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {(x.stars.length > 0 || x.spectators || x.referees.length > 0) && (
        <Card title="Ottelutiedot">
          <div className="grid gap-4 p-4 text-sm sm:grid-cols-3">
            {x.stars.length > 0 && <div><h4 className="mb-1 text-xs uppercase tracking-wider text-slate-400">Tähdet</h4>{x.stars.map((s) => <p key={s.stars} className="text-white">{'⭐'.repeat(s.stars)} {s.name}</p>)}</div>}
            <div><h4 className="mb-1 text-xs uppercase tracking-wider text-slate-400">Paikka</h4><p className="text-white">{x.rink}{x.city ? `, ${x.city.charAt(0)}${x.city.slice(1).toLowerCase()}` : ''}</p>{x.spectators ? <p className="text-slate-400">{x.spectators.toLocaleString('fi-FI')} katsojaa</p> : null}</div>
            {x.referees.length > 0 && <div><h4 className="mb-1 text-xs uppercase tracking-wider text-slate-400">Tuomarit</h4>{x.referees.map((r) => <p key={r.name} className="text-slate-300">{r.name} <span className="text-xs text-slate-500">{r.role}</span></p>)}</div>}
          </div>
        </Card>
      )}
    </>
  );
}

function TeamStats({ t, players, x }: { t: GameTeam; players: PRow[]; x?: XTeam }) {
  const sk = players.filter((p) => p.pos !== 'G');
  const gk = players.filter((p) => p.pos === 'G');
  const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
  const xp = new Map((x?.players ?? []).map((p) => [p.id, p]));
  const toi = (s?: number) => (s ? clock(s) : '');
  return (
    <Card title={<span className="flex items-center gap-2"><Logo t={t} />{t.name}</span>}>
      {!players.length ? <Empty>Tilastot päivittyvät ottelun jälkeen.</Empty> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Pelaaja</th><th className="num">M</th><th className="num">S</th><th className="num">+/−</th><th className="num">J</th>{x && <><th className="num">L</th><th className="num">Aika</th><th className="num" title="Aloitukset">Al.</th></>}<th className="num">HG</th></tr></thead>
            <tbody>
              {sk.map((p) => { const e = xp.get(p.player_id); return (
                <tr key={p.player_id} className={p.mine ? 'bg-ice-500/[0.07]' : ''}>
                  <td><span className="flex items-center gap-2"><Avatar src={p.picture} name={p.name} size="h-6 w-6" /><span className="text-white" title={e?.speed ? `Huippunopeus ${e.speed} km/h${e.hardest ? ` · kovin laukaus ${e.hardest} km/h` : ''}` : undefined}>{p.name}</span>{p.pos === 'D' && <span className="text-[10px] text-slate-500">P</span>}{p.mine && <span title="Joukkueessasi">⭐</span>}</span></td>
                  <td className="num">{p.goals || ''}</td><td className="num">{p.assists || ''}</td>
                  <td className={`num ${p.plus_minus > 0 ? 'text-emerald-300' : p.plus_minus < 0 ? 'text-red-300' : 'text-slate-500'}`}>{p.plus_minus ? pm(p.plus_minus) : ''}</td>
                  <td className="num text-slate-400">{p.pim || ''}</td>
                  {x && <><td className="num text-slate-300">{e?.shots || ''}</td><td className="num text-slate-400">{toi(e?.toi)}</td><td className="num text-slate-400">{e?.fo ? `${e.foWon}/${e.fo}` : ''}</td></>}
                  <td className="num font-semibold text-ice-300">{fmt(p.hg)}</td>
                </tr>
              ); })}
            </tbody>
            {gk.length > 0 && (
              <tbody className="border-t border-white/10">
                {gk.map((p) => (
                  <tr key={p.player_id} className={p.mine ? 'bg-ice-500/[0.07]' : ''}>
                    <td><span className="flex items-center gap-2"><Avatar src={p.picture} name={p.name} size="h-6 w-6" /><span className="text-white">{p.name}</span><span className="text-[10px] text-slate-500">MV</span>{p.mine && <span>⭐</span>}</span></td>
                    <td colSpan={x ? 7 : 4} className="text-xs text-slate-400">{p.saves} torjuntaa, {p.goals_against} päästettyä{p.saves + p.goals_against ? ` (${Math.round((p.saves / (p.saves + p.goals_against)) * 1000) / 10} %)` : ''}{p.shutout ? ' · nollapeli' : ''}{p.win ? ' · voitto' : ''}{x && xp.get(p.player_id)?.toi ? ` · ${toi(xp.get(p.player_id)!.toi)}` : ''}</td>
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

interface Cmp { pointsAverage: number; pointsAverageRank: number; gf_gp: number; gf_gpRank: number; ga_gp: number; ga_gpRank: number; powerplayPercentage: number; powerplayPercentageRank: number; penaltykillPercentage: number; penaltykillPercentageRank: number; faceoffPercentage: number; faceoffPercentageRank: number; shotsPerGame: number; shotsPerGameRank: number }
interface Watch { id: number; name: string; jersey: string | null; role: string | null; value: number; category: string }
interface Preview { home: Cmp | null; away: Cmp | null; watchHome: Watch[]; watchAway: Watch[] }
const CAT: Record<string, string> = { points: 'p', goals: 'm', assists: 's', plusMinus: '+/−', savePercentage: 'torj-%', gaa: 'pmk' };

function PreviewView({ g, f, p }: { g: Game; f: Forecast | null; p: Preview | null }) {
  const rows: [string, keyof Cmp, keyof Cmp, (n: number) => string, boolean][] = [
    ['Pisteitä / ottelu', 'pointsAverage', 'pointsAverageRank', (n) => fmt(n, 2), true],
    ['Tehdyt maalit / ottelu', 'gf_gp', 'gf_gpRank', (n) => fmt(n, 2), true],
    ['Päästetyt maalit / ottelu', 'ga_gp', 'ga_gpRank', (n) => fmt(n, 2), false],
    ['Ylivoima-%', 'powerplayPercentage', 'powerplayPercentageRank', (n) => fmt(n, 1), true],
    ['Alivoima-%', 'penaltykillPercentage', 'penaltykillPercentageRank', (n) => fmt(n, 1), true],
    ['Aloitus-%', 'faceoffPercentage', 'faceoffPercentageRank', (n) => fmt(n, 1), true],
    ['Laukauksia / ottelu', 'shotsPerGame', 'shotsPerGameRank', (n) => fmt(n, 1), true],
  ];
  return (
    <div className="space-y-6">
      {f && (
        <Card title="HG-ennuste">
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              {([['1', g.home.name, f.pHome, f.odds.home, 'text-ice-300'], ['X', 'Tasapeli', f.pDraw, f.odds.draw, 'text-slate-300'], ['2', g.away.name, f.pAway, f.odds.away, 'text-amber-300']] as const).map(([k, l, pp, o, cls]) => (
                <div key={k} className="rounded-xl bg-white/5 p-3">
                  <p className="truncate text-[11px] uppercase tracking-wider text-slate-400">{k} · {l}</p>
                  <p className={`scoreboard text-3xl ${cls}`}>{pct(pp)}</p>
                  <p className="font-mono text-sm text-white">{fmt(o)}</p>
                </div>
              ))}
            </div>
            <ProbBar f={f} big />
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-white/5 p-3 text-center"><p className="label">Odotetut maalit</p><p className="font-mono text-white">{fmt(f.xgHome, 2)} – {fmt(f.xgAway, 2)}</p></div>
              <div className="rounded-xl bg-white/5 p-3 text-center"><p className="label">Todennäköisin tulos</p><p className="font-display text-xl text-white">{f.likely}</p></div>
              <div className="space-y-1 rounded-xl bg-white/5 p-3 text-xs">
                <p className="label">Viimeiset 5</p>
                <p className="flex items-center justify-between gap-2"><span className="truncate text-slate-300">{g.home.name}</span><Form f={f.formHome} /></p>
                <p className="flex items-center justify-between gap-2"><span className="truncate text-slate-300">{g.away.name}</span><Form f={f.formAway} /></p>
              </div>
            </div>
            <p className="text-xs text-slate-500">Ennuste perustuu joukkueiden kauden maalitehoon ja -puolustukseen, viimeisten 5 ottelun vireeseen ja kotietuun (Poisson-malli, varsinainen peliaika). Kertoimet = 1 / todennäköisyys, ilman marginaalia. Leikkimielinen arvio.</p>
          </div>
        </Card>
      )}
      {p?.home && p.away && (
        <Card title="Joukkuevertailu">
          <table className="table">
            <thead><tr><th className="num">{g.home.name}</th><th className="text-center">Tilasto</th><th>{g.away.name}</th></tr></thead>
            <tbody>
              {rows.map(([l, k, rk, f2, high]) => {
                const h = p.home![k], a = p.away![k];
                const better = h === a ? 0 : (h > a) === high ? 1 : -1;
                return (
                  <tr key={l}>
                    <td className={`num ${better > 0 ? 'font-semibold text-white' : 'text-slate-400'}`}>{f2(h)} <span className="text-[10px] text-slate-500">({p.home![rk]}.)</span></td>
                    <td className="text-center text-xs text-slate-400">{l}</td>
                    <td className={better < 0 ? 'font-semibold text-white' : 'text-slate-400'}>{f2(a)} <span className="text-[10px] text-slate-500">({p.away![rk]}.)</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-5 py-2 text-[11px] text-slate-500">Suluissa sija liigassa. Lähde: liiga.fi</p>
        </Card>
      )}
      {p && (p.watchHome.length > 0 || p.watchAway.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {([[g.home, p.watchHome], [g.away, p.watchAway]] as const).map(([t, list]) => (
            <Card key={t.id} title={`Seuraa: ${t.name}`}>
              <ul className="divide-y divide-white/5 text-sm">
                {list.map((w) => <li key={`${w.id}-${w.category}`} className="flex items-center gap-3 px-4 py-2"><span className="w-8 font-mono text-xs text-slate-500">#{w.jersey}</span><span className="flex-1 text-white">{w.name}</span><span className="font-mono text-ice-300">{fmt(w.value)} {CAT[w.category] ?? w.category}</span></li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function GameDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi<{ game: Game | null; players: PRow[]; extra: Extra | null; forecast: Forecast | null; preview: Preview | null }>(`/games/${id}`, [id]);
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
      {g && !g.started ? (
        data.forecast || data.preview ? <PreviewView g={g} f={data.forecast} p={data.preview} /> : <Card><Empty>Ottelu ei ole vielä alkanut.</Empty></Card>
      ) : g ? (
        <>
          {data.extra && <ExtraView g={g} x={data.extra} />}
          {!g.ended ? <Card><Empty>Ottelu on käynnissä – pelaajien HG-pisteet päivittyvät ottelun jälkeen.</Empty></Card> : (
            <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
              <TeamStats t={g.home} players={of(g.home)} x={data.extra?.home} />
              <TeamStats t={g.away} players={of(g.away)} x={data.extra?.away} />
            </div>
          )}
          <p className="text-xs text-slate-500">HG = HogiGuru-pisteet kuluvan kauden säännöillä. ⭐ = pelaaja on joukkueessasi. L = laukaukset, Al. = aloitukset (voitetut/yht.). Vie hiiri pelaajan nimen päälle: huippunopeus ja kovin laukaus. Lähde: liiga.fi.</p>
        </>
      ) : null}
    </div>
  );
}
