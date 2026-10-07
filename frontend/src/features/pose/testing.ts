/**
 * Synthetic pose generator for tests and demos: turns a side-view squat pose (the same planar geometry the
 * engine uses) into MediaPipe-shaped landmarks. Not used by the production UI.
 */
import { planarPoints, shankTorso, type Point2 } from '../../engine/index.ts';
import type { NormLandmark, PoseFrame } from './landmarks.ts';

export interface FakePoseOptions {
  femurTorso: number;
  shankFemur: number;
  /** shin lean from vertical (deg) */
  alpha: number;
  /** thigh elevation (deg): ~88 standing, 0 parallel, negative = deeper */
  phi: number;
  /** torso lean from vertical (deg) */
  tau: number;
  /** MediaPipe world landmarks are y-down */
  yDown?: boolean;
  /** which way the person faces in the image */
  facing?: 1 | -1;
  /** camera yaw around the vertical axis (deg); 3-D angles must not care */
  yawDeg?: number;
  visibility?: number;
  /** visibility of the far (right) side landmarks */
  farVisibility?: number;
}

export function makePoseFrame(o: FakePoseOptions): PoseFrame {
  const yDown = o.yDown ?? true;
  const facing = o.facing ?? 1;
  const yaw = ((o.yawDeg ?? 0) * Math.PI) / 180;
  const vis = o.visibility ?? 0.99;
  const far = o.farVisibility ?? vis;
  const pts = planarPoints(o.femurTorso, shankTorso(o), o.alpha, o.phi, o.tau);
  const heel: Point2 = [-0.12, 0];
  const toe: Point2 = [0.28, 0];

  const landmarks: NormLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));

  const put = (id: number, p: Point2, v: number) => {
    landmarks[id] = { x: 0.5 + facing * p[0] * 0.2, y: 0.85 - p[1] * 0.2, z: 0, visibility: v };
    world[id] = {
      x: facing * p[0] * 0.5 * Math.cos(yaw),
      y: (yDown ? -p[1] : p[1]) * 0.5,
      z: facing * p[0] * 0.5 * Math.sin(yaw),
    };
  };
  const both = (left: number, right: number, p: Point2) => {
    put(left, p, vis);
    put(right, p, far);
  };
  both(11, 12, pts.shoulder);
  both(23, 24, pts.hip);
  both(25, 26, pts.knee);
  both(27, 28, pts.ankle);
  both(29, 30, heel);
  both(31, 32, toe);
  put(0, [pts.shoulder[0] + 0.1, pts.shoulder[1] + 0.35], vis); // nose
  return { landmarks, world };
}

/** A standing frame for the given body. */
export const standingFrame = (body: Pick<FakePoseOptions, 'femurTorso' | 'shankFemur'>, extra: Partial<FakePoseOptions> = {}): PoseFrame =>
  makePoseFrame({ ...body, alpha: 0, phi: 88, tau: 3, ...extra });
