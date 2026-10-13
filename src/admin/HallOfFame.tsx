import { useState } from 'react';
import { fmt } from '../api';
import { useApi } from '../auth';
import { Card, Empty, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface Hof { id: number; season_name: string; rank: number; name: string; points: number | null; note: string | null }

export default function HallOfFameAdmin() {
  const { data, reload } = useApi<Hof[]>('/hall-of-fame');
  const { run } = useAdmin();
  const [f, setF] = useState({ season_name: '', rank: '1', name: '', points: '', note: '' });
  if (!data) return <Spinner />;

  return (
    <>
      <PageHeader kicker="Historia" title="Hall of Fame" />
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card title="Lisää tulos">
          <form className="space-y-3 p-5" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => api('/admin/hall-of-fame', { body: { ...f, points: f.points.replace(',', '.') } }), 'Lisätty');
            if (ok) { setF({ ...f, rank: String(Number(f.rank) + 1), name: '', points: '', note: '' }); reload(); }
          }}>
            <input className="input" placeholder="Kausi, esim. 2025–2026" required value={f.season_name} onChange={(e) => setF({ ...f, season_name: e.target.value })} />
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <input className="input" type="number" min={1} required value={f.rank} onChange={(e) => setF({ ...f, rank: e.target.value })} />
              <input className="input" placeholder="Nimi" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <input className="input" placeholder="Pisteet" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} />
            <input className="input" placeholder="Huomio (valinnainen)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <button className="btn btn-primary w-full">Lisää</button>
          </form>
        </Card>
        <Card>
          {!data.length ? <Empty>Ei vielä historiaa.</Empty> : (
            <table className="table">
              <thead><tr><th>Kausi</th><th>#</th><th>Nimi</th><th className="num">Pisteet</th><th /></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="text-slate-400">{r.season_name}</td><td>{r.rank}</td><td className="font-semibold text-white">{r.name}</td><td className="num">{fmt(r.points)}</td>
                    <td className="text-right"><button className="text-slate-500 hover:text-goal" onClick={async () => { await run(() => api(`/admin/hall-of-fame/${r.id}`, { method: 'DELETE' })); reload(); }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
