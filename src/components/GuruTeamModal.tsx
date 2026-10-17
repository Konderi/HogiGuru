import { fmt, POS_PLURAL, type Position, type Slot } from '../api';
import { useApi } from '../auth';
import { Avatar, ErrorBox, Modal, PosBadge, Spinner } from '../ui';

interface Resp { guru: { id: number; name: string }; slots: Slot[]; standing: { rank: number; points: number } | null }
const ORDER: Position[] = ['F', 'D', 'G', 'C'];

/** Gurun nykyinen kentällinen ponnahdusikkunassa (Leaderboard, etusivun Top 10). */
export function GuruTeamModal({ guru, onClose }: { guru: { id: number; name: string } | null; onClose: () => void }) {
  const { data, error, loading } = useApi<Resp>(guru ? `/gurus/${guru.id}/team` : null, [guru?.id]);
  if (!guru) return null;
  return (
    <Modal open onClose={onClose} title={guru.name}>
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : data && (
        <div className="space-y-4">
          {data.standing && (
            <div className="flex gap-3">
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-center">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Sijoitus</div>
                <div className="scoreboard text-2xl">{data.standing.rank}.</div>
              </div>
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-center">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">HG-pisteet</div>
                <div className="scoreboard text-2xl">{fmt(data.standing.points)}</div>
              </div>
            </div>
          )}
          {ORDER.map((p) => {
            const list = data.slots.filter((s) => s.position === p).sort((a, b) => b.value - a.value);
            if (!list.length) return null;
            return (
              <div key={p}>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{POS_PLURAL[p]}</h4>
                <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
                  {list.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                      <PosBadge pos={s.position} />
                      {p !== 'C' && <Avatar src={s.picture} name={s.name} size="h-7 w-7" />}
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{s.name}<span className="ml-2 text-xs text-slate-500">{s.team}</span></span>
                      <span className="scoreboard font-mono text-sm">{fmt(s.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!data.slots.length && <p className="text-sm text-slate-400">Kentällinen ei ole vielä valmis.</p>}
        </div>
      )}
    </Modal>
  );
}
