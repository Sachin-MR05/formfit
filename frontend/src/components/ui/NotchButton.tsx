import type { ReactNode } from 'react';

type NotchTone = 'white' | 'yellow' | 'ink';

const TONE: Record<NotchTone, string> = {
  white: 'bg-white text-ink',
  yellow: 'bg-borderline text-ink',
  ink: 'bg-ink text-white',
};

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface NotchButtonProps {
  /** Accessible name (required: the button is icon-only). */
  label: string;
  onClick?: () => void;
  tone?: NotchTone;
  children?: ReactNode;
}

export function NotchButton({ label, onClick, tone = 'white', children }: NotchButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid h-11 w-11 place-items-center rounded-full shadow-sm transition-transform duration-200 hover:rotate-12 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${TONE[tone]}`}
    >
      {children ?? <ArrowIcon />}
    </button>
  );
}
