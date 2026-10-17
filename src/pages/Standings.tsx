import { useApi } from '../auth';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';

export interface StandingRow {
  team_id: string; name: string; logo: string | null; ranking: number; games: number; wins: number; ot_wins: number;
  ot_losses: number; losses: number; points: number; goals_for: number; goals_against: number;
}

export function StandingsTable({ rows, compact }: { rows: StandingRow[]; compact?: boolean }) {
  if (!rows.length) return <Empty>Sarjataulukkoa ei ole vielä haettu.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th className="w-10">#</th><th>Joukkue</th><th className="num">O</th>
            {!compact && <><th className="num">3P</th><th className="num">2P</th><th className="num">1P</th><th className="num">0P</th></>}
            <th className="num">TM–PM</th><th className="num">ME</th><th className="num">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const zone = t.ranking <= 6 ? 'border-l-ice-400' : t.ranking <= 10 ? 'border-l-ice-400/40' : t.ranking > rows.length - 3 ? 'border-l-goal' : 'border-l-transparent';
            const diff = t.goals_for - t.goals_against;
            return (
              <tr key={t.team_id}>
                <td className={`border-l-2 font-display text-slate-400 ${zone}`}>{t.ranking}</td>
                <td>
                  <span className="flex items-center gap-3 font-semibold text-white">
                    {t.logo ? <img src={t.logo} alt="" className="h-7 w-7 object-contain" /> : <span className="h-7 w-7" />}
                    {t.name}
                  </span>
                </td>
                <td className="num">{t.games}</td>
                {!compact && <><td className="num">{t.wins}</td><td className="num">{t.ot_wins}</td><td className="num">{t.ot_losses}</td><td className="num">{t.losses}</td></>}
                <td className="num text-slate-400">{t.goals_for}–{t.goals_against}</td>
                <td className={`num ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-goal' : ''}`}>{diff > 0 ? `+${diff}` : diff}</td>
                <td className="num scoreboard text-base">{t.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Standings() {
  const { data, error, loading } = useApi<StandingRow[]>('/standings');
  return (
    <>
      <PageHeader kicker="Liiga · runkosarja" title="Sarjataulukko" />
      <ErrorBox error={error} />
      <Card>{loading && !data ? <Spinner /> : <StandingsTable rows={data ?? []} />}</Card>
      <p className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 bg-ice-400" />Suoraan puolivälieriin</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-ice-400/40" />Säälipudotuspelit</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-goal" />Putoavat (3 alinta)</span>
      </p>
    </>
  );
}
