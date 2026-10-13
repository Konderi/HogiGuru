export type Position = 'C' | 'G' | 'D' | 'F';
export const POSITIONS: Position[] = ['C', 'G', 'D', 'F'];

export interface SkaterWeights { goals: number; assists: number; pim: number; plusMinus: number; games: number }
export interface Scoring {
  F: SkaterWeights;
  D: SkaterWeights;
  G: { shutouts: number; saves: number; goalsAgainst: number; wins: number };
  C: { teamPoints: number };
  coachFiredPenalty: number;
}

export interface StatRow {
  games: number; goals: number; assists: number; pim: number; plus_minus: number;
  shutouts: number; saves: number; goals_against: number; wins: number;
}

const r1 = (n: number) => Math.round(n * 100) / 100;

export function skaterPoints(s: StatRow, w: SkaterWeights): number {
  return r1(s.goals * w.goals + s.assists * w.assists + s.pim * w.pim + s.plus_minus * w.plusMinus + s.games * w.games);
}

export function goaliePoints(s: StatRow, w: Scoring['G']): number {
  return r1(s.shutouts * w.shutouts + s.saves * w.saves + s.goals_against * w.goalsAgainst + s.wins * (w.wins ?? 0));
}

export function coachPoints(teamPoints: number, w: Scoring['C']): number {
  return r1(teamPoints * w.teamPoints);
}

/** Nykyiset HG-pisteet entiteetille annetussa paikassa. */
export function entityPoints(
  pos: Position, entityId: number, sc: Scoring,
  stats: Map<number, StatRow>, coachTeam: Map<number, string>, teamPoints: Map<string, number>,
): number {
  if (pos === 'C') {
    const team = coachTeam.get(entityId);
    return team ? coachPoints(teamPoints.get(team) ?? 0, sc.C) : 0;
  }
  const s = stats.get(entityId);
  if (!s) return 0;
  return pos === 'G' ? goaliePoints(s, sc.G) : skaterPoints(s, sc[pos]);
}
