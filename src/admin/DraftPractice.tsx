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
    if (!realRaw) return null;
    const snake = { ...realRaw, snake: true }; // harjoituksessa aina käärmedraft: joka toinen kierros käänteisesti
    if (realRaw.pool.length) return snake;
    if (!sF.data || !sD.data || !sG.data || !sC.data) return null;
    const mk = (position: Position, rows: Row[]) => rows.map((r) => ({ position, entity_id: r.id, name: r.name, team: r.team, used: 0 }));
    return { ...snake, pool: [...mk('F', sF.data.players), ...mk('D', sD.data.players), ...mk('G', sG.data.players), ...mk('C', sC.data)].sort((a, b) => a.name.localeCompare(b.name, 'fi')) };
  }, [realRaw, sF.data, sD.data, sG.data, sC.data]);
  // Testikupongit: paremmuusjärjestys HG-pisteiden mukaan (stats tulee valmiiksi järjestettynä)
  const ranked = useMemo<Record<Position, number[]>>(() => ({
    F: (sF.data?.players ?? []).map((p) => p.id), D: (sD.data?.players ?? []).map((p) => p.id),
    G: (sG.data?.players ?? []).map((p) => p.id), C: (sC.data ?? []).map((p) => p.id),
  }), [sF.data, sD.data, sG.data, sC.data]);
  const [fakePrefs, setFakePrefs] = useState<Record<number, Prefs>>({});
  const allPrefs = useMemo(() => ({ ...(prefs ?? {}), ...fakePrefs }), [prefs, fakePrefs]);
  const [gurus, setGurus] = useState<Guru[] | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  // Vaiheet: valmistelu → arvonta → järjestys esillä → live → tarkistus → julkaistu
  const [phase, setPhase] = useState<'setup' | 'lottery' | 'lobby' | 'live' | 'review' | 'published'>('setup');
  const status: DraftState['status'] = phase === 'live' || phase === 'review' ? 'live' : phase === 'published' ? 'done' : 'setup';
  const [lottery, setLottery] = useState<DraftState['lottery']>(null);
  const [edit, setEdit] = useState<number | null>(null);
  const [eq, setEq] = useState('');
  const [paused, setPaused] = useState(false);
  const [autoAt, setAutoAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<Position | 'all'>('all');
  const [q, setQ] = useState('');

  // Alkutila: oikeat gurut ilman numeroita (numerot arvotaan harjoituksessa)
  useEffect(() => {
    if (!real || gurus) return;
    setGurus(real.gurus.map((g) => ({ ...g, draft_number: null, remote_draft: 1 })));
  }, [real, gurus]);

  // Arvonnan aikana numerot paljastuvat vasta, kun arvonta ehtii gurun kohdalle (kuten palvelimella)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!lottery || lottery.paused) return;
    const t = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(t);
  }, [lottery]);
  const st = useMemo(() => {
    if (!real || !gurus) return null;
    if (!lottery) return { ...buildState(real, gurus, picks, status), lottery };
    const now = lottery.paused ? lottery.now : Date.now();
    const shown = new Set(lottery.order.filter((_, i) => now >= lottery.at + i * lottery.step + lottery.reveal).map((o) => o.id));
    const masked = gurus.map((g) => (shown.has(g.id) ? g : { ...g, draft_number: null }))
      .sort((a, b) => (a.draft_number ?? 999) - (b.draft_number ?? 999) || a.name.localeCompare(b.name, 'fi'));
    return { ...buildState(real, masked, picks, status), gurus: masked, lottery };
  }, [real, gurus, picks, status, lottery, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arvonta seinänäkymään: 10 s lähtölaskenta, sitten guru kerrallaan
  const startLottery = () => {
    if (!gurus?.length) return;
    const numbered = shuffle(gurus);
    const order = numbered.map((g) => ({ g, r: Math.random() })).sort((a, b) => a.r - b.r).map(({ g }) => ({ id: g.id, name: g.name, draft_number: g.draft_number }));
    const now = Date.now();
    setGurus(numbered);
    setLottery({ at: now + 10_000, now, step: 5_000, reveal: 2_000, paused: false, order });
    setPhase('lottery');
  };
  const toggleLottery = () => setLottery((L) => {
    if (!L) return L;
    const now = Date.now();
    return L.paused ? { ...L, paused: false, at: L.at + (now - L.now), now } : { ...L, paused: true, now };
  });
  useEffect(() => {
    if (!lottery || lottery.paused) return;
    const t = setTimeout(() => { setLottery(null); setPhase('lobby'); }, lottery.at - Date.now() + lottery.order.length * lottery.step + 1500);
    return () => clearTimeout(t);
  }, [lottery]);

  // Lähetys seinänäkymälle; seinän painikkeet lähettävät komennot takaisin
  const ch = useRef<BroadcastChannel | null>(null);
  const latest = useRef<DraftState | null>(null);
  const cmd = useRef<Record<string, () => void>>({});
  cmd.current = { lottery: startLottery, toggle: toggleLottery };
  useEffect(() => {
    const c = new BroadcastChannel(DEMO_CHANNEL); ch.current = c;
    c.onmessage = (e) => {
      if (e.data?.type === 'hello' && latest.current) c.postMessage({ type: 'state', st: latest.current, paused, autoAt });
      if (e.data?.type === 'cmd') cmd.current[e.data.action]?.();
    };
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
      const c = autoChoice(st, allPrefs[remoteTurn.id]);
      if (c) doPick(c.position, c.entityId, true);
      else { failedFor.current = st.pickNo; setAutoAt(null); setErr(`${remoteTurn.name}: lomakkeella ei vapaita vaihtoehtoja – valitse käsin`); }
    }, AUTO_DELAY);
    return () => clearTimeout(t);
  }, [st?.pickNo, remoteTurn?.id, paused, allPrefs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (st && phase === 'live' && st.picks.length >= st.total) setPhase('review'); }, [st, phase]);

  if (!st || !gurus) return <Spinner />;

  const mine = st.picks.filter((p) => p.guru_id === st.onClock?.id);
  const left = (p: Position) => st.roster[p] - mine.filter((x) => x.position === p).length;
  const pool = st.pool.filter((p) => (pos === 'all' || p.position === pos) && matchName(`${p.name} ${p.team ?? ''}`, q));
  const shown = pool.slice(0, 6);
  const remoteNoPrefs = gurus.filter((g) => g.remote_draft && !allPrefs[g.id]);
  const genPrefs = () => {
    // Painotettu satunnaisuus: kärkipelaajat suosittuja → realistisia päällekkäisyyksiä ja täyttyviä pelaajia
    const pickSome = (ids: number[], n: number) => {
      const pool = ids.slice(0, Math.max(n * 3, 25)).map((id, i) => ({ id, w: Math.random() / (i + 4) }));
      return pool.sort((a, b) => b.w - a.w).slice(0, n).map((x) => x.id);
    };
    const out: Record<number, Prefs> = {};
    for (const g of gurus) {
      const slots = POSITIONS.flatMap((p) => Array(st.roster[p]).fill(p) as Position[]);
      const positionOrder = slots.map((p) => ({ p, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.p);
      const rankings = Object.fromEntries(POSITIONS.map((p) => [p, pickSome(ranked[p], st.roster[p] * 3 + 4)]));
      out[g.id] = { positionOrder, rankings };
    }
    setFakePrefs(out);
  };
  const reset = () => { setPicks([]); setPhase('setup'); setLottery(null); setPaused(false); setErr(null); setEdit(null); failedFor.current = null; setGurus(gurus.map((g) => ({ ...g, draft_number: null }))); };
  const pickGurus = (list: Guru[]) => { setGurus(list); setFakePrefs({}); };
  const testGurus = () => pickGurus(TEST_NAMES.map((name, i) => ({ id: 900_001 + i, name, draft_number: null, remote_draft: 1, user_id: null }) as Guru));
  const numbered = gurus.length > 0 && gurus.every((g) => g.draft_number != null);

  // Tarkistusvaihe: yksittäisen valinnan vaihto (samat säännöt kuin palvelimen replacePick)
  const editPick = picks.find((p) => p.pick_no === edit);
  const replace = (entityId: number) => {
    if (!editPick) return;
    const item = st.pool.find((p) => p.position === editPick.position && p.entity_id === entityId)!;
    const others = picks.filter((p) => p.pick_no !== editPick.pick_no);
    if (others.some((p) => p.guru_id === editPick.guru_id && p.position === item.position && p.entity_id === entityId)) { setErr('Gurulla on jo tämä valinta'); return; }
    const used = others.filter((p) => p.position === item.position && p.entity_id === entityId).length;
    if (used >= st.maxPicks[item.position]) { setErr(`Valittu jo ${used} kertaa (max ${st.maxPicks[item.position]})`); return; }
    setErr(null);
    setPicks(picks.map((p) => (p.pick_no === editPick.pick_no ? { ...p, entity_id: entityId, name: item.name, team: item.team, auto: 0 } : p)));
    setEdit(null);
  };
  const cands = editPick ? st.pool.filter((p) => p.position === editPick.position && p.entity_id !== editPick.entity_id && matchName(`${p.name} ${p.team ?? ''}`, eq)) : [];
  const steps = [['setup', '1 Läsnäolo'], ['lottery', '2 Arvonta'], ['lobby', '3 Järjestys'], ['live', '4 Draft'], ['review', '5 Tarkistus'], ['published', '6 Julkaistu']] as const;
  const stepIdx = steps.findIndex(([k]) => k === phase);

  return (
    <>
      <PageHeader kicker="Harjoitus · ei tallennu" title="Harjoitusdraft">
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-ghost" href="/draft/naytto?harjoitus" target="_blank" rel="noopener">📺 Avaa seinänäkymä</a>
          {phase === 'setup' && <button className="btn btn-primary" disabled={!gurus.length} onClick={startLottery}>🎲 Aloita arvonta</button>}
          {phase === 'lottery' && <button className="btn btn-ghost" onClick={toggleLottery}>{lottery?.paused ? '▶ Jatka arvontaa' : '⏸ Tauko arvontaan'}</button>}
          {(phase === 'lobby' || (phase === 'setup' && numbered)) && <button className="btn btn-primary" onClick={() => setPhase('live')}>▶ Aloita draft</button>}
          {phase === 'live' && <button className="btn btn-ghost" onClick={() => setPaused(!paused)}>{paused ? '▶ Jatka' : '⏸ Tauko'}</button>}
          {(phase === 'live' || phase === 'review') && <button className="btn btn-ghost" disabled={!picks.length} onClick={() => { setPicks((p) => p.slice(0, -1)); setPhase('live'); setEdit(null); failedFor.current = null; }}>↶ Peru edellinen</button>}
          {phase !== 'setup' && <button className="btn btn-ghost" onClick={() => confirm('Aloitetaanko harjoitus alusta?') && reset()}>↺ Nollaa</button>}
        </div>
      </PageHeader>

      <ol className="mb-4 flex flex-wrap gap-1 text-xs">
        {steps.map(([k, label], i) => (
          <li key={k} className={`rounded-full px-3 py-1 ${i === stepIdx ? 'bg-ice-500 font-semibold text-rink-950' : i < stepIdx ? 'bg-ice-500/20 text-ice-200' : 'bg-white/5 text-slate-500'}`}>{label}</li>
        ))}
      </ol>

      <p className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
        Harjoitus kulkee samat vaiheet kuin oikea draft, mutta mitään ei tallenneta. Avaa seinänäkymä <b>samassa selaimessa</b> ja jaa se seinälle/Teamsiin – se seuraa tätä ikkunaa reaaliajassa (arvonta, draft, valmis).
      </p>

      {phase === 'setup' && (
        <Card title={`Vaihe 1 · Läsnäolo (${gurus.length} gurua)`} className="mb-6"
          action={<div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost px-3 py-1 text-xs" onClick={testGurus} title="10 keksittyä gurua – nopea läpikäynti">👥 10 testigurua</button>
            {real && <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => pickGurus(real.gurus.map((g) => ({ ...g, draft_number: null, remote_draft: 1 })))}>Oikeat gurut</button>}
            <button className="btn btn-ghost px-3 py-1 text-xs" onClick={genPrefs} title="Keksityt draft-lomakkeet kaikille guruille (vain harjoitukseen)">🎟 Generoi testikupongit</button>
            <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setGurus(gurus.map((g) => ({ ...g, remote_draft: 1 })))}>Kaikki lomakkeelta</button>
            <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setGurus(gurus.map((g) => ({ ...g, remote_draft: 0 })))}>Kaikki paikalla</button>
          </div>}>
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...gurus].sort((a, b) => (a.draft_number ?? 0) - (b.draft_number ?? 0)).map((g) => {
              const present = !g.remote_draft;
              return (
                <button key={g.id} onClick={() => setGurus(gurus.map((x) => (x.id === g.id ? { ...x, remote_draft: present ? 1 : 0 } : x)))}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${present ? 'border-ice-400/50 bg-ice-500/10' : 'border-white/10 bg-white/[0.02]'}`}>
                  <span className="w-6 font-display text-ice-300">{g.draft_number}</span>
                  <span className="flex-1 truncate font-semibold text-white">{g.name}</span>
                  <span className={`text-xs ${present ? 'text-ice-300' : allPrefs[g.id] ? 'text-slate-400' : 'text-goal'}`}>{present ? '🏒 paikalla' : fakePrefs[g.id] ? '🎟 testikuponki' : allPrefs[g.id] ? '📋 lomake' : '⚠ ei lomaketta'}</span>
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
      {phase === 'lottery' && <section className="mb-6 rounded-3xl border border-ice-400/30 bg-ice-500/10 p-6 text-white"><p className="font-display text-3xl">🎲 Arvonta käynnissä seinänäkymässä</p><p className="mt-1 text-sm text-slate-300">Kestää noin {Math.round((gurus.length * 5 + 10) / 6) / 10} min. Järjestys tulee näkyviin, kun arvonta päättyy.</p></section>}
      {phase === 'lobby' && <section className="mb-6 rounded-3xl border border-ice-400/30 bg-ice-500/10 p-6 text-white"><p className="font-display text-3xl">Järjestys arvottu</p><p className="mt-1 text-sm text-slate-300">Seinällä näkyy valintajärjestys. Käy se läpi ja paina ▶ Aloita draft.</p></section>}
      {phase === 'review' && (
        <Card title="Vaihe 5 · Tarkista ja hyväksy" className="mb-6"
          action={<button className="btn btn-primary" onClick={() => confirm('Hyväksytäänkö valinnat ja julkaistaanko joukkueet? (harjoitus)') && (setPhase('published'), setEdit(null))}>✓ Hyväksy ja julkaise joukkueet</button>}>
          <p className="px-5 pt-4 text-sm text-slate-300">Kaikki valinnat tehty. Klikkaa valintaa korjataksesi sen toiseen saman pelipaikan nimeen.</p>
          <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
            {st.gurus.map((g) => (
              <div key={g.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 font-semibold text-white">{g.draft_number}. {g.name}</p>
                <div className="flex flex-wrap gap-1">
                  {picks.filter((p) => p.guru_id === g.id).sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position)).map((p) => (
                    <button key={p.pick_no} onClick={() => { setEdit(edit === p.pick_no ? null : p.pick_no); setEq(''); }}
                      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${edit === p.pick_no ? 'bg-amber-400/30 ring-1 ring-amber-300' : 'bg-white/5 hover:bg-white/10'}`}>
                      <PosBadge pos={p.position} />{p.name}
                    </button>
                  ))}
                </div>
                {editPick?.guru_id === g.id && (
                  <div className="mt-3 rounded-lg border border-amber-400/30 p-2">
                    <p className="mb-1 text-xs text-amber-300">Vaihda {editPick.name} (valinta #{editPick.pick_no}) →</p>
                    <input type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" className="input" autoFocus placeholder="Hae…" value={eq} onChange={(e) => setEq(e.target.value)} />
                    <ul className="mt-1">
                      {cands.slice(0, 6).map((c) => {
                        const dis = c.used >= st.maxPicks[c.position] || picks.some((x) => x.guru_id === g.id && x.position === c.position && x.entity_id === c.entity_id);
                        return (
                          <li key={c.entity_id} className="flex items-center gap-2 border-t border-white/5 py-1 text-sm">
                            <span className={`flex-1 truncate ${dis ? 'text-slate-600' : 'text-white'}`}>{c.name} <span className="text-xs text-slate-500">{c.team}</span></span>
                            <span className="font-mono text-xs text-slate-400">{c.used}/{st.maxPicks[c.position]}</span>
                            <button className="btn btn-primary px-2 py-0.5 text-xs" disabled={dis} onClick={() => replace(c.entity_id)}>Vaihda</button>
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
      )}
      {phase === 'published' && (
        <Card title="Vaihe 6 · Joukkueet julkaistu (harjoitus)" className="mb-6">
          <p className="px-5 pt-4 text-sm text-slate-300">Oikeassa draftissa nämä kentälliset tulisivat nyt guruille näkyviin Oma joukkue -sivulle. Harjoituksessa mitään ei tallennettu.</p>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {st.gurus.map((g) => (
              <div key={g.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 font-semibold text-white">{g.name}</p>
                {POSITIONS.map((ps) => (
                  <div key={ps} className="mb-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{POS_PLURAL[ps]}</p>
                    {picks.filter((p) => p.guru_id === g.id && p.position === ps).map((p) => <p key={p.pick_no} className="truncate text-sm">{p.name}</p>)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}

      <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] [&>*]:min-w-0">
        <Card title="Valitse" className="2xl:sticky 2xl:top-20">
          <div className="grid grid-cols-5 gap-1 p-3">
            <button onClick={() => setPos('all')} className={`rounded-lg px-1 py-1.5 text-xs font-semibold ${pos === 'all' ? 'bg-ice-500 text-rink-950' : 'bg-white/5 text-slate-400 hover:text-white'}`}>Kaikki</button>
            {POSITIONS.map((p) => (
              <button key={p} onClick={() => setPos(p)} className={`rounded-lg px-1 py-1.5 text-xs font-semibold ${pos === p ? 'bg-ice-500 text-rink-950' : 'bg-white/5 text-slate-400 hover:text-white'} ${status === 'live' && !left(p) ? 'opacity-40' : ''}`}>
                {POS_PLURAL[p]}
              </button>
            ))}
          </div>
          <div className="p-3"><input type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" className="input" placeholder="Hae pelaajaa…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ul>
            {shown.map((p) => {
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
            {pool.length > shown.length && <li className="border-t border-white/5 px-4 py-2 text-xs text-slate-500">+ {pool.length - shown.length} muuta – tarkenna hakua</li>}
            {!pool.length && <li><Empty>Ei osumia.</Empty></li>}
          </ul>
        </Card>
        <Card title="Draft-taulu"><div className="max-h-[70vh] overflow-auto"><DraftGrid st={st} /></div></Card>
      </div>
    </>
  );
}

const TEST_NAMES = ['Testi-Aki', 'Testi-Bea', 'Testi-Cale', 'Testi-Dani', 'Testi-Eki', 'Testi-Fanni', 'Testi-Gege', 'Testi-Hessu', 'Testi-Iida', 'Testi-Jussi'];

function shuffle(gurus: Guru[]): Guru[] {
  const order = gurus.map((g) => ({ g, r: Math.random() })).sort((a, b) => a.r - b.r);
  return order.map((o, i) => ({ ...o.g, draft_number: i + 1 }));
}
