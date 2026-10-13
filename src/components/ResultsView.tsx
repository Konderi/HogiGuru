import { useState } from 'react';
import { fmt } from '../api';
import { Card, Modal, RankBadge } from '../ui';

export const CAT_FI: Record<string, string> = {
  points: 'Pistepörssi', goals: 'Maalipörssi', assists: 'Syöttöpörssi', plusMinus: 'Plus/miinus',
  dPoints: 'Puolustajien pisteet', pim: 'Jäähypörssi', shutouts: 'Nollapelit',
};

interface Top { id: number; name: string | null; rank: number; value: number | null }
export interface ResultRow {
  id: number; name: string; rank: number; registered: boolean;
  allstars: number; standings: number; topScorers: number; categories: number; total: number;
  details: {
    standings: { team: string; name: string; guess: number; actual: number | null; pts: number }[];
    topScorers: { team: string; name: string; player: string | null; rank: number | null; pts: number }[];
    categories: { key: string; player: string | null; rank: number | null; value: number | null; pts: number }[];
  };
}
export interface Results {
  season: string; published: boolean;
  answers: {
    standings: { team: string; name: string; rank: number }[];
    topScorers: { team: string; name: string; top: Top[] }[];
    categories: { key: string; top: Top[] }[];
  };
  rows: ResultRow[];
}

const Pts = ({ v }: { v: number }) => <span className={v > 0 ? 'font-semibold text-emerald-300' : 'text-slate-500'}>{fmt(v, v % 1 ? 1 : 0)}</span>;

export default function ResultsView({ data }: { data: Results }) {
  const [sel, setSel] = useState<ResultRow | null>(null);
  return (
    <div className="space-y-6">
      <Card title={`Kokonaistulokset ${data.season}`}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>#</th><th>Guru</th><th>All-Stars</th><th>Sarjataulukko</th><th>Pistemiehet</th><th>Kategoriat</th><th>Yhteensä</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-white/5" onClick={() => setSel(r)}>
                  <td><RankBadge rank={r.rank} /></td>
                  <td className="font-semibold text-white">{r.name}{!r.registered && <span className="ml-2 text-xs font-normal text-slate-500">(ei veikkauksia)</span>}</td>
                  <td>{fmt(r.allstars)}</td><td>{fmt(r.standings, 0)}</td><td>{fmt(r.topScorers, 0)}</td><td>{fmt(r.categories)}</td>
                  <td className="scoreboard text-lg">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-500">Klikkaa gurua nähdäksesi veikkaukset ja pisteet eriteltynä.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Oikea sarjataulukko">
          <ol className="p-4 text-sm">{data.answers.standings.map((t) => <li key={t.team} className="py-0.5"><span className="scoreboard mr-2 inline-block w-6 text-right">{t.rank}.</span>{t.name}</li>)}</ol>
        </Card>
        <Card title="Joukkueiden pistemiehet">
          <ul className="space-y-1 p-4 text-sm">{data.answers.topScorers.map((t) => (
            <li key={t.team}><span className="text-slate-400">{t.name}:</span> <span className="text-white">{t.top.filter((x) => x.rank === 1).map((x) => `${x.name} (${x.value ?? '–'})`).join(', ') || '–'}</span></li>
          ))}</ul>
        </Card>
        <Card title="Kategoriat (top 5)">
          <div className="space-y-3 p-4 text-sm">{data.answers.categories.map((k) => (
            <div key={k.key}><p className="label">{CAT_FI[k.key] ?? k.key}</p>
              <ol>{k.top.map((x) => <li key={x.id}><span className="mr-2 inline-block w-5 text-right font-mono text-xs text-slate-400">{x.rank}.</span>{x.name} <span className="text-xs text-slate-500">{x.value ?? ''}</span></li>)}</ol>
            </div>
          ))}</div>
        </Card>
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title={`${sel?.name} · ${fmt(sel?.total)} p`} wide>
        {sel && (
          <div className="grid gap-6 text-sm md:grid-cols-2">
            <div>
              <p className="label">Sarjataulukko ({fmt(sel.standings, 0)} p)</p>
              <table className="w-full"><tbody>{sel.details.standings.map((s) => (
                <tr key={s.team}><td className="pr-2 text-right font-mono text-xs text-slate-400">{s.guess}.</td><td>{s.name}</td><td className="text-right text-xs text-slate-400">oikea {s.actual ?? '–'}.</td><td className="w-10 text-right"><Pts v={s.pts} /></td></tr>
              ))}</tbody></table>
            </div>
            <div className="space-y-5">
              <div>
                <p className="label">Joukkueen paras pistemies ({fmt(sel.topScorers, 0)} p)</p>
                <table className="w-full"><tbody>{sel.details.topScorers.map((s) => (
                  <tr key={s.team}><td className="text-slate-400">{s.name}</td><td>{s.player}</td><td className="text-right text-xs text-slate-400">{s.rank ? `${s.rank}.` : '–'}</td><td className="w-10 text-right"><Pts v={s.pts} /></td></tr>
                ))}</tbody></table>
              </div>
              <div>
                <p className="label">Kategoriat ({fmt(sel.categories)} p)</p>
                <table className="w-full"><tbody>{sel.details.categories.map((s) => (
                  <tr key={s.key}><td className="text-slate-400">{CAT_FI[s.key] ?? s.key}</td><td>{s.player}</td><td className="text-right text-xs text-slate-400">{s.rank ? `${s.rank}.` : '–'}</td><td className="w-10 text-right"><Pts v={s.pts} /></td></tr>
                ))}</tbody></table>
              </div>
              <p className="rounded-xl bg-white/5 p-3">All-Stars <b className="text-white">{fmt(sel.allstars)}</b> + veikkaukset <b className="text-white">{fmt(sel.standings + sel.topScorers + sel.categories)}</b> = <b className="text-ice-300">{fmt(sel.total)}</b></p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
