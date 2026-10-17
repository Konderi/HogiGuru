import { useState } from 'react';
import { fmt, fmtDate, POS_LABEL } from '../api';
import { useApi, useAuth } from '../auth';
import { Avatar, Card, Empty, ErrorBox, PageHeader, Spinner } from '../ui';

type Pos = 'C' | 'G' | 'D' | 'F';
interface P { id: number; name: string; team: string | null; picture?: string | null; pos: Pos; hg: number; games: number; goals: number; assists: number }
interface Weekly {
  monday: string; sunday: string; first: string | null; last: string | null; games: number;
  gurus: { id: number; name: string; points: number }[];
  players: P[]; topF: P[]; topD: P[]; topG: P[];
  coaches: { id: number; name: string; team: string | null; hg: number; games: number }[];
  bestGames: { id: number; name: string; team: string | null; pos: Pos; date: string; opponent: string | null; hg: number; line: string }[];
  worstGames: Weekly['bestGames'];
  popular: { id: number; name: string | null; owners: number; hg: number; games: number }[];
  hidden: P[];
}
interface SwapA {
  swaps: { id: number; guru_id: number; guru: string; position: Pos; date: string; in: string; out: string; gained: number; missed: number; net: number }[];
  gurus: { guru_id: number; guru: string; swaps: number; net: number }[];
}

const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const sign = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;
const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-goal' : 'text-slate-400');

