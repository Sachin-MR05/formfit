import { describe, expect, it } from 'vitest';
import { BORDERLINE_MIN, GOOD_MIN, scoreBand } from './score';

describe('scoreBand', () => {
  it('uses the agreed thresholds', () => {
    expect(GOOD_MIN).toBe(70);
    expect(BORDERLINE_MIN).toBe(50);
  });

  it('classifies boundaries correctly', () => {
    expect(scoreBand(100)).toBe('good');
    expect(scoreBand(70)).toBe('good');
    expect(scoreBand(69.9)).toBe('borderline');
    expect(scoreBand(50)).toBe('borderline');
    expect(scoreBand(49.9)).toBe('fix');
    expect(scoreBand(0)).toBe('fix');
  });

  it('treats invalid input as needing a fix', () => {
    expect(scoreBand(Number.NaN)).toBe('fix');
    expect(scoreBand(Number.POSITIVE_INFINITY)).toBe('fix');
  });
});
