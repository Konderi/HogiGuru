import { fmt, type Position } from '../api';
import { useApi } from '../auth';
import GameLog from './GameLog';
import { Avatar, ErrorBox, Modal, Spinner } from '../ui';

interface Hist { season: number; team: string; games: number; goals: number; assists: number; points: number; pim: number; plusMinus: number; saves: number; savePct: number; gaa: number; shutouts: number; gkWins: number }
interface Info {
  id: number; name: string; dateOfBirth: string | null; height: number | null; weight: number | null; handedness: string | null;
  nationality: string | null; birthplace: string | null; team: string | null; jersey: number | null; position: string | null; picture: string | null; history: Hist[];
}
/** Tilastot-sivulta välitettävät tämän kauden HG-tiedot */
export interface CardSeed { id: number; name: string; team: string | null; picture: string | null; hg: number; reserved: number; max: number; goalie: boolean; position?: Position }

const POS: Record<string, string> = { H: 'Hyökkääjä', VL: 'Vasen laitahyökkääjä', OL: 'Oikea laitahyökkääjä', KH: 'Keskushyökkääjä', P: 'Puolustaja', MV: 'Maalivahti' };
const age = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 31557600000);
const season = (y: number) => `${y - 1}–${String(y).slice(2)}`;

export default function PlayerCard({ seed, onClose }: { seed: CardSeed | null; onClose: () => void }) {
  const { data, error, loading } = useApi<Info>(seed ? `/players/${seed.id}/info` : null, [seed?.id]);
  if (!seed) return null;
  const g = seed.goalie;
  const facts: [string, string | null][] = data ? [
    ['Pelipaikka', data.position ? POS[data.position] ?? data.position : null],
    ['Numero', data.jersey != null ? `#${data.jersey}` : null],
    ['Ikä', data.dateOfBirth ? `${age(data.dateOfBirth)} v (${new Date(data.dateOfBirth).toLocaleDateString('fi-FI')})` : null],
    ['Kansallisuus', data.nationality],
    ['Syntymäpaikka', data.birthplace],
    ['Pituus / paino', data.height ? `${data.height} cm${data.weight ? ` / ${data.weight} kg` : ''}` : null],
    ['Kätisyys', data.handedness === 'L' ? 'Vasen' : data.handedness === 'R' ? 'Oikea' : null],
  ] : [];
  const totals = data?.history.reduce((a, h) => ({ games: a.games + h.games, goals: a.goals + h.goals, assists: a.assists + h.assists, points: a.points + h.points, shutouts: a.shutouts + h.shutouts }), { games: 0, goals: 0, assists: 0, points: 0, shutouts: 0 });

  return (
    <Modal open onClose={onClose} title="Pelaajakortti" wide>
      <div className="flex flex-wrap items-center gap-5">
        <Avatar src={data?.picture ?? seed.picture} name={seed.name} size="h-24 w-24" />
        <div className="flex-1">
          <h3 className="font-display text-3xl uppercase text-white">{seed.name}</h3>
          <p className="text-slate-400">{data?.team ?? seed.team}{data?.jersey != null && ` · #${data.jersey}`}</p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">HG-pisteet</div>
            <div className="scoreboard text-2xl">{fmt(seed.hg)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Varattu</div>
            <div className={`font-mono text-2xl font-bold ${seed.reserved >= seed.max ? 'text-goal' : 'text-white'}`}>{seed.reserved}/{seed.max}</div>
          </div>
        </div>
      </div>

      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : data && (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt><dd className="text-white">{v}</dd></div>
            ))}
          </dl>

          <h4 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tämä kausi · ottelukohtaiset tilastot ja HG-pisteet</h4>
          <GameLog slot={{ entity_id: seed.id, position: seed.position ?? (g ? 'G' : 'F') }} />

          <h4 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Liiga-ura · runkosarja</h4>
          {!data.history.length ? <p className="text-sm text-slate-500">Ei Liiga-otteluita.</p> : (
            <div className="max-h-72 overflow-auto rounded-xl border border-white/5">
              <table className="table">
                <thead className="sticky top-0 bg-rink-900">
                  <tr><th>Kausi</th><th>Joukkue</th><th className="num">O</th>
                    {g ? <><th className="num">V</th><th className="num">Torj-%</th><th className="num">PMK</th><th className="num">NP</th></>
                       : <><th className="num">M</th><th className="num">S</th><th className="num">P</th><th className="num">+/−</th><th className="num">J</th></>}
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={`${h.season}-${h.team}`}>
                      <td className="font-mono text-slate-300">{season(h.season)}</td>
                      <td className="text-slate-300">{h.team}</td>
                      <td className="num">{h.games}</td>
                      {g ? <><td className="num">{h.gkWins}</td><td className="num">{fmt(h.savePct)}</td><td className="num">{fmt(h.gaa)}</td><td className="num">{h.shutouts}</td></>
                         : <><td className="num">{h.goals}</td><td className="num">{h.assists}</td><td className="num font-semibold text-white">{h.points}</td>
                             <td className={`num ${h.plusMinus > 0 ? 'text-emerald-400' : h.plusMinus < 0 ? 'text-goal' : ''}`}>{h.plusMinus > 0 ? `+${h.plusMinus}` : h.plusMinus}</td><td className="num">{h.pim}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totals && data.history.length > 1 && (
            <p className="mt-2 text-xs text-slate-400">Yhteensä {data.history.length} kautta, {totals.games} ottelua{g ? `, ${totals.shutouts} nollapeliä` : `, ${totals.goals}+${totals.assists}=${totals.points}`}</p>
          )}
          <p className="mt-4 text-[11px] text-slate-500">Lähde: liiga.fi</p>
        </>
      )}
    </Modal>
  );
}
