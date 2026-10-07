import type { EngineConfig } from './config.ts';
import { torsoNeeded } from './geometry.ts';
import type { BodyProfile, CoachPhase, CueCode, FrameFeatures, TorsoStatus } from './types.ts';

export interface Cue {
  code: CueCode;
  /** 1 = safety, 2 = depth, 3 = balance. Lower is more urgent (voice picks the lowest). */
  priority: number;
  /** Full sentence for the screen. */
  text: string;
  /** Short phrase for the voice coach. */
  spoken: string;
}

export interface CoachResult {
  /** Balanced torso lean for this body at the current shin lean and depth (deg). */
  target: number;
  /** actual torso lean minus target (deg) */
  diff: number;
  torso: TorsoStatus;
  depthOk: boolean;
  alphaHigh: boolean;
  /** Codes in the same order as the Python reference (compared in parity tests). */
  codes: CueCode[];
  /** The same issues as UI/voice cues, most urgent first. */
  cues: Cue[];
}

const deg = (x: number): string => `${x.toFixed(0)}°`;

function buildCue(code: CueCode, f: FrameFeatures, target: number, cfg: EngineConfig): Cue {
  switch (code) {
    case 'torso_forward':
      return {
        code,
        priority: 3,
        text: `Chest is folding forward more than YOUR proportions need (you ${deg(f.torso)}, your balanced target ≈ ${deg(target)}). Keep the chest up and let the knees travel.`,
        spoken: 'Chest up.',
      };
    case 'torso_upright':
      return {
        code,
        priority: 3,
        text: `Torso is more upright than your balance point (you ${deg(f.torso)}, target ≈ ${deg(target)}). Weight may drift to the heels: sit the hips back and hinge a little.`,
        spoken: 'Sit back and hinge a little.',
      };
    case 'knee_travel':
      return {
        code,
        priority: 1,
        text: `Knees are travelling very far forward (${deg(f.shank)}). Try a wider stance or a small heel lift.`,
        spoken: 'Knees are travelling far forward.',
      };
    case 'depth_short':
      return {
        code,
        priority: 2,
        text: `Depth not reached: hips ended about ${(f.phi - cfg.depthPhiOk).toFixed(0)}° above knee level.`,
        spoken: 'Go a little deeper.',
      };
  }
}

/**
 * Geometry-aware verdict for one frame ('live') or a finished rep ('rep').
 * 'rep' additionally reports missed depth; during the descent depth is not nagged about.
 */
export function coach(cfg: EngineConfig, f: FrameFeatures, profile: BodyProfile, phase: CoachPhase = 'rep'): CoachResult {
  const target = torsoNeeded(profile, f.shank, f.phi, cfg.footOffset);
  const diff = f.torso - target;
  const torso: TorsoStatus = Math.abs(diff) <= cfg.torsoTol ? 'ok' : diff > 0 ? 'forward' : 'upright';
  const depthOk = f.phi <= cfg.depthPhiOk;
  const alphaHigh = f.shank > cfg.alphaMax;

  const codes: CueCode[] = [];
  if (torso === 'forward') codes.push('torso_forward');
  if (torso === 'upright') codes.push('torso_upright');
  if (alphaHigh) codes.push('knee_travel');
  if (phase === 'rep' && !depthOk) codes.push('depth_short');

  const cues = codes.map((c) => buildCue(c, f, target, cfg)).sort((a, b) => a.priority - b.priority);
  return { target, diff, torso, depthOk, alphaHigh, codes, cues };
}
