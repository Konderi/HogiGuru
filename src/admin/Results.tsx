import { useEffect, useState } from 'react';
import { type Season } from '../api';
import { useApi } from '../auth';
import ResultsView, { type Results } from '../components/ResultsView';
import { Card, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

export default function AdminResults() {
  const ov = useApi<{ season: Season & { results_published: number; results_override: unknown } }>('/admin/overview');
  const res = useApi<Results>('/admin/results');
  const { run } = useAdmin();
  const [override, setOverride] = useState('');
  useEffect(() => { if (ov.data) setOverride(JSON.stringify(ov.data.season.results_override ?? {}, null, 2)); }, [ov.data]);
  if (!ov.data) return <Spinner />;
  const s = ov.data.season;
  const published = !!s.results_published;

  const toggle = () => {
    if (!published && !confirm('Julkaistaanko kokonaistulokset kaikille? Veikkaukset tulevat näkyviin.')) return;
    run(async () => { await api('/admin/season', { method: 'PUT', body: { results_published: published ? 0 : 1 } }); ov.reload(); }, published ? 'Julkaisu peruttu' : 'Tulokset julkaistu');
  };
  const saveOverride = () => run(async () => {
    let parsed: unknown; try { parsed = JSON.parse(override || '{}'); } catch { throw new Error('Virheellinen JSON'); }
    await api('/admin/results/override', { method: 'PUT', body: parsed }); res.reload();
  }, 'Korjaukset tallennettu');

  return (
    <>
      <PageHeader kicker={`Kausi ${s.name}`} title="Kokonaistulokset">
        <button className={`btn ${published ? 'btn-ghost' : 'btn-primary'}`} onClick={toggle}>{published ? '🔒 Piilota tulokset' : '🏆 Julkaise kokonaistulokset'}</button>
      </PageHeader>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Tila">
          <div className="space-y-3 p-5 text-sm text-slate-300">
            <p className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${published ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {published ? 'Julkaistu – näkyy sivulla Kokonaistulokset.' : 'Pimitetty – vain ylläpito näkee tämän esikatselun.'}</p>
            <p className="text-slate-400">Pisteet lasketaan automaattisesti liiga.fi-tilastoista: sarjataulukko, joukkueiden pistemiehet (maalit + syötöt) ja kategorioiden top 1/3/5 tasatilanteet huomioiden.</p>
            <button className="btn btn-ghost w-full" onClick={() => { if (confirm(`Tallennetaanko kauden ${s.name} kokonaistulos Hall of Fameen? Saman kauden aiemmat rivit korvataan.`)) run(() => api('/admin/results/hall-of-fame', { body: {} }), 'Tallennettu Hall of Fameen'); }}>♛ Tallenna Hall of Fameen</button>
          </div>
        </Card>
        <Card title="Käsikorjaukset oikeisiin vastauksiin">
          <div className="space-y-2 p-5">
            <p className="text-xs text-slate-400">Tyhjä {'{}'} = automaattinen. Voit pakottaa järjestyksen esim. tasapelien tai siirtojen takia:
              <code className="mt-1 block text-[11px] text-slate-300">{'{"standings":["TPS","KAL",…], "topScorers":{"TPS":[pelaaja_id,…]}, "categories":{"goals":[pelaaja_id,…]}}'}</code></p>
            <textarea rows={6} className="input font-mono text-xs" value={override} onChange={(e) => setOverride(e.target.value)} />
            <button className="btn btn-primary w-full" onClick={saveOverride}>Tallenna korjaukset</button>
          </div>
        </Card>
      </div>
      {res.data ? <ResultsView data={res.data} /> : <Spinner />}
    </>
  );
}
