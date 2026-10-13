import { useState } from 'react';
import { fmt, fmtDate, type Position } from '../api';
import { useApi } from '../auth';
import { Card, Empty, Modal, PageHeader, PosBadge, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface Day { id: number; date: string; note: string | null; start_time: string; end_time: string; processed_at: string | null }
interface Swap { id: number; date: string; guru: string; position: Position; in_name: string; out_name: string; in_points: number; out_points: number }

export default function Swaps() {
  const days = useApi<Day[]>('/swap-days');
  const swaps = useApi<Swap[]>('/admin/swaps');
  const { run } = useAdmin();
  const [f, setF] = useState({ date: '', note: '', start_time: '09:00', end_time: '21:00' });
  const [openDay, setOpenDay] = useState<Day | null>(null);
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
            if (ok) { setF({ ...f, date: '', note: '' }); days.reload(); }
          }}>
            <input type="date" required className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <div className="flex items-center gap-2">
              <input type="time" className="input" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
              <span className="text-slate-500">–</span>
              <input type="time" className="input" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
            </div>
            <input className="input" placeholder="Lisätieto (valinnainen)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <button className="btn btn-primary w-full">+ Lisää vaihtopäivä</button>
          </form>
          {!days.data ? <Spinner /> : !days.data.length ? <Empty>Ei vaihtopäiviä.</Empty> : (
            <ul className="divide-y divide-white/5">
              {days.data.map((d) => (
                <li key={d.id} className={`flex items-center gap-3 px-4 py-2.5 ${d.date < today ? 'opacity-50' : ''}`}>
                  <span className="flex-1"><span className="font-semibold text-white">{fmtDate(d.date)}</span> <span className="font-mono text-xs text-ice-300">klo {d.start_time}–{d.end_time}</span>{d.note && <span className="block text-xs text-slate-400">{d.note}</span>}</span>
                  <button className={`rounded-lg px-2 py-1 text-xs font-semibold ${d.processed_at ? 'bg-emerald-500/15 text-emerald-300' : 'bg-ice-500/15 text-ice-300 hover:bg-ice-500/25'}`} onClick={() => setOpenDay(d)}>
                    {d.processed_at ? '✓ Käsitelty' : 'Toiveet'}
                  </button>
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
      <SwapDayModal day={openDay} onClose={() => setOpenDay(null)} onDone={() => { days.reload(); swaps.reload(); }} />
    </>
  );
}

interface Preview {
  dayNumber: number; reversed: boolean;
  order: { pos: number; id: number; name: string; draft_number: number | null; requests: number }[];
  results: { request_id: number; guru: string; round: number; position: Position; out_name: string; in_name: string | null; ok: boolean; note: string }[];
}

function SwapDayModal({ day, onClose, onDone }: { day: Day | null; onClose: () => void; onDone: () => void }) {
  const pv = useApi<Preview>(day ? `/admin/swap-days/${day.id}/preview` : null, [day?.id]);
  const { run } = useAdmin();
  const p = pv.data;
  const ok = p?.results.filter((r) => r.ok).length ?? 0;
  return (
    <Modal open={!!day} onClose={onClose} title={day ? `Vaihtopäivä ${fmtDate(day.date)}` : ''}>
      {!p ? <Spinner /> : (
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            {p.dayNumber}. vaihtopäivä · järjestys: <b className="text-white">{p.reversed ? 'käänteinen draft-järjestys' : 'draft-järjestys'}</b>.{' '}
            {day?.processed_at ? 'Käsitelty – alla toteutuneet tulokset.' : 'Esikatselu nykyisillä toiveilla. Mitään ei vielä muuteta.'}
          </p>
          {!day?.processed_at && (
            <details className="rounded-xl bg-white/5 p-3 text-xs text-slate-400">
              <summary className="cursor-pointer font-semibold text-slate-300">Vuorojärjestys ({p.order.filter((o) => o.requests).length} gurulla toiveita)</summary>
              <ol className="mt-2 columns-2 sm:columns-3">{p.order.map((o) => <li key={o.id} className={o.requests ? 'text-white' : ''}>{o.pos}. {o.name}{o.requests ? ` (${o.requests})` : ''}</li>)}</ol>
            </details>
          )}
          {!p.results.length ? <Empty>Ei vaihtotoiveita.</Empty> : (
            <div className="max-h-[50vh] overflow-auto">
              <table className="table">
                <thead><tr><th>Kierros</th><th>Guru</th><th /><th>Ulos</th><th>Sisään</th><th>Huom.</th></tr></thead>
                <tbody>
                  {p.results.map((r) => (
                    <tr key={r.request_id} className={r.ok ? '' : 'opacity-60'}>
                      <td className="font-mono text-xs">{r.round}</td>
                      <td className="font-semibold text-white">{r.guru}</td>
                      <td><PosBadge pos={r.position} /></td>
                      <td className="text-goal/90">↓ {r.out_name}</td>
                      <td className={r.ok ? 'text-emerald-400' : 'text-slate-500'}>{r.ok ? `↑ ${r.in_name}` : '✕ ei toteudu'}</td>
                      <td className="text-xs text-slate-400">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!day?.processed_at && p.results.length > 0 && (
            <button className="btn btn-primary w-full" onClick={async () => {
              if (!confirm(`Toteutetaanko ${ok} vaihtoa? Toimintoa ei voi perua kerralla (yksittäiset vaihdot voi perua vaihtolokista).`)) return;
              const res = await run(() => api(`/admin/swap-days/${day!.id}/process`, { method: 'POST' }), `${ok} vaihtoa toteutettu`);
              if (res) { onDone(); onClose(); }
            }}>✓ Hyväksy ja toteuta {ok} vaihtoa</button>
          )}
        </div>
      )}
    </Modal>
  );
}
