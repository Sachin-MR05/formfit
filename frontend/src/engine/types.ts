/** Shared engine types. Pure data: no React, no DOM. Angles are in degrees. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** +1 if the landmark y-axis points up, -1 if it points down (MediaPipe world landmarks: down). */
export type UpSign = 1 | -1;

/** The five kinematic features the networks use. */
export interface FrameFeatures {
  /** hip-knee-ankle angle */
  knee: number;
  /** shoulder-hip-knee angle */
  hip: number;
  /** torso lean from vertical */
  torso: number;
  /** shin lean from vertical (ankle to knee) */
  shank: number;
  /** thigh elevation above horizontal: 0 = parallel, negative = below parallel */
  phi: number;
}

export interface RawFeatures extends FrameFeatures {
  thighLen: number;
  shankLen: number;
  torsoLen: number;
}

/** Static body proportions measured during calibration. */
export interface BodyProfile {
  femurTorso: number;
  shankFemur: number;
  legTorso: number;
  upSign: UpSign;
}

export type TorsoStatus = 'ok' | 'forward' | 'upright';
export type CueCode = 'torso_forward' | 'torso_upright' | 'knee_travel' | 'depth_short';
export type RuleReason = 'knee_over' | 'torso_over' | 'depth_short';
export type CoachPhase = 'live' | 'rep';

export type Point2 = readonly [number, number];
