import { useEffect, useState } from 'react';
import { fmtDateTime, type Season } from '../api';
import { useApi } from '../auth';
import { CATEGORY_LABEL, fmtDeadline } from '../pages/Register';
import { Card, Empty, Modal, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface Reg {
  id: number; name: string; phone: string | null; email: string; status: 'new' | 'accepted' | 'rejected';
  standings: string[]; top_scorers: Record<string, number>; categories: Record<string, number>;
  guru_name: string | null; created_at: string; updated_at: string;
}
interface Team { id: string; name: string }
interface Player { id: number; name: string }

const STATUS = { new: ['Uusi', 'bg-ice-500/15 text-ice-300'], accepted: ['Hyväksytty', 'bg-emerald-500/15 text-emerald-300'], rejected: ['Hylätty', 'bg-goal/15 text-goal'] } as const;

export default function Registrations() {
  const ov = useApi<{ season: Season }>('/admin/overview');
  const regs = useApi<Reg[]>('/admin/registrations');
  const meta = useApi<{ teams: Team[]; players: Player[] }>('/public/registration');
  const { run } = useAdmin();
  const [s, setS] = useState<Season | null>(null);
  const [view, setView] = useState<Reg | null>(null);
  const [accept, setAccept] = useState<Reg | null>(null);
  const [pw, setPw] = useState('');
  useEffect(() => { if (ov.data) setS(ov.data.season); }, [ov.data]);
  if (!s) return <Spinner />;

  const team = (id: string) => meta.data?.teams.find((t) => t.id === id)?.name ?? id;
  const player = (id?: number) => (id ? meta.data?.players.find((p) => p.id === id)?.name ?? `#${id}` : '–');
  const save = (patch: Partial<Season>) => run(async () => { await api('/admin/season', { method: 'PUT', body: { ...s, ...patch } }); setS({ ...s, ...patch }); }, 'Tallennettu');
  const list = regs.data ?? [];
  const n = (st: Reg['status']) => list.filter((r) => r.status === st).length;

  const csv = () => {
    const rows = [['Nimi', 'Puhelin', 'Sähköposti', 'Tila', 'Ilmoittautunut'], ...list.map((r) => [r.name, r.phone ?? '', r.email, STATUS[r.status][0], r.created_at])];
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ilmoittautuneet-${s.name}.csv`; a.click();
  };

  return (
    <>
      <PageHeader kicker={`Kausi ${s.name}`} title="Ilmoittautuminen">
        <button className={`btn ${s.registration_open ? 'btn-ghost' : 'btn-primary'}`} onClick={() => save({ registration_open: s.registration_open ? 0 : 1 })}>
          {s.registration_open ? '⏸ Sulje ilmoittautuminen' : '▶ Avaa ilmoittautuminen'}
        </button>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card title="Asetukset">
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <span className={`h-3 w-3 rounded-full ${s.registration_open ? 'bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400' : 'bg-slate-600'}`} />
              <span className="text-sm text-white">{s.registration_open ? 'Lomake on auki etusivulla' : 'Lomake on suljettu'}</span>
            </div>
            <div><label className="label">Määräaika</label><input type="datetime-local" className="input" value={s.registration_deadline ?? ''} onChange={(e) => setS({ ...s, registration_deadline: e.target.value })} />
              {s.registration_deadline && <p className="mt-1 text-xs text-slate-500">{fmtDeadline(s.registration_deadline)}</p>}</div>
            <div><label className="label">Osallistumismaksu</label><input className="input" value={s.entry_fee ?? ''} onChange={(e) => setS({ ...s, entry_fee: e.target.value })} /></div>
            <div><label className="label">Lisätieto lomakkeelle</label><textarea rows={4} className="input" value={s.registration_info ?? ''} onChange={(e) => setS({ ...s, registration_info: e.target.value })} placeholder="Esim. maksuohjeet, draft-illan ajankohta…" /></div>
            <button className="btn btn-primary w-full" onClick={() => save({})}>Tallenna</button>
          </div>
        </Card>

        <Card title={`Ilmoittautuneet (${list.length})`} action={<div className="flex items-center gap-3 text-xs text-slate-400"><span>Uusia {n('new')} · Hyväksytty {n('accepted')}</span>{list.length > 0 && <button className="font-semibold text-ice-400 hover:text-ice-300" onClick={csv}>⤓ CSV</button>}</div>}>
          {!regs.data ? <Spinner /> : !list.length ? <Empty>Ei vielä ilmoittautumisia.</Empty> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Nimi</th><th>Yhteystiedot</th><th>Tila</th><th>Saapunut</th><th /></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td className="font-semibold text-white">{r.name}{r.guru_name && <span className="block text-xs font-normal text-slate-500">→ {r.guru_name}</span>}</td>
                      <td className="text-xs text-slate-400">{r.email}<br />{r.phone}</td>
                      <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
                      <td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(r.updated_at)}</td>
                      <td className="whitespace-nowrap text-right">
                        <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setView(r)}>Veikkaukset</button>
                        {r.status !== 'accepted' && <button className="btn btn-primary ml-1 px-2 py-1 text-xs" onClick={() => { setPw(''); setAccept(r); }}>Hyväksy</button>}
                        {r.status === 'new' && <button className="ml-1 px-2 text-xs text-slate-500 hover:text-goal" onClick={async () => { await run(() => api(`/admin/registrations/${r.id}/reject`, { body: {} })); regs.reload(); }}>Hylkää</button>}
                        <button className="ml-1 px-1 text-slate-500 hover:text-goal" title="Poista" onClick={async () => { if (confirm(`Poistetaanko ${r.name}?`)) { await run(() => api(`/admin/registrations/${r.id}`, { method: 'DELETE' })); regs.reload(); } }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!accept} onClose={() => setAccept(null)} title={`Hyväksy: ${accept?.name}`}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => api(`/admin/registrations/${accept!.id}/accept`, { body: { password: pw || undefined } }), `${accept!.name} lisätty guruksi`);
          if (ok) { setAccept(null); regs.reload(); }
        }}>
          <p className="text-sm text-slate-300">Guru <b className="text-white">{accept?.name}</b> lisätään kauden kisaajiin (tai liitetään samannimiseen guruun).</p>
          <div><label className="label">Salasana tunnukselle {accept?.email} (valinnainen)</label>
            <input className="input" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Tyhjä = ei luoda tunnusta nyt" /></div>
          <button className="btn btn-primary w-full">Hyväksy</button>
        </form>
      </Modal>

      <Modal open={!!view} onClose={() => setView(null)} title={`Veikkaukset: ${view?.name}`}>
        {view && (
          <div className="grid gap-6 text-sm sm:grid-cols-2">
            <div>
              <p className="label">Sarjataulukko</p>
              <ol className="space-y-0.5">{view.standings.map((t, i) => <li key={t}><span className="scoreboard mr-2 inline-block w-6 text-right">{i + 1}.</span>{team(t)}</li>)}</ol>
            </div>
            <div className="space-y-5">
              <div>
                <p className="label">Paras pistemies</p>
                <ul className="space-y-0.5">{Object.entries(view.top_scorers).map(([t, p]) => <li key={t}><span className="text-slate-400">{team(t)}:</span> <span className="text-white">{player(p)}</span></li>)}</ul>
              </div>
              <div>
                <p className="label">Kategoriat</p>
                <ul className="space-y-0.5">{Object.entries(CATEGORY_LABEL).map(([k, l]) => <li key={k}><span className="text-slate-400">{l}:</span> <span className="text-white">{player(view.categories[k])}</span></li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
