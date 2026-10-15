import { useState } from 'react';
import { api, fmt, fmtDate, POS_LABEL, type Position, type Slot } from '../api';
import { useApi } from '../auth';
import { DraftPrefsEditor, type PoolItem } from '../components/DraftPrefs';
import { SwapRequests } from '../components/SwapRequests';
import HalfRink from '../components/HalfRink';
import GameLog from '../components/GameLog';
import CoachReplace from '../components/CoachReplace';
import { Avatar, Card, Empty, ErrorBox, Modal, PageHeader, RankBadge, Spinner } from '../ui';

interface TeamResp {
  guru: { id: number; name: string } | null;
  slots: Slot[];
  adjustments: { id: number; points: number; reason: string; created_at: string }[];
  standing: { rank: number; points: number } | null;
  swaps: { used: number; max: number | null };
  firedCoachSlot?: number | null;
}
interface DraftResp { status: 'setup' | 'live' | 'done'; roster: Record<Position, number>; pool: PoolItem[] }

function PlayerTile({ s, onOpen }: { s?: Slot; onOpen?: (s: Slot) => void }) {
  if (!s) return <div className="flex h-24 w-[74px] items-center justify-center rounded-2xl border border-dashed border-slate-500/60 bg-rink-950/40 text-xs text-slate-300 sm:h-36 sm:w-32">Tyhjä</div>;
  return (
    <button type="button" onClick={() => onOpen?.(s)} title="Näytä ottelukohtaiset HG-pisteet" className="group flex w-[74px] cursor-pointer flex-col items-center rounded-xl border border-white/10 bg-rink-950/85 p-1.5 text-center shadow-xl shadow-rink-950/40 backdrop-blur transition hover:-translate-y-0.5 hover:border-ice-400/50 sm:w-32 sm:rounded-2xl sm:p-3">
      <Avatar src={s.picture} name={s.name} size="h-9 w-9 sm:h-14 sm:w-14" />
      <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-tight text-white sm:mt-2 sm:text-xs">{s.name}</p>
      <p className="hidden text-[10px] uppercase tracking-wider text-slate-500 sm:block">{s.team}</p>
      <p className={`scoreboard mt-0.5 text-sm sm:mt-1 sm:text-lg ${s.value < 0 ? '!text-goal' : ''}`}>{fmt(s.value)}</p>
    </button>
  );
}

export default function MyTeam() {
  const team = useApi<TeamResp>('/me/team');
  const draft = useApi<DraftResp>('/draft');
  const [tab, setTab] = useState<'team' | 'prefs' | 'swaps'>('team');
  const [sel, setSel] = useState<Slot | null>(null);

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
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold uppercase tracking-wide sm:flex-none sm:px-4 sm:text-sm sm:tracking-wider ${tab === t ? 'bg-ice-500 text-rink-950' : 'text-slate-400'}`}>
              {t === 'team' ? 'Kentällinen' : t === 'prefs' ? 'Draft-ennakkolista' : 'Vaihtotoiveet'}
            </button>
          ))}
        </div>
      )}

      {tab === 'swaps' ? <SwapRequests slots={slots} /> : tab === 'prefs' && draft.data ? (
        <Card title="Draft-ennakkolista" ><div className="p-5"><DraftPrefsEditor endpoint="/me/draft-prefs" pool={draft.data.pool} roster={draft.data.roster} /></div></Card>
      ) : (
        <div className="space-y-6">
          {/* Kaukalo: pystysuuntainen puolikaukalo, pelaajat omilla paikoillaan */}
          <section className="relative mx-auto w-full max-w-[640px] animate-in" style={{ aspectRatio: '850 / 1000' }}>
            <HalfRink className="absolute inset-0 h-full w-full drop-shadow-2xl" />
            {([['F', 3, 17], ['D', 2, 57], ['G', 1, 84]] as const).map(([pos, n, y]) => {
              const list = slotsFor(pos, n);
              const xs = list.length === 3 ? [20, 50, 80] : list.length === 2 ? [26, 74] : list.length === 1 ? [50] : list.map((_, i) => ((i + 1) * 100) / (list.length + 1));
              return list.map((s, i) => (
                <div key={`${pos}${i}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${xs[i]}%`, top: `${y}%` }}><PlayerTile s={s} onOpen={setSel} /></div>
              ));
            })}
          </section>

          {/* Valmentaja vaihtopenkillä */}
          {team.data.firedCoachSlot && <CoachReplace onDone={team.reload} />}
          <section className="flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-white/10 bg-rink-850/60 px-5 py-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Valmentaja</span>
            {byPos('C').length ? byPos('C').map((s) => (
              <button key={s.id} type="button" onClick={() => setSel(s)} title="Näytä ottelukohtaiset HG-pisteet" className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-white/5">
                <span className="font-semibold text-white">{s.name}</span>
                <span className="text-sm text-slate-400">{s.team}</span>
                <span className="scoreboard font-mono">{fmt(s.value)}</span>
              </button>
            )) : <span className="text-sm text-slate-500">Ei valmentajaa</span>}
          </section>

          <div>
            <Card title="Pisteerittely">
              <table className="table">
                <thead><tr><th>Paikka</th><th>Nimi</th><th className="num">Alku</th><th className="num">Nyt</th><th className="num">HG</th></tr></thead>
                <tbody>
                  {active.map((s) => (
                    <tr key={s.id} className="cursor-pointer hover:bg-white/5" onClick={() => setSel(s)}><td className="text-xs text-slate-400">{POS_LABEL[s.position]}</td><td className="text-white">{s.name}</td><td className="num text-slate-500">{fmt(s.start_points)}</td><td className="num">{fmt(s.current)}</td><td className="num scoreboard">{fmt(s.value)}</td></tr>
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
                  {history.map((s) => <tr key={s.id} className="cursor-pointer hover:bg-white/5" onClick={() => setSel(s)}><td className="text-white">{s.name}</td><td className="text-slate-400">{POS_LABEL[s.position]}</td><td className="text-slate-400">{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</td><td className="num scoreboard">{fmt(s.value)}</td></tr>)}
                </tbody>
              </table>
            </Card>
          )}
          <EmailPrefs />
          <ChangePassword />
          <Modal open={!!sel} onClose={() => setSel(null)} title={`${sel?.name ?? ''} · ottelukohtaiset HG-pisteet`} wide>
            {sel && <GameLog slot={sel} />}
          </Modal>
        </div>
      )}
    </>
  );
}

function EmailPrefs() {
  const prefs = useApi<{ weekly?: boolean; swaps?: boolean; coach?: boolean }>('/me/email-prefs');
  const [saving, setSaving] = useState(false);
  if (!prefs.data) return null;
  const weekly = prefs.data.weekly ?? true;
  return (
    <Card title="Sähköposti-ilmoitukset">
      <label className="flex cursor-pointer items-start gap-3 p-5">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-ice-400" checked={weekly} disabled={saving}
          onChange={async (e) => {
            setSaving(true);
            await api('/me/email-prefs', { method: 'PUT', body: { ...prefs.data, weekly: e.target.checked } }).catch(() => {});
            await prefs.reload(); setSaving(false);
          }} />
        <span><span className="block font-semibold text-white">Gurukierros-viikkokatsaus</span>
          <span className="text-sm text-slate-400">Maanantaisin: oman viikkosi pisteet ja sijoitus, viikon tähdet ja huippupelit.</span></span>
      </label>
    </Card>
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
