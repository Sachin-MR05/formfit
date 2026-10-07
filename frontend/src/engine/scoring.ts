import { scoreBand, type ScoreBand } from './bands.ts';
import type { Engine } from './engine.ts';
import { predictProba } from './network.ts';
import type { BodyProfile, FrameFeatures, RuleReason } from './types.ts';

export interface RepScore {
  /** P(good form) from the personalized network (angles + body ratios), 0..1 */
  personalized: number;
  /** P(good form) from the angles-only baseline network, 0..1 */
  generic: number;
  /** The fixed-threshold "one size fits all" rule */
  ruleOk: boolean;
  ruleReasons: RuleReason[];
  /** personalized * 100, rounded: the number shown to the user */
  score: number;
  band: ScoreBand;
}

export function featureVector(f: FrameFeatures, p: BodyProfile): number[] {
  return [f.knee, f.hip, f.torso, f.shank, f.phi, p.femurTorso, p.shankFemur, p.legTorso];
}

export function ruleVerdict(cfg: Engine['config'], f: FrameFeatures): { ok: boolean; reasons: RuleReason[] } {
  const reasons: RuleReason[] = [];
  if (f.knee > cfg.genericKneeMax) reasons.push('knee_over');
  if (f.torso > cfg.genericTorsoMax) reasons.push('torso_over');
  if (f.phi > cfg.depthPhiOk) reasons.push('depth_short');
  return { ok: reasons.length === 0, reasons };
}

/** Score a finished rep from its bottom-position features and the person's body profile. */
export function scoreRep(engine: Engine, f: FrameFeatures, profile: BodyProfile): RepScore {
  const x = featureVector(f, profile);
  const personalized = predictProba(engine.personalized, x);
  const generic = predictProba(engine.generic, x.slice(0, 5));
  const rule = ruleVerdict(engine.config, f);
  const score = Math.round(personalized * 100);
  return {
    personalized,
    generic,
    ruleOk: rule.ok,
    ruleReasons: rule.reasons,
    score,
    band: scoreBand(score, engine.config.scoreGoodMin, engine.config.scoreBorderlineMin),
  };
}
