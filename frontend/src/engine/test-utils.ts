/** Shared helpers for the engine tests. The only file that touches Vite-specific imports (JSON, ?raw). */
import configJson from './generated/config.json';
import modelJson from './generated/model.v1.json';
import fixturesRaw from './generated/fixtures.json?raw';
import { createEngine } from './engine.ts';
import type { BodyProfile, Vec3 } from './types.ts';

export type Feat5 = { knee: number; hip: number; torso: number; shank: number; phi: number };
export type SnakeProfile = { femur_torso: number; shank_femur: number; leg_torso: number };

export interface Fixtures {
  schema: number;
  model_version: string;
  geometry: Array<{
    landmarks: Record<'shoulder' | 'hip' | 'knee' | 'ankle', [number, number, number]>;
    up_sign: 1 | -1;
    expected: Feat5 & { thigh_len: number; shank_len: number; torso_len: number };
  }>;
  profiles: Array<{
    thigh: number; shank: number; torso: number; up_sign: 1 | -1;
    expected: SnakeProfile & { up_sign: number };
  }>;
  balance: Array<{
    profile: SnakeProfile; alpha: number; phi: number; tau: number;
    torso_target: number; knee_at_pose: number; pose_knee: number; pose_hip: number;
    points: Record<'ankle' | 'knee' | 'hip' | 'shoulder', [number, number]>;
  }>;
  network: Array<{ x: number[]; personalized: number; generic: number }>;
  scores: Array<{
    phase: 'rep' | 'live'; features: Feat5; profile: SnakeProfile;
    expected: {
      personalized: number; generic: number; rule_ok: boolean; rule_reasons: string[];
      target: number; diff: number; torso: string; depth_ok: boolean; alpha_high: boolean; codes: string[];
    };
  }>;
  trackers: Array<{
    name: string; profile: SnakeProfile; frames: number[][];
    expected_reps: Array<{
      start_t: number; bottom_t: number; end_t: number; down_s: number; up_s: number; min_knee: number;
      bottom: Feat5; personalized: number; generic: number; rule_ok: boolean; codes: string[];
    }>;
  }>;
  smoother: { raw: Feat5[]; expected: Feat5[] };
}

export { configJson, modelJson };
export const engine = createEngine(configJson, modelJson);
export const fixtures = JSON.parse(fixturesRaw) as Fixtures;

export const vec3 = (a: readonly number[]): Vec3 => ({ x: a[0]!, y: a[1]!, z: a[2]! });

export const toProfile = (p: SnakeProfile, upSign: 1 | -1 = -1): BodyProfile => ({
  femurTorso: p.femur_torso,
  shankFemur: p.shank_femur,
  legTorso: p.leg_torso,
  upSign,
});

/** Assert |actual - expected| <= tol with a message that says what diverged. */
export function close(label: string, actual: number, expected: number, tol = 1e-9): void {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label}: TypeScript ${actual} vs Python ${expected} (|diff| ${Math.abs(actual - expected)} > ${tol})`);
  }
}
