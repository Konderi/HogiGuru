import { useEffect, useState } from 'react';
import { POS_LABEL, POSITIONS, type Position, type Scoring as Sc, type Season } from '../api';
import { useApi } from '../auth';
import { Card, PageHeader, Spinner } from '../ui';
import { api, useAdmin } from './AdminLayout';

const LABELS: Record<string, string> = {
  goals: 'Maali', assists: 'Syöttö', pim: 'Jäähyminuutti', plusMinus: '+/−', games: 'Ottelu',
  shutouts: 'Nollapeli', saves: 'Torjunta', goalsAgainst: 'Päästetty maali', wins: 'Voitto', teamPoints: 'Joukkueen sarjapiste',
};

export default function Scoring() {
  const { data } = useApi<{ season: Season }>('/admin/overview');
  const { run } = useAdmin();
  const [s, setS] = useState<Season | null>(null);
  useEffect(() => { if (data) setS(data.season); }, [data]);
  if (!s) return <Spinner />;

  const setW = (group: 'F' | 'D' | 'G' | 'C', key: string, v: string) =>
    setS({ ...s, scoring: { ...s.scoring, [group]: { ...s.scoring[group], [key]: Number(v) } } as Sc });

  const save = () => run(() => api('/admin/season', { method: 'PUT', body: s }), 'Asetukset tallennettu');

  return (
    <>
      <PageHeader kicker={`Kausi ${s.name}`} title="Pisteytys & kausi"><button className="btn btn-primary" onClick={save}>Tallenna muutokset</button></PageHeader>

      <div className="grid gap-6 xl:grid-cols-2">
        {(['F', 'D', 'G', 'C'] as const).map((g) => (
          <Card key={g} title={`${POS_LABEL[g as Position]} – kertoimet`}>
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
              {Object.entries(s.scoring[g]).map(([k, v]) => (
                <div key={k}><label className="label">{LABELS[k] ?? k}</label><input type="number" step="0.1" className="input font-mono" value={v} onChange={(e) => setW(g, k, e.target.value)} /></div>
              ))}
              {g === 'C' && <div><label className="label">Potkut</label><input type="number" step="1" className="input font-mono" value={s.scoring.coachFiredPenalty} onChange={(e) => setS({ ...s, scoring: { ...s.scoring, coachFiredPenalty: Number(e.target.value) } })} /></div>}
            </div>
          </Card>
        ))}

        <Card title="Kauden säännöt">
          <div className="grid grid-cols-2 gap-4 p-5">
            <div><label className="label">Kauden nimi</label><input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
            <div><label className="label">Liiga-kausi (päättymisvuosi)</label><input type="number" className="input" value={s.liiga_season} onChange={(e) => setS({ ...s, liiga_season: Number(e.target.value) })} /></div>
            <div><label className="label">Sama valinta max (oletus)</label><input type="number" className="input" value={s.max_picks_per_entity} onChange={(e) => setS({ ...s, max_picks_per_entity: Number(e.target.value) })} /></div>
            <div><label className="label">Vaihtoja / guru (tyhjä = ei rajaa)</label><input type="number" className="input" value={s.max_swaps ?? ''} onChange={(e) => setS({ ...s, max_swaps: e.target.value === '' ? null : Number(e.target.value) })} /></div>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ice-400" checked={!!s.draft_snake} onChange={(e) => setS({ ...s, draft_snake: e.target.checked ? 1 : 0 })} /> Käärmedraft (parilliset kierrokset käänteisessä järjestyksessä)</label>
          </div>
        </Card>

        <Card title="Kentällisen koko">
          <div className="grid grid-cols-4 gap-4 p-5">
            {POSITIONS.map((p) => (
              <div key={p}><label className="label">{POS_LABEL[p]}</label><input type="number" min={0} className="input" value={s.roster[p]} onChange={(e) => setS({ ...s, roster: { ...s.roster, [p]: Number(e.target.value) } })} /></div>
            ))}
          </div>
        </Card>

        <Card title="Sama pelaaja voi olla valittuna enintään (kertaa)">
          <div className="grid grid-cols-4 gap-4 p-5">
            {POSITIONS.map((p) => (
              <div key={p}><label className="label">{POS_LABEL[p]}</label><input type="number" min={1} className="input" value={s.max_picks_by_pos?.[p] ?? s.max_picks_per_entity} onChange={(e) => setS({ ...s, max_picks_by_pos: { ...s.max_picks_by_pos, [p]: Number(e.target.value) } })} /></div>
            ))}
          </div>
        </Card>

        {s.scoring.prediction && (
          <Card title="Veikkausosion pisteet (oikein / 1 päässä / 2 päässä)">
            <div className="grid grid-cols-3 gap-4 p-5">
              {([['standings', 'Sarjataulukko'], ['topScorer', 'Joukkueen paras pistemies'], ['category', 'Pörssit (oikein / top 3 / top 5)']] as const).map(([k, l]) => (
                <div key={k}><label className="label">{l}</label>
                  <input className="input font-mono" value={s.scoring.prediction![k].join(' / ')}
                    onChange={(e) => setS({ ...s, scoring: { ...s.scoring, prediction: { ...s.scoring.prediction!, [k]: e.target.value.split('/').map((x) => Number(x.trim()) || 0) } } })} /></div>
              ))}
              <div><label className="label">Nollapelit kerroin</label><input type="number" step="0.1" className="input font-mono" value={s.scoring.prediction.shutoutFactor}
                onChange={(e) => setS({ ...s, scoring: { ...s.scoring, prediction: { ...s.scoring.prediction!, shutoutFactor: Number(e.target.value) } } })} /></div>
            </div>
          </Card>
        )}
      </div>
      <p className="mt-6 text-sm text-slate-400">Muutokset vaikuttavat heti kaikkiin laskettuihin pisteisiin. Pelaajan HG-pisteet = Σ (tilasto × kerroin). Vaihdon alku- ja loppupisteet tallennetaan vaihtohetkellä, joten kertoimien muuttaminen kesken kauden ei muuta niitä takautuvasti.</p>
    </>
  );
}
