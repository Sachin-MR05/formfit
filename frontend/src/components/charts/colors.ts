import { scoreBand, type ScoreBand } from '@/lib/score';

/** Fill colours that match the design tokens (lime = good, yellow = borderline, coral = fix). */
export const BAND_FILL: Record<ScoreBand, string> = { good: '#d4f28a', borderline: '#ffe680', fix: '#ff8f7e' };
export const BAND_INK: Record<ScoreBand, string> = { good: '#3f6212', borderline: '#a16207', fix: '#b91c1c' };

export const fillForScore = (score: number): string => BAND_FILL[scoreBand(score)];
