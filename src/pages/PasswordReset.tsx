import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Logo, Spinner } from '../ui';

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="card relative overflow-hidden p-6 animate-in sm:p-8">
        <div className="rink-lines pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo className="mb-3 h-16 w-16" />
            <h1 className="text-3xl">{title}</h1>
            {sub && <p className="mt-2 text-sm text-slate-400">{sub}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** /unohtunut – pyydä palautuslinkki sähköpostiin. */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api('/auth/forgot', { body: { email } }); setSent(true); } catch (x) { setError((x as Error).message); } finally { setBusy(false); }
  }

  if (sent) return (
    <Shell title="Tarkista sähköposti" sub={`Jos osoitteella ${email} on tunnus, lähetimme siihen linkin salasanan vaihtoon.`}>
      <ul className="mb-6 space-y-1 text-sm text-slate-400">
        <li>• Linkki on voimassa 60 minuuttia ja toimii kerran.</li>
        <li>• Viestin lähettäjä on <span className="text-slate-200">no-reply@konderi.fi</span> – katso tarvittaessa roskaposti.</li>
      </ul>
      <Link to="/kirjaudu" className="btn btn-ghost w-full py-3">Takaisin kirjautumiseen</Link>
    </Shell>
  );

  return (
    <Shell title="Unohtuiko salasana?" sub="Anna tunnuksesi sähköpostiosoite, niin lähetämme linkin uuden salasanan asettamiseen.">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label">Sähköposti</label><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <ErrorBox error={error} />
        <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? 'Lähetetään…' : 'Lähetä linkki'}</button>
      </form>
      <p className="mt-6 text-center text-sm"><Link to="/kirjaudu" className="text-ice-300 hover:underline">← Takaisin kirjautumiseen</Link></p>
    </Shell>
  );
}

/** /salasana?t=… – uuden salasanan asetus sähköpostin linkistä. */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [who, setWho] = useState<{ name: string; email: string } | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [f, setF] = useState({ password: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setInvalid('Linkistä puuttuu tunniste.'); return; }
    api<{ name: string; email: string }>(`/auth/reset?t=${encodeURIComponent(token)}`).then(setWho).catch((e) => setInvalid((e as Error).message));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (f.password !== f.again) { setError('Salasanat eivät täsmää'); return; }
    setBusy(true);
    try {
      await api('/auth/reset', { body: { token, password: f.password } });
      await refresh(); navigate('/oma-joukkue', { replace: true });
    } catch (x) { setError((x as Error).message); } finally { setBusy(false); }
  }

  if (invalid) return (
    <Shell title="Linkki ei kelpaa" sub={invalid}>
      <Link to="/unohtunut" className="btn btn-primary w-full py-3">Pyydä uusi linkki</Link>
    </Shell>
  );
  if (!who) return <Spinner />;

  return (
    <Shell title="Uusi salasana" sub={`${who.name} · ${who.email}`}>
      <form onSubmit={submit} className="space-y-4">
        {/* Piilotettu käyttäjätunnus auttaa selainta tallentamaan uuden salasanan oikealle tunnukselle */}
        <input type="email" autoComplete="username" value={who.email} readOnly hidden />
        <div><label className="label">Uusi salasana (väh. 8 merkkiä)</label><input className="input" type="password" autoComplete="new-password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div><label className="label">Uusi salasana uudelleen</label><input className="input" type="password" autoComplete="new-password" required minLength={8} value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></div>
        <ErrorBox error={error} />
        <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? 'Tallennetaan…' : 'Tallenna ja kirjaudu'}</button>
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">Tallennus kirjaa sinut ulos kaikilta muilta laitteilta.</p>
    </Shell>
  );
}
