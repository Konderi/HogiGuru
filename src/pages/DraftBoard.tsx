import { useEffect } from 'react';
import { POS_SHORT, POSITIONS, type Position } from '../api';
import { useApi } from '../auth';
import { Card, Empty, PageHeader, PosBadge, Spinner } from '../ui';

export interface DraftState {
  status: 'setup' | 'live' | 'done'; snake: boolean; roster: Record<Position, number>; maxPicks: Record<Position, number>;
  total: number; pickNo: number; round: number;
  onClock: { id: number; name: string; remote_draft: number } | null;
  gurus: { id: number; name: string; draft_number: number | null; remote_draft: number; lottery_order?: number | null }[];
  hasPrefs: number[];
  picks: { id: number; pick_no: number; guru_id: number; position: Position; entity_id: number; name: string; team: string | null; auto: number }[];
  pool: { position: Position; entity_id: number; name: string; team: string | null; used: number }[];
  lottery: { at: number; now: number; step: number; reveal: number; order: { id: number; name: string; draft_number: number | null }[] } | null;
}

/** Draft-taulu: gurut riveinä, kierrokset sarakkeina. Numero ja nimi pysyvät näkyvissä vieritettäessä;
 *  compact-tila mahduttaa kaikki kierrokset kerralla ruudulle (heijastettava näkymä). */
export function DraftGrid({ st, compact = false }: { st: DraftState; compact?: boolean }) {
  const perGuru = Object.values(st.roster).reduce((a, b) => a + b, 0);
  const stick = 'sticky z-10 bg-rink-900';
  return (
    <div className={compact ? '' : 'overflow-x-auto'}>
      <table className={`w-full border-separate border-spacing-0 ${compact ? 'table-fixed text-[clamp(10px,0.85vw,16px)]' : 'text-sm'}`}>
        <thead>
          <tr className="text-xs uppercase tracking-wider text-slate-400">
            <th className={`${stick} left-0 w-10 px-2 py-2 text-left`}>#</th>
            <th className={`${stick} left-10 px-2 py-2 text-left ${compact ? 'w-[12%]' : 'min-w-36'} border-r border-white/10`}>Guru</th>
            {Array.from({ length: perGuru }, (_, i) => <th key={i} className="px-1.5 py-2 text-center">K{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {st.gurus.map((g) => {
            const mine = st.picks.filter((p) => p.guru_id === g.id);
            const onClock = st.onClock?.id === g.id && st.status === 'live';
            const rowBg = onClock ? 'bg-[#0b2a45]' : 'bg-rink-900';
            return (
              <tr key={g.id} className={onClock ? 'outline outline-2 -outline-offset-2 outline-ice-400' : ''}>
                <td className={`sticky left-0 z-10 ${rowBg} border-t border-white/5 px-2 py-1.5 font-display text-slate-400`}>{g.draft_number ?? '–'}</td>
                <td className={`sticky left-10 z-10 ${rowBg} truncate whitespace-nowrap border-r border-t border-white/10 px-2 py-1.5 font-semibold text-white`}>
                  {onClock && <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-goal" />}
                  {g.name}{g.remote_draft ? <span className="ml-1.5 text-[0.75em] font-normal text-slate-500" title="Ei paikalla – valinnat lomakkeelta">📋</span> : null}
                </td>
                {Array.from({ length: perGuru }, (_, i) => {
                  const p = mine[i];
                  return (
                    <td key={i} className={`border-t border-white/5 px-1.5 py-1.5 ${compact ? '' : 'min-w-32'} ${onClock && i === mine.length ? 'bg-ice-500/20' : ''}`}>
                      {p ? <span className="flex min-w-0 items-center gap-1"><PosBadge pos={p.position} /><span className="truncate text-white">{p.name}</span>{p.auto ? <span className="text-slate-500" title="Draft-lomakkeelta">⚙︎</span> : null}</span>
                        : <span className="text-slate-700">·</span>}
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
          {' '}Jos et pääse paikalle, täytä draft-lomake Oma joukkue -sivulla – vuorollasi valinta tehdään sen perusteella.
        </p>
      )}
      {st.lottery && <p className="mb-4 text-sm text-ice-300">🎲 Draft-numeroiden arvonta on käynnissä…</p>}
      <Card>{st.gurus.length ? <DraftGrid st={st} /> : <Empty>Draftin osallistujia ei ole vielä lisätty.</Empty>}</Card>
    </>
  );
}
