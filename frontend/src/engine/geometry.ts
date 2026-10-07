import type { BodyProfile, Point2, RawFeatures, UpSign, Vec3 } from './types.ts';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const EPS = 1e-9; // identical to the Python reference

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (u: Vec3, v: Vec3): number => u.x * v.x + u.y * v.y + u.z * v.z;
const norm = (u: Vec3): number => Math.hypot(u.x, u.y, u.z);

/** Angle at b (degrees) between a-b and c-b. */
export function angleAt(a: Vec3, b: Vec3, c: Vec3): number {
  const u = sub(a, b);
  const v = sub(c, b);
  return Math.acos(clamp(dot(u, v) / (norm(u) * norm(v) + EPS), -1, 1)) * R2D;
}

/** Angle between a vector and the vertical axis (degrees, direction-agnostic). */
export function fromVertical(u: Vec3): number {
  return Math.acos(clamp(Math.abs(u.y) / (norm(u) + EPS), 0, 1)) * R2D;
}

/**
 * Joint features from four 3-D landmarks (MediaPipe *world* landmarks).
 * Works for any camera yaw (angles are computed in 3-D) and either y-axis direction (via upSign).
 */
export function featuresFromWorld(sh: Vec3, hip: Vec3, kn: Vec3, an: Vec3, upSign: UpSign): RawFeatures {
  const thigh = sub(hip, kn);
  return {
    knee: angleAt(hip, kn, an),
    hip: angleAt(sh, hip, kn),
    torso: fromVertical(sub(sh, hip)),
    shank: fromVertical(sub(kn, an)),
    phi: Math.asin(clamp((upSign * thigh.y) / (norm(thigh) + EPS), -1, 1)) * R2D,
    thighLen: norm(thigh),
    shankLen: norm(sub(kn, an)),
    torsoLen: norm(sub(sh, hip)),
  };
}

export function profileFromLengths(thigh: number, shank: number, torso: number, upSign: UpSign): BodyProfile {
  return {
    femurTorso: thigh / torso,
    shankFemur: shank / thigh,
    legTorso: (thigh + shank) / torso,
    upSign,
  };
}

/** shank length / torso length */
export const shankTorso = (p: Pick<BodyProfile, 'femurTorso' | 'shankFemur'>): number => p.femurTorso * p.shankFemur;

/**
 * Balance model: the torso lean (deg) that keeps the shoulders over the mid-foot for THIS body.
 *   thigh*cos(phi) - shank*sin(alpha) + footOffset = sin(torso)      (all lengths in torso lengths)
 */
export function torsoNeeded(
  p: Pick<BodyProfile, 'femurTorso' | 'shankFemur'>,
  alpha: number,
  phi: number,
  footOffset: number,
): number {
  const x = p.femurTorso * Math.cos(phi * D2R) - shankTorso(p) * Math.sin(alpha * D2R) + footOffset;
  return Math.asin(clamp(x, -1, 1)) * R2D;
}

export interface PlanarPose {
  ankle: Point2;
  knee: Point2;
  hip: Point2;
  shoulder: Point2;
}

/** Side-view joint positions in torso lengths (x forward, y up, ankle at the origin). Used for the ghost skeleton. */
export function planarPoints(femurTorso: number, shankTorsoRatio: number, alpha: number, phi: number, tau: number): PlanarPose {
  const a = alpha * D2R;
  const p = phi * D2R;
  const t = tau * D2R;
  const knee: Point2 = [shankTorsoRatio * Math.sin(a), shankTorsoRatio * Math.cos(a)];
  const hip: Point2 = [knee[0] - femurTorso * Math.cos(p), knee[1] + femurTorso * Math.sin(p)];
  const shoulder: Point2 = [hip[0] + Math.sin(t), hip[1] + Math.cos(t)];
  return { ankle: [0, 0], knee, hip, shoulder };
}

function angle2(u: Point2, v: Point2): number {
  const c = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) + EPS);
  return Math.acos(clamp(c, -1, 1)) * R2D;
}

/** Knee and hip angles implied by the planar geometry. */
export function poseAngles(femurTorso: number, shankTorsoRatio: number, alpha: number, phi: number, tau: number): { knee: number; hip: number } {
  const { knee, hip, shoulder } = planarPoints(femurTorso, shankTorsoRatio, alpha, phi, tau);
  const kneeAngle = angle2([hip[0] - knee[0], hip[1] - knee[1]], [-knee[0], -knee[1]]);
  const hipAngle = angle2([shoulder[0] - hip[0], shoulder[1] - hip[1]], [knee[0] - hip[0], knee[1] - hip[1]]);
  return { knee: kneeAngle, hip: hipAngle };
}

/** Knee angle this body would show at a given shin lean and thigh elevation. */
export function kneeAtPose(p: Pick<BodyProfile, 'femurTorso' | 'shankFemur'>, alpha: number, phi: number): number {
  return poseAngles(p.femurTorso, shankTorso(p), alpha, phi, 0).knee;
}
