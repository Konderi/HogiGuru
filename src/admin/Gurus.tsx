import { useState } from 'react';
import { fmt, fmtDate, matchName, POS_LABEL, POSITIONS, type Position, type Slot } from '../api';
import { useApi } from '../auth';
import { DraftPrefsEditor, type PoolItem } from '../components/DraftPrefs';
import { Card, Empty, EntityPicker, Modal, PageHeader, PosBadge, Spinner, type SearchHit } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface G { id: number; name: string; draft_number: number | null; remote_draft: number; user_id: number | null; email: string | null }
interface Team { slots: Slot[]; adjustments: { id: number; points: number; reason: string; created_at: string }[]; standing: { rank: number; points: number } | null; swaps: { used: number; max: number | null } }
interface Coach { id: number; name: string; team: string }

export function useCoachOptions() {
  const { data } = useApi<Coach[]>('/coaches');
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, team: c.team }));
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });

/** Vaihto-dialogi: valitaan uusi pelaaja/valmentaja paikalle. */
export function SwapModal({ slot, onClose, onDone }: { slot: Slot | null; onClose: () => void; onDone: () => void }) {
  const { run } = useAdmin();
  const coaches = useCoachOptions();
  const [pick, setPick] = useState<SearchHit | null>(null);
  const [date, setDate] = useState(today());
  if (!slot) return null;
  return (
    <Modal open onClose={() => { setPick(null); onClose(); }} title={`Vaihto: ${slot.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          {POS_LABEL[slot.position]} – nykyiset HG-pisteet <b className="text-white">{fmt(slot.value)}</b> jäädytetään gurulle. Uusi {slot.position === 'C' ? 'valmentaja' : 'pelaaja'} kerryttää pisteitä vaihtohetkestä alkaen.
        </p>
        {pick ? (
          <div className="flex items-center justify-between rounded-xl bg-ice-500/10 px-4 py-3">
            <span><span className="font-semibold text-white">{pick.name}</span> <span className="text-sm text-slate-400">{pick.team}</span></span>
            <button className="text-sm text-slate-400 hover:text-white" onClick={() => setPick(null)}>Vaihda</button>
          </div>
        ) : <EntityPicker pos={slot.position} onPick={setPick} options={slot.position === 'C' ? coaches : undefined} />}
        <div><label className="label">Vaihtopäivä</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Peruuta</button>
          <button className="btn btn-primary" disabled={!pick} onClick={async () => {
            const ok = await run(() => api('/admin/swaps', { body: { slot_id: slot.id, entity_id: pick!.id, date } }), 'Vaihto tehty');
            if (ok) { setPick(null); onDone(); }
          }}>Vahvista vaihto</button>
        </div>
      </div>
    </Modal>
  );
}

function GuruPanel({ guru, onChanged }: { guru: G; onChanged: () => void }) {
  const team = useApi<Team>(`/admin/gurus/${guru.id}/team`, [guru.id]);
  const draft = useApi<{ pool: PoolItem[]; roster: Record<Position, number> }>('/draft');
  const coaches = useCoachOptions();
  const { run } = useAdmin();
  const [swap, setSwap] = useState<Slot | null>(null);
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [add, setAdd] = useState<Position | null>(null);
  const [adj, setAdj] = useState({ points: '', reason: '' });
  const [tab, setTab] = useState<'team' | 'prefs'>('team');
  const reload = () => { team.reload(); onChanged(); };
  if (!team.data) return <Spinner />;
  const active = team.data.slots.filter((s) => s.active);
  const old = team.data.slots.filter((s) => !s.active);

  return (
    <Card title={guru.name} action={
      <div className="flex gap-1">
        {(['team', 'prefs'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1 text-xs font-semibold uppercase ${tab === t ? 'bg-ice-500 text-rink-950' : 'bg-white/5 text-slate-400'}`}>{t === 'team' ? 'Kentällinen' : 'Ennakkolista'}</button>)}
      </div>}>
      {tab === 'prefs' ? (
        <div className="p-5">{draft.data && <DraftPrefsEditor endpoint={`/admin/gurus/${guru.id}/draft-prefs`} pool={draft.data.pool} roster={draft.data.roster} />}</div>
      ) : (
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap gap-6 text-sm">
            <span>Sija <b className="text-white">{team.data.standing?.rank ?? '–'}</b></span>
            <span>Pisteet <b className="scoreboard">{fmt(team.data.standing?.points)}</b></span>
            <span>Vaihdot <b className="text-white">{team.data.swaps.used}{team.data.swaps.max != null && `/${team.data.swaps.max}`}</b></span>
          </div>
          <table className="table">
            <thead><tr><th>Paikka</th><th>Nimi</th><th className="num">Alku</th><th className="num">Nyt</th><th className="num">HG</th><th /></tr></thead>
            <tbody>
              {POSITIONS.flatMap((p) => active.filter((s) => s.position === p)).map((s) => (
                <tr key={s.id}>
                  <td><PosBadge pos={s.position} /></td>
                  <td><span className="text-white">{s.name}</span> <span className="text-xs text-slate-500">{s.team}</span></td>
                  <td className="num text-slate-500">{fmt(s.start_points)}</td><td className="num">{fmt(s.current)}</td><td className="num scoreboard">{fmt(s.value)}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn btn-primary py-1" onClick={() => setSwap(s)}>⇄ Vaihda</button>
                    <button className="ml-1 px-2 text-slate-400 hover:text-white" title="Muokkaa" onClick={() => setEditSlot(s)}>✎</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2">
            {POSITIONS.map((p) => <button key={p} className="btn btn-ghost py-1 text-xs" onClick={() => setAdd(p)}>+ {POS_LABEL[p]}</button>)}
          </div>

          {old.length > 0 && (
            <div>
              <p className="label">Vaihdetut</p>
              <table className="table"><tbody>
                {old.map((s) => (
                  <tr key={s.id} className="text-slate-400">
                    <td><PosBadge pos={s.position} /></td><td>{s.name}</td><td>{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</td><td className="num">{fmt(s.value)}</td>
                    <td className="text-right"><button className="px-2 hover:text-white" onClick={() => setEditSlot(s)}>✎</button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}

          <div>
            <p className="label">Pistekorjaukset</p>
            <ul className="mb-3 space-y-1 text-sm">
              {team.data.adjustments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-1.5">
                  <span className={`num w-14 ${a.points < 0 ? 'text-goal' : 'text-emerald-400'}`}>{fmt(a.points)}</span><span className="flex-1">{a.reason}</span>
                  <button className="text-slate-500 hover:text-goal" onClick={async () => { await run(() => api(`/admin/adjustments/${a.id}`, { method: 'DELETE' })); reload(); }}>✕</button>
                </li>
              ))}
            </ul>
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => api('/admin/adjustments', { body: { guru_id: guru.id, points: Number(adj.points.replace(',', '.')), reason: adj.reason } }), 'Korjaus lisätty');
              if (ok) { setAdj({ points: '', reason: '' }); reload(); }
            }}>
              <input className="input w-24" placeholder="±p" required value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} />
              <input className="input" placeholder="Syy" required value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
              <button className="btn btn-ghost">Lisää</button>
            </form>
          </div>
        </div>
      )}

      <SwapModal slot={swap} onClose={() => setSwap(null)} onDone={() => { setSwap(null); reload(); }} />

      <Modal open={!!add} onClose={() => setAdd(null)} title={`Lisää ${add ? POS_LABEL[add].toLowerCase() : ''}`}>
        {add && <>
          <p className="mb-3 text-sm text-slate-400">Suora lisäys kentälliseen (korjaukset / tuonti). Normaalisti kentällinen syntyy draftista.</p>
          <EntityPicker pos={add} options={add === 'C' ? coaches : undefined} onPick={async (h) => {
            const ok = await run(() => api('/admin/slots', { body: { guru_id: guru.id, position: add, entity_id: h.id } }), 'Lisätty');
            if (ok) { setAdd(null); reload(); }
          }} />
        </>}
      </Modal>

      <Modal open={!!editSlot} onClose={() => setEditSlot(null)} title={`Muokkaa: ${editSlot?.name}`}>
        {editSlot && (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => api(`/admin/slots/${editSlot.id}`, { method: 'PUT', body: editSlot }), 'Tallennettu');
            if (ok) { setEditSlot(null); reload(); }
          }}>
            <p className="text-sm text-slate-400">HG = (loppupisteet tai nykyiset) − alkupisteet. Alkupisteet vastaavat Excelin kaavoihin kirjoitettua vähennystä.</p>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Alkupvm</label><input type="date" className="input" value={editSlot.start_date} onChange={(e) => setEditSlot({ ...editSlot, start_date: e.target.value })} /></div>
              <div><label className="label">Alkupisteet</label><input type="number" step="0.1" className="input" value={editSlot.start_points} onChange={(e) => setEditSlot({ ...editSlot, start_points: Number(e.target.value) })} /></div>
              <div><label className="label">Loppupvm</label><input type="date" className="input" value={editSlot.end_date ?? ''} onChange={(e) => setEditSlot({ ...editSlot, end_date: e.target.value || null })} /></div>
              <div><label className="label">Loppupisteet</label><input type="number" step="0.1" className="input" value={editSlot.end_points ?? ''} onChange={(e) => setEditSlot({ ...editSlot, end_points: e.target.value === '' ? null : Number(e.target.value) })} /></div>
            </div>
            <div className="flex justify-between">
              <button type="button" className="btn btn-danger" onClick={async () => {
                if (!confirm('Poistetaanko paikka kokonaan?')) return;
                await run(() => api(`/admin/slots/${editSlot.id}`, { method: 'DELETE' }), 'Poistettu'); setEditSlot(null); reload();
              }}>Poista</button>
              <button className="btn btn-primary">Tallenna</button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}

