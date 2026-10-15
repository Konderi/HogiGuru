import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { POS_LABEL, POS_PLURAL, POSITIONS, type Position } from '../api';
import { useApi } from '../auth';
import { Logo, PosBadge, Spinner } from '../ui';
import { DraftGrid, type DraftState } from './DraftBoard';

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
  const { data: st, reload } = useApi<DraftState>('/draft');
  const offset = useRef(0);
  useEffect(() => { if (st?.lottery) offset.current = st.lottery.now - Date.now(); }, [st]);
  useEffect(() => {
    const t = setInterval(reload, st?.lottery ? 1000 : 3000);
    return () => clearInterval(t);
  }, [st?.lottery, reload]);

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
          {st.status === 'live' && <span className="flex items-center gap-2 font-semibold text-goal"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-goal" />LIVE</span>}
          <Clock />
          <button onClick={fs} className="rounded-lg border border-white/10 px-3 py-1 hover:bg-white/5" title="Koko näyttö">⛶</button>
          <Link to="/admin/draft" className="rounded-lg border border-white/10 px-3 py-1 hover:bg-white/5">Hallinta</Link>
        </div>
      </header>

      {st.lottery ? <Lottery st={st} offset={offset.current} />
        : st.status === 'setup' ? <Lobby st={st} />
        : <Live st={st} />}

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

function Clock() {
  const now = useNow(10_000);
  return <span className="font-mono">{new Date(now).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}</span>;
}

/* ---------- Arvonta ---------- */
function Lottery({ st, offset }: { st: DraftState; offset: number }) {
  const now = useNow(80) + offset;
  const L = st.lottery!;
  const elapsed = now - L.at;
  const n = L.order.length;
  const idx = Math.min(Math.floor(elapsed / L.step), n - 1);
  const inStep = elapsed - idx * L.step;
  const cur = elapsed >= 0 ? L.order[idx] : null;
  const revealed = cur && inStep >= L.reveal && cur.draft_number != null;
  const spin = useMemo(() => 1 + Math.floor(Math.random() * n), [now, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = L.order.filter((g, i) => i < idx || (i === idx && revealed)).filter((g) => g.draft_number != null)
    .sort((a, b) => a.draft_number! - b.draft_number!);

  return (
    <main className="grid min-h-[calc(100vh-65px)] grid-cols-[1fr_minmax(280px,26%)] gap-6 p-8">
      <section className="grid place-items-center">
        {!cur ? (
          <div className="text-center">
            <p className="text-2xl uppercase tracking-[0.4em] text-ice-300">Draft-järjestyksen arvonta</p>
            <p className="mt-6 font-display text-[12rem] leading-none">{Math.max(1, Math.ceil(-elapsed / 1000))}</p>
          </div>
        ) : (
          <div key={cur.id} className="w-full max-w-5xl text-center">
            <p className="text-xl uppercase tracking-[0.4em] text-slate-400">Guru {idx + 1} / {n}</p>
            <p className="lottery-rise mt-6 font-display text-[clamp(3rem,8vw,9rem)] leading-none">{cur.name}</p>
            <div className="mt-10 flex items-center justify-center gap-6">
              <span className="text-2xl uppercase tracking-[0.3em] text-slate-400">Draft-numero</span>
              <span className={`grid h-48 w-48 place-items-center rounded-3xl border-4 font-display text-9xl transition-all ${revealed ? 'scale-110 border-ice-400 bg-ice-500/20 text-white shadow-[0_0_80px_rgba(56,189,248,0.5)]' : 'border-white/10 bg-white/5 text-slate-500'}`}>
                {revealed ? cur.draft_number : spin}
              </span>
            </div>
            <div className="mx-auto mt-10 h-1.5 max-w-xl overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-ice-400" style={{ width: `${Math.min(100, (inStep / L.step) * 100)}%` }} />
            </div>
          </div>
        )}
      </section>
      <aside className="rounded-3xl border border-white/10 bg-rink-850/80 p-5">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-slate-400">Valintajärjestys</p>
        <ol className="space-y-1.5">
          {Array.from({ length: n }, (_, i) => {
            const g = done.find((d) => d.draft_number === i + 1);
            return (
              <li key={i} className={`flex items-center gap-3 rounded-xl px-3 py-1.5 text-lg ${g ? 'animate-in bg-ice-500/15' : 'bg-white/[0.03]'}`}>
                <span className="w-8 font-display text-ice-300">{i + 1}.</span>
                <span className={g ? 'font-semibold' : 'text-slate-600'}>{g?.name ?? '—'}</span>
              </li>
            );
          })}
        </ol>
      </aside>
    </main>
  );
}

/* ---------- Ennen draftia ---------- */
function Lobby({ st }: { st: DraftState }) {
  const ready = st.gurus.every((g) => g.draft_number != null);
  return (
    <main className="mx-auto max-w-6xl p-8">
      <p className="text-center text-2xl uppercase tracking-[0.4em] text-ice-300">{ready ? 'Valintajärjestys' : 'Draft alkaa pian'}</p>
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
function Live({ st }: { st: DraftState }) {
  const mine = st.onClock ? st.picks.filter((p) => p.guru_id === st.onClock!.id) : [];
  const left = (p: Position) => st.roster[p] - mine.filter((x) => x.position === p).length;
  const upcoming = Array.from({ length: 4 }, (_, i) => st.pickNo + 1 + i).filter((n) => n <= st.total)
    .map((n) => ({ n, g: guruForPick(st.gurus, n, st.snake) }));
  const recent = st.picks.slice(-5).reverse();
  const hot = st.pool.filter((p) => p.used >= Math.min(HOT, st.maxPicks[p.position]))
    .sort((a, b) => (b.used >= st.maxPicks[b.position] ? 1 : 0) - (a.used >= st.maxPicks[a.position] ? 1 : 0) || b.used - a.used || a.name.localeCompare(b.name, 'fi'));
  const name = (id: number) => st.gurus.find((g) => g.id === id)?.name ?? '';

  return (
    <main className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,24%)]">
      <div className="min-w-0 space-y-5">
        {st.status === 'live' && st.onClock ? (
          <section className="flex flex-wrap items-center gap-8 rounded-3xl border border-ice-400/40 bg-gradient-to-r from-ice-500/25 via-rink-850 to-rink-850 px-8 py-5">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-ice-300">Vuorossa · kierros {st.round} · valinta {st.pickNo}/{st.total}</p>
              <p className="font-display text-[clamp(2.5rem,5vw,5rem)] leading-tight">{st.onClock.name}</p>
              <p className="text-slate-300">{st.onClock.remote_draft ? '📋 Ei paikalla – valinta tehdään draft-lomakkeelta' : '🏒 Paikalla – valitsee nyt'}</p>
            </div>
            <div className="flex gap-3">
              {POSITIONS.map((p) => (
                <div key={p} className={`rounded-2xl border px-4 py-2 text-center ${left(p) ? 'border-white/15 bg-white/5' : 'border-transparent opacity-25'}`}>
                  <div className="font-display text-4xl">{left(p)}</div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">{POS_PLURAL[p]}</div>
                </div>
              ))}
            </div>
            {upcoming.length > 0 && (
              <div className="ml-auto">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Seuraavaksi</p>
                <ol className="mt-1 space-y-0.5 text-lg">
                  {upcoming.map(({ n, g }) => <li key={n}><span className="mr-2 font-mono text-sm text-slate-500">{n}</span>{g.name}</li>)}
                </ol>
              </div>
            )}
          </section>
        ) : st.status === 'done' || st.picks.length >= st.total ? (
          <section className="rounded-3xl border border-ice-400/40 bg-ice-500/10 px-8 py-5 text-center font-display text-4xl">Draft valmis – onnea kaudelle! 🏆</section>
        ) : null}

        <div className="rounded-3xl border border-white/10 bg-rink-900 p-2">
          <DraftGrid st={st} compact />
        </div>
      </div>

      <aside className="space-y-5">
        <section className="rounded-3xl border border-amber-400/30 bg-rink-850/80 p-5">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300">🔥 Varaustilanne</p>
          <p className="mt-1 text-xs text-slate-400">Valittu vähintään {HOT} kertaa – mieti varavalinta!</p>
          <ul className="mt-3 space-y-1.5">
            {hot.map((p) => {
              const full = p.used >= st.maxPicks[p.position];
              return (
                <li key={`${p.position}-${p.entity_id}`} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${full ? 'bg-goal/20 ring-1 ring-goal/50' : 'bg-amber-400/10 ring-1 ring-amber-400/30'}`}>
                  <PosBadge pos={p.position} />
                  <span className={`min-w-0 flex-1 truncate font-semibold ${full ? 'text-slate-400 line-through' : ''}`}>{p.name}</span>
                  <span className={`font-mono text-lg font-bold ${full ? 'text-goal' : 'text-amber-300'}`}>{p.used}/{st.maxPicks[p.position]}</span>
                  {full && <span className="rounded bg-goal px-1.5 text-xs font-bold">TÄYNNÄ</span>}
                </li>
              );
            })}
            {!hot.length && <li className="text-sm text-slate-500">Ei vielä yhtään.</li>}
          </ul>
        </section>
        <section className="rounded-3xl border border-white/10 bg-rink-850/80 p-5">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Viimeisimmät</p>
          <ul className="mt-3 space-y-2">
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
