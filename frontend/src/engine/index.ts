/** Public API of the scoring engine (pure TypeScript: no React, no DOM). */
export * from './types.ts';
export * from './bands.ts';
export { parseConfig, type EngineConfig } from './config.ts';
export { parseMlp, predictProba, type MlpModel } from './network.ts';
export { createEngine, GENERIC_FEATURES, PERSONALIZED_FEATURES, type Engine, type ModelMeta } from './engine.ts';
export {
  angleAt,
  clamp,
  featuresFromWorld,
  fromVertical,
  kneeAtPose,
  planarPoints,
  poseAngles,
  profileFromLengths,
  shankTorso,
  torsoNeeded,
  type PlanarPose,
} from './geometry.ts';
export { coach, type Cue, type CoachResult } from './coach.ts';
export { featureVector, ruleVerdict, scoreRep, type RepScore } from './scoring.ts';
export { FeatureSmoother } from './smoothing.ts';
export { RepTracker, type RepEvent } from './repTracker.ts';
export {
  CalibrationAccumulator,
  checkStanding,
  median,
  type CalibrationExtras,
  type CalibrationResult,
  type Side,
  type StandingCheck,
} from './calibration.ts';
