import { useEffect } from 'react';
import { POS_SHORT, POSITIONS, type Position } from '../api';
import { useApi } from '../auth';
import { Card, Empty, PageHeader, PosBadge, Spinner } from '../ui';

export interface DraftState {
  status: 'setup' | 'live' | 'done'; snake: boolean; roster: Record<Position, number>; maxPicks: Record<Position, number>;
  total: number; pickNo: number; round: number;
  onClock: { id: number; name: string; remote_draft: number } | null;
  gurus: { id: number; name: string; draft_number: number | null; remote_draft: number }[];
  hasPrefs: number[];
  picks: { id: number; pick_no: number; guru_id: number; position: Position; entity_id: number; name: string; team: string | null; auto: number }[];
  pool: { position: Position; entity_id: number; name: string; team: string | null; used: number }[];
}

/** Draft-taulu: gurut riveinä, valinnat soluina. Päivittyy automaattisesti livenä. */
export function DraftGrid({ st }: { st: DraftState }) {
  const perGuru = Object.values(st.roster).reduce((a, b) => a + b, 0);
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th className="w-10">#</th><th>Guru</th>{Array.from({ length: perGuru }, (_, i) => <th key={i} className="text-center">K{i + 1}</th>)}</tr></thead>
        <tbody>
          {st.gurus.map((g) => {
            const mine = st.picks.filter((p) => p.guru_id === g.id);
            const onClock = st.onClock?.id === g.id && st.status === 'live';
            return (
              <tr key={g.id} className={onClock ? 'bg-ice-500/10' : ''}>
                <td className="font-display text-slate-400">{g.draft_number ?? '–'}</td>
                <td className="whitespace-nowrap font-semibold text-white">
                  {onClock && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-goal" />}
                  {g.name}{g.remote_draft ? <span className="chip ml-2 bg-white/5 text-slate-400">etä</span> : null}
                </td>
                {Array.from({ length: perGuru }, (_, i) => {
                  const p = mine[i];
                  return (
                    <td key={i} className="min-w-32">
                      {p ? <span className="flex items-center gap-1.5 text-xs"><PosBadge pos={p.position} /><span className="truncate text-white">{p.name}</span>{p.auto ? <span title="Ennakkolistalta">⚙︎</span> : null}</span> : <span className="text-slate-700">·</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function DraftBoard() {
  const { data: st, loading, reload } = useApi<DraftState>('/draft');
  useEffect(() => {
    if (st?.status !== 'live') return;
    const t = setInterval(reload, 4000); return () => clearInterval(t);
  }, [st?.status, reload]);
  if (loading && !st) return <Spinner />;
  if (!st) return null;
  const last = st.picks[st.picks.length - 1];

  return (
    <>
      <PageHeader kicker={st.status === 'live' ? '● Live' : st.status === 'done' ? 'Valmis' : 'Tulossa'} title="Draft">
        {st.status === 'live' && st.onClock && (
          <div className="card flex items-center gap-4 px-5 py-3">
            <div><p className="label">Vuorossa · valinta {st.pickNo}/{st.total}</p><p className="font-display text-2xl text-white">{st.onClock.name}</p></div>
            {last && <div className="border-l border-white/10 pl-4"><p className="label">Edellinen</p><p className="text-sm text-white">{last.name}</p></div>}
          </div>
        )}
      </PageHeader>
      {st.status === 'setup' && (
        <p className="mb-6 text-sm text-slate-400">
          Kentällinen: {POSITIONS.map((p) => `${st.roster[p]} ${POS_SHORT[p]}`).join(' · ')}. Sama pelaaja voi olla valittuna enintään: {POSITIONS.map((p) => `${POS_SHORT[p]} ${st.maxPicks[p]}`).join(' · ')} kertaa.
          {' '}Jos et pääse paikalle, tee ennakkolista Oma joukkue -sivulla.
        </p>
      )}
      <Card>{st.gurus.length ? <DraftGrid st={st} /> : <Empty>Draftin osallistujia ei ole vielä lisätty.</Empty>}</Card>
    </>
  );
}
