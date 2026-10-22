import { describe, expect, it } from 'vitest';
import { areaPath, barLayout, linePath, niceTicks, scaleLinear } from './chartMath.ts';

describe('scaleLinear', () => {
  it('maps and can invert the direction', () => {
    expect(scaleLinear(0, 100, 0, 200)(50)).toBe(100);
    expect(scaleLinear(0, 100, 200, 0)(25)).toBe(150); // SVG y grows downwards
  });
  it('does not divide by zero for a flat series', () => {
    expect(scaleLinear(5, 5, 0, 100)(5)).toBe(50);
  });
});

describe('niceTicks', () => {
  it('picks round values covering the range', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.5, 1]);
    expect(niceTicks(3, 3)).toEqual([3]);
    expect(niceTicks(Number.NaN, 1)).toEqual([]);
  });
});

describe('paths', () => {
  it('builds a line and a closed area', () => {
    expect(linePath([[0, 10], [5, 20]])).toBe('M0 10 L5 20');
    expect(linePath([])).toBe('');
    expect(areaPath([[0, 10], [5, 20]], 50)).toBe('M0 10 L5 20 L5 50 L0 50 Z');
    expect(areaPath([], 50)).toBe('');
  });
});

describe('barLayout', () => {
  it('spaces bars evenly inside the width', () => {
    const { barW, x } = barLayout(4, 400, 0.2);
    expect(barW).toBe(80);
    expect(x(0)).toBe(10);
    expect(x(3) + barW).toBe(390);
  });
  it('handles no bars', () => {
    expect(barLayout(0, 100).barW).toBeGreaterThan(0);
  });
});
