import { motion } from 'framer-motion';
import { BAND_LABEL, BAND_STROKE, scoreBand } from '@/lib/score';

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface ScoreRingProps {
  score: number;
  size?: number;
}

/** Animated 0-100 ring. Colour is paired with the band label for accessibility. */
export function ScoreRing({ score, size = 168 }: ScoreRingProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(score) ? score : 0));
  const band = scoreBand(clamped);

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Form score ${Math.round(clamped)} out of 100, ${BAND_LABEL[band]}`}
    >
      <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true">
        <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="rgba(0,0,0,0.09)" strokeWidth="14" />
        <motion.circle
          cx="80"
          cy="80"
          r={RADIUS}
          fill="none"
          stroke={BAND_STROKE[band]}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          transform="rotate(-90 80 80)"
          initial={false}
          animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - clamped / 100) }}
          transition={{ type: 'spring', stiffness: 80, damping: 18 }}
        />
      </svg>
      <span className="absolute font-display text-4xl font-black">{Math.round(clamped)}</span>
    </div>
  );
}
