import { describe, expect, it } from 'vitest';
import { deg, formatTime } from './format.ts';

describe('format', () => {
  it('formats times as m:ss and tolerates bad input', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-3)).toBe('0:00');
  });
  it('formats degrees', () => {
    expect(deg(37.6)).toBe('38°');
    expect(deg(37.65, 1)).toBe('37.6°');
  });
});
