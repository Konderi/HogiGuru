import { useApi } from '../auth';
import ResultsView, { type Results } from '../components/ResultsView';
import { Card, ErrorBox, PageHeader, Spinner } from '../ui';

export default function ResultsPage() {
  const { data, error } = useApi<Results | { published: false; season: string }>('/results');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader kicker={`Kausi ${data.season}`} title="Kokonaistulokset" />
      {!data.published ? (
        <Card><div className="p-10 text-center">
          <p className="text-5xl">🤫</p>
          <p className="mt-4 text-lg text-white">Kokonaistulokset julkaistaan gaalassa.</p>
          <p className="mt-2 text-sm text-slate-400">Kauden aikana seurataan vain All-Stars-pisteitä. Sarjataulukko-, pistemies- ja kategoriaveikkaukset pysyvät salassa loppuun asti.</p>
        </div></Card>
      ) : <ResultsView data={data as Results} />}
    </>
  );
}
