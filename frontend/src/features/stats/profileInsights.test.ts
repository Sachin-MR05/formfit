import { describe, expect, it } from 'vitest';
import { engine } from '../../engine/test-utils.ts';
import { REFERENCE, calibrationQuality, femurBuild, normalCdf, percentile, personalRanges } from './profileInsights.ts';

describe('normal distribution helpers', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
  it('turns a ratio into a percentile', () => {
    expect(percentile(0.85, 0.85, 0.08)).toBe(50);
    expect(percentile(0.93, 0.85, 0.08)).toBe(84);
    expect(percentile(0.69, 0.85, 0.08)).toBe(2);
  });
});

describe('femurBuild', () => {
  it('describes short, typical and long femurs', () => {
    expect(femurBuild(0.7).kind).toBe('short');
    expect(femurBuild(REFERENCE.femurTorso.mean).kind).toBe('average');
    expect(femurBuild(1.02).kind).toBe('long');
    expect(femurBuild(1.02).percentile).toBeGreaterThan(90);
  });
});

describe('calibrationQuality', () => {
  it('rates measured profiles by how many frames they came from', () => {
    expect(calibrationQuality({ samples: 30 }).level).toBe('high');
    expect(calibrationQuality({ samples: 8 }).level).toBe('medium');
    expect(calibrationQuality({ samples: 1 }).level).toBe('low');
  });
  it('is honest about estimates', () => {
    expect(calibrationQuality({ kind: 'average', samples: 0 }).level).toBe('estimate');
    expect(calibrationQuality({ kind: 'manual', samples: 0 }).label).toContain('Typed-in');
  });
});

describe('personalRanges (the fairness story for one person)', () => {
  const cfg = engine.config;
  it('gives a longer balanced range for a long femur than a short one', () => {
    const long = personalRanges(cfg, { femurTorso: 1.05, shankFemur: 1.0 });
    const short = personalRanges(cfg, { femurTorso: 0.7, shankFemur: 1.0 });
    const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
    expect(mid(long.torso)).toBeGreaterThan(mid(short.torso) + 8); // ranges can overlap (ankle mobility matters), the typical need does not
    expect(long.torso[0]).toBeLessThan(long.torso[1]);
    expect(long.knee[0]).toBeLessThan(long.knee[1]);
  });
  it('shows how much of a long-femur range the fixed rule would wrongly reject, and none of a short one', () => {
    expect(personalRanges(cfg, { femurTorso: 1.05, shankFemur: 1.0 }).rejectedByFixedRule).toBeGreaterThan(0.3);
    expect(personalRanges(cfg, { femurTorso: 0.7, shankFemur: 1.0 }).rejectedByFixedRule).toBe(0);
    expect(personalRanges(cfg, { femurTorso: 1.05, shankFemur: 1.0 }).fixedTorsoMax).toBe(cfg.genericTorsoMax);
  });
});
