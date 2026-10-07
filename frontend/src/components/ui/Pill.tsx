import type { ReactNode } from 'react';

export type PillTone = 'neutral' | 'good' | 'borderline' | 'fix' | 'target' | 'body';

const TONE: Record<PillTone, string> = {
  neutral: 'bg-white/70 border-black/10',
  good: 'bg-good border-transparent',
  borderline: 'bg-borderline border-transparent',
  fix: 'bg-fix border-transparent',
  target: 'bg-target border-transparent',
  body: 'bg-body border-transparent',
};

export interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  /** Selected pills use the yellow accent, like the reference design. */
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Pill({ children, tone = 'neutral', selected = false, onClick, className = '' }: PillProps) {
  const base = `inline-flex items-center gap-1.5 rounded-pill border px-4 py-1.5 text-sm font-medium text-ink ${
    selected ? 'bg-borderline border-transparent' : TONE[tone]
  } ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`${base} transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}
      >
        {children}
      </button>
    );
  }
  return <span className={base}>{children}</span>;
}
