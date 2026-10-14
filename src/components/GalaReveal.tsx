import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmt } from '../api';
import { useApi } from '../auth';
import type { Results } from './ResultsView';
import { Logo, Spinner } from '../ui';
import GoldConfetti from './GoldConfetti';

function DelayedConfetti() {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 1200); return () => clearTimeout(t); }, []);
  return on ? <GoldConfetti duration={10000} /> : null;
}

/**
 * Gaalaesitys: paljastaa kokonaistulokset vaiheittain.
 * 1) sijat 31– (hitaasti alhaalta ylös), 2) 21–30, 3) 11–20, 4–13) sijat 10…1 yksi kerrallaan.
 * Käyttää ylläpidon dataa, joten esityksen voi harjoitella milloin tahansa ennen julkaisua.
 */
export default function GalaReveal({ onClose, onPublish }: { onClose: () => void; onPublish?: () => void }) {
  const { data } = useApi<Results>('/admin/results');
  const [stage, setStage] = useState(0);

  // Vaiheet = "näytä sijat >= cutoff". Tyhjät vaiheet (vähän guruja) ohitetaan.
  const stages = useMemo(() => {
    const n = data?.rows.length ?? 0;
    const cuts = [31, 21, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const out: { cut: number; label: string }[] = [];
    let prev = Infinity;
    for (const c of cuts) {
      const has = data?.rows.some((r) => r.rank >= c && r.rank < prev);
      if (!has) continue;
      out.push({ cut: c, label: c >= 11 ? `Sijat ${c}–${Math.min(prev - 1, n)}` : c === 1 ? 'Voittaja' : `Sija ${c}` });
      prev = c;
    }
    return out;
  }, [data]);

  const cut = stage === 0 ? Infinity : stages[stage - 1]?.cut ?? 1;
  const done = stage >= stages.length;
  const next = useCallback(() => setStage((s) => Math.min(s + 1, stages.length)), [stages.length]);
  const prev = useCallback(() => setStage((s) => Math.max(s - 1, 0)), []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [next, prev, onClose]);

  if (!data) return <div className="fixed inset-0 z-50 grid place-items-center bg-rink-950"><Spinner /></div>;
  const visible = data.rows.filter((r) => r.rank >= cut);
  // Uusimman erän ajastus: huonoin ensin, paras viimeisenä
  const prevCut = stage <= 1 ? Infinity : stages[stage - 2].cut;
  const batch = visible.filter((r) => r.rank < prevCut).sort((a, b) => b.rank - a.rank).map((r) => r.id);
  const step = batch.length > 1 ? Math.min(1.1, 9 / batch.length) : 0;
  const top = cut <= 10;
  // Voittajan paljastus: kultainen konfetti + ilotulitus ~10 s (pieni viive, jotta nimi ehtii esiin)
  const winner = stage > 0 && stages[stage - 1]?.cut === 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-b from-rink-950 via-rink-900 to-rink-950">
      {winner && <DelayedConfetti key={stage} />}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3"><Logo className="h-10 w-10" /><div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ice-300">HogiGuru-gaala {data.season}</p>
          <p className="font-display text-2xl text-white">{stage === 0 ? 'Kokonaistulokset' : stages[stage - 1].label}</p>
        </div></div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{stage}/{stages.length}</span>
          <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => document.documentElement.requestFullscreen?.()}>⛶ Koko näyttö</button>
          <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setStage(0)}>↺ Alusta</button>
          <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={onClose}>✕ Sulje</button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-28">
        {stage === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div className="gala-in"><p className="text-7xl">🏆</p><p className="mt-6 font-display text-5xl text-white">Kausi {data.season}</p>
              <p className="mt-3 text-slate-400">{data.rows.length} gurua · All-Stars + veikkaukset</p></div>
          </div>
        ) : (<>
          {cut <= 3 && (
            /* Palkintokoroke: 2. vasemmalla, 1. keskellä korkeimmalla, 3. oikealla */
            <div className="mx-auto mb-8 grid max-w-4xl grid-cols-3 items-end gap-3 pt-6 sm:gap-6">
              {([2, 1, 3] as const).map((place) => {
                const r = data.rows.find((x) => x.rank === place) ?? (place === 3 ? data.rows.filter((x) => x.rank <= 3)[2] : undefined);
                const shown = !!r && r.rank >= cut;
                const isNew = shown && batch.includes(r!.id);
                const h = place === 1 ? 'h-48 sm:h-56' : place === 2 ? 'h-36 sm:h-40' : 'h-28 sm:h-32';
                const tone = place === 1 ? 'from-yellow-300/50 to-yellow-600/20 border-yellow-300/60' : place === 2 ? 'from-slate-200/40 to-slate-500/15 border-slate-200/50' : 'from-amber-600/45 to-amber-900/20 border-amber-600/50';
                return (
                  <div key={place} className="flex flex-col items-center">
                    <div className={`mb-3 min-h-[120px] w-full text-center ${shown ? (isNew ? (place === 1 ? 'gala-glow rounded-2xl' : 'gala-in') : '') : 'opacity-0'}`}>
                      {shown && <>
                        <p className={place === 1 ? 'text-6xl' : 'text-5xl'}>{place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</p>
                        <p className={`mt-2 font-display leading-tight text-white ${place === 1 ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-3xl'}`}>{r!.name}</p>
                        <p className={`scoreboard mt-1 ${place === 1 ? 'text-4xl' : 'text-2xl'}`}>{fmt(r!.total)}</p>
                        <p className="mt-1 hidden text-xs text-slate-400 sm:block">All-Stars {fmt(r!.allstars)} · Veikkaukset {fmt(r!.standings + r!.topScorers + r!.categories)}</p>
                      </>}
                    </div>
                    <div className={`flex w-full items-start justify-center rounded-t-2xl border border-b-0 bg-gradient-to-b pt-3 shadow-2xl ${h} ${tone}`}>
                      <span className="font-display text-5xl text-white/80 sm:text-7xl">{place}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <ol className={`mx-auto grid max-w-5xl gap-2 ${top ? '' : 'md:grid-cols-2'}`}>
            {[...visible].filter((r) => cut > 3 || r.rank > 3).sort((a, b) => a.rank - b.rank).map((r) => {
              const i = batch.indexOf(r.id);
              const isNew = i >= 0;
              const big = r.rank <= 3 && r.rank >= cut;
              return (
                <li key={r.id} style={isNew ? { animationDelay: `${i * step}s` } : undefined}
                  className={`${isNew ? (big ? 'gala-glow' : 'gala-in') : ''} flex items-center gap-4 rounded-2xl border px-5 ${r.rank <= 10 ? 'py-4' : 'py-2.5'} ${
                    r.rank === 1 ? 'border-yellow-400/60 bg-yellow-400/10' : r.rank <= 3 ? 'border-ice-300/40 bg-ice-500/10' : 'border-white/10 bg-rink-850/70'}`}>
                  <span className={`scoreboard w-12 text-right ${r.rank <= 10 ? 'text-3xl' : 'text-xl'}`}>{r.rank}.</span>
                  <span className={`flex-1 font-semibold text-white ${r.rank === 1 ? 'text-4xl' : r.rank <= 10 ? 'text-2xl' : 'text-lg'}`}>{r.rank === 1 && '🥇 '}{r.rank === 2 && '🥈 '}{r.rank === 3 && '🥉 '}{r.name}</span>
                  {r.rank <= 10 && <span className="hidden text-right text-xs text-slate-400 sm:block">All-Stars {fmt(r.allstars)}<br />Veikkaukset {fmt(r.standings + r.topScorers + r.categories)}</span>}
                  <span className={`scoreboard ${r.rank <= 10 ? 'text-3xl' : 'text-xl'}`}>{fmt(r.total)}</span>
                </li>
              );
            })}
          </ol>
        </>)}
      </main>

      <footer className="fixed inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-rink-950 to-transparent px-6 pb-6 pt-10">
        <button className="btn btn-ghost" disabled={stage === 0} onClick={prev}>←</button>
        {!done ? (
          <button className="btn btn-primary px-8 py-3 text-lg" onClick={next}>
            {stage === 0 ? 'Aloita' : 'Seuraava'}: {stages[stage]?.label}
          </button>
        ) : onPublish ? (
          <button className="btn btn-primary px-8 py-3 text-lg" onClick={onPublish}>📣 Julkaise tulokset kaikille</button>
        ) : <span className="text-sm text-slate-400">Kaikki paljastettu 🎉</span>}
        <span className="hidden text-xs text-slate-500 sm:inline">välilyönti / → = seuraava · ← = takaisin · Esc = sulje</span>
      </footer>
    </div>
  );
}