export default function Gurus() {
  const { data, reload } = useApi<G[]>('/admin/gurus');
  const { run } = useAdmin();
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<Partial<G> | null>(null);
  const [q, setQ] = useState('');
  if (!data) return <Spinner />;
  const selected = data.find((g) => g.id === sel);

  return (
    <>
      <PageHeader kicker={`${data.length} kisaajaa`} title="Gurut & kentälliset">
        <button className="btn btn-primary" onClick={() => setEdit({ remote_draft: 0 })}>+ Uusi guru</button>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <Card>
          <div className="p-3"><input className="input" placeholder="Hae…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ul className="max-h-[70vh] overflow-y-auto">
            {data.filter((g) => matchName(g.name, q)).map((g) => (
              <li key={g.id} className={`flex items-center gap-2 border-t border-white/5 px-4 py-2 ${sel === g.id ? 'bg-ice-500/10' : ''}`}>
                <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setSel(g.id)}>
                  <span className="w-6 text-center font-display text-xs text-slate-500">{g.draft_number ?? '–'}</span>
                  <span className="flex-1 text-sm font-semibold text-white">{g.name}</span>
                  {!g.user_id && <span title="Ei tunnusta" className="text-xs text-amber-400">●</span>}
                </button>
                <button className="px-1 text-slate-500 hover:text-white" onClick={() => setEdit(g)}>✎</button>
              </li>
            ))}
          </ul>
        </Card>
        {selected ? <GuruPanel key={selected.id} guru={selected} onChanged={reload} /> : <Card><Empty>Valitse guru listalta nähdäksesi kentällisen, tehdäksesi vaihtoja tai korjauksia.</Empty></Card>}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Muokkaa gurua' : 'Uusi guru'}>
        {edit && (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => edit.id ? api(`/admin/gurus/${edit.id}`, { method: 'PUT', body: edit }) : api('/admin/gurus', { body: edit }), 'Tallennettu');
            if (ok) { setEdit(null); reload(); }
          }}>
            <div><label className="label">Nimi</label><input className="input" required value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label className="label">Draft-numero</label><input type="number" className="input" value={edit.draft_number ?? ''} onChange={(e) => setEdit({ ...edit, draft_number: e.target.value ? Number(e.target.value) : null })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ice-400" checked={!!edit.remote_draft} onChange={(e) => setEdit({ ...edit, remote_draft: e.target.checked ? 1 : 0 })} /> Osallistuu draftiin etänä (ennakkolista)</label>
            <div className="flex justify-between">
              {edit.id ? <button type="button" className="btn btn-danger" onClick={async () => {
                if (!confirm(`Poistetaanko ${edit.name} ja koko kentällinen?`)) return;
                await run(() => api(`/admin/gurus/${edit.id}`, { method: 'DELETE' }), 'Poistettu'); setEdit(null); setSel(null); reload();
              }}>Poista</button> : <span />}
              <button className="btn btn-primary">Tallenna</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
