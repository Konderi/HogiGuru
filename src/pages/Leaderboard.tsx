import { useMemo, useState } from 'react';
import { fmt, matchName, type LeaderRow } from '../api';
import { useApi, useAuth } from '../auth';
import { Card, Empty, ErrorBox, PageHeader, RankBadge, RankDelta, Spinner } from '../ui';
import { GuruTeamModal } from '../components/GuruTeamModal';

export default function Leaderboard() {
  const [open, setOpen] = useState<{ id: number; name: string } | null>(null);
  const { data, error, loading } = useApi<LeaderRow[]>('/leaderboard');
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const rows = useMemo(() => (data ?? []).filter((r) => matchName(r.name, q)), [data, q]);
  const leader = data?.[0]?.points ?? 0;

  return (
    <>
      <PageHeader kicker="HogiGuru" title="Pistetilanne">
        <input className="input max-w-xs" placeholder="Etsi gurua…" value={q} onChange={(e) => setQ(e.target.value)} />
      </PageHeader>
      <ErrorBox error={error} />
      <Card>
        {loading && !data ? <Spinner /> : rows.length === 0 ? <Empty>Ei tuloksia.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th className="w-14">#</th><th>Guru</th><th className="w-16 text-center">Muutos</th><th className="hidden w-1/3 sm:table-cell" /><th className="num">Ero</th><th className="num">Pisteet</th></tr></thead>
              <tbody>
                {rows.map((g) => {
                  const mine = me?.guru?.id === g.id;
                  const pct = leader > 0 ? Math.max(4, (g.points / leader) * 100) : 0;
                  return (
                    <tr key={g.id} className={`cursor-pointer ${mine ? 'bg-ice-500/8' : ''}`} title="Näytä kentällinen" onClick={() => setOpen({ id: g.id, name: g.name })}>
                      <td><RankBadge rank={g.rank} /></td>
                      <td className="font-semibold text-white underline-offset-2 hover:underline">{g.name}{mine && <span className="chip ml-2 bg-ice-500/20 text-ice-300">Sinä</span>}</td>
                      <td className="text-center"><RankDelta rank={g.rank} prev={g.prevRank} /></td>
                      <td className="hidden sm:table-cell">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-ice-500 to-ice-300" style={{ width: `${pct}%` }} /></div>
                      </td>
                      <td className="num text-slate-500">{g.rank === 1 ? '–' : `−${fmt(leader - g.points)}`}</td>
                      <td className="num scoreboard text-base">{fmt(g.points)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <GuruTeamModal guru={open} onClose={() => setOpen(null)} />
    </>
  );
}
