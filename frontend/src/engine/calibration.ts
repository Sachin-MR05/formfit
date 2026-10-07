import { profileFromLengths } from './geometry.ts';
import type { BodyProfile, RawFeatures, UpSign } from './types.ts';

export const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface StandingCheck {
  ok: boolean;
  /** why the frame was rejected, with the measured values (shown to the user) */
  reason?: string;
}

/**
 * Is this frame usable for measuring body proportions? Segment LENGTHS do not depend on pose, so we only need a
 * clearly upright person (thigh well above horizontal so the "up" direction is unambiguous). Photos are judged
 * more leniently than live frames.
 */
export function checkStanding(raw: RawFeatures, relaxed: boolean): StandingCheck {
  const kneeMin = relaxed ? 130 : 145;
  const torsoMax = relaxed ? 40 : 30;
  const thighMin = relaxed ? 30 : 45;
  if (raw.knee <= kneeMin) {
    return { ok: false, reason: `knee angle ${raw.knee.toFixed(0)}° (needs more than ${kneeMin}°: stand with straighter legs)` };
  }
  if (raw.torso >= torsoMax) {
    return { ok: false, reason: `torso lean ${raw.torso.toFixed(0)}° (needs less than ${torsoMax}°: stand upright; a tilted camera can cause this)` };
  }
  if (Math.abs(raw.phi) < thighMin) {
    return { ok: false, reason: `thigh is close to horizontal (${Math.abs(raw.phi).toFixed(0)}° elevation): stand up, do not squat` };
  }
  return { ok: true };
}

export type Side = 'left' | 'right';

/** Extra per-sample data that is not part of the joint features. */
export interface CalibrationExtras {
  side: Side;
  /** hip.y - knee.y in WORLD landmarks; its sign tells which way "up" points */
  hipKneeDy: number;
  /** hip y in the image (0..1), used for the display-only hip_depth_ratio */
  hipImageY: number;
  /** 2-D thigh length in image-height units */
  thigh2d: number;
}

export interface CalibrationResult {
  profile: BodyProfile;
  side: Side;
  hipImageY0: number;
  thigh2d: number;
  /** number of clean standing frames used */
  samples: number;
}

/**
 * Collects clean standing frames (camera, clip or photos) and produces the person's body profile.
 * `relaxed` is used for photos, where people stand a little less perfectly.
 */
export class CalibrationAccumulator {
  private thigh: number[] = [];
  private shank: number[] = [];
  private torso: number[] = [];
  private dy: number[] = [];
  private sides: Side[] = [];
  private hipY: number[] = [];
  private t2d: number[] = [];
  private rejectedFrames = 0;
  private lastReason: string | null = null;

  get count(): number {
    return this.thigh.length;
  }

  /** frames rejected so far (not standing / not usable) */
  get rejected(): number {
    return this.rejectedFrames;
  }

  /** why the most recent rejected frame was rejected */
  get lastRejection(): string | null {
    return this.lastReason;
  }

  /** Returns true if the frame was accepted as a standing pose. */
  add(raw: RawFeatures, extras: CalibrationExtras, relaxed = false): boolean {
    const check = checkStanding(raw, relaxed);
    if (!check.ok) {
      this.rejectedFrames += 1;
      this.lastReason = check.reason ?? 'not a standing pose';
      return false;
    }
    this.thigh.push(raw.thighLen);
    this.shank.push(raw.shankLen);
    this.torso.push(raw.torsoLen);
    this.dy.push(extras.hipKneeDy);
    this.sides.push(extras.side);
    this.hipY.push(extras.hipImageY);
    this.t2d.push(extras.thigh2d);
    return true;
  }

  finish(minSamples = 15): CalibrationResult | null {
    if (this.count < minSamples) return null;
    const upSign: UpSign = Math.sign(median(this.dy)) >= 0 ? 1 : -1;
    const left = this.sides.filter((s) => s === 'left').length;
    return {
      profile: profileFromLengths(median(this.thigh), median(this.shank), median(this.torso), upSign),
      side: left >= this.sides.length / 2 ? 'left' : 'right',
      hipImageY0: median(this.hipY),
      thigh2d: median(this.t2d),
      samples: this.count,
    };
  }
}
