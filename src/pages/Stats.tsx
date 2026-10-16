import { useMemo, useState } from 'react';
import { fmt, matchName, POS_PLURAL, type Position } from '../api';
import { useApi } from '../auth';
import { Avatar, Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';
import PlayerCard, { type CardSeed } from '../components/PlayerCard';

interface PlayerStat {
  id: number; name: string; team: string; picture: string | null; games: number; goals: number; assists: number; pim: number;
  plusMinus: number; shutouts: number; saves: number; goalsAgainst: number; wins: number; savePct: number | null; hg: number; reserved: number;
}
interface CoachStat { id: number; name: string; team: string; logo: string | null; team_points: number | null; hg: number; reserved: number; fired: number }
type SortKey = 'name' | 'games' | 'goals' | 'assists' | 'points' | 'plusMinus' | 'pim' | 'wins' | 'saves' | 'goalsAgainst' | 'savePct' | 'shutouts' | 'reserved' | 'hg';

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
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'hg', desc: true });
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'goalsAgainst' && key !== 'name' }));

  const rows = useMemo(() => {
    const val = (p: PlayerStat): number | string => (sort.key === 'points' ? p.goals + p.assists : sort.key === 'savePct' ? p.savePct ?? -1 : p[sort.key]);
    return (players.data?.players ?? [])
      .filter((p) => matchName(`${p.name} ${p.team}`, q))
      .filter((p) => !onlyFree || p.reserved < max)
      .sort((a, b) => {
        const x = val(a), y = val(b);
        const c = typeof x === 'string' ? x.localeCompare(String(y), 'fi') : x - (y as number);
        return (sort.desc ? -c : c) || b.hg - a.hg;
      });
  }, [players.data, q, onlyFree, max, sort]);

  // Haku muista pelipaikoista: vihje, jos pelaaja löytyy toiselta välilehdeltä (esim. puolustaja)
  const searching = q.trim().length >= 2;
  const allF = useApi<{ players: PlayerStat[] }>(searching && pos !== 'F' ? '/stats?pos=F' : null, [searching && pos !== 'F']);
  const allD = useApi<{ players: PlayerStat[] }>(searching && pos !== 'D' ? '/stats?pos=D' : null, [searching && pos !== 'D']);
  const allG = useApi<{ players: PlayerStat[] }>(searching && pos !== 'G' ? '/stats?pos=G' : null, [searching && pos !== 'G']);
  const elsewhere = !searching ? [] : ([['F', allF.data], ['D', allD.data], ['G', allG.data]] as const)
    .filter(([p]) => p !== pos)
    .map(([p, d]) => ({ pos: p as Position, n: (d?.players ?? []).filter((x) => matchName(`${x.name} ${x.team}`, q)).length }))
    .filter((x) => x.n > 0);

  const Th = ({ k, children, title }: { k: SortKey; children: React.ReactNode; title?: string }) => (
    <th className={`num cursor-pointer select-none whitespace-nowrap hover:text-white ${sort.key === k ? 'text-ice-300' : ''}`} title={title ?? 'Järjestä'} onClick={() => sortBy(k)}>
      {children}{sort.key === k ? (sort.desc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <>
      <PageHeader kicker="HG-pisteet & varaustilanne" title="Tilastot">
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" className="input w-full sm:w-56" placeholder="Hae pelaajaa tai joukkuetta…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="accent-ice-400" /> Vain vapaat
          </label>
        </div>
      </PageHeader>

      <div className="mb-5 flex gap-1 rounded-2xl border border-white/8 bg-rink-850/60 p-1 sm:inline-flex">
        {(['F', 'D', 'G', 'C'] as Position[]).map((p) => (
          <button key={p} onClick={() => setPos(p)}
            className={`flex-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold uppercase tracking-wide transition sm:px-4 sm:text-sm sm:tracking-wider ${pos === p ? 'bg-ice-500 text-rink-950' : 'text-slate-400 hover:text-white'}`}>
            {POS_PLURAL[p]}
          </button>
        ))}
      </div>

      <ErrorBox error={players.error ?? coaches.error} />
      {elsewhere.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-ice-400/20 bg-ice-500/[0.06] px-4 py-2.5 text-sm text-slate-300">
          Hakusanalla löytyy myös:
          {elsewhere.map((e) => (
            <button key={e.pos} className="rounded-full bg-ice-500/15 px-3 py-1 font-semibold text-ice-200 hover:bg-ice-500/25" onClick={() => setPos(e.pos)}>
              {POS_PLURAL[e.pos]} ({e.n}) →
            </button>
          ))}
        </div>
      )}
      <Card>
        {pos === 'C' ? (
          coaches.loading && !coaches.data ? <Spinner /> : !coaches.data?.length ? <Empty>Valmentajia ei ole vielä lisätty.</Empty> : (
            <table className="table">
              <thead><tr><th>Valmentaja</th><th>Joukkue</th><th className="num">Joukkueen P</th><th className="num">Varattu</th><th className="num">HG</th></tr></thead>
              <tbody>
                {coaches.data.filter((c) => matchName(`${c.name} ${c.team}`, q)).sort((a, b) => b.hg - a.hg).map((c) => (
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
                  <th className="w-10">#</th>
                  <th className={`cursor-pointer select-none hover:text-white ${sort.key === 'name' ? 'text-ice-300' : ''}`} onClick={() => sortBy('name')}>Pelaaja{sort.key === 'name' ? (sort.desc ? ' ▼' : ' ▲') : ''}</th>
                  <Th k="games" title="Ottelut">O</Th>
                  {pos === 'G'
                    ? <><Th k="wins" title="Voitot">V</Th><Th k="saves" title="Torjunnat">Torj.</Th><Th k="goalsAgainst" title="Päästetyt maalit">PM</Th><Th k="savePct" title="Torjuntaprosentti">Torj-%</Th><Th k="shutouts" title="Nollapelit">NP</Th></>
                    : <><Th k="goals" title="Maalit">M</Th><Th k="assists" title="Syötöt">S</Th><Th k="points" title="Pisteet (M+S)">P</Th><Th k="plusMinus" title="Plus/miinus">+/−</Th><Th k="pim" title="Jäähyminuutit">J</Th></>}
                  <Th k="reserved" title="Varaukset">Varattu</Th><Th k="hg" title="HG-pisteet">HG</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((p, i) => (
                  <tr key={p.id} className="cursor-pointer" title="Avaa pelaajakortti"
                    onClick={() => setCard({ id: p.id, name: p.name, team: p.team, picture: p.picture, hg: p.hg, reserved: p.reserved, max, goalie: pos === 'G' })}>
                    <td className="font-display text-slate-500">{i + 1}</td>
                    <td className="min-w-[11rem]">
                      <span className="flex items-center gap-3">
                        <Avatar src={p.picture} name={p.name} />
                        <span className="min-w-0"><span className="block font-semibold text-white underline-offset-2 hover:underline">{p.name}</span><span className="text-xs text-slate-400">{p.team}</span></span>
                      </span>
                    </td>
                    <td className="num">{p.games}</td>
                    {pos === 'G'
                      ? <><td className="num">{p.wins}</td><td className="num">{p.saves}</td><td className="num">{p.goalsAgainst}</td><td className="num">{p.savePct != null ? fmt(p.savePct) : '–'}</td><td className="num">{p.shutouts}</td></>
                      : <><td className="num">{p.goals}</td><td className="num">{p.assists}</td><td className="num font-semibold text-white">{p.goals + p.assists}</td><td className={`num ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-goal' : ''}`}>{p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}</td><td className="num">{p.pim}</td></>}
                    <td className="num"><Reserved n={p.reserved} max={max} /></td>
                    <td className="num scoreboard">{fmt(p.hg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-slate-500">Klikkaa sarakkeen otsikkoa järjestääksesi (uudelleen klikkaus kääntää suunnan). Klikkaa pelaajaa avataksesi pelaajakortin. Varattu = kuinka monen gurun kentällisessä pelaaja on nyt (max {max}). Punainen = täynnä, ei voi valita vaihdossa.</p>
      <PlayerCard seed={card} onClose={() => setCard(null)} />
    </>
  );
}
