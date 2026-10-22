/** Explanations for the body profile page. Pure functions. */
import { kneeAtPose, torsoNeeded, type BodyProfile, type EngineConfig } from '../../engine/index.ts';

/**
 * Reference distribution of the two ratios used to train and test the model. These are the ASSUMED population
 * parameters of the simulator (ml/formfit_ml/simulate.py), not a measured survey: the page labels them as such.
 */
export const REFERENCE = {
  femurTorso: { mean: 0.85, sd: 0.08, min: 0.62, max: 1.1 },
  shankFemur: { mean: 1.0, sd: 0.07, min: 0.8, max: 1.2 },
} as const;

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error below 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Percentile (0..100) of a value under a normal distribution. */
export function percentile(value: number, mean: number, sd: number): number {
  return Math.round(normalCdf((value - mean) / sd) * 100);
}

export type BuildKind = 'short' | 'average' | 'long';

export function femurBuild(femurTorso: number): { kind: BuildKind; label: string; percentile: number } {
  const pct = percentile(femurTorso, REFERENCE.femurTorso.mean, REFERENCE.femurTorso.sd);
  if (pct < 25) return { kind: 'short', label: 'Shorter femur than most', percentile: pct };
  if (pct > 75) return { kind: 'long', label: 'Longer femur than most', percentile: pct };
  return { kind: 'average', label: 'Typical femur-to-torso proportion', percentile: pct };
}

export type QualityLevel = 'high' | 'medium' | 'low' | 'estimate';

/** How much to trust the measurement, from how many clean standing frames it came from. */
export function calibrationQuality(p: { kind?: 'measured' | 'manual' | 'average'; samples: number }): { level: QualityLevel; label: string; tip: string } {
  const kind = p.kind ?? 'measured';
  if (kind === 'average') return { level: 'estimate', label: 'Average build (not personalized)', tip: 'Calibrate with a standing side-view photo to personalize your targets.' };
  if (kind === 'manual') return { level: 'estimate', label: 'Typed-in ratios', tip: 'A photo calibration is usually more accurate than typed-in numbers.' };
  if (p.samples >= 20) return { level: 'high', label: 'High confidence', tip: 'Measured from many clean frames.' };
  if (p.samples >= 5) return { level: 'medium', label: 'Good confidence', tip: 'A few more photos from slightly different moments make it more robust.' };
  return { level: 'low', label: 'Based on very few frames', tip: 'Upload two or three standing photos (or a short clip) to firm this up.' };
}

export interface PersonalRanges {
  /** balanced torso lean at parallel depth across typical ankle mobility (degrees) */
  torso: [number, number];
  /** knee angle at parallel depth (degrees) */
  knee: [number, number];
  /** the one-size-fits-all torso limit */
  fixedTorsoMax: number;
  /** how much of this person's balanced range a fixed rule would call wrong (0..1) */
  rejectedByFixedRule: number;
}

export function personalRanges(cfg: Pick<EngineConfig, 'footOffset' | 'alphaRange' | 'genericTorsoMax'>, profile: Pick<BodyProfile, 'femurTorso' | 'shankFemur'>): PersonalRanges {
  const [aLo, aHi] = cfg.alphaRange;
  const t1 = torsoNeeded(profile, aHi, 0, cfg.footOffset);
  const t2 = torsoNeeded(profile, aLo, 0, cfg.footOffset);
  const k1 = kneeAtPose(profile, aHi, 0);
  const k2 = kneeAtPose(profile, aLo, 0);
  const torso: [number, number] = [Math.min(t1, t2), Math.max(t1, t2)];
  const width = torso[1] - torso[0];
  const above = Math.max(0, torso[1] - Math.max(torso[0], cfg.genericTorsoMax));
  return {
    torso,
    knee: [Math.min(k1, k2), Math.max(k1, k2)],
    fixedTorsoMax: cfg.genericTorsoMax,
    rejectedByFixedRule: width > 0 ? Math.min(1, above / width) : torso[0] > cfg.genericTorsoMax ? 1 : 0,
  };
}
