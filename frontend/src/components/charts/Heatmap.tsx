import type { HeatCell } from '@/features/stats/stats.ts';
import { fillForScore } from './colors';

const CELL = 14;
const GAP = 3;
const DAYS = ['Mon', 'Wed', 'Fri'];

/** Calendar heatmap: one square per day, coloured by that day's average score. */
export function Heatmap({ cells, label }: { cells: HeatCell[]; label: string }) {
  const cols = Math.max(0, ...cells.map((c) => c.col)) + 1;
  const w = 26 + cols * (CELL + GAP);
  const h = 7 * (CELL + GAP);
  const trained = cells.filter((c) => c.reps > 0).length;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-lg" role="img" aria-label={`${label}. ${trained} training days in this period.`}>
        {DAYS.map((d, i) => (
          <text key={d} x="0" y={i * 2 * (CELL + GAP) + CELL - 2} fontSize="8" fill="#4a5246">
            {d}
          </text>
        ))}
        {cells.map((c) => (
          <rect
            key={c.day}
            x={26 + c.col * (CELL + GAP)}
            y={c.row * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx="3"
            fill={c.avg === null ? 'rgba(0,0,0,0.07)' : fillForScore(c.avg)}
            stroke={c.avg === null ? 'none' : 'rgba(0,0,0,0.25)'}
            strokeWidth="0.5"
          >
            <title>{c.reps ? `${c.day}: ${c.reps} reps, average ${Math.round(c.avg ?? 0)}` : `${c.day}: no training`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
