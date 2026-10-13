import { useMemo, useState } from 'react';
import { fmt, POS_PLURAL, type Position } from '../api';
import { useApi } from '../auth';
import { Avatar, Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';
import PlayerCard, { type CardSeed } from '../components/PlayerCard';

interface PlayerStat {
  id: number; name: string; team: string; picture: string | null; games: number; goals: number; assists: number; pim: number;
  plusMinus: number; shutouts: number; saves: number; goalsAgainst: number; wins: number; savePct: number | null; hg: number; reserved: number;
}
interface CoachStat { id: number; name: string; team: string; logo: string | null; team_points: number | null; hg: number; reserved: number; fired: number }

function Reserved({ n, max }: { n: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`Varattu ${n}/${max}`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={`h-2 w-2 rounded-full ${i < n ? (n >= max ? 'bg-goal' : 'bg-ice-400') : 'bg-white/10'}`} />)}
    </span>
  );
}

export default function Stats() {
  const [pos, setPos] = useState<Position>('F');
  const [q, setQ] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);
  const players = useApi<{ maxPicks: number; players: PlayerStat[] }>(pos === 'C' ? null : `/stats?pos=${pos}`, [pos]);
  const coaches = useApi<CoachStat[]>(pos === 'C' ? '/coaches' : null, [pos]);
  const max = players.data?.maxPicks ?? 5;
  const [card, setCard] = useState<CardSeed | null>(null);

  const rows = useMemo(() => (players.data?.players ?? [])
    .filter((p) => (p.name + p.team).toLowerCase().includes(q.toLowerCase()))
    .filter((p) => !onlyFree || p.reserved < max), [players.data, q, onlyFree, max]);

  return (
    <>
      <PageHeader kicker="HG-pisteet & varaustilanne" title="Tilastot">
        <div className="flex flex-wrap items-center gap-3">
          <input className="input w-56" placeholder="Hae pelaajaa tai joukkuetta…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="accent-ice-400" /> Vain vapaat
          </label>
        </div>
      </PageHeader>

      <div className="mb-5 flex gap-1 rounded-2xl border border-white/8 bg-rink-850/60 p-1 sm:inline-flex">
        {(['F', 'D', 'G', 'C'] as Position[]).map((p) => (
          <button key={p} onClick={() => setPos(p)}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-wider transition ${pos === p ? 'bg-ice-500 text-rink-950' : 'text-slate-400 hover:text-white'}`}>
            {POS_PLURAL[p]}
          </button>
        ))}
      </div>

      <ErrorBox error={players.error ?? coaches.error} />
      <Card>
        {pos === 'C' ? (
          coaches.loading && !coaches.data ? <Spinner /> : !coaches.data?.length ? <Empty>Valmentajia ei ole vielä lisätty.</Empty> : (
            <table className="table">
              <thead><tr><th>Valmentaja</th><th>Joukkue</th><th className="num">Joukkueen P</th><th className="num">Varattu</th><th className="num">HG</th></tr></thead>
              <tbody>
                {coaches.data.filter((c) => (c.name + c.team).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.hg - a.hg).map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold text-white">{c.name}{c.fired ? <span className="chip ml-2 bg-goal/20 text-red-300">Potkut</span> : null}</td>
                    <td><span className="flex items-center gap-2">{c.logo && <img src={c.logo} className="h-5 w-5" alt="" />}{c.team}</span></td>
                    <td className="num">{c.team_points ?? 0}</td>
                    <td className="num"><Reserved n={c.reserved} max={max} /></td>
                    <td className="num scoreboard">{fmt(c.hg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : players.loading && !players.data ? <Spinner /> : rows.length === 0 ? <Empty>Ei pelaajia.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">#</th><th>Pelaaja</th><th className="num">O</th>
                  {pos === 'G'
                    ? <><th className="num">V</th><th className="num">Torj.</th><th className="num">PM</th><th className="num">Torj-%</th><th className="num">NP</th></>
                    : <><th className="num">M</th><th className="num">S</th><th className="num">+/−</th><th className="num">J</th></>}
                  <th className="num">Varattu</th><th className="num">HG</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((p, i) => (
                  <tr key={p.id} className="cursor-pointer" title="Avaa pelaajakortti"
                    onClick={() => setCard({ id: p.id, name: p.name, team: p.team, picture: p.picture, hg: p.hg, reserved: p.reserved, max, goalie: pos === 'G' })}>
                    <td className="font-display text-slate-500">{i + 1}</td>
                    <td>
                      <span className="flex items-center gap-3">
                        <Avatar src={p.picture} name={p.name} />
                        <span><span className="block font-semibold text-white underline-offset-2 hover:underline">{p.name}</span><span className="text-xs text-slate-400">{p.team}</span></span>
                      </span>
                    </td>
                    <td className="num">{p.games}</td>
                    {pos === 'G'
                      ? <><td className="num">{p.wins}</td><td className="num">{p.saves}</td><td className="num">{p.goalsAgainst}</td><td className="num">{p.savePct != null ? fmt(p.savePct) : '–'}</td><td className="num">{p.shutouts}</td></>
                      : <><td className="num">{p.goals}</td><td className="num">{p.assists}</td><td className={`num ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-goal' : ''}`}>{p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}</td><td className="num">{p.pim}</td></>}
                    <td className="num"><Reserved n={p.reserved} max={max} /></td>
                    <td className="num scoreboard">{fmt(p.hg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-slate-500">Klikkaa pelaajaa avataksesi pelaajakortin. Varattu = kuinka monen gurun kentällisessä pelaaja on nyt (max {max}). Punainen = täynnä, ei voi valita vaihdossa.</p>
      <PlayerCard seed={card} onClose={() => setCard(null)} />
    </>
  );
}
