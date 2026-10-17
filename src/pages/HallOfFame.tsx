import { useMemo, useState } from 'react';
import { fmt, matchName } from '../api';
import { useApi } from '../auth';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';
import CherryTrophy from '../components/CherryTrophy';

interface Hof { id: number; season_name: string; rank: number; name: string; points: number | null; note: string | null }
interface Marathon { name: string; seasons: number; titles: number; medals: number; best: number; points: number; years: string[]; history: Hof[] }

const MEDAL = ['🥇', '🥈', '🥉'];
/** Kauden sijoitus: voittaja pokaalilla */
const PLACE = ['🏆', '🥈', '🥉'];
const short = (s: string) => `${s.slice(2, 4)}–${s.slice(-2)}`;

export default function HallOfFame() {
  const { data, error, loading } = useApi<Hof[]>('/hall-of-fame');
  const [tab, setTab] = useState<'marathon' | 'seasons'>('marathon');
  const [q, setQ] = useState('');
  const [openSeason, setOpenSeason] = useState<string | null>(null);
  const [openGuru, setOpenGuru] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [allChamps, setAllChamps] = useState(false);
  const [allCherry, setAllCherry] = useState(false);

  const { seasons, marathon, champions, venues, sizes, cherry, cherryCount } = useMemo(() => {
    const rows = data ?? [];
    const seasons = [...new Set(rows.map((r) => r.season_name))].sort().reverse();
    const venues = new Map<string, string>();
    const sizes = new Map<string, number>();
    const m = new Map<string, Marathon>();
    for (const r of rows) {
      if (r.note) venues.set(r.season_name, r.note);
      sizes.set(r.season_name, (sizes.get(r.season_name) ?? 0) + 1);
      const x = m.get(r.name) ?? { name: r.name, seasons: 0, titles: 0, medals: 0, best: 999, points: 0, years: [], history: [] };
      x.seasons++; x.points += r.points ?? 0; x.best = Math.min(x.best, r.rank); x.history.push(r);
      if (r.rank === 1) { x.titles++; x.years.push(r.season_name); }
      if (r.rank <= 3) x.medals++;
      m.set(r.name, x);
    }
    const marathon = [...m.values()].sort((a, b) => b.points - a.points);
    marathon.forEach((x) => x.history.sort((a, b) => b.season_name.localeCompare(a.season_name)));
    const champions = marathon.filter((x) => x.titles).sort((a, b) => b.titles - a.titles || b.points - a.points);
    // Ed Cherry Trophy: kauden viimeinen (Play-Offs-kaudet eivät mukana, niissä vain Top 3)
    const cherry = seasons.filter((s) => !s.includes('Play-Offs')).map((s) => {
      const rs = rows.filter((r) => r.season_name === s && r.note !== 'Play-Offs');
      const max = Math.max(...rs.map((r) => r.rank));
      return { season: s, size: rs.length, winners: rs.filter((r) => r.rank === max) };
    }).filter((x) => x.size > 3);
    const cherryCount = new Map<string, number>();
    for (const c of cherry) for (const w of c.winners) cherryCount.set(w.name, (cherryCount.get(w.name) ?? 0) + 1);
    return { seasons, marathon, champions, venues, sizes, cherry, cherryCount };
  }, [data]);

  const rankOf = new Map(marathon.map((x, i) => [x.name, i + 1]));
  const filtered = marathon.filter((x) => matchName(x.name, q));
  const shown = q || showAll ? filtered : filtered.slice(0, 20);
  const champsShown = allChamps ? champions : champions.slice(0, 6);

  return (
    <>
      <PageHeader kicker={seasons.length ? `${seasons.length} kautta · ${marathon.length} gurua` : 'Legendat'} title="Hall of Fame" />
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : !seasons.length ? <Card><Empty>Hall of Fame täyttyy pian – aiempien kausien tulokset ovat tulossa.</Empty></Card> : (
        <div className="space-y-6">
          {/* Mestarit */}
          <Card title="Mestarit" action={<span className="text-xs text-slate-400">{champions.length} eri mestaria</span>}>
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {champsShown.map((c, i) => (
                <div key={c.name} className={`rounded-2xl border px-4 py-3 ${i === 0 ? 'border-amber-400/40 bg-amber-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{i === 0 ? '👑' : '🏆'}</span>
                    <span className="flex-1 font-semibold text-white">{c.name}</span>
                    <span className="scoreboard">{c.titles}×</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 pl-8 text-xs text-slate-400">
                    {c.years.sort().reverse().map((y) => <li key={y}><span className="font-mono text-slate-300">{y}</span>{venues.get(y) && <> · {venues.get(y)}</>}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            {champions.length > 6 && (
              <button onClick={() => setAllChamps(!allChamps)} className="w-full border-t border-white/5 py-2.5 text-xs font-semibold text-ice-300 hover:bg-white/[0.03]">
                {allChamps ? 'Näytä vähemmän' : `Näytä kaikki ${champions.length} mestaria`}
              </button>
            )}
          </Card>

          {/* Ed Cherry Trophy – sisäpiirin kunniamaininta kauden viimeiselle */}
          {cherry.length > 0 && (
            <Card title="Ed Cherry Trophy" action={<span className="text-xs text-slate-400">Kauden viimeinen guru</span>}>
              <div className="grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-3">
                {(allCherry ? cherry : cherry.slice(0, 6)).map((c) => (
                  <div key={c.season} className="flex items-center gap-3 rounded-xl border border-rose-400/15 bg-rose-500/[0.06] px-4 py-2.5">
                    <CherryTrophy className="h-9 w-9 shrink-0" />
                    <span className="w-20 font-mono text-xs text-slate-400">{c.season}</span>
                    <span className="flex-1 text-sm text-white">
                      {c.winners.map((w) => <span key={w.id} className="block">{w.name}{(cherryCount.get(w.name) ?? 0) > 1 && <span className="ml-1 text-xs text-rose-300">({cherryCount.get(w.name)}×)</span>}</span>)}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{c.winners[0]?.rank}/{c.size}</span>
                  </div>
                ))}
              </div>
              {cherry.length > 6 && (
                <button onClick={() => setAllCherry(!allCherry)} className="w-full border-t border-white/5 py-2.5 text-xs font-semibold text-ice-300 hover:bg-white/[0.03]">
                  {allCherry ? 'Näytä vähemmän' : `Näytä kaikki ${cherry.length} kautta`}
                </button>
              )}
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-2xl border border-white/8 bg-rink-850/60 p-1">
              {([['marathon', 'Maratontaulukko'], ['seasons', 'Kausittain']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold uppercase tracking-wide sm:flex-none sm:px-4 sm:text-sm sm:tracking-wider transition ${tab === k ? 'bg-ice-500 text-rink-950' : 'text-slate-400 hover:text-white'}`}>{l}</button>
              ))}
            </div>
            {tab === 'marathon' && <input type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" className="input max-w-xs" placeholder="Hae gurua…" value={q} onChange={(e) => setQ(e.target.value)} />}
          </div>

          {tab === 'marathon' ? (
            <Card>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th className="w-10">#</th><th>Guru</th><th className="num">Kaudet</th><th className="num" title="Mestaruudet">🏆</th><th className="num">Mitalit</th><th className="num">Paras</th><th className="num">Maratonpisteet</th></tr></thead>
                  <tbody>
                    {shown.map((x) => {
                      const r = rankOf.get(x.name)!;
                      const open = openGuru === x.name;
                      return [
                        <tr key={x.name} onClick={() => setOpenGuru(open ? null : x.name)} className="cursor-pointer">
                          <td className="font-display text-slate-400">{PLACE[r - 1] ?? r}</td>
                          <td className="font-semibold text-white"><span className={`mr-2 inline-block text-xs text-slate-500 transition ${open ? 'rotate-90' : ''}`}>▶</span>{x.name}</td>
                          <td className="num">{x.seasons}</td>
                          <td className="num">{x.titles || '–'}</td>
                          <td className="num">{x.medals || '–'}</td>
                          <td className="num">{x.best}.</td>
                          <td className="num scoreboard">{fmt(x.points)}</td>
                        </tr>,
                        open && (
                          <tr key={x.name + '-h'}>
                            <td colSpan={7} className="bg-white/[0.02]">
                              <div className="grid gap-x-6 gap-y-1 py-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                {x.history.map((h) => (
                                  <div key={h.id} className="flex items-center gap-2">
                                    <span className="w-12 font-mono text-slate-400">{short(h.season_name)}</span>
                                    <span className="w-8 text-right">{PLACE[h.rank - 1] ?? <span className="text-slate-300">{h.rank}.</span>}</span>
                                    <span className="text-slate-500">/ {sizes.get(h.season_name)}</span>
                                    <span className="ml-auto font-mono text-slate-400">{fmt(h.points ?? 0)} p</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              {!q && filtered.length > 20 && (
                <button onClick={() => setShowAll(!showAll)} className="w-full border-t border-white/5 py-2.5 text-xs font-semibold text-ice-300 hover:bg-white/[0.03]">
                  {showAll ? 'Näytä Top 20' : `Näytä kaikki ${filtered.length} gurua`}
                </button>
              )}
              <p className="border-t border-white/5 px-5 py-3 text-xs text-slate-500">Avaa rivi nähdäksesi gurun kaikki kaudet. Maratonpisteet kaudelta = (osallistujat + 1 − sija) / osallistujat × 100.</p>
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-white/5">
                {seasons.map((s) => {
                  const rows = data!.filter((r) => r.season_name === s).sort((a, b) => a.rank - b.rank);
                  const open = openSeason === s;
                  return (
                    <li key={s}>
                      <button onClick={() => setOpenSeason(open ? null : s)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-white/[0.03]">
                        <span className={`text-xs text-slate-500 transition ${open ? 'rotate-90' : ''}`}>▶</span>
                        <span className="w-24 font-display text-lg text-white">{s}</span>
                        <span className="w-48 text-xs text-slate-400">🎉 {venues.get(s) ?? '–'}</span>
                        <span className="flex flex-1 flex-wrap gap-x-4 text-sm">
                          {rows.slice(0, 3).map((r) => <span key={r.id} className={r.rank === 1 ? 'font-semibold text-white' : 'text-slate-300'}>{PLACE[r.rank - 1]} {r.name}</span>)}
                        </span>
                        <span className="text-xs text-slate-500">{rows.length} gurua</span>
                      </button>
                      {open && (
                        <ol className="grid gap-x-6 gap-y-1 bg-white/[0.02] px-5 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          {rows.map((r) => (
                            <li key={r.id} className="flex items-center gap-2">
                              <span className="w-7 text-right">{PLACE[r.rank - 1] ?? <span className="font-mono text-xs text-slate-500">{r.rank}.</span>}</span>
                              <span className={r.rank <= 3 ? 'font-semibold text-white' : 'text-slate-300'}>{r.name}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
