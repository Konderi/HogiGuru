import { useState } from 'react';
import { api } from '../api';
import { isAdminRole, useApi, useAuth } from '../auth';
import GalaReveal from '../components/GalaReveal';
import ResultsView, { type Results } from '../components/ResultsView';
import { Card, ErrorBox, PageHeader, Spinner } from '../ui';

export default function ResultsPage() {
  const { data, error, reload } = useApi<Results | { published: false; season: string }>('/results');
  const { me } = useAuth();
  const isAdmin = isAdminRole(me?.user?.role);
  const [gala, setGala] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  const publish = async () => {
    if (!confirm('Julkaistaanko kokonaistulokset kaikille?')) return;
    await api('/admin/season', { method: 'PUT', body: { results_published: 1 } });
    reload();
  };
  return (
    <>
      <PageHeader kicker={`Kausi ${data.season}`} title="Kokonaistulokset">
        {isAdmin && <button className="btn btn-primary" onClick={() => setGala(true)}>🎬 Gaalaesitys{!data.published && ' (harjoitus)'}</button>}
      </PageHeader>
      {!data.published ? (
        <Card><div className="p-10 text-center">
          <p className="text-5xl">🤫</p>
          <p className="mt-4 text-lg text-white">Kokonaistulokset julkaistaan gaalassa.</p>
          <p className="mt-2 text-sm text-slate-400">Kauden aikana seurataan vain All-Stars-pisteitä. Sarjataulukko-, pistemies- ja kategoriaveikkaukset pysyvät salassa loppuun asti.</p>
          {isAdmin && <p className="mt-4 text-xs text-ice-300">Ylläpitäjänä voit harjoitella gaalaesitystä – muut eivät näe tuloksia ennen julkaisua.</p>}
        </div></Card>
      ) : <ResultsView data={data as Results} />}
      {gala && <GalaReveal onClose={() => setGala(false)} onPublish={!data.published ? async () => { await publish(); setGala(false); } : undefined} />}
    </>
  );
}
