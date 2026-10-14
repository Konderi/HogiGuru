import { useEffect, useMemo, useState } from 'react';
import { matchName, POS_LABEL, POS_PLURAL, POSITIONS, type Position } from '../api';
import { useApi } from '../auth';
import { DraftGrid, type DraftState } from '../pages/DraftBoard';
import { Card, Empty, EntityPicker, PageHeader, PosBadge, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';
import { useCoachOptions } from './Gurus';

export default function Draft() {
  const { data: st, reload } = useApi<DraftState>('/draft');
  const { run } = useAdmin();
  const coaches = useCoachOptions();
  const [pos, setPos] = useState<Position>('F');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (st?.status !== 'live') return;
    const t = setInterval(reload, 5000); return () => clearInterval(t);
  }, [st?.status, reload]);

  const mine = useMemo(() => st?.picks.filter((p) => p.guru_id === st.onClock?.id) ?? [], [st]);
  if (!st) return <Spinner />;

  const act = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); await run(fn, ok); setBusy(false); reload(); };
  const left = (p: Position) => st.roster[p] - mine.filter((x) => x.position === p).length;
  const pool = st.pool.filter((p) => p.position === pos && matchName(`${p.name} ${p.team ?? ''}`, q));
  const statusLabel = { setup: 'Valmistelu', live: 'Käynnissä', done: 'Viety kentällisiin' }[st.status];

  return (
    <>
      <PageHeader kicker={`Draft · ${statusLabel}`} title="Draft-tilaisuus">
        <div className="flex flex-wrap gap-2">
          {st.status === 'setup' && <>
            <button className="btn btn-ghost" disabled={busy} onClick={() => confirm('Arvotaanko draft-numerot kaikille guruille uudelleen?') && act(() => api('/admin/draft/shuffle', { method: 'POST' }), 'Järjestys arvottu')}>🎲 Arvo järjestys</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api('/admin/draft/status', { body: { status: 'live' } }), 'Draft käynnistetty!')}>▶ Aloita draft</button>
          </>}
          {st.status === 'live' && <>
            <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api('/admin/draft/status', { body: { status: 'setup' } }), 'Draft keskeytetty')}>⏸ Keskeytä</button>
            <button className="btn btn-primary" disabled={busy || st.picks.length < st.total} onClick={() => confirm('Viedäänkö valinnat kentällisiin? Tätä ei voi perua.') && act(() => api('/admin/draft/finalize', { method: 'POST' }), 'Kentälliset luotu!')}>✓ Vie kentällisiin</button>
          </>}
        </div>
      </PageHeader>

      {st.status === 'live' && st.onClock && (
        <section className="relative mb-6 overflow-hidden rounded-3xl border border-ice-400/30 bg-gradient-to-r from-ice-500/15 via-rink-850 to-goal/10 p-6 animate-in">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="label">Kierros {st.round} · valinta {st.pickNo}/{st.total}</p>
              <p className="font-display text-4xl text-white">{st.onClock.name}</p>
              <p className="mt-1 flex flex-wrap gap-2 text-sm text-slate-300">
                {POSITIONS.map((p) => <span key={p} className={left(p) ? '' : 'opacity-30'}><PosBadge pos={p} /> {left(p)}</span>)}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {(st.onClock.remote_draft || st.hasPrefs.includes(st.onClock.id)) ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api('/admin/draft/auto', { method: 'POST' }), 'Valittu ennakkolistalta')}>⚙ Valitse ennakkolistalta</button>
              ) : null}
              <button className="btn btn-ghost" disabled={busy || !st.picks.length} onClick={() => act(() => api('/admin/draft/undo', { method: 'POST' }), 'Edellinen valinta peruttu')}>↶ Peru edellinen</button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Card title={st.status === 'live' ? 'Valitse' : 'Draft-lista'}>
          <div className="grid grid-cols-4 gap-1 p-3">
            {POSITIONS.map((p) => (
              <button key={p} title={POS_PLURAL[p]} onClick={() => setPos(p)} className={`min-w-0 rounded-lg px-1 py-1.5 text-xs font-semibold ${pos === p ? 'bg-ice-500 text-rink-950' : 'bg-white/5 text-slate-400 hover:text-white'}`}>
                <span className="block">{p === 'C' ? 'V' : p === 'F' ? 'H' : p === 'D' ? 'P' : 'MV'} · {st.pool.filter((x) => x.position === p).length}</span>
                <span className="block truncate text-[10px] font-normal opacity-70">{POS_PLURAL[p]}</span>
              </button>
            ))}
          </div>
          {st.status === 'setup' && (
            <div className="border-y border-white/5 p-3">
              <p className="mb-2 text-xs text-slate-400">Lisää {POS_LABEL[pos].toLowerCase()} listalle:</p>
              <EntityPicker pos={pos} options={pos === 'C' ? coaches : undefined}
                onPick={(h) => act(() => api('/admin/draft/pool', { body: { position: pos, ids: [h.id] } }))} />
            </div>
          )}
          <div className="p-3"><input className="input" placeholder="Suodata…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ul className="max-h-[55vh] overflow-y-auto">
            {pool.map((p) => {
              const full = p.used >= st.maxPicks[p.position];
              const owned = mine.some((m) => m.position === p.position && m.entity_id === p.entity_id);
              const disabled = st.status !== 'live' || full || owned || left(pos) <= 0 || busy;
              return (
                <li key={p.entity_id} className="flex items-center gap-2 border-t border-white/5 px-4 py-2">
                  <span className={`flex-1 text-sm ${full ? 'text-slate-600 line-through' : 'text-white'}`}>{p.name} <span className="text-xs text-slate-500">{p.team}</span></span>
                  <span className={`font-mono text-xs ${full ? 'text-goal' : 'text-slate-400'}`}>{p.used}/{st.maxPicks[p.position]}</span>
                  {st.status === 'live' && <button className="btn btn-primary px-3 py-1 text-xs" disabled={disabled}
                    onClick={() => act(() => api('/admin/draft/pick', { body: { position: p.position, entity_id: p.entity_id } }), `${st.onClock?.name}: ${p.name}`)}>Valitse</button>}
                  {st.status === 'setup' && <button className="px-1 text-slate-500 hover:text-goal" onClick={() => act(() => api(`/admin/draft/pool/${p.position}/${p.entity_id}`, { method: 'DELETE' }))}>✕</button>}
                </li>
              );
            })}
            {!pool.length && <li><Empty>Lista on tyhjä.</Empty></li>}
          </ul>
        </Card>

        <Card title="Draft-taulu">
          {st.gurus.length ? <div className="overflow-x-auto"><DraftGrid st={st} /></div> : <Empty>Lisää gurut ensin (Gurut & kentälliset).</Empty>}
          {st.status === 'setup' && st.gurus.length > 0 && (
            <p className="border-t border-white/5 px-5 py-3 text-xs text-slate-400">
              Ennakkolista tehty: {st.hasPrefs.length}/{st.gurus.length}. Etäosallistujat merkitään gurun asetuksista; heidän vuorollaan valinta tehdään ennakkolistalta.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
