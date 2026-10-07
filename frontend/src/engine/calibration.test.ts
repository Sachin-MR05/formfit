import { describe, expect, it } from 'vitest';
import { CalibrationAccumulator, checkStanding, median } from './calibration.ts';
import { featuresFromWorld, planarPoints } from './geometry.ts';
import type { RawFeatures, UpSign } from './types.ts';

/** A relaxed standing pose (no squat) for a body with the given proportions, in metres. */
function standing(femurTorso: number, shankTorso: number, yDown: boolean, jitter = 0): { raw: RawFeatures; dy: number } {
  const pts = planarPoints(femurTorso, shankTorso, 0, 88, 3);
  const w = (p: readonly [number, number]) => ({ x: p[0] * 0.5 + jitter, y: (yDown ? -p[1] : p[1]) * 0.5, z: 0 });
  const upSign: UpSign = yDown ? -1 : 1;
  const raw = featuresFromWorld(w(pts.shoulder), w(pts.hip), w(pts.knee), w(pts.ankle), upSign);
  return { raw, dy: w(pts.hip).y - w(pts.knee).y };
}

describe('CalibrationAccumulator', () => {
  for (const yDown of [true, false]) {
    it(`recovers body ratios and the up direction (y-${yDown ? 'down' : 'up'} landmarks)`, () => {
      const acc = new CalibrationAccumulator();
      for (let i = 0; i < 40; i++) {
        const s = standing(1.0, 0.95, yDown, (i % 5) * 1e-4);
        acc.add(s.raw, { side: 'left', hipKneeDy: s.dy, hipImageY: 0.45, thigh2d: 0.2 });
      }
      const r = acc.finish()!;
      expect(r).not.toBeNull();
      expect(Math.abs(r.profile.femurTorso - 1.0)).toBeLessThan(0.01);
      expect(Math.abs(r.profile.shankFemur - 0.95)).toBeLessThan(0.01);
      expect(r.profile.upSign).toBe(yDown ? -1 : 1);
      expect(r.side).toBe('left');
      expect(r.samples).toBe(40);
    });
  }

  it('rejects frames that are not standing', () => {
    const acc = new CalibrationAccumulator();
    const pts = planarPoints(1, 0.95, 38, -5, 40);
    const w = (p: readonly [number, number]) => ({ x: p[0] * 0.5, y: -p[1] * 0.5, z: 0 });
    const squat = featuresFromWorld(w(pts.shoulder), w(pts.hip), w(pts.knee), w(pts.ankle), -1);
    expect(acc.add(squat, { side: 'left', hipKneeDy: 0, hipImageY: 0.5, thigh2d: 0.2 })).toBe(false);
    expect(acc.count).toBe(0);
  });

  it('needs enough clean frames, but a single good photo is enough when asked', () => {
    const acc = new CalibrationAccumulator();
    const s = standing(0.9, 0.9, true);
    acc.add(s.raw, { side: 'right', hipKneeDy: s.dy, hipImageY: 0.5, thigh2d: 0.2 }, true);
    expect(acc.finish()).toBeNull();
    expect(acc.finish(1)?.side).toBe('right');
  });

  it('median handles odd, even and empty input', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('checkStanding (tolerant, with reasons)', () => {
  const base: RawFeatures = { knee: 172, hip: 170, torso: 5, shank: 3, phi: 85, thighLen: 0.5, shankLen: 0.5, torsoLen: 0.5 };

  it('accepts a normal standing pose', () => {
    expect(checkStanding(base, false).ok).toBe(true);
  });

  it('accepts slightly bent knees and a leaning torso in a photo, but not in strict mode', () => {
    const casual = { ...base, knee: 138, torso: 34 };
    expect(checkStanding(casual, true).ok).toBe(true);
    expect(checkStanding(casual, false).ok).toBe(false);
  });

  it('explains what is wrong, with the measured number', () => {
    expect(checkStanding({ ...base, knee: 100 }, true).reason).toContain('knee angle 100°');
    expect(checkStanding({ ...base, torso: 60 }, true).reason).toContain('torso lean 60°');
    expect(checkStanding({ ...base, phi: 10 }, true).reason).toContain('close to horizontal');
  });

  it('works whichever way the y axis points (uses the absolute thigh elevation)', () => {
    expect(checkStanding({ ...base, phi: -85 }, false).ok).toBe(true);
  });

  it('the accumulator counts rejected frames and remembers the last reason', () => {
    const acc = new CalibrationAccumulator();
    const extras = { side: 'left' as const, hipKneeDy: -1, hipImageY: 0.5, thigh2d: 0.2 };
    acc.add({ ...base, knee: 90 }, extras);
    acc.add({ ...base, torso: 70 }, extras);
    expect(acc.count).toBe(0);
    expect(acc.rejected).toBe(2);
    expect(acc.lastRejection).toContain('torso lean 70°');
  });
});
