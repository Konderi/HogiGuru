import { useEffect, useState } from 'react';
import { fmtDateTime, POS_LABEL, POSITIONS, type Position, type Season } from '../api';
import { useApi } from '../auth';
import { CATEGORY_LABEL, fmtDeadline } from '../pages/Register';
import { Card, Empty, Modal, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface Reg {
  id: number; name: string; phone: string | null; email: string; status: 'new' | 'accepted' | 'rejected';
  standings: string[]; top_scorers: Record<string, number>; categories: Record<string, number>;
  guru_name: string | null; created_at: string; updated_at: string;
  position_order?: Position[]; rankings?: Partial<Record<Position, number[]>>; basket_picks?: { position: Position; entity_id: number }[];
}
interface Team { id: string; name: string }
interface Player { id: number; name: string }

const STATUS = { new: ['Uusi', 'bg-ice-500/15 text-ice-300'], accepted: ['Hyväksytty', 'bg-emerald-500/15 text-emerald-300'], rejected: ['Hylätty', 'bg-goal/15 text-goal'] } as const;

export default function Registrations() {
  const ov = useApi<{ season: Season }>('/admin/overview');
  const regs = useApi<Reg[]>('/admin/registrations');
  const meta = useApi<{ teams: Team[]; players: Player[]; coaches: Player[]; standings?: { team_id: string }[] }>('/public/registration');
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
            <div>
              <label className="label">All-Stars-valintatapa</label>
              <select className="input" value={s.selection_mode ?? 'draft'} onChange={(e) => setS({ ...s, selection_mode: e.target.value as 'draft' | 'baskets' })}>
                <option value="draft">Draft (toivelistat + valintajärjestys)</option>
                <option value="baskets">Korit (yksi valinta per kori, ennakkoon)</option>
              </select>
            </div>
            {s.selection_mode === 'baskets' && meta.data && (() => {
              const bk = s.baskets ?? [];
              const total = Object.values(s.roster).reduce((a, b) => a + b, 0);
              const where = (t: string) => bk.findIndex((b) => b.includes(t));
              const setTeam = (t: string, i: number) => {
                const nb = Array.from({ length: Math.max(total, bk.length) }, (_, j) => (bk[j] ?? []).filter((x) => x !== t));
                if (i >= 0) nb[i] = [...nb[i], t];
                setS({ ...s, baskets: nb });
              };
              const auto = () => {
                const order = (meta.data!.standings ?? []).map((x) => x.team_id);
                const teams = [...order, ...meta.data!.teams.map((t) => t.id).filter((t) => !order.includes(t))];
                const per = Math.ceil(teams.length / total);
                setS({ ...s, baskets: Array.from({ length: total }, (_, i) => teams.slice(i * per, (i + 1) * per)) });
              };
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><span className="label mb-0">Korit ({total} kpl)</span>
                    <button type="button" className="text-xs font-semibold text-ice-400 hover:text-ice-300" onClick={auto}>Täytä sarjataulukon mukaan</button></div>
                  <p className="text-xs text-slate-500">Valitse jokaiselle joukkueelle kori. Guru valitsee jokaisesta korista yhden pelaajan tai valmentajan.</p>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {meta.data.teams.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-slate-300">{t.name}</span>
                        <select className="input w-24 py-1 text-xs" value={where(t.id)} onChange={(e) => setTeam(t.id, Number(e.target.value))}>
                          <option value={-1}>–</option>
                          {Array.from({ length: total }, (_, i) => <option key={i} value={i}>Kori {i + 1}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
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
            <div className="sm:col-span-2">
              {!!view.basket_picks?.length && <><p className="label">Korivalinnat</p>
                <p className="mb-3 text-white">{view.basket_picks.map((b, i) => `${i + 1}. ${POS_LABEL[b.position]}: ${b.position === 'C' ? meta.data?.coaches?.find((c) => c.id === b.entity_id)?.name ?? `#${b.entity_id}` : player(b.entity_id)}`).join(' · ')}</p></>}
              <p className="label">Draftin valintajärjestys</p>
              <p className="text-white">{view.position_order?.length ? view.position_order.map((x, i) => `${i + 1}. ${POS_LABEL[x]}`).join(' · ') : '–'}</p>
            </div>
            {POSITIONS.map((x) => (
              <div key={x}>
                <p className="label">Toivelista: {POS_LABEL[x]}</p>
                <ol className="space-y-0.5">{(view.rankings?.[x] ?? []).map((id, i) => <li key={id}><span className="scoreboard mr-2 inline-block w-6 text-right">{i + 1}.</span>{x === 'C' ? meta.data?.coaches?.find((c) => c.id === id)?.name ?? `#${id}` : player(id)}</li>)}</ol>
                {!view.rankings?.[x]?.length && <p className="text-slate-500">–</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
