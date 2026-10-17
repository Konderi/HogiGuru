import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api, fmt, fmtDate, matchName, POS_LABEL, POSITIONS, type Position, type Scoring } from '../api';
import { useApi } from '../auth';
import { Card, ErrorBox, PageHeader, Spinner } from '../ui';

interface Team { id: string; name: string; logo: string | null }
interface Player { id: number; name: string; team_id: string | null; team: string | null; role: string | null }
export interface RegInfo { open: boolean; enabled: boolean; deadline: string | null; fee: string | null; info: string | null }
interface Data {
  season: { name: string; roster: Record<Position, number>; maxPicks: Record<Position, number>; maxSwaps: number | null; scoring: Scoring; selectionMode?: 'draft' | 'baskets'; baskets?: string[][] };
  registration: RegInfo; teams: Team[]; players: Player[];
  swapDays: { date: string; start_time: string; end_time: string }[];
  coaches: { id: number; name: string; team_id: string; team: string | null }[];
}

export const CATEGORY_LABEL: Record<string, string> = {
  points: 'Pistepörssin voittaja', goals: 'Maalipörssin voittaja', assists: 'Syöttöpörssin voittaja',
  plusMinus: '+/− -tilaston voittaja', dPoints: 'Puolustajien pistepörssin voittaja', pim: 'Jäähypörssin voittaja', shutouts: 'Eniten nollapelejä',
};

