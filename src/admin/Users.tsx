import { useState } from 'react';
import { useApi } from '../auth';
import { Card, Modal, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface U { id: number; email: string; name: string; role: 'admin' | 'guru'; active: number; guru_id: number | null; guru_name: string | null }
interface G { id: number; name: string; user_id: number | null }

const randomPw = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 55]).join('');

export default function Users() {
  const users = useApi<U[]>('/admin/users');
  const gurus = useApi<G[]>('/admin/gurus');
  const { run } = useAdmin();
  const [edit, setEdit] = useState<Partial<U> & { password?: string; guruId?: number | null } | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  if (!users.data) return <Spinner />;

  async function save() {
    if (!edit) return;
    const body = { email: edit.email, name: edit.name, role: edit.role, password: edit.password || undefined, guruId: edit.guruId, active: edit.active === undefined ? undefined : !!edit.active };
    const ok = await run(() => edit.id ? api(`/admin/users/${edit.id}`, { method: 'PUT', body }) : api('/admin/users', { body }), 'Tallennettu');
    if (ok !== undefined) {
      if (edit.password) setCreated({ email: edit.email!, password: edit.password });
      setEdit(null); users.reload(); gurus.reload();
    }
  }
  const freeGurus = (gurus.data ?? []).filter((g) => !g.user_id || g.id === edit?.guru_id);

  return (
    <>
      <PageHeader kicker="Tunnukset" title="Käyttäjät">
        <button className="btn btn-primary" onClick={() => setEdit({ role: 'guru', password: randomPw(), guruId: null })}>+ Uusi käyttäjä</button>
      </PageHeader>
      {created && (
        <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <p className="font-semibold text-emerald-300">Toimita tunnukset käyttäjälle:</p>
          <p className="mt-1 font-mono text-white">{created.email} / {created.password}</p>
          <p className="mt-1 text-slate-400">Osoite: https://guru.konderi.fi/kirjaudu – käyttäjä voi vaihtaa salasanan Oma joukkue -sivulla.</p>
          <button className="mt-2 text-xs text-slate-400 underline" onClick={() => setCreated(null)}>Sulje</button>
        </div>
      )}
      <Card>
        <table className="table">
          <thead><tr><th>Nimi</th><th>Sähköposti</th><th>Rooli</th><th>Guru</th><th /></tr></thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                <td className="font-semibold text-white">{u.name}</td>
                <td className="text-slate-400">{u.email}</td>
                <td><span className={`chip ${u.role === 'admin' ? 'bg-goal/20 text-red-300' : 'bg-white/5 text-slate-300'}`}>{u.role === 'admin' ? 'Ylläpitäjä' : 'Guru'}</span></td>
                <td>{u.guru_name ?? <span className="text-slate-600">–</span>}</td>
                <td className="text-right"><button className="btn btn-ghost py-1" onClick={() => setEdit({ ...u, guruId: u.guru_id })}>Muokkaa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Muokkaa käyttäjää' : 'Uusi käyttäjä'}>
        {edit && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div><label className="label">Nimi</label><input className="input" required value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label className="label">Sähköposti</label><input className="input" type="email" required value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Rooli</label>
                <select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as U['role'] })}><option value="guru">Guru</option><option value="admin">Ylläpitäjä</option></select>
              </div>
              <div><label className="label">Liitä guruun</label>
                <select className="input" value={edit.guruId ?? ''} onChange={(e) => setEdit({ ...edit, guruId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">–</option>{freeGurus.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label">{edit.id ? 'Uusi salasana (tyhjä = ei muutosta)' : 'Salasana'}</label>
              <div className="flex gap-2"><input className="input font-mono" value={edit.password ?? ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
                <button type="button" className="btn btn-ghost" onClick={() => setEdit({ ...edit, password: randomPw() })}>Arvo</button></div>
            </div>
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ice-400" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked ? 1 : 0 })} /> Aktiivinen</label>}
            <div className="flex justify-between pt-2">
              {edit.id ? <button type="button" className="btn btn-danger" onClick={async () => {
                if (!confirm(`Poistetaanko ${edit.name}?`)) return;
                await run(() => api(`/admin/users/${edit.id}`, { method: 'DELETE' }), 'Poistettu'); setEdit(null); users.reload();
              }}>Poista</button> : <span />}
              <button className="btn btn-primary">Tallenna</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
