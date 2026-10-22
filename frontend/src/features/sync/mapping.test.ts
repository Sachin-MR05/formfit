import { describe, expect, it } from 'vitest';
import { profileFromWire, profileToWire, repFromWire, repToWire, sessionFromWire, sessionToWire } from './mapping.ts';
import type { StoredProfile, StoredRep, StoredSession } from '../session/types.ts';

const profile = { femurTorso: 0.94, shankFemur: 0.98, legTorso: 1.86, upSign: -1 as const };
const sp: StoredProfile = { id: 'prof-0001', kind: 'manual', profile, side: 'right', hipImageY0: 0.5, thigh2d: 0.2, samples: 12, source: 'x', createdAt: 5, updatedAt: 9, syncedVersion: null };
const ss: StoredSession = { id: 'sess-0001', startedAt: 10, endedAt: 20, updatedAt: 30, syncedVersion: null, source: 'upload', fileName: 'a.mp4', poseModel: 'lite', modelVersion: 'v1', profile };
const sr: StoredRep = {
  id: 'rep-00001', sessionId: 'sess-0001', index: 3, createdAt: 11, updatedAt: 12, syncedVersion: null, tSeconds: 4.5,
  features: { knee: 60.1, hip: 50.2, torso: 35.3, shank: 38.4, phi: -5.5 }, profile, score: 81, personalized: 0.81, generic: 0.7, ruleOk: false,
  ruleReasons: ['torso_over'], codes: ['torso_forward', 'depth_short'], downS: 1.1, upS: 0.9, modelVersion: 'v1', label: 'faulty',
};

describe('wire mapping', () => {
  it('profiles round-trip (and arrive already synced)', () => {
    const back = profileFromWire(profileToWire(sp));
    expect(back).toEqual({ ...sp, syncedVersion: 9 });
    expect(profileToWire({ ...sp, kind: undefined }).kind).toBe('measured');
  });

  it('sessions round-trip', () => {
    const w = sessionToWire(ss);
    expect(w.profile?.up_sign).toBe(-1);
    expect(sessionFromWire(w)).toEqual({ ...ss, syncedVersion: 30 });
  });

  it('a deleted session travels as a minimal tombstone, both ways', () => {
    expect(sessionToWire({ ...ss, deleted: true })).toEqual({ id: 'sess-0001', updated_at: 30, deleted: true });
    expect(sessionFromWire({ id: 'sess-0001', updated_at: 30, deleted: true })).toEqual({ id: 'sess-0001', deleted: true, updatedAt: 30 });
  });

  it('reps round-trip', () => {
    expect(repFromWire(repToWire(sr))).toEqual({ ...sr, syncedVersion: 12 });
    const w = repToWire(sr);
    expect(w.session_id).toBe('sess-0001');
    expect(w.rule_ok).toBe(false);
    expect(w.features).toEqual(sr.features);
  });

  it('an incomplete session from the server is an error, not silently half-saved', () => {
    expect(() => sessionFromWire({ id: 'sess-0002', updated_at: 1 })).toThrow();
  });
});
