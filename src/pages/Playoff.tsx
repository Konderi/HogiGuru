import { useState } from 'react';
import { api } from '../api';
import { useApi } from '../auth';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';

interface SeriesTeam { id: string; name: string; logo: string | null; wins: number }
interface Series {
  phase: number; pair: number; reqWins: number; a: SeriesTeam; b: SeriesTeam; winner: string | null; done: boolean; played: number; next: string | null;
  games: { id: number; start: string; home: string; away: string; hg: number; ag: number; ended: boolean; ot: boolean }[];
}
interface Bracket { season: number; current: number; alive: string[]; rounds: { phase: number; name: string; guru: boolean; done: boolean; series: Series[] }[] }

const fmt = (d: string) => new Date(d).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

function TeamRow({ t, s }: { t: SeriesTeam; s: Series }) {
  const lost = s.done && s.winner !== t.id;
  const won = s.winner === t.id;
  return (
    <div className={`flex items-center gap-2 ${lost ? 'opacity-40' : ''}`}>
      {t.logo ? <img src={t.logo} alt="" className="h-6 w-6 object-contain" /> : <span className="h-6 w-6" />}
      <span className={`flex-1 truncate text-sm ${won ? 'font-bold text-white' : 'text-slate-300'}`}>{t.name}</span>
      <span className={`font-display text-xl ${won ? 'text-ice-300' : 'text-slate-400'}`}>{t.wins}</span>
    </div>
  );
}

function SeriesCard({ s }: { s: Series }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border p-3 ${s.done ? 'border-white/8 bg-white/[0.02]' : 'border-ice-400/30 bg-ice-500/5'}`}>
      <button className="block w-full space-y-1.5 text-left" onClick={() => setOpen(!open)}>
        <TeamRow t={s.a} s={s} />
        <TeamRow t={s.b} s={s} />
        <div className="pt-1 text-[11px] text-slate-500">
          {s.done ? 'Sarja ratkennut' : s.next ? `Seuraava: ${fmt(s.next)}` : 'Käynnissä'} · {s.reqWins} voittoon
        </div>
      </button>
      {open && (
        <ul className="mt-2 space-y-0.5 border-t border-white/6 pt-2 text-xs text-slate-400">
          {s.games.map((g, i) => (
            <li key={g.id} className="flex justify-between gap-2">
              <span>{i + 1}. {fmt(g.start)}</span>
              <span className="tabular-nums text-slate-300">{g.ended ? `${g.home === s.a.id ? g.hg : g.ag}–${g.home === s.a.id ? g.ag : g.hg}${g.ot ? ' JA' : ''}` : '–'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TopRow { id: number; name: string; team: string; picture: string | null; games: number; goals: number; assists: number; hg: number }

function TopLists({ season }: { season: number }) {
  const { data, error, reload } = useApi<{ total: number; top: Record<'F' | 'D' | 'G', TopRow[]> }>(`/admin/playoff/top?season=${season}`, [season]);
  const [busy, setBusy] = useState(false);
  const sync = async () => { setBusy(true); try { await api(`/admin/playoff/sync?season=${season}`, { method: 'POST' }); await reload(); } finally { setBusy(false); } };
  const labels = { F: 'Hyökkääjät', D: 'Puolustajat', G: 'Maalivahdit' } as const;
  return (
    <Card title="Pudotuspelien HG-kärki" action={<button className="btn btn-ghost" disabled={busy} onClick={sync}>{busy ? 'Haetaan…' : '↻ Hae tilastot'}</button>}>
      <ErrorBox error={error} />
      {!data?.total ? <Empty>Ei pudotuspelitilastoja tälle kaudelle – paina "Hae tilastot".</Empty> : (
        <div className="grid gap-4 p-4 md:grid-cols-3">
          {(['F', 'D', 'G'] as const).map((k) => (
            <div key={k}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{labels[k]}</h3>
              <ol className="space-y-1 text-sm">
                {data.top[k].map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="w-5 text-right text-slate-500">{i + 1}.</span>
                    <span className="flex-1 truncate text-slate-200">{r.name} <span className="text-xs text-slate-500">{r.team}</span></span>
                    <span className="text-xs text-slate-500">{r.games} O</span>
                    <span className="w-10 text-right font-display text-ice-300">{r.hg}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Playoff() {
  const [season, setSeason] = useState<number | null>(null);
  const { data, error, loading } = useApi<Bracket>(`/admin/playoff/bracket${season ? `?season=${season}` : ''}`, [season]);

  return (
    <div className="space-y-8">
      <PageHeader kicker="Play-Off · esikatselu (vain ylläpito)" title="Play-Off">
        {data && (
          <select className="input w-auto" value={data.season} onChange={(e) => setSeason(Number(e.target.value))}>
            {[data.current, data.current - 1, data.current - 2].map((y) => <option key={y} value={y}>Kausi {y - 1}–{String(y).slice(2)}</option>)}
          </select>
        )}
      </PageHeader>
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : data && (
        <>
          {data.season !== data.current && <p className="text-sm text-amber-300/80">Kuluvan kauden pudotuspelit eivät ole alkaneet – näytetään kausi {data.season - 1}–{String(data.season).slice(2)}.</p>}
          <Card title="Hakemistopuu">
            {!data.rounds.length ? <Empty>Ei pudotuspeliotteluita.</Empty> : (
              <div className="grid gap-4 p-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                {data.rounds.map((r) => (
                  <div key={r.phase} className={`space-y-3 ${r.guru ? '' : 'opacity-60'}`}>
                    <h3 className="flex items-center gap-2 font-display text-lg tracking-wide text-white">
                      {r.name}
                      {!r.guru && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-sans text-slate-400">ei gurukisassa</span>}
                      {r.done && <span className="text-xs text-ice-300">✓</span>}
                    </h3>
                    {r.series.map((s) => <SeriesCard key={s.pair} s={s} />)}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <TopLists season={data.season} />
          <p className="text-xs text-slate-500">Elossa gurukisan kannalta: {data.alive.length} joukkuetta. Tulossa: ilmoittautuminen, lomakedraft, kokoonpanot, leaderboard ja vaihtoikkunat.</p>
        </>
      )}
    </div>
  );
}
