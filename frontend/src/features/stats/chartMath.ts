/** Geometry helpers for the SVG charts (kept free of React so they can be tested). */

/** Linear map from a domain to a range. A zero-width domain maps everything to the middle of the range. */
export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  if (d1 === d0) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** "Nice" tick values covering [min, max], roughly `count` of them. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v * 1e9) / 1e9);
  return out;
}

export type XY = readonly [number, number];

export function linePath(points: readonly XY[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`).join(' ');
}

/** Closed area under a line down to `baseY`. */
export function areaPath(points: readonly XY[], baseY: number): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath(points)} L${round(last[0])} ${round(baseY)} L${round(first[0])} ${round(baseY)} Z`;
}

const round = (v: number): number => Math.round(v * 100) / 100;

/** Evenly spaced bars: width of each bar and the x of bar i. */
export function barLayout(n: number, width: number, gapRatio = 0.25): { barW: number; x: (i: number) => number } {
  const slot = n > 0 ? width / n : width;
  const barW = slot * (1 - gapRatio);
  return { barW, x: (i) => i * slot + (slot - barW) / 2 };
}
