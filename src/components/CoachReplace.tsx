import { useState } from 'react';
import { api, fmt } from '../api';
import { useApi } from '../auth';

interface CoachRow { id: number; name: string; team: string; fired: number; hg: number; reserved: number; max: number }

/** Valmentaja sai potkut → guru valitsee heti uuden (ei kuluta vaihtoja). */
export default function CoachReplace({ onDone }: { onDone: () => void }) {
  const coaches = useApi<CoachRow[]>('/coaches');
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = (coaches.data ?? []).filter((c) => !c.fired);

  const save = async () => {
    if (!id) return;
    setBusy(true); setErr(null);
    try { await api('/me/coach', { body: { coach_id: Number(id) } }); onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-goal/40 bg-goal/10 px-5 py-4">
      <p className="font-semibold text-white">Valmentajasi sai potkut</p>
      <p className="mt-1 text-sm text-slate-300">Voit valita uuden valmentajan heti, eikä se kuluta vaihtojasi. Uusi valmentaja kerää pisteitä valintapäivästä alkaen.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="input max-w-xs" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Valitse valmentaja…</option>
          {list.map((c) => (
            <option key={c.id} value={c.id} disabled={c.reserved >= c.max}>
              {c.name} ({c.team}) · {fmt(c.hg)} HG{c.reserved >= c.max ? ' – täynnä' : ''}
            </option>
          ))}
        </select>
        <button className="btn-primary" disabled={!id || busy} onClick={save}>{busy ? 'Tallennetaan…' : 'Vahvista'}</button>
      </div>
      {err && <p className="mt-2 text-sm text-goal">{err}</p>}
    </div>
  );
}
