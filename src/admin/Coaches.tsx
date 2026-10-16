import { useState } from 'react';
import { fmt } from '../api';
import { useApi } from '../auth';
import { Card, Empty, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface Coach { id: number; name: string; team_id: string; team: string; logo: string | null; fired: number; hg: number; reserved: number }
interface Team { id: string; name: string }

export default function Coaches() {
  const coaches = useApi<Coach[]>('/coaches');
  const teams = useApi<Team[]>('/teams');
  const { run } = useAdmin();
  const [f, setF] = useState({ name: '', team_id: '' });
  if (!coaches.data) return <Spinner />;

  return (
    <>
      <PageHeader kicker="Liigan päävalmentajat" title="Valmentajat" />
      <p className="mb-6 text-sm text-slate-400">Valmentajan HG-pisteet = joukkueen sarjapisteet × kerroin. <b className="text-white">Potkut</b> antaa miinuspisteet kaikille guruille, joiden kentällisessä valmentaja on – tee sen jälkeen vaihto uuteen valmentajaan.</p>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card title="Lisää valmentaja">
          <form className="space-y-3 p-5" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => api('/admin/coaches', { body: f }), 'Lisätty');
            if (ok) { setF({ name: '', team_id: '' }); coaches.reload(); }
          }}>
            <input className="input" placeholder="Nimi" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <select className="input" required value={f.team_id} onChange={(e) => setF({ ...f, team_id: e.target.value })}>
              <option value="">Joukkue…</option>{(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {!teams.data?.length && <p className="text-xs text-amber-400">Joukkueet haetaan liiga.fi:stä – aja tilastopäivitys ensin.</p>}
            <button className="btn btn-primary w-full">Lisää</button>
          </form>
        </Card>
        <Card>
          {!coaches.data.length ? <Empty>Ei valmentajia.</Empty> : (
            <table className="table">
              <thead><tr><th>Valmentaja</th><th>Joukkue</th><th className="num">Varattu</th><th className="num">HG</th><th /></tr></thead>
              <tbody>
                {coaches.data.map((c) => (
                  <tr key={c.id} className={c.fired ? 'opacity-60' : ''}>
                    <td className="font-semibold text-white">{c.name}{c.fired ? <span className="chip ml-2 bg-goal/20 text-red-300">Potkut</span> : null}</td>
                    <td><span className="flex items-center gap-2">{c.logo && <img src={c.logo} alt="" className="h-5 w-5" />}{c.team}</span></td>
                    <td className="num">{c.reserved}</td>
                    <td className="num scoreboard">{fmt(c.hg)}</td>
                    <td className="whitespace-nowrap text-right">
                      {!c.fired && <button className="btn btn-danger px-3 py-1 text-xs" onClick={async () => {
                        if (!confirm(`${c.name} sai potkut? Miinuspisteet annetaan ${c.reserved} gurulle.`)) return;
                        const date = prompt('Potkujen päivämäärä (VVVV-KK-PP). Valmentajan pisteet lasketaan tähän päivään asti, seuraajan seuraavasta päivästä.', new Date().toLocaleDateString('sv-SE'));
                        if (!date) return;
                        await run(() => api(`/admin/coaches/${c.id}/fire`, { method: 'POST', body: { date } }), 'Potkut kirjattu'); coaches.reload();
                      }}>Potkut</button>}
                      <button className="ml-2 text-slate-500 hover:text-goal" onClick={async () => {
                        if (!confirm('Poistetaanko valmentaja?')) return;
                        await run(() => api(`/admin/coaches/${c.id}`, { method: 'DELETE' })); coaches.reload();
                      }}>✕</button>
                    </td>
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
