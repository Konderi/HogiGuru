import { useMemo, useState } from 'react';
import { fmt, matchName, POS_PLURAL, type Position } from '../api';
import { useApi } from '../auth';
import { Avatar, Empty, Modal, ReservedBadge, Spinner, type SearchHit } from '../ui';
import { InjuryIcon } from '../pages/Stats';

interface Row {
  id: number; name: string; team: string; picture?: string | null; injured?: boolean;
  games?: number; goals?: number; assists?: number; wins?: number; savePct?: number | null;
  team_points?: number | null; hg: number; reserved: number; max?: number;
}
type SortKey = 'hg' | 'points' | 'games' | 'name';

/**
 * Selattava pelaajalista vaihtoa varten: saman pelipaikan pelaajat tilastoineen,
 * järjestys ja suodatus, klikkaus valitsee.
 */
export function PlayerBrowser({ open, pos, exclude, onPick, onClose }: {
  open: boolean; pos: Position; exclude: number[]; onPick: (h: SearchHit) => void; onClose: () => void;
}) {
  const players = useApi<{ maxPicks: number; players: Row[] }>(open && pos !== 'C' ? `/stats?pos=${pos}` : null, [open, pos]);
  const coaches = useApi<Row[]>(open && pos === 'C' ? '/coaches' : null, [open, pos]);
  const [q, setQ] = useState('');
  const [onlyFree, setOnlyFree] = useState(true);
  const [sort, setSort] = useState<SortKey>('hg');
  const loading = pos === 'C' ? coaches.loading && !coaches.data : players.loading && !players.data;
  const maxDefault = players.data?.maxPicks ?? 5;

  const rows = useMemo(() => {
    const src = (pos === 'C' ? coaches.data : players.data?.players) ?? [];
    const pts = (r: Row) => (pos === 'C' ? r.team_points ?? 0 : pos === 'G' ? r.wins ?? 0 : (r.goals ?? 0) + (r.assists ?? 0));
    return src
      .filter((r) => !exclude.includes(r.id))
      .filter((r) => matchName(`${r.name} ${r.team}`, q))
      .filter((r) => !onlyFree || r.reserved < (r.max ?? maxDefault))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'fi')
        : sort === 'points' ? pts(b) - pts(a) || b.hg - a.hg
        : sort === 'games' ? (b.games ?? 0) - (a.games ?? 0) || b.hg - a.hg
        : b.hg - a.hg);
  }, [pos, coaches.data, players.data, exclude, q, onlyFree, sort, maxDefault]);

  const ptsLabel = pos === 'C' ? 'Joukkueen P' : pos === 'G' ? 'Voitot' : 'Pisteet';
  const sorts: [SortKey, string][] = pos === 'C' ? [['hg', 'HG'], ['points', ptsLabel], ['name', 'Nimi']] : [['hg', 'HG'], ['points', ptsLabel], ['games', 'Ottelut'], ['name', 'Nimi']];

  return (
    <Modal open={open} onClose={onClose} title={`Valitse tulija – ${POS_PLURAL[pos].toLowerCase()}`} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" autoComplete="off" autoCorrect="off" spellCheck={false} className="input w-full sm:w-56" placeholder="Rajaa nimellä tai joukkueella…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="accent-ice-400" /> Vain vapaat
          </label>
          <div className="flex gap-1 text-xs">
            <span className="self-center text-slate-500">Järjestys:</span>
            {sorts.map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className={`rounded-full px-2.5 py-1 font-semibold ${sort === k ? 'bg-ice-500 text-rink-950' : 'bg-white/5 text-slate-300 hover:text-white'}`}>{l}</button>
            ))}
          </div>
        </div>
        {loading ? <Spinner /> : !rows.length ? <Empty>Ei pelaajia näillä rajauksilla.</Empty> : (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-white/8">
            <table className="table">
              <thead className="sticky top-0 bg-rink-900">
                <tr>
                  <th>{pos === 'C' ? 'Valmentaja' : 'Pelaaja'}</th>
                  {pos !== 'C' && <th className="num">O</th>}
                  <th className="num">{pos === 'C' ? 'JP' : pos === 'G' ? 'V' : 'P'}</th>
                  {pos === 'G' && <th className="num">Torj-%</th>}
                  {pos !== 'C' && pos !== 'G' && <th className="num">M+S</th>}
                  <th className="num">Varattu</th><th className="num">HG</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-ice-500/10" title="Valitse tulijaksi"
                    onClick={() => onPick({ id: r.id, name: r.name, team: r.team, picture: r.picture, reserved: r.reserved, max: r.max ?? maxDefault, hg: r.hg })}>
                    <td className="min-w-[10rem]">
                      <span className="flex items-center gap-2.5">
                        {pos !== 'C' && <Avatar src={r.picture} name={r.name} size="h-7 w-7" />}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-semibold text-white">{r.name}{r.injured && <InjuryIcon className="h-3.5 w-3.5" />}</span>
                          <span className="text-xs text-slate-400">{r.team}</span>
                        </span>
                      </span>
                    </td>
                    {pos !== 'C' && <td className="num">{r.games ?? 0}</td>}
                    <td className="num font-semibold text-white">{pos === 'C' ? r.team_points ?? 0 : pos === 'G' ? r.wins ?? 0 : (r.goals ?? 0) + (r.assists ?? 0)}</td>
                    {pos === 'G' && <td className="num">{r.savePct != null ? fmt(r.savePct) : '–'}</td>}
                    {pos !== 'C' && pos !== 'G' && <td className="num text-slate-400">{r.goals ?? 0}+{r.assists ?? 0}</td>}
                    <td className="num"><ReservedBadge n={r.reserved} max={r.max ?? maxDefault} /></td>
                    <td className="num scoreboard">{fmt(r.hg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">Klikkaa pelaajaa lisätäksesi hänet tulijaksi. Voit lisätä useita varavaihtoehtoja.</p>
      </div>
    </Modal>
  );
}
