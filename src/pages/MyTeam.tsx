import { useState } from 'react';
import { api, fmt, fmtDate, POS_LABEL, type Position, type Slot } from '../api';
import { useApi } from '../auth';
import { DraftPrefsEditor, type PoolItem } from '../components/DraftPrefs';
import { SwapRequests } from '../components/SwapRequests';
import { Avatar, Card, Empty, ErrorBox, PageHeader, RankBadge, Spinner } from '../ui';

interface TeamResp {
  guru: { id: number; name: string } | null;
  slots: Slot[];
  adjustments: { id: number; points: number; reason: string; created_at: string }[];
  standing: { rank: number; points: number } | null;
  swaps: { used: number; max: number | null };
}
interface DraftResp { status: 'setup' | 'live' | 'done'; roster: Record<Position, number>; pool: PoolItem[] }

function PlayerTile({ s }: { s?: Slot }) {
  if (!s) return <div className="flex h-36 w-28 items-center justify-center rounded-2xl border border-dashed border-white/15 text-xs text-slate-500 sm:w-32">Tyhjä</div>;
  return (
    <div className="group flex w-28 flex-col items-center rounded-2xl border border-white/10 bg-rink-950/70 p-3 text-center shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:border-ice-400/50 sm:w-32">
      <Avatar src={s.picture} name={s.name} size="h-14 w-14" />
      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight text-white">{s.name}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.team}</p>
      <p className={`scoreboard mt-1 text-lg ${s.value < 0 ? '!text-goal' : ''}`}>{fmt(s.value)}</p>
    </div>
  );
}

