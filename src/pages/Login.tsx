import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Logo } from '../ui';

export default function Login() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setup = !!me?.needsSetup;

  if (me?.user) return <Navigate to={me.user.role === 'admin' ? '/admin' : '/oma-joukkue'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(setup ? '/setup' : '/auth/login', { body: f });
      await refresh(); navigate(setup ? '/admin' : '/oma-joukkue');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="card relative overflow-hidden p-8 animate-in">
        <div className="rink-lines pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo className="mb-3 h-16 w-16" />
            <h1 className="text-3xl">{setup ? 'Ensimmäinen ylläpitäjä' : 'Kirjaudu sisään'}</h1>
            <p className="mt-2 text-sm text-slate-400">{setup ? 'Luo pääkäyttäjätunnus HogiGurulle.' : 'Näet oman All-Stars-kentällisesi ja draft-valintasi.'}</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {setup && <div><label className="label">Nimi</label><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>}
            <div><label className="label">Sähköposti</label><input className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><label className="label">Salasana</label><input className="input" type="password" autoComplete={setup ? 'new-password' : 'current-password'} required minLength={setup ? 8 : undefined} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
            <ErrorBox error={error} />
            <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? 'Hetki…' : setup ? 'Luo tunnus' : 'Kirjaudu'}</button>
          </form>
          {!setup && <p className="mt-6 text-center text-xs text-slate-500">Tunnukset saat HogiGurun ylläpidolta.</p>}
        </div>
      </div>
    </div>
  );
}
