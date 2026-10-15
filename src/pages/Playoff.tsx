import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { isAdminRole, useApi, useAuth } from '../auth';
import { Avatar, Card, Empty, ErrorBox, Modal, PageHeader, ReservedBadge, Spinner } from '../ui';

interface SeriesTeam { id: string; name: string; logo: string | null; wins: number }
interface Series {
  phase: number; pair: number; reqWins: number; a: SeriesTeam; b: SeriesTeam; winner: string | null; done: boolean; played: number; next: string | null;
  games: { id: number; start: string; home: string; away: string; hg: number; ag: number; ended: boolean; ot: boolean }[];
}
interface Bracket { season: number; current: number; alive: string[]; rounds: { phase: number; name: string; guru: boolean; done: boolean; series: Series[] }[] }

const fmt = (d: string) => new Date(d).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

function TeamRow({ t, s }: { t: SeriesTeam; s: Series }) {
  const lost = s.done && s.winner !== t.id;
  const won = s.winner === t.id;
  return (
    <div className={`flex items-center gap-2 ${lost ? 'opacity-40' : ''}`}>
      {t.logo ? <img src={t.logo} alt="" className="h-6 w-6 object-contain" /> : <span className="h-6 w-6" />}
      <span className={`flex-1 truncate text-sm ${won ? 'font-bold text-white' : 'text-slate-300'}`}>{t.name}</span>
      <span className={`font-display text-xl ${won ? 'text-ice-300' : 'text-slate-400'}`}>{t.wins}</span>
    </div>
  );
}

