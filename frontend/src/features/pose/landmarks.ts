/** MediaPipe pose landmark helpers (pure, no DOM). */
import { featuresFromWorld, type RawFeatures, type UpSign, type Vec3 } from '../../engine/index.ts';

export interface NormLandmark {
  /** 0..1 across the image width */
  x: number;
  /** 0..1 down the image height */
  y: number;
  z: number;
  visibility: number;
}

/** One detected person: 33 normalised image landmarks + 33 metric world landmarks (origin at the hips). */
export interface PoseFrame {
  landmarks: NormLandmark[];
  world: Vec3[];
}

export type Side = 'left' | 'right';

export interface SideIds {
  shoulder: number;
  hip: number;
  knee: number;
  ankle: number;
  heel: number;
  toe: number;
}

export const SIDES: Record<Side, SideIds> = {
  left: { shoulder: 11, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 },
  right: { shoulder: 12, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 },
};

/** Bones drawn for the full skeleton. */
export const CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30],
  [30, 32], [28, 32], [15, 17], [15, 19], [15, 21], [16, 18], [16, 20], [16, 22],
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
];

/** Weakest visibility among the four joints that matter for a squat on this side. */
export function sideVisibility(lm: readonly NormLandmark[], side: Side): number {
  const ids = SIDES[side];
  return Math.min(lm[ids.shoulder]!.visibility, lm[ids.hip]!.visibility, lm[ids.knee]!.visibility, lm[ids.ankle]!.visibility);
}

/** The side of the body facing the camera (highest average visibility). */
export function bestSide(lm: readonly NormLandmark[]): Side {
  const mean = (side: Side) => {
    const ids = SIDES[side];
    return (lm[ids.shoulder]!.visibility + lm[ids.hip]!.visibility + lm[ids.knee]!.visibility + lm[ids.ankle]!.visibility) / 4;
  };
  return mean('left') >= mean('right') ? 'left' : 'right';
}

/** Raw (unsmoothed) joint features for one side, from the world landmarks. */
export function rawFeaturesFor(frame: PoseFrame, side: Side, upSign: UpSign): RawFeatures {
  const ids = SIDES[side];
  const w = frame.world;
  return featuresFromWorld(w[ids.shoulder]!, w[ids.hip]!, w[ids.knee]!, w[ids.ankle]!, upSign);
}

/** +1 if the person faces right in the image (toe is to the right of the heel), else -1. */
export function facingSign(lm: readonly NormLandmark[], side: Side): 1 | -1 {
  const ids = SIDES[side];
  return lm[ids.toe]!.x - lm[ids.heel]!.x >= 0 ? 1 : -1;
}

/** 2-D thigh length in image-height units (aspect = width / height). */
export function thighLength2d(lm: readonly NormLandmark[], side: Side, aspect: number): number {
  const ids = SIDES[side];
  const h = lm[ids.hip]!;
  const k = lm[ids.knee]!;
  return Math.hypot((h.x - k.x) * aspect, h.y - k.y);
}
