import { useEffect, useState } from 'react';
import { api, POS_LABEL, POS_PLURAL, POSITIONS, type Position } from '../api';
import { Avatar, ErrorBox, PosBadge } from '../ui';

export interface PoolItem { position: Position; entity_id: number; name: string; team: string | null; picture?: string | null; used: number }
interface Prefs { positionOrder: Position[]; rankings: Partial<Record<Position, number[]>>; updatedAt: string | null }

/** Etädraftaajan ennakkolista: paikkajärjestys + toivelistat paikoittain. */
export function DraftPrefsEditor({ endpoint, pool, roster, readOnly }: {
  endpoint: string; pool: PoolItem[]; roster: Record<Position, number>; readOnly?: boolean;
}) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [tab, setTab] = useState<Position>('F');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Prefs>(endpoint).then((p) => setPrefs(p ?? { positionOrder: [], rankings: {}, updatedAt: null })).catch((e) => setError(e.message)); }, [endpoint]);
  if (!prefs) return <ErrorBox error={error} />;

  const total = Object.values(roster).reduce((a, b) => a + b, 0);
  const count = (p: Position) => prefs.positionOrder.filter((x) => x === p).length;
  const byId = (p: Position, id: number) => pool.find((x) => x.position === p && x.entity_id === id);
  const ranking = prefs.rankings[tab] ?? [];
  const update = (p: Partial<Prefs>) => { setPrefs({ ...prefs, ...p }); setMsg(null); };
  const setRanking = (ids: number[]) => update({ rankings: { ...prefs.rankings, [tab]: ids } });
  const move = (i: number, d: number) => { const a = [...ranking]; [a[i], a[i + d]] = [a[i + d], a[i]]; setRanking(a); };

  async function save() {
    setError(null);
    try { await api(endpoint, { method: 'PUT', body: prefs }); setMsg('Tallennettu ✓'); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="label">1. Valintajärjestys paikoittain ({prefs.positionOrder.length}/{total})</p>
        <p className="mb-3 text-sm text-slate-400">Esim. H, MV, P, V, H, P, H – missä järjestyksessä haluat täyttää kentällisesi.</p>
        <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-dashed border-white/10 p-2">
          {prefs.positionOrder.map((p, i) => (
            <button key={i} disabled={readOnly} onClick={() => update({ positionOrder: prefs.positionOrder.filter((_, j) => j !== i) })}
              className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-sm hover:bg-goal/20" title="Poista">
              <span className="text-xs text-slate-500">{i + 1}.</span><PosBadge pos={p} />
            </button>
          ))}
          {!prefs.positionOrder.length && <span className="px-2 text-sm text-slate-500">Lisää paikkoja alta</span>}
        </div>
        {!readOnly && (
          <div className="mt-3 flex flex-wrap gap-2">
            {POSITIONS.map((p) => (
              <button key={p} className="btn btn-ghost py-1.5" disabled={count(p) >= roster[p]} onClick={() => update({ positionOrder: [...prefs.positionOrder, p] })}>
                + {POS_LABEL[p]} <span className="text-xs text-slate-500">{count(p)}/{roster[p]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="label">2. Toivelista paikoittain</p>
        <p className="mb-3 text-sm text-slate-400">Jos ensimmäinen toive on jo varattu maksimimäärän, valitaan listalta seuraava. Lisää reilusti vaihtoehtoja.</p>
        <div className="mb-3 flex flex-wrap gap-1">
          {POSITIONS.map((p) => (
            <button key={p} onClick={() => setTab(p)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === p ? 'bg-ice-500 text-rink-950' : 'bg-white/5 text-slate-300'}`}>
              {POS_PLURAL[p]} <span className="opacity-60">({(prefs.rankings[p] ?? []).length})</span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ol className="space-y-1">
            {ranking.map((id, i) => {
              const it = byId(tab, id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                  <span className="w-6 text-center font-display text-slate-500">{i + 1}</span>
                  <Avatar src={it?.picture} name={it?.name ?? '?'} size="h-6 w-6" />
                  <span className="flex-1 text-sm text-white">{it?.name ?? `#${id}`}<span className="ml-2 text-xs text-slate-500">{it?.team}</span></span>
                  {!readOnly && <>
                    <button className="px-1 text-slate-400 hover:text-white disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                    <button className="px-1 text-slate-400 hover:text-white disabled:opacity-20" disabled={i === ranking.length - 1} onClick={() => move(i, 1)}>▼</button>
                    <button className="px-1 text-slate-400 hover:text-goal" onClick={() => setRanking(ranking.filter((x) => x !== id))}>✕</button>
                  </>}
                </li>
              );
            })}
            {!ranking.length && <li className="text-sm text-slate-500">Ei toiveita.</li>}
          </ol>
          {!readOnly && (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-white/8">
              {pool.filter((p) => p.position === tab && !ranking.includes(p.entity_id)).map((p) => (
                <button key={p.entity_id} onClick={() => setRanking([...ranking, p.entity_id])} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-ice-500/10">
                  <span className="text-ice-400">+</span><span className="flex-1 text-white">{p.name}</span><span className="text-xs text-slate-500">{p.team}</span>
                </button>
              ))}
              {!pool.some((p) => p.position === tab) && <p className="p-4 text-sm text-slate-500">Ylläpito ei ole vielä julkaissut draft-listaa.</p>}
            </div>
          )}
        </div>
      </div>

      <ErrorBox error={error} />
      {!readOnly && (
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={save}>Tallenna ennakkolista</button>
          {msg && <span className="text-sm text-emerald-400">{msg}</span>}
        </div>
      )}
    </div>
  );
}
