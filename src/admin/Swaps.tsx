import { useState } from 'react';
import { fmt, fmtDate, type Position } from '../api';
import { useApi } from '../auth';
import { Card, Empty, PageHeader, PosBadge, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface Day { id: number; date: string; note: string | null }
interface Swap { id: number; date: string; guru: string; position: Position; in_name: string; out_name: string; in_points: number; out_points: number }

export default function Swaps() {
  const days = useApi<Day[]>('/swap-days');
  const swaps = useApi<Swap[]>('/admin/swaps');
  const { run } = useAdmin();
  const [f, setF] = useState({ date: '', note: '' });
  const today = new Date().toLocaleDateString('sv-SE');

  return (
    <>
      <PageHeader kicker="Vaihtopäivät & loki" title="Vaihdot" />
      <p className="mb-6 text-sm text-slate-400">Vaihto tehdään <b className="text-white">Gurut & kentälliset</b> -sivulla valitsemalla guru ja painamalla pelaajan kohdalla ⇄ Vaihda. Seuraava vaihtopäivä näkyy etusivulla kaikille.</p>
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card title="Vaihtopäivät">
          <form className="space-y-2 border-b border-white/5 p-4" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => api('/admin/swap-days', { body: f }), 'Vaihtopäivä lisätty');
            if (ok) { setF({ date: '', note: '' }); days.reload(); }
          }}>
            <input type="date" required className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <input className="input" placeholder="Lisätieto (valinnainen)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <button className="btn btn-primary w-full">+ Lisää vaihtopäivä</button>
          </form>
          {!days.data ? <Spinner /> : !days.data.length ? <Empty>Ei vaihtopäiviä.</Empty> : (
            <ul className="divide-y divide-white/5">
              {days.data.map((d) => (
                <li key={d.id} className={`flex items-center gap-3 px-4 py-2.5 ${d.date < today ? 'opacity-50' : ''}`}>
                  <span className="flex-1"><span className="font-semibold text-white">{fmtDate(d.date)}</span>{d.note && <span className="block text-xs text-slate-400">{d.note}</span>}</span>
                  <button className="text-slate-500 hover:text-goal" onClick={async () => { await run(() => api(`/admin/swap-days/${d.id}`, { method: 'DELETE' })); days.reload(); }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Vaihtoloki">
          {!swaps.data ? <Spinner /> : !swaps.data.length ? <Empty>Ei vielä vaihtoja.</Empty> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Pvm</th><th>Guru</th><th /><th>Ulos</th><th>Sisään</th><th className="num">Ulos HG</th><th /></tr></thead>
                <tbody>
                  {swaps.data.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap text-slate-400">{fmtDate(s.date)}</td>
                      <td className="font-semibold text-white">{s.guru}</td>
                      <td><PosBadge pos={s.position} /></td>
                      <td className="text-goal/90">↓ {s.out_name}</td>
                      <td className="text-emerald-400">↑ {s.in_name}</td>
                      <td className="num">{fmt(s.out_points)}</td>
                      <td className="text-right"><button className="text-xs text-slate-500 hover:text-goal" onClick={async () => {
                        if (!confirm('Perutaanko vaihto?')) return;
                        await run(() => api(`/admin/swaps/${s.id}/undo`, { method: 'POST' }), 'Vaihto peruttu'); swaps.reload();
                      }}>Peru</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
