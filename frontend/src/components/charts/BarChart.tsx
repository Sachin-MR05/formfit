import { barLayout, niceTicks, scaleLinear } from '@/features/stats/chartMath.ts';

export interface Bar {
  value: number;
  label: string;
  fill: string;
  /** a second, narrower bar drawn in front (e.g. up-time over down-time) */
  value2?: number;
  fill2?: string;
}

export interface BarChartProps {
  bars: Bar[];
  label: string;
  max?: number;
  /** horizontal reference line */
  reference?: { value: number; name: string };
  unit?: string;
}

const W = 320;
const H = 130;
const PAD = { l: 28, r: 6, t: 8, b: 18 };

export function BarChart({ bars, label, max, reference, unit = '' }: BarChartProps) {
  if (bars.length === 0) return <p className="text-sm text-ink-soft">Not enough data yet.</p>;
  const top = max ?? Math.max(...bars.map((b) => Math.max(b.value, b.value2 ?? 0)), reference?.value ?? 0, 1);
  const sy = scaleLinear(0, top, H - PAD.b, PAD.t);
  const { barW, x } = barLayout(bars.length, W - PAD.l - PAD.r, 0.25);
  const ticks = niceTicks(0, top, 4);

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
        {bars.map((b, i) => {
          const bx = PAD.l + x(i);
          return (
            <g key={i}>
              <rect x={bx} y={sy(b.value)} width={barW} height={Math.max(0, sy(0) - sy(b.value))} rx="3" fill={b.fill} stroke="rgba(0,0,0,.35)" strokeWidth="0.6">
                <title>{`${b.label}: ${b.value.toFixed(1)}${unit}`}</title>
              </rect>
              {b.value2 !== undefined && (
                <rect x={bx + barW * 0.25} y={sy(b.value2)} width={barW * 0.5} height={Math.max(0, sy(0) - sy(b.value2))} rx="2" fill={b.fill2 ?? '#0b0b0b'} opacity="0.85">
                  <title>{`${b.label}: ${b.value2.toFixed(1)}${unit}`}</title>
                </rect>
              )}
              {bars.length <= 16 && (
                <text x={bx + barW / 2} y={H - 5} textAnchor="middle" fontSize="8.5" fill="#4a5246">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
        {reference && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(reference.value)} y2={sy(reference.value)} stroke="#0369a1" strokeDasharray="4 3" strokeWidth="1.2" />
            <title>{reference.name}</title>
          </g>
        )}
      </svg>
      <figcaption className="sr-only">
        {label}: {bars.map((b) => `${b.label} ${b.value.toFixed(1)}${unit}`).join(', ')}
      </figcaption>
    </figure>
  );
}