function SeriesCard({ s }: { s: Series }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border p-3 ${s.done ? 'border-white/8 bg-white/[0.02]' : 'border-ice-400/30 bg-ice-500/5'}`}>
      <button className="block w-full space-y-1.5 text-left" onClick={() => setOpen(!open)}>
        <TeamRow t={s.a} s={s} />
        <TeamRow t={s.b} s={s} />
        <div className="pt-1 text-[11px] text-slate-500">
          {s.done ? 'Sarja ratkennut' : s.next ? `Seuraava: ${fmt(s.next)}` : 'Käynnissä'} · {s.reqWins} voittoon
        </div>
      </button>
      {open && (
        <ul className="mt-2 space-y-0.5 border-t border-white/6 pt-2 text-xs text-slate-400">
          {s.games.map((g, i) => (
            <li key={g.id} className="flex justify-between gap-2">
              <span>{i + 1}. {fmt(g.start)}</span>
              <span className="tabular-nums text-slate-300">{g.ended ? `${g.home === s.a.id ? g.hg : g.ag}–${g.home === s.a.id ? g.ag : g.hg}${g.ot ? ' JA' : ''}` : '–'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TopRow { id: number; name: string; team: string; picture: string | null; games: number; goals: number; assists: number; hg: number }

function TopLists({ season }: { season: number }) {
  const { data, error, reload } = useApi<{ total: number; top: Record<'F' | 'D' | 'G', TopRow[]> }>(`/admin/playoff/top?season=${season}`, [season]);
  const [busy, setBusy] = useState(false);
  const sync = async () => { setBusy(true); try { await api(`/admin/playoff/sync?season=${season}`, { method: 'POST' }); await reload(); } finally { setBusy(false); } };
  const labels = { F: 'Hyökkääjät', D: 'Puolustajat', G: 'Maalivahdit' } as const;
  return (
    <Card title="Pudotuspelien HG-kärki" action={<button className="btn btn-ghost" disabled={busy} onClick={sync}>{busy ? 'Haetaan…' : '↻ Hae tilastot'}</button>}>
      <ErrorBox error={error} />
      {!data?.total ? <Empty>Ei pudotuspelitilastoja tälle kaudelle – paina "Hae tilastot".</Empty> : (
        <div className="grid gap-4 p-4 md:grid-cols-3">
          {(['F', 'D', 'G'] as const).map((k) => (
            <div key={k}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{labels[k]}</h3>
              <ol className="space-y-1 text-sm">
                {data.top[k].map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="w-5 text-right text-slate-500">{i + 1}.</span>
                    <span className="flex-1 truncate text-slate-200">{r.name} <span className="text-xs text-slate-500">{r.team}</span></span>
                    <span className="text-xs text-slate-500">{r.games} O</span>
                    <span className="w-10 text-right font-display text-ice-300">{r.hg}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

interface PoSeason { id: number; name: string; reg_open: number; draft_status: string; max_picks_by_pos: string; max_swaps: number; swap_open: number }
interface Entry { id: number; name: string; email: string | null; champion: string | null; champion_name: string | null }

function AdminCompetition() {
  const { data, error, reload } = useApi<{ season: PoSeason | null; entries: Entry[] }>('/admin/playoff/season');
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await reload(); } catch (e) { setErr((e as Error).message); } };
  const s = data?.season;
  const limits = s ? JSON.parse(s.max_picks_by_pos || '{}') as Record<string, number> : {};
  const setLimit = (k: string, v: number) => run(() => api('/admin/playoff/season', { method: 'PUT', body: { max_picks_by_pos: { ...limits, [k]: v } } }));
  return (
    <Card title="Kisan hallinta (ylläpito)">
      <div className="space-y-4 p-4">
        <ErrorBox error={error ?? err} />
        {!data ? <Spinner /> : !s ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-400">Play-Off-kisaa ei ole vielä luotu tälle kaudelle.</p>
            <button className="btn btn-primary" onClick={() => run(() => api('/admin/playoff/season', { method: 'POST' }))}>Luo Play-Off-kisa</button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold text-white">{s.name}</span>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={!!s.reg_open} onChange={(e) => run(() => api('/admin/playoff/season', { method: 'PUT', body: { reg_open: e.target.checked } }))} />
                Ilmoittautuminen auki
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">Draft-lomake
                <select className="input w-auto py-1" value={s.draft_status} onChange={(e) => run(() => api('/admin/playoff/season', { method: 'PUT', body: { draft_status: e.target.value } }))}>
                  <option value="setup">Ei vielä auki</option><option value="live">Auki</option><option value="done">Lukittu (kisa käynnissä)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">Vaihdot
                <select className="input w-auto py-1" value={s.swap_open} onChange={(e) => run(() => api('/admin/playoff/season', { method: 'PUT', body: { swap_open: Number(e.target.value) } }))}>
                  <option value={0}>Automaattinen</option><option value={1}>Pakko auki</option><option value={-1}>Pakko kiinni</option>
                </select>
              </label>
              <span className="text-sm text-slate-400">Vaihtoja: {s.max_swaps}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="text-slate-400">Draftin valintarajat:</span>
              {(['F', 'D', 'G'] as const).map((k) => (
                <label key={k} className="flex items-center gap-1">{k === 'F' ? 'H' : k === 'D' ? 'P' : 'MV'}
                  <input type="number" min={1} className="input w-16 py-1" defaultValue={limits[k]} onBlur={(e) => Number(e.target.value) !== limits[k] && setLimit(k, Number(e.target.value))} />
                </label>
              ))}
              <span className="text-xs text-slate-500">(vaihdoissa ei rajoja)</span>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Ilmoittautuneet ({data.entries.length})</h3>
              {!data.entries.length ? <p className="text-sm text-slate-500">Ei vielä ilmoittautuneita.</p> : (
                <ul className="divide-y divide-white/5 text-sm">
                  {data.entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-1.5">
                      <span className="flex-1 text-slate-200">{e.name} <span className="text-xs text-slate-500">{e.email}</span></span>
                      <span className="text-xs text-slate-400">🏆 {e.champion_name ?? '–'}</span>
                      <button className="text-xs text-red-300 hover:text-red-200" onClick={() => confirm(`Poistetaanko ${e.name}?`) && run(() => api(`/admin/playoff/entry/${e.id}`, { method: 'DELETE' }))}>Poista</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function MyEntry() {
  const { data, error, reload } = useApi<{ season: { name: string; reg_open: boolean } | null; guru: { name: string } | null; champion: string | null; count: number }>('/playoff/me');
  const teams = useApi<{ team_id: string; name: string }[]>('/standings');
  const [err, setErr] = useState<string | null>(null);
  if (!data?.season) return null;
  const join = async (champion?: string | null) => { setErr(null); try { await api('/playoff/join', { method: 'POST', body: champion === undefined ? {} : { champion } }); await reload(); } catch (e) { setErr((e as Error).message); } };
  const leave = async () => { setErr(null); try { await api('/playoff/join', { method: 'DELETE' }); await reload(); } catch (e) { setErr((e as Error).message); } };
  const open = data.season.reg_open;
  return (
    <Card title="Oma ilmoittautuminen">
      <div className="space-y-3 p-4 text-sm">
        <ErrorBox error={error ?? err} />
        <p className="text-slate-400">{data.count} gurua ilmoittautunut. {open ? 'Ilmoittautuminen on auki.' : 'Ilmoittautuminen on suljettu.'}</p>
        {data.guru ? (
          <>
            <p className="text-ice-200">✓ Olet mukana nimellä <b>{data.guru.name}</b>.</p>
            <label className="flex flex-wrap items-center gap-2 text-slate-300">
              🏆 Mestariveikkaus:
              <select className="input w-auto" disabled={!open} value={data.champion ?? ''} onChange={(e) => join(e.target.value || null)}>
                <option value="">– valitse –</option>
                {(teams.data ?? []).map((t) => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
              </select>
            </label>
            {open && <button className="btn btn-ghost" onClick={() => confirm('Perutaanko ilmoittautuminen?') && leave()}>Peru ilmoittautuminen</button>}
          </>
        ) : open ? <button className="btn btn-primary" onClick={() => join()}>Ilmoittaudu Play-Off-kisaan</button> : null}
      </div>
    </Card>
  );
}

// ---------- Joukkue, draft-lomake ja vaihdot ----------
type PoPos = 'F' | 'D' | 'G';
const POS_LABEL: Record<PoPos, string> = { F: 'Hyökkääjä', D: 'Puolustaja', G: 'Maalivahti' };
interface Hit { id: number; name: string; team: string; picture: string | null; reserved: number; max: number }
interface RSlot { slot_id: number; position: PoPos; player_id: number; name: string; team: string | null; picture: string | null; start_date: string | null; end_date: string | null; free: boolean; points: number; alive: boolean }
interface State {
  season: { id: number; name: string; draft_status: 'setup' | 'live' | 'done'; max_swaps: number; limits: Record<PoPos, number>; roster: Record<PoPos, number> } | null;
  window: { open: boolean; reason: string; closesAt: string | null; round: string | null };
  started: boolean; guru: { id: number; name: string } | null;
  roster: { active: RSlot[]; history: RSlot[]; swapsUsed: number; total: number } | null;
}

function PoPicker({ pos, onPick, exclude }: { pos: PoPos; onPick: (h: Hit) => void; exclude: number[] }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  useEffect(() => {
    const t = setTimeout(() => api<Hit[]>(`/playoff/search?pos=${pos}&q=${encodeURIComponent(q)}`).then(setHits).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, pos]);
  return (
    <div>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hae nimellä…" />
      <ul className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-rink-950/80">
        {hits.filter((h) => !exclude.includes(h.id)).map((h) => {
          const full = h.reserved >= h.max;
          return (
            <li key={h.id}>
              <button disabled={full} className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ice-500/10 ${full ? 'opacity-40' : ''}`} onClick={() => onPick(h)}>
                <Avatar src={h.picture} name={h.name} size="h-7 w-7" />
                <span className="flex-1 text-sm text-white">{h.name}</span>
                <span className="text-xs text-slate-400">{h.team}</span>
                <ReservedBadge n={h.reserved} max={h.max} />
              </button>
            </li>
          );
        })}
        {!hits.length && <li className="px-3 py-3 text-sm text-slate-500">Ei osumia.</li>}
      </ul>
    </div>
  );
}

