import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, POS_LABEL, POS_PLURAL, POSITIONS, type Position } from '../api';
import { isAdminRole, useApi, useAuth } from '../auth';
import { Logo, PosBadge, Spinner } from '../ui';
import { DraftGrid, type DraftState } from './DraftBoard';
import { DEMO_CHANNEL } from '../draftLogic';

/** Varausmäärä, josta pelaaja nostetaan "kuumaksi" heijastettavassa näkymässä. */
const HOT = 3;

function guruForPick(gurus: DraftState['gurus'], pickNo: number, snake: boolean) {
  const n = gurus.length;
  const round = Math.floor((pickNo - 1) / n);
  let idx = (pickNo - 1) % n;
  if (snake && round % 2 === 1) idx = n - 1 - idx;
  return gurus[idx];
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Draft-tilaisuuden heijastettava näkymä (seinä / Teams-jako). */
export default function DraftScreen() {
  const { data: real, reload } = useApi<DraftState>('/draft');
  const demo = new URLSearchParams(location.search).has('harjoitus');
  const demoRes = useDemo(demo ? real : null);
  // Harjoitusdraft: hallintaikkuna lähettää tilan tähän ikkunaan
  const [practice, setPractice] = useState<{ st: DraftState; paused: boolean; autoAt: number | null } | null>(null);
  const chRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (!demo) return;
    const c = new BroadcastChannel(DEMO_CHANNEL); chRef.current = c;
    c.onmessage = (e) => { if (e.data?.type === 'state') setPractice(e.data); if (e.data?.type === 'bye') setPractice(null); };
    c.postMessage({ type: 'hello' });
    return () => c.close();
  }, [demo]);
  const usePractice = !!practice;
  const st = usePractice ? practice!.st : demo ? demoRes.st : real;
  const { me } = useAuth();
  const offset = useRef(0);
  useEffect(() => { if (st?.lottery && !st.lottery.paused && !demo) offset.current = st.lottery.now - Date.now(); }, [st, demo]);
  const send = (action: string) => () => chRef.current?.postMessage({ type: 'cmd', action });
  const start = usePractice ? send('lottery') : demo ? demoRes.start
    : isAdminRole(me?.user?.role) ? async () => { await api('/admin/draft/shuffle', { body: { animate: true } }).catch(() => {}); reload(); }
    : undefined;
  const toggle = usePractice ? send('toggle') : demo ? demoRes.toggle
    : isAdminRole(me?.user?.role) ? async () => { await api('/admin/draft/lottery', { body: { action: st?.lottery?.paused ? 'resume' : 'pause' } }).catch(() => {}); reload(); }
    : undefined;
  useEffect(() => {
    if (demo) return;
    const t = setInterval(reload, st?.lottery ? 1000 : 3000);
    return () => clearInterval(t);
  }, [st?.lottery, reload, demo]);

  // Uuden valinnan ilmoitus koko ruudulle
  const [flash, setFlash] = useState<DraftState['picks'][number] & { guru: string } | null>(null);
  const lastId = useRef<number | null>(null);
  useEffect(() => {
    if (!st) return;
    const last = st.picks[st.picks.length - 1];
    if (lastId.current !== null && last && last.id !== lastId.current) {
      setFlash({ ...last, guru: st.gurus.find((g) => g.id === last.guru_id)?.name ?? '' });
      const t = setTimeout(() => setFlash(null), 5000);
      lastId.current = last.id;
      return () => clearTimeout(t);
    }
    lastId.current = last?.id ?? 0;
  }, [st]);

  const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});

  if (!st) return <div className="grid min-h-screen place-items-center bg-rink-950"><Spinner /></div>;

  return (
    <div className="min-h-screen bg-rink-950 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.15),transparent_60%)] text-white">
      <header className="flex items-center gap-4 border-b border-white/10 px-6 py-3">
        <Logo className="h-10 w-10" />
        <div className="font-display text-2xl tracking-[0.2em]">HOGIGURU <span className="text-ice-400">DRAFT</span></div>
        <div className="ml-auto flex items-center gap-4 text-sm text-slate-400">
          {demo && <span className="rounded-full bg-amber-400/20 px-3 py-1 font-semibold text-amber-300">HARJOITUS – ei tallennu</span>}
          {st.status === 'live' && <span className="flex items-center gap-2 font-semibold text-goal"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-goal" />LIVE</span>}
          <Clock />
          <button onClick={fs} className="rounded-lg border border-white/10 px-3 py-1 hover:bg-white/5" title="Koko näyttö">⛶</button>
          <Link to="/admin/draft" className="rounded-lg border border-white/10 px-3 py-1 hover:bg-white/5">Hallinta</Link>
        </div>
      </header>

      {st.lottery ? <Lottery st={st} offset={offset.current} onToggle={toggle} />
        : st.status === 'setup' ? <Lobby st={st} onStart={start} />
        : <Live st={st} note={usePractice ? (practice!.paused ? '⏸ Tauko' : practice!.autoAt ? '📋 Valitaan lomakkeelta…' : null) : null} />}

      {flash && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-rink-950/70 backdrop-blur-sm">
          <div className="animate-in rounded-3xl border border-ice-400/40 bg-rink-850 px-16 py-10 text-center shadow-2xl shadow-ice-500/20">
            <p className="text-xl uppercase tracking-[0.3em] text-ice-300">Valinta {flash.pick_no} · {flash.guru}</p>
            <p className="mt-4 font-display text-7xl">{flash.name}</p>
            <p className="mt-3 flex items-center justify-center gap-3 text-2xl text-slate-300"><PosBadge pos={flash.position} /> {POS_LABEL[flash.position]}{flash.team ? ` · ${flash.team}` : ''}{flash.auto ? ' · lomakkeelta' : ''}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Harjoitustila (?harjoitus): arvonta oikeilla guruilla vain selaimessa – ei tallenna mitään. */
function useDemo(real: DraftState | null): { st: DraftState | null; toggle: () => void; start: () => void } {
  const [base, setBase] = useState<DraftState | null>(null);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!real || base || !started) return;
    const rnd = (n: number) => [...Array(n).keys()].map((i) => ({ i, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.i);
    const nums = rnd(real.gurus.length), order = rnd(real.gurus.length);
    const gurus = real.gurus.map((g, i) => ({ ...g, draft_number: nums[i] + 1 }));
    const at = Date.now() + 10_000;
    setBase({
      ...real, status: 'setup', picks: [], gurus: [...gurus].sort((a, b) => a.draft_number - b.draft_number),
      lottery: { at, now: Date.now(), step: 10_000, reveal: 4_000, paused: false, order: order.map((i) => ({ id: gurus[i].id, name: gurus[i].name, draft_number: gurus[i].draft_number })) },
    });
  }, [real, base, started]);
  useEffect(() => {
    if (!base?.lottery || base.lottery.paused) return;
    const t = setTimeout(() => setOver(true), base.lottery.at - Date.now() + base.gurus.length * 10_000 + 1500);
    return () => clearTimeout(t);
  }, [base]);
  const toggle = () => setBase((b) => {
    if (!b?.lottery) return b;
    const L = b.lottery, now = Date.now();
    return { ...b, lottery: L.paused ? { ...L, paused: false, at: L.at + (now - L.now), now } : { ...L, paused: true, now } };
  });
  return { st: !started ? (real ? { ...real, status: 'setup', picks: [], lottery: null, gurus: real.gurus.map((g) => ({ ...g, draft_number: null })) } : null) : base && over ? { ...base, lottery: null } : base, toggle, start: () => setStarted(true) };
}

function Clock() {
  const now = useNow(10_000);
  return <span className="font-mono">{new Date(now).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}</span>;
}

/* ---------- Arvonta ---------- */
function Lottery({ st, offset, onToggle }: { st: DraftState; offset: number; onToggle?: () => void }) {
  const tick = useNow(80);
  const L = st.lottery!;
  const now = L.paused ? L.now : tick + offset;
  const elapsed = now - L.at;
  const n = L.order.length;
  const idx = Math.min(Math.floor(elapsed / L.step), n - 1);
  const inStep = elapsed - idx * L.step;
  const cur = elapsed >= 0 ? L.order[idx] : null;
  const revealed = cur && inStep >= L.reveal && cur.draft_number != null;
  const spin = useMemo(() => 1 + Math.floor(Math.random() * n), [tick, n]); // eslint-disable-line react-hooks/exhaustive-deps
  // Arvotut: uusin ylimmäksi
  const done = L.order.filter((g, i) => (i < idx || (i === idx && revealed)) && g.draft_number != null).reverse();

  return (
    <main className="grid h-[calc(100vh-65px)] grid-cols-[1fr_minmax(280px,26%)] gap-6 overflow-hidden p-6">
      <section className="flex flex-col items-center pt-[4vh]">
        {!cur ? (
          <div className="text-center">
            <p className="text-2xl uppercase tracking-[0.4em] text-ice-300">Draft-järjestyksen arvonta</p>
            <p className="mt-6 font-display text-[12rem] leading-none">{Math.max(1, Math.ceil(-elapsed / 1000))}</p>
          </div>
        ) : (
          <div key={cur.id} className="w-full max-w-5xl text-center">
            <p className="text-xl uppercase tracking-[0.4em] text-slate-400">Guru {idx + 1} / {n}</p>
            <p className="lottery-rise mt-4 font-display text-[clamp(3rem,7vw,8rem)] leading-none">{cur.name}</p>
            <div className="mt-8 flex items-center justify-center gap-6">
              <span className="text-2xl uppercase tracking-[0.3em] text-slate-400">Draft-numero</span>
              <span className={`grid h-44 w-44 place-items-center rounded-3xl border-4 font-display text-9xl transition-all ${revealed ? 'scale-110 border-ice-400 bg-ice-500/20 text-white shadow-[0_0_80px_rgba(56,189,248,0.5)]' : 'border-white/10 bg-white/5 text-slate-500'}`}>
                {revealed ? cur.draft_number : L.paused ? '?' : spin}
              </span>
            </div>
            <div className="mx-auto mt-8 h-1.5 max-w-xl overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-ice-400" style={{ width: `${Math.min(100, (inStep / L.step) * 100)}%` }} />
            </div>
          </div>
        )}
        {L.paused && <p className="mt-6 animate-pulse font-display text-4xl tracking-[0.3em] text-amber-300">⏸ TAUKO</p>}
        {onToggle && (
          <button onClick={onToggle} className={`btn mt-6 px-8 py-3 text-lg ${L.paused ? 'btn-primary' : 'btn-ghost'}`}>
            {L.paused ? '▶ Jatka arvontaa' : '⏸ Tauko'}
          </button>
        )}
      </section>
      <aside className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-rink-850/80 p-5">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-slate-400">Arvotut · {done.length}/{n}</p>
        <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {done.map((g, i) => (
            <li key={g.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-lg ${i === 0 ? 'animate-in bg-ice-500/25 ring-1 ring-ice-400/50' : 'bg-ice-500/10'}`}>
              <span className="w-10 text-right font-display text-2xl text-ice-300">{g.draft_number}.</span>
              <span className="font-semibold">{g.name}</span>
            </li>
          ))}
          {!done.length && <li className="text-sm text-slate-500">Arvonta alkaa…</li>}
        </ol>
      </aside>
    </main>
  );
}

/* ---------- Ennen draftia ---------- */
function Lobby({ st, onStart }: { st: DraftState; onStart?: () => void }) {
  const ready = st.gurus.every((g) => g.draft_number != null);
  return (
    <main className="mx-auto max-w-6xl p-8">
      <p className="text-center text-2xl uppercase tracking-[0.4em] text-ice-300">{ready ? 'Valintajärjestys' : 'Draft alkaa pian'}</p>
      {onStart && !ready && (
        <div className="mt-6 text-center">
          <button onClick={onStart} className="btn btn-primary px-10 py-4 text-2xl shadow-[0_0_60px_rgba(56,189,248,0.35)]">🎲 Aloita arvonta</button>
          <p className="mt-2 text-sm text-slate-400">Arvonta alkaa 10 sekunnin lähtölaskennalla.</p>
        </div>
      )}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {st.gurus.map((g) => (
          <div key={g.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-rink-850/80 px-5 py-4">
            <span className="w-10 font-display text-4xl text-ice-300">{g.draft_number ?? '?'}</span>
            <span className="flex-1 truncate text-2xl font-semibold">{g.name}</span>
            <span className="text-sm text-slate-400">{g.remote_draft ? '📋 lomake' : '🏒 paikalla'}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

/* ---------- Käynnissä / valmis ---------- */
function Live({ st, note }: { st: DraftState; note?: string | null }) {
  const mine = st.onClock ? st.picks.filter((p) => p.guru_id === st.onClock!.id) : [];
  const left = (p: Position) => st.roster[p] - mine.filter((x) => x.position === p).length;
  const upcoming = Array.from({ length: 4 }, (_, i) => st.pickNo + 1 + i).filter((n) => n <= st.total)
    .map((n) => ({ n, g: guruForPick(st.gurus, n, st.snake) }));
  const recent = st.picks.slice(-12).reverse();
  const name = (id: number) => st.gurus.find((g) => g.id === id)?.name ?? '';

  // Draft-taulu vierii itsestään niin, että vuorossa oleva guru pysyy näkyvissä
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boardRef.current;
    const row = box?.querySelector<HTMLElement>('[data-onclock]');
    if (!box || !row) return;
    box.scrollTo({ top: row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2, behavior: 'smooth' });
  }, [st.pickNo]);

  const live = st.status === 'live' && !!st.onClock;
  const COLS: Position[] = ['C', 'G', 'D', 'F'];
  return (
    <main className="grid h-[calc(100vh-65px)] gap-4 overflow-hidden p-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,24%)]">
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        {st.status === 'done' && !st.picks.length ? (
          <section className="rounded-3xl border border-white/10 bg-rink-850/80 px-8 py-10 text-center">
            <p className="font-display text-4xl">Kauden kentälliset on jo luotu</p>
            <p className="mt-3 text-slate-300">Tämän kauden joukkueet on syötetty suoraan, joten draft-tilaisuutta ei ole. Arvonta ja live-draft käynnistyvät, kun uuden kauden draft on valmistelutilassa.</p>
            <a href="/draft/naytto?harjoitus" className="btn btn-primary mt-6 inline-flex">🧪 Kokeile harjoitusarvontaa</a>
          </section>
        ) : !live && (st.status === 'done' || st.picks.length >= st.total) ? (
          <section className="rounded-3xl border border-ice-400/40 bg-ice-500/10 px-8 py-5 text-center font-display text-4xl">Draft valmis – onnea kaudelle! 🏆</section>
        ) : null}

        {st.picks.length > 0 && (
          <section className="flex min-h-0 flex-[3] flex-col rounded-3xl border border-amber-400/30 bg-rink-850/80 p-3">
            <p className="px-1 text-sm uppercase tracking-[0.3em] text-amber-300">🔥 Varaustilanne <span className="normal-case tracking-normal text-slate-400">· <span className="text-amber-300">kuuma</span> · <span className="text-red-300">täynnä</span></span></p>
            <div className="mt-2 grid min-h-0 flex-1 grid-cols-[1fr_1fr_1fr_2fr] gap-3">
              {COLS.map((pos) => {
                const max = st.maxPicks[pos];
                const list = st.pool.filter((p) => p.position === pos && p.used > 0)
                  .sort((a, b) => b.used - a.used || a.name.localeCompare(b.name, 'fi'));
                return (
                  <div key={pos} className="flex min-h-0 min-w-0 flex-col">
                    <p className="mb-1 flex items-center gap-1.5 border-b border-white/10 pb-1 text-xs uppercase tracking-wider text-slate-400">
                      <PosBadge pos={pos} />{POS_PLURAL[pos]} <span className="ml-auto font-mono">{list.length} · max {max}</span>
                    </p>
                    <div className={`min-h-0 flex-1 overflow-y-auto pr-1 ${pos === 'F' ? 'columns-2 gap-2' : ''}`}>
                      {list.map((p) => {
                        const cls = p.used >= max ? 'bg-goal/30 text-red-100' : p.used >= Math.min(HOT, max) ? 'bg-amber-400/15 text-amber-100' : 'text-slate-300';
                        return (
                          <div key={p.entity_id} className={`mb-0.5 flex break-inside-avoid items-center gap-1 rounded px-1.5 text-sm leading-6 ${cls}`}>
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            <span className="font-mono font-bold">{p.used}</span>
                          </div>
                        );
                      })}
                      {!list.length && <p className="text-xs text-slate-600">–</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div ref={boardRef} className="min-h-0 flex-[2] overflow-y-auto rounded-3xl border border-white/10 bg-rink-900 px-2 pb-2">
          <DraftGrid st={st} compact />
        </div>
      </div>

      <aside className="flex min-h-0 flex-col gap-4">
        {live && st.onClock && (
          <section className="shrink-0 rounded-3xl border border-ice-400/40 bg-gradient-to-b from-ice-500/25 to-rink-850 p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-ice-300">Vuorossa · kierros {st.round}{st.snake && st.round % 2 === 0 ? ' ↩' : ''} · {st.pickNo}/{st.total}</p>
            <p className="font-display text-[clamp(2rem,3.2vw,4rem)] leading-tight">{st.onClock.name}</p>
            <p className="text-sm text-slate-300">{st.onClock.remote_draft ? '📋 Ei paikalla – valinta lomakkeelta' : '🏒 Paikalla – valitsee nyt'}</p>
            {note && <p className="mt-1 animate-pulse font-semibold text-amber-300">{note}</p>}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {POSITIONS.map((p) => (
                <div key={p} className={`rounded-xl border px-1 py-2 text-center ${left(p) ? 'border-white/15 bg-white/5' : 'border-transparent opacity-25'}`}>
                  <div className="font-display text-3xl">{left(p)}</div>
                  <div className="truncate text-[10px] uppercase tracking-wider text-slate-400">{POS_PLURAL[p]}</div>
                </div>
              ))}
            </div>
            {upcoming.length > 0 && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Seuraavaksi</p>
                <ol className="mt-1 space-y-0.5">
                  {upcoming.map(({ n, g }) => <li key={n} className="truncate"><span className="mr-2 font-mono text-sm text-slate-500">{n}</span>{g.name}</li>)}
                </ol>
              </div>
            )}
          </section>
        )}
        <section className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-white/10 bg-rink-850/80 p-4">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Viimeisimmät</p>
          <ul className="mt-2 space-y-1.5">
            {recent.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-2 ${i === 0 ? 'text-lg' : 'text-sm text-slate-300'}`}>
                <span className="w-7 font-mono text-xs text-slate-500">{p.pick_no}</span>
                <PosBadge pos={p.position} />
                <span className="min-w-0 flex-1 truncate"><b>{p.name}</b> <span className="text-slate-500">→ {name(p.guru_id)}</span></span>
              </li>
            ))}
            {!recent.length && <li className="text-sm text-slate-500">Ei valintoja vielä.</li>}
          </ul>
        </section>
      </aside>
    </main>
  );
}
