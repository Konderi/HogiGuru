// Ottelukohtainen ennuste: Poisson-malli joukkueiden hyökkäys-/puolustusvoimasta (koko kausi + viimeiset 5) ja kotietu.
import type { GameRow } from './games';

export interface Forecast {
  pHome: number; pDraw: number; pAway: number;
  odds: { home: number; draw: number; away: number };
  xgHome: number; xgAway: number; likely: string;
  formHome: string[]; formAway: string[];
}

const K = 4; // kutistus liigakeskiarvoon (otteluita) – vähäinen otos ei heilauta liikaa
const FORM_W = 0.3; // viimeisten 5 ottelun paino

/** Varsinaisen peliajan tulos: jatkoajalla/voittolaukauksilla ratkenneet ovat tasapelejä. */
const reg = (g: GameRow) => (g.ot ? { h: Math.min(g.home.goals, g.away.goals), a: Math.min(g.home.goals, g.away.goals) } : { h: g.home.goals, a: g.away.goals });

const pois = (l: number, k: number) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };

export function forecasts(games: GameRow[]): Map<number, Forecast> {
  const done = games.filter((g) => g.ended);
  const out = new Map<number, Forecast>();
  if (done.length < 10) return out;
  // Liigan keskiarvot (varsinainen peliaika)
  let hg = 0, ag = 0;
  for (const g of done) { const r = reg(g); hg += r.h; ag += r.a; }
  const hAvg = hg / done.length, aAvg = ag / done.length, avg = (hAvg + aAvg) / 2;
  // Poisson aliarvioi tasapelejä jääkiekossa: kalibroidaan kauden toteutuneeseen jatkoaikaosuuteen
  const drawRate = done.filter((g) => g.ot).length / done.length;
  let dm = 0;
  for (let i = 0; i <= 10; i++) dm += pois(hAvg, i) * pois(aAvg, i);
  const drawBoost = Math.min(2, Math.max(1, drawRate / dm));

  type T = { gf: number; ga: number; n: number; recent: { gf: number; ga: number }[]; form: string[] };
  const t = new Map<string, T>();
  const get = (id: string) => t.get(id) ?? (t.set(id, { gf: 0, ga: 0, n: 0, recent: [], form: [] }), t.get(id)!);
  for (const g of done) {
    const r = reg(g);
    for (const [me, gf, ga, real, opp] of [[g.home.id, r.h, r.a, g.home.goals, g.away.goals], [g.away.id, r.a, r.h, g.away.goals, g.home.goals]] as const) {
      const x = get(me);
      x.gf += gf; x.ga += ga; x.n++;
      x.recent.push({ gf, ga });
      x.form.push(real > opp ? (g.ot ? 'JV' : 'V') : (g.ot ? 'JH' : 'H'));
    }
  }
  const strength = (id: string) => {
    const x = t.get(id);
    if (!x) return { att: 1, def: 1, form: [] as string[] };
    const att = (x.gf + avg * K) / (x.n + K) / avg;
    const def = (x.ga + avg * K) / (x.n + K) / avg;
    const r = x.recent.slice(-5);
    const rAtt = (r.reduce((s, y) => s + y.gf, 0) + avg * 2) / (r.length + 2) / avg;
    const rDef = (r.reduce((s, y) => s + y.ga, 0) + avg * 2) / (r.length + 2) / avg;
    return { att: att * (1 - FORM_W) + rAtt * FORM_W, def: def * (1 - FORM_W) + rDef * FORM_W, form: x.form.slice(-5) };
  };

  for (const g of games.filter((x) => !x.started)) {
    const h = strength(g.home.id), a = strength(g.away.id);
    const lh = hAvg * h.att * a.def, la = aAvg * a.att * h.def;
    let pH = 0, pD = 0, pA = 0, best = { p: 0, s: '0–0' };
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const p = pois(lh, i) * pois(la, j);
      if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
      if (p > best.p) best = { p, s: `${i}–${j}` };
    }
    const s = pH + pD * drawBoost + pA; pH /= s; pD = (pD * drawBoost) / s; pA /= s;
    const o = (p: number) => Math.round(Math.min(50, 1 / p) * 100) / 100;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    out.set(g.id, {
      pHome: r2(pH), pDraw: r2(pD), pAway: r2(pA), odds: { home: o(pH), draw: o(pD), away: o(pA) },
      xgHome: r2(lh), xgAway: r2(la), likely: best.s, formHome: h.form, formAway: a.form,
    });
  }
  return out;
}