function DraftForm({ st, reload }: { st: State; reload: () => void }) {
  const s = st.season!;
  const init = () => {
    const m: Record<PoPos, Hit[]> = { F: [], D: [], G: [] };
    for (const r of st.roster?.active ?? []) m[r.position].push({ id: r.player_id, name: r.name, team: r.team ?? '', picture: r.picture, reserved: 0, max: 0 });
    return m;
  };
  const [picks, setPicks] = useState(init);
  const [adding, setAdding] = useState<PoPos | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const ready = (['F', 'D', 'G'] as const).every((p) => picks[p].length === s.roster[p]);
  const save = async () => {
    try {
      await api('/playoff/picks', { method: 'POST', body: { F: picks.F.map((x) => x.id), D: picks.D.map((x) => x.id), G: picks.G.map((x) => x.id) } });
      setMsg({ text: 'Joukkue tallennettu ✓' }); reload();
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); }
  };
  return (
    <Card title="Valitse Play-Off-joukkueesi">
      <div className="space-y-4 p-4">
        <p className="text-sm text-slate-400">Valitse {s.roster.F} hyökkääjää, {s.roster.D} puolustajaa ja {s.roster.G} maalivahdin. Sama pelaaja voi olla enintään {s.limits.F} gurulla (maalivahti {s.limits.G}) – nopeat syövät hitaat. Voit muokata valintoja niin kauan kuin lomake on auki.</p>
        {(['F', 'D', 'G'] as const).map((p) => (
          <div key={p}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{POS_LABEL[p]}t ({picks[p].length}/{s.roster[p]})</h3>
            <div className="flex flex-wrap gap-2">
              {picks[p].map((h) => (
                <span key={h.id} className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-3 text-sm text-white ring-1 ring-white/10">
                  <Avatar src={h.picture} name={h.name} size="h-6 w-6" />{h.name}<span className="text-xs text-slate-400">{h.team}</span>
                  <button className="text-slate-400 hover:text-red-300" onClick={() => setPicks({ ...picks, [p]: picks[p].filter((x) => x.id !== h.id) })}>✕</button>
                </span>
              ))}
              {picks[p].length < s.roster[p] && <button className="btn btn-ghost py-1" onClick={() => setAdding(p)}>+ Lisää</button>}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={!ready} onClick={save}>Tallenna joukkue</button>
          {msg && <span className={`text-sm ${msg.err ? 'text-red-300' : 'text-ice-200'}`}>{msg.text}</span>}
        </div>
      </div>
      <Modal open={!!adding} onClose={() => setAdding(null)} title={adding ? `Valitse ${POS_LABEL[adding].toLowerCase()}` : ''}>
        {adding && <PoPicker pos={adding} exclude={picks[adding].map((x) => x.id)} onPick={(h) => { setPicks({ ...picks, [adding]: [...picks[adding], h] }); setAdding(null); }} />}
      </Modal>
    </Card>
  );
}

function RosterView({ st, reload }: { st: State; reload: () => void }) {
  const r = st.roster!; const s = st.season!; const w = st.window;
  const [swap, setSwap] = useState<RSlot | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const doSwap = async (h: Hit) => {
    if (!swap) return;
    try {
      const res = await api<{ free: boolean }>('/playoff/swap', { method: 'POST', body: { slot_id: swap.slot_id, player_id: h.id } });
      setMsg({ text: `${swap.name} → ${h.name}${res.free ? ' (ilmainen vaihto)' : ''}` }); setSwap(null); reload();
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); setSwap(null); }
  };
  return (
    <Card title={`Oma joukkue · ${r.total} HG`} action={<span className="text-xs text-slate-400">Vaihtoja {r.swapsUsed}/{s.max_swaps}</span>}>
      <div className="space-y-3 p-4">
        <div className={`rounded-lg px-3 py-2 text-sm ${w.open ? 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/30' : 'bg-white/5 text-slate-400'}`}>
          {w.open ? `🔁 Vaihtoikkuna auki${w.closesAt ? ` – sulkeutuu ${fmt(w.closesAt)}` : ''}` : `Vaihdot kiinni: ${w.reason}`}
        </div>
        {msg && <p className={`text-sm ${msg.err ? 'text-red-300' : 'text-ice-200'}`}>{msg.text}</p>}
        <ul className="divide-y divide-white/5">
          {r.active.map((x) => (
            <li key={x.slot_id} className={`flex items-center gap-3 py-2 ${x.alive ? '' : 'opacity-60'}`}>
              <span className="w-8 text-xs font-semibold text-slate-500">{x.position === 'F' ? 'H' : x.position === 'D' ? 'P' : 'MV'}</span>
              <Avatar src={x.picture} name={x.name} size="h-8 w-8" />
              <span className="flex-1 text-sm text-white">{x.name} <span className="text-xs text-slate-400">{x.team}</span>
                {!x.alive && <span className="ml-2 rounded bg-goal/20 px-1.5 py-0.5 text-[10px] text-goal">pudonnut</span>}</span>
              <span className="font-display text-lg text-ice-300">{x.points}</span>
              {w.open && <button className="btn btn-ghost py-1 text-xs" onClick={() => setSwap(x)}>{x.alive ? 'Vaihda' : 'Vaihda ilmaiseksi'}</button>}
            </li>
          ))}
        </ul>
        {r.history.length > 0 && (
          <details className="text-sm text-slate-400">
            <summary className="cursor-pointer">Vaihdetut pelaajat ({r.history.length})</summary>
            <ul className="mt-2 space-y-1">
              {r.history.map((x) => <li key={x.slot_id} className="flex justify-between"><span>{x.name} <span className="text-xs">({x.end_date} asti)</span></span><span>{x.points}</span></li>)}
            </ul>
          </details>
        )}
      </div>
      <Modal open={!!swap} onClose={() => setSwap(null)} title={swap ? `Vaihda ${swap.name}${swap.alive ? '' : ' (ilmainen)'}` : ''}>
        {swap && <PoPicker pos={swap.position} exclude={r.active.map((x) => x.player_id)} onPick={doSwap} />}
      </Modal>
    </Card>
  );
}

function MyTeamTab() {
  const { data, error, reload } = useApi<State>('/playoff/state');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  if (!data.season) return <Empty>Play-Off-kisaa ei ole vielä avattu.</Empty>;
  if (!data.guru) return <MyEntry />;
  const ds = data.season.draft_status;
  return (
    <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
      {ds === 'live' ? <DraftForm st={data} reload={reload} /> : ds === 'done' && data.roster?.active.length
        ? <RosterView st={data} reload={reload} />
        : <Card title="Oma joukkue"><Empty>{ds === 'setup' ? 'Draft-lomake aukeaa myöhemmin.' : 'Et valinnut joukkuetta ennen lukitusta.'}</Empty></Card>}
      <MyEntry />
    </div>
  );
}

interface LbRow { id: number; rank: number; name: string; points: number; alive: number; size: number; swaps: number; champion_name: string | null; champion_logo: string | null; champion_hit: boolean | null }

function LeaderboardTab() {
  const { data, error } = useApi<{ season: { draft_status: string } | null; rows: LbRow[] }>('/playoff/leaderboard');
  const [open, setOpen] = useState<number | null>(null);
  const team = useApi<{ roster: State['roster'] }>(open ? `/playoff/guru/${open}` : null, [open]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  if (!data.season) return <Empty>Play-Off-kisaa ei ole vielä avattu.</Empty>;
  return (
    <Card title="Play-Off Leaderboard">
      {!data.rows.length ? <Empty>Ei vielä osallistujia.</Empty> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th className="w-10">#</th><th>Guru</th><th className="num">Elossa</th><th className="num">Vaihdot</th><th>Mestari</th><th className="num">HG</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td className="font-display text-slate-400">{r.rank}</td>
                    <td className="font-semibold text-white">{r.name}</td>
                    <td className={`num ${r.alive === r.size && r.size ? 'text-emerald-300' : r.alive ? 'text-amber-300' : 'text-slate-500'}`}>{r.alive}/{r.size}</td>
                    <td className="num text-slate-400">{r.swaps}</td>
                    <td><span className="flex items-center gap-1.5 text-sm text-slate-300">{r.champion_logo && <img src={r.champion_logo} alt="" className="h-5 w-5 object-contain" />}{r.champion_name ?? '–'}{r.champion_hit === true && ' ✅'}{r.champion_hit === false && ' ❌'}</span></td>
                    <td className="num font-display text-lg text-ice-300">{r.points}</td>
                  </tr>
                  {open === r.id && (
                    <tr><td colSpan={6} className="bg-white/[0.02]">
                      {!team.data ? <Spinner /> : !team.data.roster ? <p className="py-2 text-sm text-slate-500">Kokoonpanot julkaistaan, kun draft on lukittu.</p> : (
                        <ul className="grid gap-1 py-2 text-sm sm:grid-cols-2">
                          {[...team.data.roster.active, ...team.data.roster.history].map((x) => (
                            <li key={x.slot_id} className={`flex items-center gap-2 ${x.end_date ? 'opacity-50' : x.alive ? '' : 'opacity-70'}`}>
                              <span className="w-7 text-xs text-slate-500">{x.position === 'F' ? 'H' : x.position === 'D' ? 'P' : 'MV'}</span>
                              <span className="flex-1 text-slate-200">{x.name} <span className="text-xs text-slate-500">{x.team}{x.end_date ? ' · vaihdettu' : !x.alive ? ' · pudonnut' : ''}</span></span>
                              <span className="text-ice-300">{x.points}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function BracketTab({ admin }: { admin: boolean }) {
  const [season, setSeason] = useState<number | null>(null);
  const { data, error, loading } = useApi<Bracket>(`/playoff/bracket${season ? `?season=${season}` : ''}`, [season]);
  return (
    <div className="space-y-6">
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select className="input w-auto" value={data.season} onChange={(e) => setSeason(Number(e.target.value))}>
              {[data.current, data.current - 1, data.current - 2].map((y) => <option key={y} value={y}>Kausi {y - 1}–{String(y).slice(2)}</option>)}
            </select>
            {data.season !== data.current && <p className="text-sm text-amber-300/80">Kuluvan kauden pudotuspelit eivät ole alkaneet – näytetään kausi {data.season - 1}–{String(data.season).slice(2)}.</p>}
          </div>
          <Card title="Hakemistopuu">
            {!data.rounds.length ? <Empty>Ei pudotuspeliotteluita.</Empty> : (
              <div className="grid gap-4 p-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                {data.rounds.map((r) => (
                  <div key={r.phase} className={`space-y-3 ${r.guru ? '' : 'opacity-60'}`}>
                    <h3 className="flex items-center gap-2 font-display text-lg tracking-wide text-white">
                      {r.name}
                      {!r.guru && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-sans text-slate-400">ei gurukisassa</span>}
                      {r.done && <span className="text-xs text-ice-300">✓</span>}
                    </h3>
                    {r.series.map((s) => <SeriesCard key={s.pair} s={s} />)}
                  </div>
                ))}
              </div>
            )}
          </Card>
          {admin && <TopLists season={data.season} />}
        </>
      )}
    </div>
  );
}

const TABS = [
  { id: 'lb', label: 'Leaderboard' },
  { id: 'team', label: 'Oma joukkue' },
  { id: 'bracket', label: 'Hakemistopuu' },
  { id: 'rules', label: 'Säännöt' },
  { id: 'admin', label: 'Hallinta', admin: true },
] as const;

function Rules() {
  return (
    <Card title="Play-Off-säännöt">
      <ul className="list-disc space-y-2 p-5 pl-9 text-sm text-slate-300">
        <li>Kisa alkaa puolivälieristä ja päättyy finaaliin. Pronssiottelu ja 1. kierros eivät kerrytä pisteitä.</li>
        <li>Joukkue: 3 hyökkääjää, 2 puolustajaa ja 1 maalivahti. Valmentajia ei ole.</li>
        <li>Valinnat tehdään lomakkeella. Sama pelaaja voi olla draftissa enintään 8 gurulla (maalivahti 12) – nopeat syövät hitaat.</li>
        <li>Pisteet lasketaan samoilla HG-säännöillä kuin runkosarjassa, ottelu kerrallaan.</li>
        <li>Vaihtoja on 4. Pudonneen joukkueen pelaajan saa vaihtaa ilmaiseksi. Vaihdoissa ei ole valintarajoja.</li>
        <li>Vaihtoikkuna aukeaa automaattisesti, kun kierroksen kaikki sarjat ovat ratkenneet, ja sulkeutuu 2 tuntia ennen seuraavan kierroksen ensimmäistä ottelua.</li>
        <li>Mestariveikkaus on kunniakysymys – ei vaikuta pisteisiin. Tasapisteissä parempi on se, jolla on enemmän pelaajia elossa.</li>
        <li>Ei osallistumismaksua eikä palkintoja – pelkkää kunniaa.</li>
      </ul>
    </Card>
  );
}

export default function Playoff() {
  const { me } = useAuth();
  const admin = isAdminRole(me?.user?.role);
  const [tab, setTab] = useState<string>('lb');
  return (
    <div className="space-y-6">
      <PageHeader kicker="HogiGuru Play-Off" title="Play-Off" />
      <div className="flex flex-wrap gap-1">
        {TABS.filter((t) => !('admin' in t) || admin).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-ice-500/15 text-ice-200 ring-1 ring-ice-400/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'lb' && <LeaderboardTab />}
      {tab === 'team' && <MyTeamTab />}
      {tab === 'bracket' && <BracketTab admin={admin} />}
      {tab === 'rules' && <Rules />}
      {tab === 'admin' && admin && <AdminCompetition />}
    </div>
  );
}