export const fmtDeadline = (d: string | null) => d ? new Date(d).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Haettava pelaajavalinta: ehdottaa nimiä kirjoittaessa (alkukirjaimet ensin), valitse listasta. */
function PlayerSelect({ players, value, onChange, placeholder = 'Kirjoita nimeä…', exclude }: { players: Pick<Player, 'id' | 'name' | 'team'>[]; value?: number; onChange: (id?: number) => void; placeholder?: string; exclude?: Set<number> }) {
  const sel = players.find((p) => p.id === value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const big = players.length > 60;
  const hits = useMemo(() => {
    const s = norm(q.trim());
    const list = players.filter((p) => !exclude?.has(p.id));
    if (!s) return big ? [] : list;
    const words = (p: { name: string }) => norm(p.name).split(/\s+/);
    return list
      .filter((p) => matchName(`${p.name} ${p.team ?? ''}`, q))
      .sort((a, b) => Number(!words(a).some((w) => w.startsWith(s))) - Number(!words(b).some((w) => w.startsWith(s))))
      .slice(0, 40);
  }, [q, players, exclude, big]);
  if (sel) return (
    <div className="flex items-center gap-2 rounded-xl border border-ice-400/30 bg-ice-500/10 px-3 py-2 text-sm">
      <span className="flex-1 font-semibold text-white">{sel.name} <span className="text-xs font-normal text-slate-400">{sel.team}</span></span>
      <button type="button" className="text-slate-400 hover:text-goal" onClick={() => onChange(undefined)} aria-label="Tyhjennä">✕</button>
    </div>
  );
  return (
    <div className="relative">
      <input type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" className="input" placeholder={placeholder} value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-rink-850 shadow-2xl">
          {hits.map((p) => (
            <li key={p.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-white/5" onMouseDown={() => { onChange(p.id); setQ(''); }}>
              <span className="text-white">{p.name}</span> <span className="text-xs text-slate-500">{p.team}</span>
            </button></li>
          ))}
        </ul>
      )}
      {open && big && !q.trim() && <p className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 bg-rink-850 px-3 py-2 text-xs text-slate-400 shadow-2xl">Ala kirjoittaa nimeä tai joukkuetta…</p>}
      {open && q.trim() && !hits.length && <p className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 bg-rink-850 px-3 py-2 text-xs text-slate-400 shadow-2xl">Ei osumia</p>}
    </div>
  );
}

/** Dynaaminen toivelista: valitut järjestyksessä + aina yksi tyhjä kenttä uudelle. */
function WishList({ items, setItems, pool, min, label }: { items: number[]; setItems: (v: number[]) => void; pool: Pick<Player, 'id' | 'name' | 'team'>[]; min: number; label: string }) {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const o = [...items]; [o[i], o[j]] = [o[j], o[i]]; setItems(o); };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <span className={`text-xs ${items.length >= min ? 'text-emerald-400' : 'text-amber-300'}`}>{items.length} valittu · vähintään {min}</span>
      </div>
      <ol className="space-y-1.5">
        {items.map((id, i) => (
          <li key={id} className="flex items-center gap-2 rounded-xl border border-ice-400/30 bg-ice-500/10 px-3 py-1.5 text-sm">
            <span className="scoreboard w-6 text-right text-xs">{i + 1}.</span>
            <span className="flex-1 font-semibold text-white">{byId.get(id)?.name ?? `#${id}`} <span className="text-xs font-normal text-slate-400">{byId.get(id)?.team}</span></span>
            <button type="button" className="px-1 text-slate-400 hover:text-white disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Ylös">▲</button>
            <button type="button" className="px-1 text-slate-400 hover:text-white disabled:opacity-20" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Alas">▼</button>
            <button type="button" className="px-1 text-slate-400 hover:text-goal" onClick={() => setItems(items.filter((x) => x !== id))} aria-label="Poista">✕</button>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="w-6 text-right font-mono text-xs text-slate-500">{items.length + 1}.</span>
          <div className="flex-1"><PlayerSelect players={pool} exclude={new Set(items)} onChange={(v) => v && setItems([...items, v])} placeholder={items.length ? 'Lisää seuraava toive…' : 'Kirjoita nimeä…'} /></div>
        </li>
      </ol>
    </div>
  );
}

export default function Register() {
  const { data, error, loading } = useApi<Data>('/public/registration');
  const [form, setForm] = useState({ name: '', phone: '', email: '', website: '' });
  const [order, setOrder] = useState<string[]>([]);
  const [top, setTop] = useState<Record<string, number | undefined>>({});
  const [cats, setCats] = useState<Record<string, number | undefined>>({});
  const [wish, setWish] = useState<Record<Position, number[]>>({ F: [], D: [], G: [], C: [] });
  const [posOrder, setPosOrder] = useState<Position[]>([]);
  const [bPicks, setBPicks] = useState<{ position?: Position; entity_id?: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { if (data && !order.length) setOrder(data.teams.map((t) => t.id)); }, [data, order.length]);
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorBox error={error} />;

  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  const move = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= order.length) return;
    const o = [...order]; [o[i], o[j]] = [o[j], o[i]]; setOrder(o);
  };
  const skaters = data.players.filter((p) => p.role !== 'MV');
  const p = data.season.scoring.prediction;
  const pr = { standings: [6, 4, 1], topScorer: [7, 4, 2], category: [12, 6, 3], shutoutFactor: 0.5, ...p };
  const reg = data.registration;
  const roster = data.season.roster;
  const hasCoaches = data.coaches.length > 0;
  const wishPool: Record<Position, Pick<Player, 'id' | 'name' | 'team' | 'team_id'>[]> = {
    F: data.players.filter((x) => x.role !== 'P' && x.role !== 'MV'), D: data.players.filter((x) => x.role === 'P'),
    G: data.players.filter((x) => x.role === 'MV'), C: data.coaches,
  };
  const orderTotal = POSITIONS.reduce((s, x) => s + (roster[x] ?? 0), 0);
  // Toivelistan minimit: 20 hyökkääjää, 20 puolustajaa, 5 maalivahtia, 5 valmentajaa (enintään tarjolla olevat)
  const WISH_MIN: Record<Position, number> = { F: 20, D: 20, G: 5, C: 5 };
  const wishMin = (x: Position) => Math.max(roster[x] ?? 0, Math.min(WISH_MIN[x], wishPool[x].length));
  const left = (x: Position) => (roster[x] ?? 0) - posOrder.filter((y) => y === x).length;
  const basketMode = data.season.selectionMode === 'baskets' && (data.season.baskets?.length ?? 0) > 0;
  const baskets = data.season.baskets ?? [];
  const teamName = (id: string) => teamById.get(id)?.name ?? id;
  const bUsed = (x: Position, except: number) => bPicks.filter((b, i) => i !== except && b.position === x).length;
  const setPick = (i: number, v: { position?: Position; entity_id?: number }) => { const n = [...bPicks]; n[i] = v; setBPicks(n); };
  const missing = basketMode ? [
    ...baskets.map((_, i) => (bPicks[i]?.entity_id ? null : `kori ${i + 1}`)).filter((x): x is string => !!x),
  ] : [
    ...POSITIONS.filter((x) => (x !== 'C' || hasCoaches) && wish[x].length < wishMin(x)).map((x) => `toivelista: ${POS_LABEL[x].toLowerCase()}`),
    ...(posOrder.length < orderTotal ? ['draftin valintajärjestys'] : []),
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length) { setErr(`Täydennä vielä: ${missing.join(', ')}`); return; }
    setBusy(true); setErr(null);
    try {
      await api('/public/registration', { body: { ...form, standings: order, top_scorers: top, categories: cats, rankings: wish, position_order: posOrder, basket_picks: bPicks } });
      setDone(true); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  const Rules = (
    <Card title="Säännöt lyhyesti">
      <div className="space-y-4 p-5 text-sm text-slate-300">
        <div>
          <p className="label">All-Stars-kentällinen</p>
          <p>{POSITIONS.slice().reverse().map((x) => `${data.season.roster[x]} ${POS_LABEL[x].toLowerCase()}`).join(', ')}. Valitaan draft-tilaisuudessa vuorotellen.</p>
          <p className="mt-1 text-slate-400">Sama pelaaja voi olla valittuna enintään: {POSITIONS.map((x) => `${POS_LABEL[x].toLowerCase()} ${data.season.maxPicks[x]}`).join(', ')} kertaa.</p>
        </div>
        <div>
          <p className="label">Pisteytys</p>
          <ul className="space-y-1 text-slate-400">
            <li><b className="text-white">Hyökkääjä:</b> maali {fmt(data.season.scoring.F.goals)} · syöttö {fmt(data.season.scoring.F.assists)} · jäähymin {fmt(data.season.scoring.F.pim)} · +/− {fmt(data.season.scoring.F.plusMinus)} · ottelu {fmt(data.season.scoring.F.games)}</li>
            <li><b className="text-white">Puolustaja:</b> maali {fmt(data.season.scoring.D.goals)} · syöttö {fmt(data.season.scoring.D.assists)} · jäähymin {fmt(data.season.scoring.D.pim)} · +/− {fmt(data.season.scoring.D.plusMinus)} · ottelu {fmt(data.season.scoring.D.games)}</li>
            <li className="text-xs text-slate-400">Ottelu lasketaan, kun kenttäpelaaja on merkitty ottelun kokoonpanoon – myös silloin, jos hän ei saa peliaikaa.</li>
            <li><b className="text-white">Maalivahti:</b> nollapeli {fmt(data.season.scoring.G.shutouts)} · torjunta {fmt(data.season.scoring.G.saves)} · päästetty {fmt(data.season.scoring.G.goalsAgainst)}</li>
            <li><b className="text-white">Valmentaja:</b> joukkueen sarjapiste {fmt(data.season.scoring.C.teamPoints)} · potkut {fmt(data.season.scoring.coachFiredPenalty, 0)}</li>
          </ul>
        </div>
        <div>
          <p className="label">Veikkauspisteet</p>
          <p className="mb-1 text-slate-400">Kokonaistulos = All-Stars-pisteet + veikkauspisteet:</p>
          <ul className="space-y-1 text-slate-400">
            <li><b className="text-white">Sarjataulukko:</b> jokaisesta joukkueesta oikea sija {pr.standings[0]} p{pr.standings[1] != null && <>, yhden sijan heitto {pr.standings[1]} p</>}{pr.standings[2] != null && <>, kahden sijan heitto {pr.standings[2]} p</>}.</li>
            <li><b className="text-white">Joukkueiden paras pistemies:</b> oikea {pr.topScorer[0]} p{pr.topScorer[1] != null && <>, joukkueen 2. {pr.topScorer[1]} p</>}{pr.topScorer[2] != null && <>, 3. {pr.topScorer[2]} p</>}.</li>
            <li><b className="text-white">Pörssit</b> (piste-, maali-, syöttö-, +/−-, puolustajien piste- ja jäähypörssi): voittaja {pr.category[0]} p, sijat 2–3 {pr.category[1]} p, sijat 4–5 {pr.category[2]} p.</li>
            <li><b className="text-white">Eniten nollapelejä:</b> pörssipisteet × {fmt(pr.shutoutFactor)} ({fmt(pr.category[0] * pr.shutoutFactor)} / {fmt(pr.category[1] * pr.shutoutFactor)} / {fmt(pr.category[2] * pr.shutoutFactor)} p).</li>
            <li>Tasatilanteessa kaikki samalla sijalla olevat saavat sijan pisteet.</li>
          </ul>
        </div>
        <div>
          <p className="label">Vaihdot</p>
          <p>Kauden aikana {data.season.maxSwaps ?? 'rajaton määrä'} vaihtoa. Vaihdot avautuvat, kun jokainen joukkue on pelannut 10 ottelua, ja ne tehdään itse sivustolla. Valmentajan saa vaihtaa aina potkujen yhteydessä; muuten saman joukkueen uusi valmentaja jatkaa pisteiden keräämistä.</p>
          {data.swapDays.length > 0 && (
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {data.swapDays.map((d) => <li key={d.date} className="rounded-lg bg-white/5 px-3 py-2"><span className="block font-semibold text-white">{fmtDate(d.date)}</span><span className="font-mono text-xs text-ice-300">klo {d.start_time}–{d.end_time}</span></li>)}
            </ul>
          )}
        </div>
        <p className="text-xs text-slate-500">HG-komitea päättää mahdollisista sääntömuutoksista. Kaikilla on valitusoikeus. Osallistuminen on vapaaehtoista ja leikkimielistä.</p>
      </div>
    </Card>
  );

  if (done) return (
    <div className="mx-auto max-w-xl py-10 text-center animate-in">
      <p className="text-6xl">🏒</p>
      <h1 className="mt-4 text-4xl">Ilmoittautuminen vastaanotettu!</h1>
      <p className="mt-4 text-slate-300">Kiitos, {form.name.split(' ')[0]}! HG-komitea vahvistaa osallistumisen. {reg.fee && <>Osallistumismaksu on <b className="text-white">{reg.fee}</b>.</>}</p>
      <p className="mt-2 text-sm text-slate-400">Voit muuttaa veikkauksiasi lähettämällä lomakkeen uudelleen samalla sähköpostiosoitteella ennen määräaikaa.</p>
      <Link to="/" className="btn btn-primary mt-8">Etusivulle</Link>
    </div>
  );

  if (!reg.open) return (
    <>
      <PageHeader kicker={`Kausi ${data.season.name}`} title="Ilmoittautuminen" />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card><div className="p-8 text-center text-slate-300">{reg.enabled ? 'Ilmoittautumisen määräaika on päättynyt.' : 'Ilmoittautuminen ei ole vielä auki.'}</div></Card>
        {Rules}
      </div>
    </>
  );

  return (
    <>
      <PageHeader kicker={`Kausi ${data.season.name}`} title="Ilmoittaudu mukaan" />
      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        {reg.deadline && <span className="rounded-full bg-goal/15 px-3 py-1 font-semibold text-goal">Viimeistään {fmtDeadline(reg.deadline)}</span>}
        {reg.fee && <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">Osallistumismaksu {reg.fee}</span>}
      </div>
      {reg.info && <p className="mb-6 max-w-3xl whitespace-pre-line text-slate-300">{reg.info}</p>}

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <Card title="Yhteystiedot">
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <div><label className="label">Nimi *</label><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">Puhelin</label><input type="tel" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">Sähköposti *</label><input required type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <input tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
          </Card>

          <Card title="1) Runkosarjan lopputulos" action={p && <span className="text-xs text-slate-400">{p.standings.join(' / ')} p</span>}>
            <p className="px-5 pt-4 text-xs text-slate-400">Järjestä joukkueet nuolilla. {p && `Oikea sija ${p.standings[0]} p, yhden päässä ${p.standings[1]} p, kahden päässä ${p.standings[2]} p.`}</p>
            <ol className="p-3">
              {order.map((id, i) => {
                const t = teamById.get(id);
                return (
                  <li key={id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <span className="scoreboard w-7 text-right text-sm">{i + 1}.</span>
                    {t?.logo && <img src={t.logo} alt="" className="h-6 w-6 object-contain" />}
                    <span className="flex-1 text-sm font-semibold text-white">{t?.name ?? id}</span>
                    <button type="button" className="rounded px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Ylös">▲</button>
                    <button type="button" className="rounded px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-20" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Alas">▼</button>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card title="2) Joukkueen paras pistemies" action={p && <span className="text-xs text-slate-400">{p.topScorer.join(' / ')} p</span>}>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {data.teams.map((t) => (
                <div key={t.id}>
                  <label className="label flex items-center gap-2">{t.logo && <img src={t.logo} alt="" className="h-4 w-4 object-contain" />}{t.name}</label>
                  <PlayerSelect players={skaters.filter((x) => x.team_id === t.id)} value={top[t.id]} onChange={(v) => setTop({ ...top, [t.id]: v })} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="3) Muut kategoriat" action={p && <span className="text-xs text-slate-400">{p.category.join(' / ')} p</span>}>
            <p className="px-5 pt-4 text-xs text-slate-400">{p && `Oikein ${p.category[0]} p, top 3 ${p.category[1]} p, top 5 ${p.category[2]} p. Nollapelit puolitetuilla pisteillä.`}</p>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
                <div key={k}><label className="label">{l}</label><PlayerSelect players={data.players} value={cats[k]} onChange={(v) => setCats({ ...cats, [k]: v })} /></div>
              ))}
            </div>
          </Card>

          {basketMode ? (
            <Card title="4) All-Stars-kentällinen koreista *">
              <p className="px-5 pt-4 text-xs text-slate-400">Valitse jokaisesta korista yksi pelaaja tai valmentaja. Kentälliseen tulee yhteensä {POSITIONS.map((x) => `${roster[x]} ${POS_LABEL[x].toLowerCase()}`).join(', ')}.</p>
              <div className="space-y-3 p-5">
                {baskets.map((teams, i) => {
                  const pk = bPicks[i] ?? {};
                  const free = POSITIONS.filter((x) => (x !== 'C' || hasCoaches) && bUsed(x, i) < (roster[x] ?? 0));
                  const pool = pk.position ? wishPool[pk.position].filter((x) => !!x.team_id && teams.includes(x.team_id)) : [];
                  return (
                    <div key={i} className="rounded-xl border border-white/10 p-3">
                      <p className="mb-2 text-sm"><span className="scoreboard mr-2">Kori {i + 1}</span><span className="text-slate-300">{teams.map(teamName).join(' · ')}</span></p>
                      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                        <select className="input" value={pk.position ?? ''} onChange={(e) => setPick(i, { position: (e.target.value || undefined) as Position | undefined })}>
                          <option value="">Pelipaikka…</option>
                          {POSITIONS.filter((x) => free.includes(x) || x === pk.position).map((x) => <option key={x} value={x}>{POS_LABEL[x]}</option>)}
                        </select>
                        {pk.position ? <PlayerSelect key={`${i}-${pk.position}`} players={pool} value={pk.entity_id} onChange={(v) => setPick(i, { ...pk, entity_id: v })} /> : <div className="self-center text-xs text-slate-500">Valitse ensin pelipaikka</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (<>
          <Card title="4) All-Stars-toivelista *">
            <p className="px-5 pt-4 text-xs text-slate-400">Listaa pelaajat toivejärjestyksessä jokaiseen pelipaikkaan. Kun valitset nimen, alle aukeaa uusi kenttä. Draftissa valitaan listaltasi ylin vielä vapaana oleva. Listaa useampi kuin minimi, sillä suosikit voivat mennä muille.</p>
            <div className="grid gap-6 p-5 md:grid-cols-2">
              {(['F', 'D', 'G', 'C'] as Position[]).filter((x) => x !== 'C' || hasCoaches).map((x) => (
                <WishList key={x} label={POS_LABEL[x]} items={wish[x]} setItems={(v) => setWish({ ...wish, [x]: v })} pool={wishPool[x]} min={wishMin(x)} />
              ))}
            </div>
          </Card>

          <Card title="5) Draftin valintajärjestys *">
            <p className="px-5 pt-4 text-xs text-slate-400">Valitse, minkä pelipaikan pelaajan otat milloinkin vuorollasi ({POSITIONS.map((x) => `${roster[x]} ${POS_LABEL[x].toLowerCase()}`).join(', ')}).</p>
            <div className="space-y-3 p-5">
              <ol className="flex flex-wrap gap-2">
                {Array.from({ length: orderTotal }, (_, i) => (
                  <li key={i} className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm ${posOrder[i] ? 'border-ice-400/30 bg-ice-500/10 text-white' : 'border-dashed border-white/15 text-slate-500'}`}>
                    <span className="font-mono text-xs text-slate-400">{i + 1}.</span>
                    {posOrder[i] ? <>{POS_LABEL[posOrder[i]]}<button type="button" className="ml-1 text-slate-400 hover:text-goal" onClick={() => setPosOrder(posOrder.filter((_, j) => j !== i))} aria-label="Poista">✕</button></> : '—'}
                  </li>
                ))}
              </ol>
              {posOrder.length < orderTotal && (
                <div className="flex flex-wrap gap-2">
                  <span className="self-center text-xs text-slate-400">Kierros {posOrder.length + 1}:</span>
                  {POSITIONS.filter((x) => left(x) > 0).map((x) => (
                    <button key={x} type="button" className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => setPosOrder([...posOrder, x])}>{POS_LABEL[x]} <span className="text-xs text-slate-500">({left(x)})</span></button>
                  ))}
                </div>
              )}
            </div>
          </Card>
          </>)}

          {missing.length > 0 && <p className="text-xs text-amber-300">Puuttuu vielä: {missing.join(', ')}</p>}
          {err && <ErrorBox error={err} />}
          <button className="btn btn-primary w-full py-3 text-base" disabled={busy}>{busy ? 'Lähetetään…' : 'Lähetä ilmoittautuminen'}</button>
          <p className="text-center text-xs text-slate-500">Ilmoittautumalla hyväksyt tietojesi käsittelyn <Link to="/tietosuoja" target="_blank" className="text-orange-300 hover:underline">tietosuojaselosteen</Link> mukaisesti.</p>
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">{Rules}</div>
      </form>
    </>
  );
}
