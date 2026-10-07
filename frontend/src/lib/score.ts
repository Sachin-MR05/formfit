/** UI-facing score helpers. Thresholds and labels come from the engine (single source of truth). */
import type { ScoreBand } from '../engine/bands.ts';

export { BAND_LABEL, BORDERLINE_MIN, GOOD_MIN, scoreBand } from '../engine/bands.ts';
export type { ScoreBand } from '../engine/bands.ts';

/** Darker strokes that stay readable on the pastel tiles. */
export const BAND_STROKE: Record<ScoreBand, string> = {
  good: '#3f6212',
  borderline: '#a16207',
  fix: '#b91c1c',
};
