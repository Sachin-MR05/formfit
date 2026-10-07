import { kneeAtPose, torsoNeeded, type Engine } from '../../engine/index.ts';
import type { ProfileView } from './store.ts';
import type { StoredProfile } from './types.ts';

/** What the "Your build" tile shows: ratios plus the personal target ranges at parallel depth. */
export function makeProfileView(engine: Engine, stored: StoredProfile): ProfileView {
  const { footOffset, alphaRange } = engine.config;
  const [lo, hi] = alphaRange; // shin lean across ankle mobilities: stiff ankles (lo) need more torso lean
  const p = stored.profile;
  const t1 = torsoNeeded(p, hi, 0, footOffset);
  const t2 = torsoNeeded(p, lo, 0, footOffset);
  const k1 = kneeAtPose(p, hi, 0);
  const k2 = kneeAtPose(p, lo, 0);
  return {
    kind: stored.kind ?? 'measured',
    profile: p,
    side: stored.side,
    source: stored.source,
    samples: stored.samples,
    createdAt: stored.createdAt,
    torsoRange: [Math.min(t1, t2), Math.max(t1, t2)],
    kneeRange: [Math.min(k1, k2), Math.max(k1, k2)],
  };
}
