import { areaPath, linePath, niceTicks, scaleLinear, type XY } from '@/features/stats/chartMath.ts';

export interface LinePoint {
  x: number;
  y: number;
  label?: string;
}

export interface LineChartProps {
  points: LinePoint[];
  /** accessible name; a sentence that says what the chart shows */
  label: string;
  yDomain?: [number, number];
  /** shaded horizontal band, e.g. the personal target range */
  band?: { lo: number; hi: number; name: string };
  /** x-axis labels at given x positions */
  xTicks?: Array<{ x: number; text: string }>;
  stroke?: string;
  unit?: string;
}

const W = 320;
const H = 140;
const PAD = { l: 30, r: 8, t: 8, b: 20 };

/** A small accessible line chart. The data is also available to assistive tech as a list. */
export function LineChart({ points, label, yDomain, band, xTicks, stroke = '#0b0b0b', unit = '' }: LineChartProps) {
  if (points.length === 0) return <p className="text-sm text-ink-soft">Not enough data yet.</p>;
  const ys = points.map((p) => p.y);
  const lo = yDomain?.[0] ?? Math.min(...ys, band?.lo ?? Infinity);
  const hi = yDomain?.[1] ?? Math.max(...ys, band?.hi ?? -Infinity);
  const xs = points.map((p) => p.x);
  const sx = scaleLinear(Math.min(...xs), Math.max(...xs), PAD.l, W - PAD.r);
  const sy = scaleLinear(lo, hi, H - PAD.b, PAD.t);
  const xy: XY[] = points.map((p) => [sx(p.x), sy(p.y)]);
  const ticks = niceTicks(lo, hi, 4);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="rgba(0,0,0,.08)" />
            <text x={PAD.l - 4} y={sy(t) + 3} textAnchor="end" fontSize="9" fill="#4a5246">
              {t}
            </text>
          </g>
        ))}
        {band && (
          <rect x={PAD.l} y={sy(band.hi)} width={W - PAD.l - PAD.r} height={Math.max(0, sy(band.lo) - sy(band.hi))} fill="#bfd9ea" opacity="0.6">
            <title>{band.name}</title>
          </rect>
        )}
        <path d={areaPath(xy, H - PAD.b)} fill={stroke} opacity="0.06" />
        <path d={linePath(xy)} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {xy.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#ffe680" stroke={stroke} strokeWidth="1.2">
            <title>{`${points[i]!.label ?? points[i]!.x}: ${points[i]!.y.toFixed(1)}${unit}`}</title>
          </circle>
        ))}
        {xTicks?.map((t) => (
          <text key={t.x} x={sx(t.x)} y={H - 5} textAnchor="middle" fontSize="9" fill="#4a5246">
            {t.text}
          </text>
        ))}
      </svg>
      <figcaption className="sr-only">
        {label}: {points.map((p) => `${p.label ?? p.x} ${p.y.toFixed(1)}${unit}`).join(', ')}
      </figcaption>
    </figure>
  );
}
