import { fmt } from '../api';
import { useApi } from '../auth';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';

interface Hof { id: number; season_name: string; rank: number; name: string; points: number | null; note: string | null }

export default function HallOfFame() {
  const { data, error, loading } = useApi<Hof[]>('/hall-of-fame');
  const seasons = [...new Set((data ?? []).map((r) => r.season_name))];
  const titles = new Map<string, number>();
  (data ?? []).filter((r) => r.rank === 1).forEach((r) => titles.set(r.name, (titles.get(r.name) ?? 0) + 1));
  const legends = [...titles.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader kicker="Legendat" title="Hall of Fame" />
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : !seasons.length ? <Card><Empty>Hall of Fame täyttyy pian – aiempien kausien tulokset ovat tulossa.</Empty></Card> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <Card title="Mestaruudet">
            <ul className="divide-y divide-white/5">
              {legends.map(([name, n], i) => (
                <li key={name} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-2xl">{i === 0 ? '👑' : '🏆'}</span>
                  <span className="flex-1 font-semibold text-white">{name}</span>
                  <span className="scoreboard text-lg">{n}×</span>
                </li>
              ))}
            </ul>
          </Card>
          <div className="grid gap-6 sm:grid-cols-2">
            {seasons.map((s) => (
              <Card key={s} title={s}>
                <ol className="divide-y divide-white/5">
                  {data!.filter((r) => r.season_name === s).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-6 text-center text-xl">{['🥇', '🥈', '🥉'][r.rank - 1] ?? r.rank}</span>
                      <span className="flex-1"><span className="font-semibold text-white">{r.name}</span>{r.note && <span className="block text-xs text-slate-400">{r.note}</span>}</span>
                      {r.points != null && <span className="scoreboard">{fmt(r.points)}</span>}
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