export default function MyTeam() {
  const team = useApi<TeamResp>('/me/team');
  const draft = useApi<DraftResp>('/draft');
  const [tab, setTab] = useState<'team' | 'prefs' | 'swaps'>('team');

  if (team.loading && !team.data) return <Spinner />;
  if (!team.data?.guru) return <><PageHeader title="Oma joukkue" /><Card><Empty>Tunnustasi ei ole vielä liitetty tämän kauden guruun. Ota yhteys ylläpitoon.</Empty></Card></>;
  const { guru, slots, adjustments, standing, swaps } = team.data;
  const active = slots.filter((s) => s.active);
  const byPos = (p: Position) => active.filter((s) => s.position === p);
  // Ruutujen määrä = kentällisen koko (oletus F3/D2/G1), ei kuitenkaan vähemmän kuin todellisia pelaajia
  const slotsFor = (p: Position, n: number) => {
    const list = byPos(p);
    return Array.from({ length: Math.max(n, list.length) }, (_, i) => list[i]);
  };
  const history = slots.filter((s) => !s.active);
  const total = slots.reduce((a, s) => a + s.value, 0) + adjustments.reduce((a, x) => a + x.points, 0);

  return (
    <>
      <PageHeader kicker="All-Stars-kentällinen" title={guru.name}>
        <div className="flex items-center gap-6">
          {standing && <div className="text-center"><p className="label">Sija</p><RankBadge rank={standing.rank} /></div>}
          <div className="text-center"><p className="label">Pisteet</p><p className="scoreboard text-3xl">{fmt(total)}</p></div>
          <div className="text-center"><p className="label">Vaihdot</p><p className="font-display text-2xl text-white">{swaps.used}{swaps.max != null && <span className="text-slate-500">/{swaps.max}</span>}</p></div>
        </div>
      </PageHeader>

      {draft.data && draft.data.status !== 'live' && (
        <div className="mb-6 flex gap-1 rounded-2xl border border-white/8 bg-rink-850/60 p-1 sm:inline-flex">
          {(['team', draft.data.status === 'setup' ? 'prefs' : 'swaps'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-wider ${tab === t ? 'bg-ice-500 text-rink-950' : 'text-slate-400'}`}>
              {t === 'team' ? 'Kentällinen' : t === 'prefs' ? 'Draft-ennakkolista' : 'Vaihtotoiveet'}
            </button>
          ))}
        </div>
      )}

      {tab === 'swaps' ? <SwapRequests slots={slots} /> : tab === 'prefs' && draft.data ? (
        <Card title="Draft-ennakkolista" ><div className="p-5"><DraftPrefsEditor endpoint="/me/draft-prefs" pool={draft.data.pool} roster={draft.data.roster} /></div></Card>
      ) : (
        <div className="space-y-6">
          {/* Kaukalo */}
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-100/[0.07] to-ice-500/[0.04] px-4 py-10 animate-in">
            <div className="pointer-events-none absolute inset-x-0 top-1/3 h-1 bg-ice-400/25" />
            <div className="pointer-events-none absolute inset-x-0 top-[62%] h-1 bg-goal/25" />
            <div className="pointer-events-none absolute left-1/2 top-[62%] h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ice-400/20" />
            <div className="relative space-y-8">
              <div className="flex flex-wrap justify-center gap-3 sm:gap-6">{slotsFor('F', 3).map((s, i) => <PlayerTile key={i} s={s} />)}</div>
              <div className="flex flex-wrap justify-center gap-3 sm:gap-16">{slotsFor('D', 2).map((s, i) => <PlayerTile key={i} s={s} />)}</div>
              <div className="flex flex-wrap justify-center gap-3">{slotsFor('G', 1).map((s, i) => <PlayerTile key={i} s={s} />)}</div>
            </div>
          </section>

          {/* Valmentaja vaihtopenkillä */}
          <section className="flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-white/10 bg-rink-850/60 px-5 py-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Valmentaja</span>
            {byPos('C').length ? byPos('C').map((s) => (
              <span key={s.id} className="flex items-center gap-3">
                <span className="font-semibold text-white">{s.name}</span>
                <span className="text-sm text-slate-400">{s.team}</span>
                <span className="scoreboard font-mono">{fmt(s.value)}</span>
              </span>
            )) : <span className="text-sm text-slate-500">Ei valmentajaa</span>}
          </section>

          <div>
            <Card title="Pisteerittely">
              <table className="table">
                <thead><tr><th>Paikka</th><th>Nimi</th><th className="num">Alku</th><th className="num">Nyt</th><th className="num">HG</th></tr></thead>
                <tbody>
                  {active.map((s) => (
                    <tr key={s.id}><td className="text-xs text-slate-400">{POS_LABEL[s.position]}</td><td className="text-white">{s.name}</td><td className="num text-slate-500">{fmt(s.start_points)}</td><td className="num">{fmt(s.current)}</td><td className="num scoreboard">{fmt(s.value)}</td></tr>
                  ))}
                  {adjustments.map((a) => <tr key={`a${a.id}`}><td className="text-xs text-slate-400">Korjaus</td><td className="text-white" colSpan={3}>{a.reason}</td><td className="num text-goal">{fmt(a.points)}</td></tr>)}
                </tbody>
              </table>
            </Card>
          </div>

          {history.length > 0 && (
            <Card title="Vaihdetut pelaajat">
              <table className="table">
                <thead><tr><th>Nimi</th><th>Paikka</th><th>Kentällisessä</th><th className="num">Kerätyt HG</th></tr></thead>
                <tbody>
                  {history.map((s) => <tr key={s.id}><td className="text-white">{s.name}</td><td className="text-slate-400">{POS_LABEL[s.position]}</td><td className="text-slate-400">{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</td><td className="num scoreboard">{fmt(s.value)}</td></tr>)}
                </tbody>
              </table>
            </Card>
          )}
          <ChangePassword />
        </div>
      )}
    </>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card title="Vaihda salasana">
      <form className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async (e) => {
        e.preventDefault(); setErr(null); setMsg(null);
        try { await api('/auth/password', { body: f }); setMsg('Salasana vaihdettu'); setF({ current: '', next: '' }); } catch (x) { setErr((x as Error).message); }
      }}>
        <div><label className="label">Nykyinen</label><input className="input" type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></div>
        <div><label className="label">Uusi (väh. 8)</label><input className="input" type="password" minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></div>
        <button className="btn btn-ghost">Vaihda</button>
        <div className="sm:col-span-3"><ErrorBox error={err} />{msg && <p className="text-sm text-emerald-400">{msg}</p>}</div>
      </form>
    </Card>
  );
}
