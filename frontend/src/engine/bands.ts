/** Score → colour-band logic. UI colours live in lib/score.ts; the thresholds live here. */
export type ScoreBand = 'good' | 'borderline' | 'fix';

export const GOOD_MIN = 70;
export const BORDERLINE_MIN = 50;

export function scoreBand(score: number, goodMin = GOOD_MIN, borderlineMin = BORDERLINE_MIN): ScoreBand {
  if (!Number.isFinite(score)) return 'fix';
  if (score >= goodMin) return 'good';
  if (score >= borderlineMin) return 'borderline';
  return 'fix';
}

export const BAND_LABEL: Record<ScoreBand, string> = {
  good: 'Good form',
  borderline: 'Borderline',
  fix: 'Needs fix',
};
