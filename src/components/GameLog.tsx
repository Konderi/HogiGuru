import { fmt, fmtDate, type Slot } from '../api';
import { useApi } from '../auth';
import { Empty, Spinner } from '../ui';

interface Game {
  game_id: number; date: string; opponent: string | null; home: number; hg: number;
  goals?: number; assists?: number; pim?: number; plus_minus?: number; saves?: number; goals_against?: number; shutout?: number; win?: number;
  gf?: number; ga?: number; points?: number;
}

/** Ottelukohtainen HG-erittely: pylväskaavio + taulukko. Kentällisessä olon ulkopuoliset ottelut himmennetään. */
type LogSlot = Pick<Slot, 'entity_id' | 'position'> & Partial<Pick<Slot, 'start_date' | 'end_date'>>;

/** Ilman start_date-arvoa kaikki ottelut näytetään täysinä (esim. Tilastot-sivun pelaajakortti). */
export default function GameLog({ slot }: { slot: LogSlot }) {
  const { data } = useApi<Game[]>(`/game-log/${slot.entity_id}?pos=${slot.position}`, [slot.entity_id, slot.position]);
  if (!data) return <Spinner />;
  if (!data.length) return <Empty>Ottelukohtaisia tilastoja ei vielä ole – ne päivittyvät ottelujen jälkeen.</Empty>;
  const all = !slot.start_date;
  const inTeam = (d: string) => all || (d >= slot.start_date! && (!slot.end_date || d < slot.end_date));
  const mine = data.filter((g) => inTeam(g.date));
  const max = Math.max(1, ...data.map((g) => Math.abs(g.hg)));
  const best = mine.length ? Math.max(...mine.map((g) => g.hg)) : 0;
  const sum = mine.reduce((a, g) => a + g.hg, 0);
  const pos = slot.position;
  const W = 600, H = 160, mid = data.some((g) => g.hg < 0) ? H * 0.7 : H - 4, bw = W / data.length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-white/5 p-3"><p className="label">Otteluita</p><p className="scoreboard text-2xl">{mine.length}</p></div>
        <div className="rounded-xl bg-white/5 p-3"><p className="label">Keskiarvo</p><p className="scoreboard text-2xl">{fmt(mine.length ? sum / mine.length : 0, 2)}</p></div>
        <div className="rounded-xl bg-white/5 p-3"><p className="label">Paras ottelu</p><p className="scoreboard text-2xl">{fmt(best)}</p></div>
      </div>

      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none">
          <line x1="0" x2={W} y1={mid} y2={mid} stroke="currentColor" className="text-white/20" />
          {data.map((g, i) => {
            const h = (Math.abs(g.hg) / max) * (g.hg >= 0 ? mid - 6 : H - mid - 4);
            return (
              <rect key={g.game_id} x={i * bw + bw * 0.15} width={bw * 0.7} y={g.hg >= 0 ? mid - h : mid} height={Math.max(h, 1)} rx={Math.min(3, bw * 0.2)}
                className={g.hg >= 0 ? 'fill-ice-400' : 'fill-goal'} opacity={inTeam(g.date) ? 1 : 0.25}>
                <title>{`${fmtDate(g.date)} ${g.home ? 'vs' : '@'} ${g.opponent ?? ''}: ${fmt(g.hg)} HG`}</title>
              </rect>
            );
          })}
        </svg>
        {!all && <p className="mt-1 text-xs text-slate-500">Himmeät pylväät = ottelut, joissa pelaaja ei ollut kentällisessäsi.</p>}
      </div>

      <div className="max-h-72 overflow-y-auto">
        <table className="table">
          <thead><tr><th>Pvm</th><th>Vastustaja</th>
            {pos === 'C' ? <><th className="num">Tulos</th><th className="num">Sarjap.</th></>
              : pos === 'G' ? <><th className="num">Torj.</th><th className="num">Päästetyt</th><th className="num">NP</th></>
              : <><th className="num">M</th><th className="num">S</th><th className="num">+/−</th><th className="num">J</th></>}
            <th className="num">HG</th></tr></thead>
          <tbody>
            {[...data].reverse().map((g) => (
              <tr key={g.game_id} className={inTeam(g.date) ? '' : 'opacity-40'}>
                <td className="whitespace-nowrap text-xs text-slate-400">{fmtDate(g.date)}</td>
                <td className="text-white">{g.home ? '' : '@ '}{g.opponent}</td>
                {pos === 'C' ? <><td className="num">{g.gf}–{g.ga}</td><td className="num">{g.points}</td></>
                  : pos === 'G' ? <><td className="num">{g.saves}</td><td className="num">{g.goals_against}</td><td className="num">{g.shutout ? '✓' : ''}</td></>
                  : <><td className="num">{g.goals}</td><td className="num">{g.assists}</td><td className="num">{(g.plus_minus ?? 0) > 0 ? '+' : ''}{g.plus_minus}</td><td className="num">{g.pim}</td></>}
                <td className={`num scoreboard ${g.hg < 0 ? '!text-goal' : ''}`}>{fmt(g.hg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
