import { useState } from 'react';
import { Link } from 'react-router';
import { fmtDateTime, type Season } from '../api';
import { useApi } from '../auth';
import { Card, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

interface Overview {
  season: Season;
  counts: { users: number; gurus: number; players: number; swaps: number };
  sync: { id: number; started_at: string; finished_at: string | null; ok: number | null; message: string | null }[];
}

export default function Dashboard() {
  const { data, reload } = useApi<Overview>('/admin/overview');
  const { run } = useAdmin();
  const [busy, setBusy] = useState(false);
  if (!data) return <Spinner />;
  const stats = [
    { label: 'Gurut', value: data.counts.gurus, to: '/admin/gurut' },
    { label: 'Käyttäjät', value: data.counts.users, to: '/admin/kayttajat' },
    { label: 'Pelaajat kannassa', value: data.counts.players, to: '/pelaajat' },
    { label: 'Vaihtoja tehty', value: data.counts.swaps, to: '/admin/vaihdot' },
  ];
  const draftLabel = { setup: 'Valmistelu', live: 'Käynnissä', done: 'Valmis' }[data.season.draft_status];

  return (
    <>
      <PageHeader kicker={`Kausi ${data.season.name}`} title="Yleiskatsaus">
        <button className="btn btn-primary" disabled={busy} onClick={async () => {
          setBusy(true);
          const r = await run(() => api<{ message: string }>('/admin/sync', { method: 'POST' }));
          if (r) await run(async () => r, `Päivitetty: ${r.message}`);
          setBusy(false); reload();
        }}>{busy ? 'Haetaan…' : '⟳ Päivitä tilastot nyt'}</button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="card p-5 transition hover:border-ice-400/40">
            <p className="label">{s.label}</p><p className="scoreboard text-4xl">{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Kauden tila">
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
            <div><dt className="label">Draft</dt><dd className="text-white">{draftLabel}</dd></div>
            <div><dt className="label">Liiga-kausi</dt><dd className="text-white">{data.season.liiga_season - 1}–{data.season.liiga_season}</dd></div>
            <div><dt className="label">Max sama valinta</dt><dd className="text-white">{data.season.max_picks_per_entity}</dd></div>
            <div><dt className="label">Vaihtoja / guru</dt><dd className="text-white">{data.season.max_swaps ?? 'ei rajaa'}</dd></div>
          </dl>
        </Card>
        <Card title="Päivitysloki">
          <ul className="divide-y divide-white/5 text-sm">
            {data.sync.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-5 py-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.ok ? 'bg-emerald-400' : s.ok === 0 ? 'bg-goal' : 'bg-amber-400'}`} />
                <span className="w-28 shrink-0 text-slate-400">{fmtDateTime(s.started_at)}</span>
                <span className="text-slate-300">{s.message ?? 'Käynnissä…'}</span>
              </li>
            ))}
            {!data.sync.length && <li className="px-5 py-4 text-slate-500">Ei vielä päivityksiä. Tilastot päivittyvät automaattisesti tunnin välein.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