export default function Gurukierros() {
  const [tab, setTab] = useState<'week' | 'swaps'>('week');
  return (
    <>
      <PageHeader kicker="HogiGuru" title="Kuntopuntari" />
      <div className="mb-6 flex gap-1 rounded-2xl border border-white/8 bg-rink-850/60 p-1 sm:inline-flex">
        {([['week', 'Viikkokatsaus'], ['swaps', 'Vaihtojen kuningas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold uppercase tracking-wide sm:flex-none sm:px-4 sm:text-sm sm:tracking-wider ${tab === k ? 'bg-ice-500 text-rink-950' : 'text-slate-400'}`}>{l}</button>
        ))}
      </div>
      {tab === 'week' ? <Week /> : <Swaps />}
    </>
  );
}

function Week() {
  const [week, setWeek] = useState<string | null>(null);
  const { data, error, loading } = useApi<Weekly>(`/weekly${week ? `?week=${week}` : ''}`, [week]);
  const { me } = useAuth();
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorBox error={error} />;
  const canPrev = !!data.first && data.monday > data.first;
  const canNext = !!data.last && data.sunday < data.last;
  const myIdx = data.gurus.findIndex((g) => g.id === me?.guru?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button className="btn" disabled={!canPrev} onClick={() => setWeek(addDays(data.monday, -7))}>← Edellinen</button>
        <div className="text-center">
          <p className="font-display text-xl text-white">{fmtDate(data.monday)} – {fmtDate(data.sunday)}</p>
          <p className="text-xs text-slate-400">{data.games} ottelua{data.sunday >= new Date().toISOString().slice(0, 10) ? ' · viikko kesken' : ''}</p>
        </div>
        <button className="btn" disabled={!canNext} onClick={() => setWeek(addDays(data.monday, 7))}>Seuraava →</button>
      </div>

      {data.games === 0 ? <Card><Empty>Tällä viikolla ei pelattu otteluita.</Empty></Card> : (<>
        {/* Viikon gurut */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Viikon parhaat gurut">
            <table className="table">
              <tbody>
                {data.gurus.slice(0, 5).map((g, i) => (
                  <tr key={g.id} className={g.id === me?.guru?.id ? 'bg-ice-500/8' : ''}>
                    <td className="w-8 text-slate-400">{i === 0 ? '🏆' : i + 1}</td>
                    <td className="text-white">{g.name}</td>
                    <td className="num scoreboard">{sign(g.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {myIdx >= 5 && <p className="border-t border-white/5 px-5 py-3 text-sm text-slate-300">Sinä: {myIdx + 1}. ({sign(data.gurus[myIdx].points)})</p>}
          </Card>
          <Card title="Viikon heikoimmat gurut">
            <table className="table">
              <tbody>
                {data.gurus.slice(-3).reverse().map((g) => (
                  <tr key={g.id}><td className="text-white">{g.name}</td><td className={`num font-mono ${tone(g.points)}`}>{sign(g.points)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Kierroksen tähdet */}
        <Card title="Viikon tähdet">
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {([['Hyökkääjä', data.topF[0]], ['Puolustaja', data.topD[0]], ['Maalivahti', data.topG[0]]] as const).map(([l, p]) => p && (
              <Star key={l} label={l} name={p.name} team={p.team} picture={p.picture} hg={p.hg} sub={p.pos === 'G' ? `${p.games} ottelua` : `${p.goals}+${p.assists}, ${p.games} ott.`} />
            ))}
            {data.coaches[0] && <Star label="Valmentaja" name={data.coaches[0].name} team={data.coaches[0].team} hg={data.coaches[0].hg} sub={`${data.coaches[0].games} ottelua`} />}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Viikon huippupelit">
            <table className="table">
              <tbody>
                {data.bestGames.map((g, i) => (
                  <tr key={i}><td className="text-white">{g.name}<span className="block text-xs text-slate-400">{fmtDate(g.date)} vs {g.opponent} · {g.line}</span></td><td className="num scoreboard">{sign(g.hg)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Top 10 HG-pelaajat">
            <table className="table">
              <tbody>
                {data.players.map((p, i) => (
                  <tr key={p.id}><td className="w-8 text-slate-400">{i + 1}</td><td className="text-white">{p.name}<span className="ml-2 text-xs text-slate-400">{POS_LABEL[p.pos]} · {p.team}</span></td><td className="num scoreboard">{sign(p.hg)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card title="Kukaan ei omista – mutta olisi kannattanut">
            <table className="table">
              <tbody>
                {data.hidden.length ? data.hidden.map((p) => <tr key={p.id}><td className="text-white">{p.name}<span className="ml-2 text-xs text-slate-400">{POS_LABEL[p.pos]} · {p.team}</span></td><td className="num scoreboard">{sign(p.hg)}</td></tr>)
                  : <tr><td className="text-slate-400">Gurut omistivat kaikki viikon parhaat.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      </>)}
    </div>
  );
}

function Star({ label, name, team, picture, hg, sub }: { label: string; name: string; team: string | null; picture?: string | null; hg: number; sub: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-rink-950/50 p-3">
      <Avatar src={picture ?? null} name={name} size="h-12 w-12" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-ice-300">{label}</p>
        <p className="truncate font-semibold text-white">{name}</p>
        <p className="text-xs text-slate-400">{team} · {sub}</p>
      </div>
      <p className="scoreboard ml-auto text-lg">{sign(hg)}</p>
    </div>
  );
}

function Swaps() {
  const { data, error, loading } = useApi<SwapA>('/swap-analysis');
  const { me } = useAuth();
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorBox error={error} />;
  if (!data.swaps.length) return <Card><Empty>Vaihtoja ei ole vielä tehty.</Empty></Card>;
  const mine = data.swaps.filter((s) => s.guru_id === me?.guru?.id);
  const Row = ({ s }: { s: SwapA['swaps'][number] }) => (
    <tr>
      <td className="text-white">{s.guru}<span className="block text-xs text-slate-400">{fmtDate(s.date)} · {POS_LABEL[s.position]}</span></td>
      <td><span className="text-emerald-400">↑ {s.in}</span> <span className="font-mono text-xs text-slate-400">{sign(s.gained)}</span><span className="block"><span className="text-goal">↓ {s.out}</span> <span className="font-mono text-xs text-slate-400">{sign(s.missed)}</span></span></td>
      <td className={`num font-mono text-base ${tone(s.net)}`}>{sign(s.net)}</td>
    </tr>
  );
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">Vaihdon nettovaikutus = tulleen pelaajan pisteet vaihdon jälkeen − pisteet, jotka lähtenyt pelaaja olisi kerännyt samana aikana.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Parhaat vaihdot">
          <table className="table"><tbody>{data.swaps.slice(0, 5).map((s) => <Row key={s.id} s={s} />)}</tbody></table>
        </Card>
        <Card title="Kalleimmat vaihdot">
          <table className="table"><tbody>{data.swaps.slice(-5).reverse().map((s) => <Row key={s.id} s={s} />)}</tbody></table>
        </Card>
      </div>
      {mine.length > 0 && (
        <Card title="Omat vaihtosi">
          <table className="table"><tbody>{mine.map((s) => <Row key={s.id} s={s} />)}</tbody></table>
        </Card>
      )}
      <Card title="Vaihtotehokkuus guruittain">
        <table className="table">
          <thead><tr><th className="w-10">#</th><th>Guru</th><th className="num">Vaihtoja</th><th className="num">Netto</th></tr></thead>
          <tbody>
            {data.gurus.map((g, i) => (
              <tr key={g.guru_id} className={g.guru_id === me?.guru?.id ? 'bg-ice-500/8' : ''}>
                <td className="text-slate-400">{i === 0 ? '👑' : i + 1}</td><td className="text-white">{g.guru}</td><td className="num text-slate-400">{g.swaps}</td><td className={`num font-mono ${tone(g.net)}`}>{sign(g.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
