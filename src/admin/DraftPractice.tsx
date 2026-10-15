import { useEffect, useMemo, useRef, useState } from 'react';
import { matchName, POS_PLURAL, POSITIONS, type Position } from '../api';
import { useApi } from '../auth';
import { autoChoice, buildState, checkPick, DEMO_CHANNEL, makePick, type Guru, type Pick, type Prefs } from '../draftLogic';
import { DraftGrid, type DraftState } from '../pages/DraftBoard';
import { Card, Empty, ErrorBox, PageHeader, PosBadge, Spinner } from '../ui';

const AUTO_DELAY = 3000;

/** Harjoitusdraftin hallintanäkymä. Kaikki tapahtuu selaimessa – mitään ei tallenneta.
 *  Seinänäkymä (/draft/naytto?harjoitus) samassa selaimessa seuraa tätä BroadcastChannelin kautta. */
export default function DraftPractice() {
  const { data: realRaw } = useApi<DraftState>('/draft');
  const { data: prefs } = useApi<Record<number, Prefs>>('/admin/draft/prefs-all');
  // Jos draft-listaa ei ole koottu, harjoituksessa voi valita kaikista Liigan pelaajista ja valmentajista
  type Row = { id: number; name: string; team: string | null };
  const sF = useApi<{ players: Row[] }>('/stats?pos=F');
  const sD = useApi<{ players: Row[] }>('/stats?pos=D');
  const sG = useApi<{ players: Row[] }>('/stats?pos=G');
  const sC = useApi<Row[]>('/coaches');
  const real = useMemo(() => {
    if (!realRaw || realRaw.pool.length) return realRaw;
    if (!sF.data || !sD.data || !sG.data || !sC.data) return null;
    const mk = (position: Position, rows: Row[]) => rows.map((r) => ({ position, entity_id: r.id, name: r.name, team: r.team, used: 0 }));
    return { ...realRaw, pool: [...mk('F', sF.data.players), ...mk('D', sD.data.players), ...mk('G', sG.data.players), ...mk('C', sC.data)].sort((a, b) => a.name.localeCompare(b.name, 'fi')) };
  }, [realRaw, sF.data, sD.data, sG.data, sC.data]);
  const [gurus, setGurus] = useState<Guru[] | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [status, setStatus] = useState<DraftState['status']>('setup');
  const [paused, setPaused] = useState(false);
  const [autoAt, setAutoAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<Position | 'all'>('all');
  const [q, setQ] = useState('');

  // Alkutila oikeasta draftista (gurut, läsnäolo, numerot)
  useEffect(() => {
    if (!real || gurus) return;
    const ok = real.gurus.length && real.gurus.every((g) => g.draft_number != null);
    setGurus(ok ? real.gurus.map((g) => ({ ...g })) : shuffle(real.gurus));
  }, [real, gurus]);

  const st = useMemo(() => (real && gurus ? buildState(real, gurus, picks, status) : null), [real, gurus, picks, status]);

  // Lähetys seinänäkymälle
  const ch = useRef<BroadcastChannel | null>(null);
  const latest = useRef<DraftState | null>(null);
  useEffect(() => {
    const c = new BroadcastChannel(DEMO_CHANNEL); ch.current = c;
    c.onmessage = (e) => { if (e.data?.type === 'hello' && latest.current) c.postMessage({ type: 'state', st: latest.current, paused, autoAt }); };
    return () => { c.postMessage({ type: 'bye' }); c.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!st) return;
    latest.current = st;
    ch.current?.postMessage({ type: 'state', st, paused, autoAt });
  }, [st, paused, autoAt]);

  const doPick = (position: Position, entityId: number, auto: boolean) => {
    if (!st) return;
    const e = checkPick(st, position, entityId);
    if (e) { setErr(e); return; }
    setErr(null);
    setPicks((p) => [...p, makePick(st, position, entityId, auto)]);
  };

  // Poissaolevan vuoro: automaattinen valinta lomakkeelta pienen viiveen jälkeen
  const remoteTurn = st?.status === 'live' && st.onClock?.remote_draft ? st.onClock : null;
  const failedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!st || !remoteTurn || paused || failedFor.current === st.pickNo) { setAutoAt(null); return; }
    const at = Date.now() + AUTO_DELAY;
    setAutoAt(at);
    const t = setTimeout(() => {
      const c = autoChoice(st, prefs?.[remoteTurn.id]);
      if (c) doPick(c.position, c.entityId, true);
      else { failedFor.current = st.pickNo; setAutoAt(null); setErr(`${remoteTurn.name}: lomakkeella ei vapaita vaihtoehtoja – valitse käsin`); }
    }, AUTO_DELAY);
    return () => clearTimeout(t);
  }, [st?.pickNo, remoteTurn?.id, paused, prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (st && st.status === 'live' && st.picks.length >= st.total) setStatus('done'); }, [st]);

  if (!st || !gurus) return <Spinner />;

  const mine = st.picks.filter((p) => p.guru_id === st.onClock?.id);
  const left = (p: Position) => st.roster[p] - mine.filter((x) => x.position === p).length;
  const pool = st.pool.filter((p) => (pos === 'all' || p.position === pos) && matchName(`${p.name} ${p.team ?? ''}`, q)).slice(0, 200);
  const remoteNoPrefs = gurus.filter((g) => g.remote_draft && !prefs?.[g.id]);
  const reset = () => { setPicks([]); setStatus('setup'); setPaused(false); setErr(null); failedFor.current = null; };

  return (
    <>
      <PageHeader kicker="Harjoitus · ei tallennu" title="Harjoitusdraft">
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-ghost" href="/draft/naytto?harjoitus" target="_blank" rel="noopener">📺 Avaa seinänäkymä</a>
          {status === 'setup' && <button className="btn btn-primary" disabled={!gurus.length} onClick={() => setStatus('live')}>▶ Aloita harjoitusdraft</button>}
          {status === 'live' && <button className="btn btn-ghost" onClick={() => setPaused(!paused)}>{paused ? '▶ Jatka' : '⏸ Tauko'}</button>}
          {status !== 'setup' && <button className="btn btn-ghost" disabled={!picks.length} onClick={() => { setPicks((p) => p.slice(0, -1)); setStatus('live'); failedFor.current = null; }}>↶ Peru edellinen</button>}
          {status !== 'setup' && <button className="btn btn-ghost" onClick={() => confirm('Aloitetaanko harjoitus alusta?') && reset()}>↺ Nollaa</button>}
        </div>
      </PageHeader>

      <p className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
        Harjoitus käyttää oikeita guruja, draft-listaa ja lomakkeita, mutta mitään ei tallenneta. Avaa seinänäkymä <b>samassa selaimessa</b> ja jaa se seinälle/Teamsiin – se seuraa tätä ikkunaa reaaliajassa.
      </p>

      {status === 'setup' && (
        <Card title="Läsnäolo harjoituksessa" className="mb-6"
          action={<button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setGurus(shuffle(gurus))}>🎲 Arvo numerot uudelleen</button>}>
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...gurus].sort((a, b) => (a.draft_number ?? 0) - (b.draft_number ?? 0)).map((g) => {
              const present = !g.remote_draft;
              return (
                <button key={g.id} onClick={() => setGurus(gurus.map((x) => (x.id === g.id ? { ...x, remote_draft: present ? 1 : 0 } : x)))}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${present ? 'border-ice-400/50 bg-ice-500/10' : 'border-white/10 bg-white/[0.02]'}`}>
                  <span className="w-6 font-display text-ice-300">{g.draft_number}</span>
                  <span className="flex-1 truncate font-semibold text-white">{g.name}</span>
                  <span className={`text-xs ${present ? 'text-ice-300' : prefs?.[g.id] ? 'text-slate-400' : 'text-goal'}`}>{present ? '🏒 paikalla' : prefs?.[g.id] ? '📋 lomake' : '⚠ ei lomaketta'}</span>
                </button>
              );
            })}
          </div>
          <p className="border-t border-white/5 px-5 py-3 text-xs text-slate-400">
            Alkuun kopioitu oikea läsnäolomerkintä – muutokset koskevat vain harjoitusta.
            {remoteNoPrefs.length > 0 && <span className="text-goal"> Ilman lomaketta: {remoteNoPrefs.map((g) => g.name).join(', ')} – heidän vuorollaan valitset käsin.</span>}
          </p>
        </Card>
      )}

      {status === 'live' && st.onClock && (
        <section className="mb-6 rounded-3xl border border-ice-400/30 bg-gradient-to-r from-ice-500/15 via-rink-850 to-goal/10 p-6">
          <p className="label">Kierros {st.round} · valinta {st.pickNo}/{st.total}</p>
          <p className="font-display text-4xl text-white">{st.onClock.name}</p>
          <p className="mt-1 flex flex-wrap gap-3 text-sm text-slate-300">
            {POSITIONS.map((p) => <span key={p} className={left(p) ? '' : 'opacity-30'}><PosBadge pos={p} /> {left(p)}</span>)}
          </p>
          <p className="mt-2 text-sm">
            {st.onClock.remote_draft
              ? (paused ? <span className="text-amber-300">⏸ Tauolla</span>
                : autoAt ? <span className="text-ice-300">📋 Valitaan lomakkeelta…</span>
                : <span className="text-goal">Valitse käsin alta</span>)
              : <span className="text-emerald-300">🏒 Paikalla – kirjaa gurun kertoma valinta alta</span>}
          </p>
        </section>
      )}
      {status === 'done' && <section className="mb-6 rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-6 font-display text-3xl text-white">Harjoitusdraft valmis 🏆</section>}
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card title="Valitse">
          <div className="grid grid-cols-5 gap-1 p-3">
            <button onClick={() => setPos('all')} className={`rounded-lg px-1 py-1.5 text-xs font-semibold ${pos === 'all' ? 'bg-ice-500 text-rink-950' : 'bg-white/5 text-slate-400 hover:text-white'}`}>Kaikki</button>
            {POSITIONS.map((p) => (
              <button key={p} onClick={() => setPos(p)} className={`rounded-lg px-1 py-1.5 text-xs font-semibold ${pos === p ? 'bg-ice-500 text-rink-950' : 'bg-white/5 text-slate-400 hover:text-white'} ${status === 'live' && !left(p) ? 'opacity-40' : ''}`}>
                {POS_PLURAL[p]}
              </button>
            ))}
          </div>
          <div className="p-3"><input className="input" placeholder="Hae pelaajaa…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ul className="max-h-[55vh] overflow-y-auto">
            {pool.map((p) => {
              const full = p.used >= st.maxPicks[p.position];
              const owned = mine.some((m) => m.position === p.position && m.entity_id === p.entity_id);
              const disabled = status !== 'live' || full || owned || left(p.position) <= 0;
              return (
                <li key={`${p.position}-${p.entity_id}`} className="flex items-center gap-2 border-t border-white/5 px-4 py-2">
                  <PosBadge pos={p.position} />
                  <span className={`flex-1 text-sm ${full ? 'text-slate-600 line-through' : 'text-white'}`}>{p.name} <span className="text-xs text-slate-500">{p.team}</span></span>
                  <span className={`font-mono text-xs ${full ? 'text-goal' : p.used >= 3 ? 'text-amber-300' : 'text-slate-400'}`}>{p.used}/{st.maxPicks[p.position]}</span>
                  <button className="btn btn-primary px-3 py-1 text-xs" disabled={disabled} onClick={() => doPick(p.position, p.entity_id, false)}>Valitse</button>
                </li>
              );
            })}
            {!pool.length && <li><Empty>Ei osumia.</Empty></li>}
          </ul>
        </Card>
        <Card title="Draft-taulu"><DraftGrid st={st} /></Card>
      </div>
    </>
  );
}

function shuffle(gurus: Guru[]): Guru[] {
  const order = gurus.map((g) => ({ g, r: Math.random() })).sort((a, b) => a.r - b.r);
  return order.map((o, i) => ({ ...o.g, draft_number: i + 1 }));
}
