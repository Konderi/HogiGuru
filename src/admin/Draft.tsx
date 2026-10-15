import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { matchName, POS_LABEL, POS_PLURAL, POSITIONS, type Position } from '../api';
import { useApi, useAuth } from '../auth';
import { DraftGrid, type DraftState } from '../pages/DraftBoard';
import { Card, Empty, EntityPicker, PageHeader, PosBadge, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';
import { useCoachOptions } from './Gurus';

export default function Draft() {
  const { data: st, reload } = useApi<DraftState>('/draft');
  const { run } = useAdmin();
  const { me, refresh } = useAuth();
  const coaches = useCoachOptions();
  const [pos, setPos] = useState<Position>('F');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (st?.status !== 'live' && !st?.lottery) return;
    const t = setInterval(reload, 5000); return () => clearInterval(t);
  }, [st?.status, st?.lottery, reload]);

  const mine = useMemo(() => st?.picks.filter((p) => p.guru_id === st.onClock?.id) ?? [], [st]);
  if (!st) return <Spinner />;

  const act = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); await run(fn, ok); setBusy(false); reload(); };
  const left = (p: Position) => st.roster[p] - mine.filter((x) => x.position === p).length;
  const pool = st.pool.filter((p) => p.position === pos && matchName(`${p.name} ${p.team ?? ''}`, q));
  const statusLabel = { setup: 'Valmistelu', live: 'Käynnissä', done: 'Viety kentällisiin' }[st.status];
  const navOn = me?.draftNav !== false;
  const toggleNav = () => act(async () => { await api('/admin/season', { method: 'PUT', body: { draft_nav: !navOn } }); await refresh(); }, navOn ? 'Draft piilotettu yläpalkista' : 'Draft näkyy yläpalkissa');

  return (
    <>
      <PageHeader kicker={`Draft · ${statusLabel}`} title="Draft-tilaisuus">
        <div className="flex flex-wrap gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300" title="Näytetäänkö Draft-sivu käyttäjien yläpalkissa">
            <input type="checkbox" checked={navOn} disabled={busy} onChange={toggleNav} className="accent-ice-400" /> Näytä yläpalkissa
          </label>
          {st.status !== 'done' && <a className="btn btn-ghost" href="/draft/naytto" target="_blank" rel="noopener">📺 Seinänäkymä</a>}
          <Link className="btn btn-primary relative" to="/admin/draft/harjoitus" title="Harjoittele koko draft-tilaisuus – ei tallenna mitään">
            ▶ Aloita draft
            <span className="absolute -right-2 -top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rink-950">Harjoitus</span>
          </Link>
          {st.lottery && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api('/admin/draft/lottery', { body: { action: st.lottery?.paused ? 'resume' : 'pause' } }))}>
              {st.lottery.paused ? '▶ Jatka arvontaa' : '⏸ Tauko arvontaan'}
            </button>
          )}
          {st.status === 'setup' && <>
            <button className="btn btn-ghost" disabled={busy || !!st.lottery} onClick={() => confirm('Käynnistetäänkö draft-numeroiden arvonta? Numerot paljastetaan heijastettavassa näkymässä 10 s välein.') && act(() => api('/admin/draft/shuffle', { body: { animate: true } }), 'Arvonta käynnistyi – katso heijastettava näkymä')}>🎲 Arvo järjestys</button>
            <button className="btn btn-primary" disabled={busy || !!st.lottery} onClick={() => act(() => api('/admin/draft/status', { body: { status: 'live' } }), 'Draft käynnistetty!')}>▶ Aloita draft</button>
          </>}
          {st.status === 'live' && <>
            <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api('/admin/draft/status', { body: { status: 'setup' } }), 'Draft keskeytetty')}>⏸ Keskeytä</button>
          </>}
        </div>
      </PageHeader>

      {st.status === 'setup' && st.gurus.length > 0 && (
        <Card title="Vaihe 1 · Ketkä ovat paikalla?" className="mb-6"
          action={<div className="flex gap-2">
            <button className="btn btn-ghost px-3 py-1 text-xs" disabled={busy} onClick={() => act(() => api('/admin/draft/attendance', { body: { all: true, present: true } }))}>Kaikki paikalla</button>
            <button className="btn btn-ghost px-3 py-1 text-xs" disabled={busy} onClick={() => act(() => api('/admin/draft/attendance', { body: { all: true, present: false } }))}>Kukaan ei</button>
          </div>}>
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {st.gurus.map((g) => {
              const present = !g.remote_draft;
              const prefs = st.hasPrefs.includes(g.id);
              return (
                <button key={g.id} disabled={busy} onClick={() => act(() => api('/admin/draft/attendance', { body: { id: g.id, present: !present } }))}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${present ? 'border-ice-400/50 bg-ice-500/10' : 'border-white/10 bg-white/[0.02]'}`}>
                  <span className={`grid h-6 w-6 place-items-center rounded-md border text-sm ${present ? 'border-ice-400 bg-ice-500 text-rink-950' : 'border-white/20'}`}>{present ? '✓' : ''}</span>
                  <span className="flex-1 truncate font-semibold text-white">{g.name}</span>
                  <span className={`text-xs ${present ? 'text-ice-300' : prefs ? 'text-slate-400' : 'text-goal'}`}>
                    {present ? 'paikalla' : prefs ? '📋 lomake ok' : '⚠ lomake puuttuu'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="border-t border-white/5 px-5 py-3 text-xs text-slate-400">
            Paikalla olevat valitsevat vuorollaan vapaasti. Poissaolevien valinnat tehdään heidän draft-lomakkeeltaan, joten lomakkeen pitää olla täytetty ennen kuin draft voidaan aloittaa.
            {' '}Vaihe 2: arvo järjestys (🎲) ja näytä arvonta heijastettavassa näkymässä. Vaihe 3: ▶ Aloita draft.
          </p>
        </Card>
      )}
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

      {st.status === 'live' && st.picks.length >= st.total && <Review st={st} busy={busy} act={act} />}
      <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] [&>*]:min-w-0">
        <Card title={st.status === 'live' ? 'Valitse' : 'Draft-lista'} className="2xl:sticky 2xl:top-20">
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
          {st.gurus.length ? <div className="max-h-[70vh] overflow-auto"><DraftGrid st={st} /></div> : <Empty>Lisää gurut ensin (Gurut & kentälliset).</Empty>}
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

/** Vaihe 4: valinnat tarkistetaan ja tarvittaessa korjataan ennen kuin ne viedään kentällisiin. */
function Review({ st, busy, act }: { st: DraftState; busy: boolean; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [edit, setEdit] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const pick = st.picks.find((p) => p.pick_no === edit);
  const cands = pick ? st.pool.filter((p) => p.position === pick.position && p.entity_id !== pick.entity_id && matchName(`${p.name} ${p.team ?? ''}`, q)) : [];
  const owned = (id: number) => !!pick && st.picks.some((x) => x.guru_id === pick.guru_id && x.position === pick.position && x.entity_id === id);
  return (
    <Card title="Vaihe 4 · Tarkista ja hyväksy" className="mb-6"
      action={<button className="btn btn-primary" disabled={busy} onClick={() => confirm('Hyväksytäänkö valinnat ja julkaistaanko joukkueet guruille? Tätä ei voi perua.') && act(() => api('/admin/draft/finalize', { method: 'POST' }), 'Joukkueet julkaistu!')}>✓ Hyväksy ja julkaise joukkueet</button>}>
      <p className="px-5 pt-4 text-sm text-slate-300">Kaikki valinnat on tehty. Joukkueet eivät näy guruille ennen hyväksyntää. Jos huomaat virheen, klikkaa valintaa ja vaihda tilalle toinen saman pelipaikan nimi.</p>
      <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
        {st.gurus.map((g) => (
          <div key={g.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 font-semibold text-white">{g.name}</p>
            <div className="flex flex-wrap gap-1">
              {st.picks.filter((p) => p.guru_id === g.id).sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position)).map((p) => (
                <button key={p.pick_no} onClick={() => { setEdit(edit === p.pick_no ? null : p.pick_no); setQ(''); }}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${edit === p.pick_no ? 'bg-amber-400/30 ring-1 ring-amber-300' : 'bg-white/5 hover:bg-white/10'}`}>
                  <PosBadge pos={p.position} />{p.name}
                </button>
              ))}
            </div>
            {pick?.guru_id === g.id && (
              <div className="mt-3 rounded-lg border border-amber-400/30 p-2">
                <p className="mb-1 text-xs text-amber-300">Vaihda {pick.name} (valinta #{pick.pick_no}) →</p>
                <input className="input" autoFocus placeholder="Hae…" value={q} onChange={(e) => setQ(e.target.value)} />
                <ul className="mt-1">
                  {cands.slice(0, 6).map((c) => {
                    const full = c.used >= st.maxPicks[c.position];
                    const dis = busy || full || owned(c.entity_id);
                    return (
                      <li key={c.entity_id} className="flex items-center gap-2 border-t border-white/5 py-1 text-sm">
                        <span className={`flex-1 truncate ${dis ? 'text-slate-600' : 'text-white'}`}>{c.name} <span className="text-xs text-slate-500">{c.team}</span></span>
                        <span className="font-mono text-xs text-slate-400">{c.used}/{st.maxPicks[c.position]}</span>
                        <button className="btn btn-primary px-2 py-0.5 text-xs" disabled={dis}
                          onClick={() => act(() => api(`/admin/draft/pick/${pick.pick_no}`, { method: 'PUT', body: { entity_id: c.entity_id } }), `${g.name}: ${pick.name} → ${c.name}`).then(() => setEdit(null))}>Vaihda</button>
                      </li>
                    );
                  })}
                  {!cands.length && <li className="py-1 text-xs text-slate-500">Ei osumia.</li>}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
