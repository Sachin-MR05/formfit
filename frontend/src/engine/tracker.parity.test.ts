import { describe, expect, it } from 'vitest';
import { coach } from './coach.ts';
import { RepTracker } from './repTracker.ts';
import { scoreRep } from './scoring.ts';
import { FeatureSmoother } from './smoothing.ts';
import { close, engine, fixtures, toProfile } from './test-utils.ts';

describe('FeatureSmoother', () => {
  it('matches the Python EMA on a random sequence', () => {
    const sm = new FeatureSmoother(engine.config.emaAlpha);
    fixtures.smoother.raw.forEach((raw, i) => {
      const out = sm.update(raw);
      for (const k of ['knee', 'hip', 'torso', 'shank', 'phi'] as const) close(`smoother[${i}].${k}`, out[k], fixtures.smoother.expected[i]![k]);
    });
  });
});

describe('RepTracker parity (rep detection, tempo, scoring) on simulated sets', () => {
  it('covers the interesting scenarios', () => {
    expect(fixtures.trackers.map((t) => t.name)).toEqual(
      expect.arrayContaining(['good rep', 'forward lean', 'shallow rep', 'tiny dip ignored', 'two reps', 'deep + upright']),
    );
  });

  for (const tc of fixtures.trackers) {
    it(`scenario: ${tc.name}`, () => {
      const sm = new FeatureSmoother(engine.config.emaAlpha);
      const tracker = new RepTracker(engine.config);
      const profile = toProfile(tc.profile);
      const reps = [];
      for (const [t, knee, hip, torso, shank, phi] of tc.frames) {
        const ev = tracker.update(t!, sm.update({ knee: knee!, hip: hip!, torso: torso!, shank: shank!, phi: phi! }));
        if (ev) reps.push(ev);
      }
      expect(reps).toHaveLength(tc.expected_reps.length);
      reps.forEach((ev, i) => {
        const e = tc.expected_reps[i]!;
        close(`${tc.name}[${i}].startT`, ev.startT, e.start_t);
        close(`${tc.name}[${i}].bottomT`, ev.bottomT, e.bottom_t);
        close(`${tc.name}[${i}].endT`, ev.endT, e.end_t);
        close(`${tc.name}[${i}].downS`, ev.downS, e.down_s);
        close(`${tc.name}[${i}].upS`, ev.upS, e.up_s);
        close(`${tc.name}[${i}].minKnee`, ev.minKnee, e.min_knee);
        for (const k of ['knee', 'hip', 'torso', 'shank', 'phi'] as const) close(`${tc.name}[${i}].bottom.${k}`, ev.bottom[k], e.bottom[k]);
        const s = scoreRep(engine, ev.bottom, profile);
        close(`${tc.name}[${i}].personalized`, s.personalized, e.personalized);
        close(`${tc.name}[${i}].generic`, s.generic, e.generic);
        expect(s.ruleOk).toBe(e.rule_ok);
        expect(coach(engine.config, ev.bottom, profile, 'rep').codes).toEqual(e.codes);
      });
    });
  }

  it('reset() abandons a rep in progress (used when the user scrubs a video)', () => {
    const tracker = new RepTracker(engine.config);
    tracker.update(0, { knee: 120, hip: 90, torso: 30, shank: 30, phi: 10 });
    expect(tracker.inRep).toBe(true);
    tracker.reset();
    expect(tracker.inRep).toBe(false);
  });
});
