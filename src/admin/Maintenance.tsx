import { useState } from 'react';
import { fmtDateTime } from '../api';
import { useApi } from '../auth';
import { Card, Empty, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface Backup { key: string; size: number; uploaded: string }
interface Status {
  mailConfigured: boolean; mailFrom: string | null;
  syncs: { id: number; kind?: string; ok: number; message: string | null; started_at: string }[];
  mail7d: { ok?: number; fail?: number }; audit7d: number;
  users: Record<string, number>; lastBackup: Backup | null; backupCount: number;
}
interface Audit { id: number; at: string; user_name: string; method: string; path: string; body: string | null; status: number }
interface Mail { id: number; at: string; kind: string; recipient: string; subject: string; ok: number; error: string | null }

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mt` : `${Math.round(n / 1024)} kt`);
const tabs = [['tila', 'Järjestelmän tila'], ['varmistukset', 'Varmistukset'], ['posti', 'Sähköposti'], ['historia', 'Muutoshistoria']] as const;
type Tab = (typeof tabs)[number][0];

export default function Maintenance() {
  const [tab, setTab] = useState<Tab>('tila');
  return (
    <>
      <PageHeader kicker="Vain pääylläpitäjälle" title="Tekninen ylläpito" />
      <div className="mb-6 flex gap-1 overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-ice-500/15 text-ice-300' : 'text-slate-400 hover:bg-white/5'}`}>{l}</button>
        ))}
      </div>
      {tab === 'tila' && <StatusTab />}
      {tab === 'varmistukset' && <BackupsTab />}
      {tab === 'posti' && <MailTab />}
      {tab === 'historia' && <AuditTab />}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${warn ? 'text-amber-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function StatusTab() {
  const s = useApi<Status>('/admin/maint/status');
  if (!s.data) return <Spinner />;
  const d = s.data;
  const backupAge = d.lastBackup ? (Date.now() - new Date(d.lastBackup.uploaded).getTime()) / 3600_000 : Infinity;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Viimeisin varmistus" warn={backupAge > 26}
          value={d.lastBackup ? `${fmtDateTime(d.lastBackup.uploaded)}` : 'Ei varmistuksia'} />
        <Stat label="Varmistuksia R2:ssa" value={d.backupCount} />
        <Stat label="Sähköposti" warn={!d.mailConfigured} value={d.mailConfigured ? '✅ Käytössä' : '⚠ API-avain puuttuu'} />
        <Stat label="Viestit 7 pv" warn={!!d.mail7d.fail} value={`${d.mail7d.ok ?? 0} ok / ${d.mail7d.fail ?? 0} virhettä`} />
        <Stat label="Muutoksia 7 pv" value={d.audit7d} />
        <Stat label="Pääylläpitäjät" value={d.users.superadmin ?? 0} />
        <Stat label="Ylläpitäjät" value={d.users.admin ?? 0} />
        <Stat label="Gurut (käyttäjät)" value={d.users.guru ?? 0} />
      </div>
      <Card title="Viimeisimmät tilastopäivitykset">
        {!d.syncs.length ? <Empty>Ei ajoja.</Empty> : (
          <table className="table">
            <thead><tr><th>Aika</th><th>Tila</th><th>Viesti</th></tr></thead>
            <tbody>{d.syncs.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap">{fmtDateTime(r.started_at)}</td>
                <td>{r.ok ? '✅' : '❌'}</td><td className="text-xs text-slate-400">{r.message}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function BackupsTab() {
  const b = useApi<Backup[]>('/admin/maint/backups');
  const { run } = useAdmin();
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Varmistukset (R2: hogiguru-backups)" action={
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true);
        await run(() => api('/admin/maint/backups', { method: 'POST' }), 'Varmistus tehty');
        setBusy(false); b.reload();
      }}>{busy ? 'Tehdään…' : 'Tee varmistus nyt'}</button>}>
      <p className="px-5 pt-4 text-xs text-slate-400">
        Yöllinen varmistus klo 03 (säilytys 30 pv, kuun 1. pysyvästi). Tapahtumavarmistus ennen vaihtopäivän käsittelyä ja draftin lukitusta (90 pv).
        Palautus: <code>npx wrangler d1 execute hogiguru --remote --file=varmistus.sql</code> tyhjään kantaan.
      </p>
      {!b.data ? <Spinner /> : !b.data.length ? <Empty>Ei varmistuksia vielä.</Empty> : (
        <table className="table">
          <thead><tr><th>Tiedosto</th><th>Aika</th><th className="num">Koko</th><th /></tr></thead>
          <tbody>{b.data.map((x) => (
            <tr key={x.key}><td className="font-mono text-xs">{x.key}</td><td className="whitespace-nowrap">{fmtDateTime(x.uploaded)}</td>
              <td className="num">{kb(x.size)}</td>
              <td className="text-right"><a className="btn btn-ghost py-1" href={`/api/admin/maint/backups/file?key=${encodeURIComponent(x.key)}`}>Lataa</a></td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

function MailTab() {
  const log = useApi<Mail[]>('/admin/maint/mail-log');
  const { run } = useAdmin();
  const act = async (path: string, ok: string, body?: unknown) => { await run(() => api(path, { method: 'POST', body }), ok); log.reload(); };
  return (
    <div className="space-y-6">
      <Card title="Lähetä">
        <div className="flex flex-wrap gap-2 p-5">
          <button className="btn btn-ghost" onClick={() => act('/admin/maint/mail/test', 'Testiviesti lähetetty')}>Testiviesti itselle</button>
          <button className="btn btn-ghost" onClick={() => act('/admin/maint/mail/weekly', 'Viikkokatsaus lähetetty sinulle')}>Viikkokatsaus itselle</button>
          <button className="btn btn-ghost" onClick={() => act('/admin/maint/mail/admin-report', 'Ylläpitoraportti lähetetty')}>Ylläpitoraportti</button>
          <button className="btn btn-primary" onClick={() => {
            if (confirm('Lähetetäänkö viikkokatsaus KAIKILLE guruille? (Jo saaneille ei lähetetä uudelleen.)')) act('/admin/maint/mail/weekly', 'Viikkokatsaus lähetetty kaikille', { all: true });
          }}>Viikkokatsaus kaikille</button>
        </div>
        <p className="px-5 pb-4 text-xs text-slate-400">Automaattisesti: viikkokatsaus maanantaisin klo 9, ylläpitoraportti pääylläpitäjille joka aamu klo 7.</p>
      </Card>
      <Card title="Lähetysloki">
        {!log.data ? <Spinner /> : !log.data.length ? <Empty>Ei lähetyksiä.</Empty> : (
          <table className="table">
            <thead><tr><th>Aika</th><th>Tyyppi</th><th>Vastaanottaja</th><th>Aihe</th><th>Tila</th></tr></thead>
            <tbody>{log.data.map((m) => (
              <tr key={m.id}><td className="whitespace-nowrap">{fmtDateTime(m.at)}</td><td className="text-xs">{m.kind}</td>
                <td className="text-xs">{m.recipient}</td><td className="text-xs">{m.subject}</td>
                <td title={m.error ?? ''}>{m.ok ? '✅' : `❌ ${m.error ?? ''}`}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function AuditTab() {
  const a = useApi<Audit[]>('/admin/maint/audit');
  const [q, setQ] = useState('');
  if (!a.data) return <Spinner />;
  const rows = a.data.filter((r) => !q || `${r.user_name} ${r.path} ${r.body ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title="Muutoshistoria (300 viimeisintä)" action={<input className="input w-full sm:w-56" placeholder="Suodata…" value={q} onChange={(e) => setQ(e.target.value)} />}>
      {!rows.length ? <Empty>Ei muutoksia.</Empty> : (
        <table className="table">
          <thead><tr><th>Aika</th><th>Käyttäjä</th><th>Toiminto</th><th>Tiedot</th><th className="num">Tila</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td className="whitespace-nowrap">{fmtDateTime(r.at)}</td><td>{r.user_name}</td>
              <td className="font-mono text-xs">{r.method} {r.path}</td>
              <td className="max-w-xs truncate font-mono text-xs text-slate-400" title={r.body ?? ''}>{r.body}</td>
              <td className={`num ${r.status >= 400 ? 'text-red-400' : ''}`}>{r.status}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}
