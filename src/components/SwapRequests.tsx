import { useEffect, useState } from 'react';
import { api, fmtDate, POS_LABEL, type Slot } from '../api';
import { useApi } from '../auth';
import { Card, EntityPicker, Empty, PosBadge, ReservedBadge, Spinner, type SearchHit } from '../ui';

interface Req { slot_id: number; candidates: number[] }
interface Resp {
  guru: { id: number; name: string } | null;
  day: { id: number; date: string; start_time: string; end_time: string } | null;
  deadline: string | null; now: string; position: number | null; reversed: boolean; dayNumber: number; gurus: number;
  swaps: { used: number; max: number | null };
  requests: Req[];
  history: { date: string; slot_id: number; status: string; result_note: string | null; priority: number }[];
}

/** Gurun vaihtotoiveet seuraavaan vaihtopäivään. */
export function SwapRequests({ slots }: { slots: Slot[] }) {
  const { data, loading, reload } = useApi<Resp>('/me/swaps');
  const coaches = useApi<SearchHit[]>('/coaches');
  const [reqs, setReqs] = useState<Req[]>([]);
  const [names, setNames] = useState<Record<string, SearchHit>>({});
  const [adding, setAdding] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (data) { setReqs(data.requests); setDirty(false); } }, [data]);
  // Nimet ja varaustilanteet kaikille pelaajille/valmentajille
  useEffect(() => {
    if (!data) return;
    type R = { maxPicks: number; players: (SearchHit & { reserved: number })[] };
    Promise.all([api<R>('/stats?pos=F'), api<R>('/stats?pos=D'), api<R>('/stats?pos=G')]).then((res) => {
      const m: Record<string, SearchHit> = {};
      for (const r of res) for (const p of r.players) m[`P${p.id}`] = { ...p, max: r.maxPicks };
      for (const c of coaches.data ?? []) m[`C${c.id}`] = c;
      setNames((n) => ({ ...n, ...m }));
    }).catch(() => {});
  }, [data, coaches.data]);

  if (loading && !data) return <Spinner />;
  if (!data?.guru) return null;
  const active = slots.filter((s) => s.active);
  const left = data.swaps.max == null ? null : data.swaps.max - data.swaps.used;
  const key = (pos: string, id: number) => `${pos === 'C' ? 'C' : 'P'}${id}`;
  const update = (r: Req[]) => { setReqs(r); setDirty(true); };
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= reqs.length) return; const r = [...reqs]; [r[i], r[j]] = [r[j], r[i]]; update(r); };

  const save = async () => {
    try { await api('/me/swaps', { method: 'PUT', body: { requests: reqs } }); setMsg({ t: 'Vaihtotoiveet tallennettu ✓' }); reload(); }
    catch (e) { setMsg({ t: (e as Error).message, err: true }); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card title="Vaihtotoiveet" action={dirty && <span className="text-xs text-amber-300">Tallentamattomia muutoksia</span>}>
        {!data.day ? <Empty>Ei avointa vaihtopäivää.</Empty> : (
          <div className="space-y-4 p-5">
            {left !== null && left <= 0 && <p className="rounded-xl bg-goal/15 p-3 text-sm text-goal">Kaikki vaihdot on käytetty.</p>}
            {reqs.length === 0 && <p className="text-sm text-slate-400">Ei toiveita. Lisää vaihto valitsemalla alta lähtevä pelaaja.</p>}
            <ol className="space-y-3">
              {reqs.map((r, i) => {
                const s = active.find((x) => x.id === r.slot_id);
                if (!s) return null;
                return (
                  <li key={r.slot_id} className="rounded-2xl border border-white/10 bg-rink-950/50 p-4">
                    <div className="flex items-center gap-3">
                      <span className="scoreboard w-6 text-lg">{i + 1}.</span>
                      <PosBadge pos={s.position} />
                      <span className="flex-1 text-sm"><span className="text-slate-400">Ulos:</span> <b className="text-white">{s.name}</b></span>
                      <button className="px-1 text-slate-400 hover:text-white disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                      <button className="px-1 text-slate-400 hover:text-white disabled:opacity-20" disabled={i === reqs.length - 1} onClick={() => move(i, 1)}>▼</button>
                      <button className="px-1 text-slate-500 hover:text-goal" onClick={() => update(reqs.filter((_, j) => j !== i))}>✕</button>
                    </div>
                    <div className="mt-3 pl-9">
                      <p className="label">Sisään (varavaihtoehdot järjestyksessä)</p>
                      <ol className="mb-2 space-y-1">
                        {r.candidates.map((id, k) => (
                          <li key={id} className="flex items-center gap-2 text-sm">
                            <span className="w-5 text-right font-mono text-xs text-slate-500">{k + 1}.</span>
                            <span className="flex-1 text-white">{names[key(s.position, id)]?.name ?? `#${id}`}</span>
                            {names[key(s.position, id)]?.max != null && <ReservedBadge n={names[key(s.position, id)].reserved ?? 0} max={names[key(s.position, id)].max!} />}
                            <button className="px-1 text-xs text-slate-500 hover:text-white disabled:opacity-20" disabled={k === 0} onClick={() => { const c = [...r.candidates]; [c[k - 1], c[k]] = [c[k], c[k - 1]]; update(reqs.map((x, j) => j === i ? { ...x, candidates: c } : x)); }}>▲</button>
                            <button className="px-1 text-xs text-slate-500 hover:text-goal" onClick={() => update(reqs.map((x, j) => j === i ? { ...x, candidates: x.candidates.filter((c) => c !== id) } : x))}>✕</button>
                          </li>
                        ))}
                      </ol>
                      {adding === s.id ? (
                        <EntityPicker pos={s.position} options={s.position === 'C' ? coaches.data ?? [] : undefined} placeholder={`Hae ${POS_LABEL[s.position].toLowerCase()}…`}
                          onPick={(h) => { setNames((n) => ({ ...n, [key(s.position, h.id)]: h })); if (!r.candidates.includes(h.id) && h.id !== s.entity_id) update(reqs.map((x, j) => j === i ? { ...x, candidates: [...x.candidates, h.id] } : x)); setAdding(null); }} />
                      ) : <button className="text-sm font-semibold text-ice-400 hover:text-ice-300" onClick={() => setAdding(s.id)}>+ Lisää {r.candidates.length ? 'varavaihtoehto' : 'tulija'}</button>}
                    </div>
                  </li>
                );
              })}
            </ol>

            <div>
              <p className="label">Uusi vaihto – valitse lähtevä</p>
              <div className="flex flex-wrap gap-2">
                {active.filter((s) => !reqs.some((r) => r.slot_id === s.id)).map((s) => (
                  <button key={s.id} className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-ice-400/50 hover:text-white"
                    onClick={() => { update([...reqs, { slot_id: s.id, candidates: [] }]); setAdding(s.id); }}>
                    <PosBadge pos={s.position} /> {s.name}
                  </button>
                ))}
              </div>
            </div>

            {msg && <p className={`text-sm ${msg.err ? 'text-goal' : 'text-emerald-300'}`}>{msg.t}</p>}
            <button className="btn btn-primary w-full" onClick={save} disabled={!dirty}>Tallenna vaihtotoiveet</button>
          </div>
        )}
      </Card>

      <div className="space-y-6">
        <Card title="Seuraava vaihtopäivä">
          <div className="space-y-3 p-5 text-sm">
            {data.day ? (
              <>
                <p className="font-display text-2xl text-white">{fmtDate(data.day.date)}</p>
                <p className="text-slate-400">Toiveita voi muokata <b className="text-white">{fmtDate(data.day.date)} klo {data.day.end_time}</b> asti.</p>
                {data.position && (
                  <div className="rounded-xl bg-ice-500/10 p-3">
                    <p className="label">Oma vuoro</p>
                    <p className="scoreboard text-3xl">{data.position}<span className="text-base text-slate-500"> / {data.gurus}</span></p>
                    <p className="mt-1 text-xs text-slate-400">{data.dayNumber}. vaihtopäivä · {data.reversed ? 'käänteinen draft-järjestys' : 'draft-järjestys'}</p>
                  </div>
                )}
              </>
            ) : <p className="text-slate-400">Ei tulevia vaihtopäiviä.</p>}
            <p className="text-slate-400">Vaihtoja käytetty <b className="text-white">{data.swaps.used}{data.swaps.max != null && ` / ${data.swaps.max}`}</b></p>
          </div>
        </Card>
        <Card title="Näin se toimii">
          <ul className="list-disc space-y-1.5 p-5 pl-9 text-xs text-slate-400">
            <li>Tallenna toiveet etukäteen – kellon kanssa ei tarvitse kilpailla.</li>
            <li>Vaihtopäivän päätyttyä toiveet käsitellään kierroksittain: ensin kaikkien 1. toive vuorojärjestyksessä, sitten 2. toive jne.</li>
            <li>Vuorojärjestys on draft-järjestys; joka toisena vaihtopäivänä käänteinen.</li>
            <li>Jos tulija on jo täynnä, otetaan seuraava varavaihtoehto. Jos mikään ei käy, vaihto ei toteudu eikä vaihtokertaa kulu.</li>
            <li>HG-komitea hyväksyy käsittelyn, ja vaihdot astuvat voimaan seuraavasta pelistä.</li>
          </ul>
        </Card>
        <Card title="Varaustilanne">
          <div className="space-y-2 p-5 text-xs text-slate-400">
            <p>Pelaajahaun tuloksissa ja toivelistassa näkyy merkki <b className="text-white">varattu / max</b>: vihreä = tilaa, keltainen = yksi paikka jäljellä, punainen = täynnä.</p>
            <p>Huom: tilanne voi muuttua ennen käsittelyä, siksi kannattaa lisätä varavaihtoehtoja.</p>
            <a href="/pelaajat" className="inline-block font-semibold text-ice-300 hover:underline">Kaikki pelaajat ja vapaat paikat → Pelaajat</a>
          </div>
        </Card>
      </div>
    </div>
  );
}
