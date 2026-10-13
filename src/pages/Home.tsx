import { Link } from 'react-router';
import { fmt, fmtDate, fmtDateTime, type LeaderRow } from '../api';
import { useApi } from '../auth';
import { Card, Countdown, Empty, ErrorBox, RankBadge, RankDelta, Spinner } from '../ui';
import { StandingsTable, type StandingRow } from './Standings';
import { fmtDeadline, type RegInfo } from './Register';

interface Overview {
  season: { name: string; draftStatus: string };
  leaderboard: LeaderRow[];
  nextSwap: { date: string; note: string | null; start_time?: string; end_time?: string } | null;
  lastSync: { finished_at: string; message: string } | null;
  standings: StandingRow[];
  registration: RegInfo;
}

export default function Home() {
  const { data, error, loading } = useApi<Overview>('/public/overview');
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorBox error={error} />;
  const top3 = data.leaderboard.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <div className="space-y-10">
      {data.registration?.open && (
        <Link to="/ilmoittaudu" className="group flex flex-wrap items-center gap-4 rounded-2xl border border-goal/40 bg-gradient-to-r from-goal/20 via-goal/10 to-transparent px-6 py-5 transition hover:border-goal/70 animate-in">
          <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-goal opacity-70" /><span className="relative inline-flex h-3 w-3 rounded-full bg-goal" /></span>
          <div className="flex-1">
            <p className="font-display text-2xl tracking-wide text-white">Ilmoittautuminen kaudelle {data.season.name} on auki!</p>
            <p className="text-sm text-slate-300">
              {data.registration.deadline && <>Viimeistään {fmtDeadline(data.registration.deadline)}. </>}
              {data.registration.fee && <>Osallistumismaksu {data.registration.fee}.</>}
            </p>
          </div>
          <span className="btn btn-primary group-hover:translate-x-0.5">Ilmoittaudu →</span>
        </Link>
      )}
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-rink-800 via-rink-850 to-rink-950 px-6 py-12 sm:px-12 sm:py-16 animate-in">
        <div className="rink-lines pointer-events-none absolute inset-0 opacity-60" />
        <div className="ice-sheen pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full border-[6px] border-goal/15" />
        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-ice-400">Kausi {data.season.name}</p>
            <h1 className="text-5xl leading-[0.95] sm:text-7xl">HogiGuru<br /><span className="bg-gradient-to-r from-ice-200 to-ice-500 bg-clip-text text-transparent">Liiga</span><br />veikkaus</h1>
            <p className="mt-5 max-w-md text-slate-300">Veikkaa runkosarjan lopputulos, joukkueiden parhaat pistemiehet ja pörssien voittajat, draftaa oma All-Stars-kentällisesi ja nouse Gurujen kärkeen.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/leaderboard" className="btn btn-primary">Koko leaderboard</Link>
              <Link to="/tilastot" className="btn btn-ghost">Pelaajatilastot</Link>
            </div>
          </div>
          {/* Podium */}
          <div className="flex items-end justify-center gap-3">
            {podiumOrder.map((g) => {
              const h = g.rank === 1 ? 'h-44' : g.rank === 2 ? 'h-32' : 'h-24';
              const c = g.rank === 1 ? 'from-gold/30 border-gold/50' : g.rank === 2 ? 'from-silver/20 border-silver/40' : 'from-bronze/25 border-bronze/40';
              return (
                <div key={g.id} className="flex w-1/3 max-w-36 flex-col items-center text-center">
                  <span className="mb-2 text-3xl">{g.rank === 1 ? '🏆' : g.rank === 2 ? '🥈' : '🥉'}</span>
                  <p className="text-sm font-semibold leading-tight text-white">{g.name}</p>
                  <p className="scoreboard mb-2 text-xl">{fmt(g.points)}</p>
                  <div className={`${h} w-full rounded-t-xl border border-b-0 bg-gradient-to-b to-transparent ${c} flex items-start justify-center pt-3 font-display text-3xl text-white/80`}>{g.rank}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top 10 */}
        <Card title="Top 10 Gurut" action={<Link to="/leaderboard" className="text-sm font-semibold text-ice-400 hover:text-ice-300">Kaikki →</Link>} className="lg:col-span-2">
          {data.leaderboard.length === 0 ? <Empty>Kausi ei ole vielä alkanut.</Empty> : (
            <table className="table">
              <tbody>
                {data.leaderboard.slice(0, 10).map((g) => (
                  <tr key={g.id}>
                    <td className="w-12"><RankBadge rank={g.rank} /></td>
                    <td className="font-semibold text-white">{g.name}</td>
                    <td className="w-14 text-center"><RankDelta rank={g.rank} prev={g.prevRank} /></td>
                    <td className="num scoreboard text-base">{fmt(g.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Seuraava vaihtopäivä">
            <div className="p-5">
              {data.nextSwap ? (
                <>
                  <p className="mb-4 font-display text-2xl text-white">{fmtDate(data.nextSwap.date)}{data.nextSwap.start_time && <span className="ml-2 font-mono text-base text-ice-300">klo {data.nextSwap.start_time}–{data.nextSwap.end_time}</span>}</p>
                  <Countdown date={`${data.nextSwap.date}T${data.nextSwap.start_time ?? '00:00'}:00`} />
                  {data.nextSwap.note && <p className="mt-4 text-sm text-slate-400">{data.nextSwap.note}</p>}
                </>
              ) : <p className="text-sm text-slate-400">Vaihtopäiviä ei ole vielä julkaistu.</p>}
            </div>
          </Card>
          <Card title="Tilastot päivitetty">
            <div className="p-5 text-sm">
              <p className="scoreboard text-xl">{fmtDateTime(data.lastSync?.finished_at)}</p>
              <p className="mt-1 text-slate-400">{data.lastSync?.message ?? 'Ei vielä päivityksiä'}</p>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Liigan sarjataulukko" action={<Link to="/sarjataulukko" className="text-sm font-semibold text-ice-400 hover:text-ice-300">Koko taulukko →</Link>}>
        <StandingsTable rows={data.standings} compact />
      </Card>
    </div>
  );
}
