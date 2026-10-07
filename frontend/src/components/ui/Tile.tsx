import type { CSSProperties, ReactNode } from 'react';

export type Tone = 'good' | 'borderline' | 'fix' | 'target' | 'body' | 'sand' | 'white' | 'dark';
export type Corner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

// Full literal class names so Tailwind can see them at build time.
const TONE_BG: Record<Tone, string> = {
  good: 'bg-good',
  borderline: 'bg-borderline',
  fix: 'bg-fix',
  target: 'bg-target',
  body: 'bg-body',
  sand: 'bg-sand',
  white: 'bg-white',
  dark: 'bg-ink',
};

const CORNER_ORIGIN: Record<Corner, string> = {
  'top-right': '100% 0',
  'top-left': '0 0',
  'bottom-right': '100% 100%',
  'bottom-left': '0 100%',
};

const CORNER_POSITION: Record<Corner, string> = {
  'top-right': 'top-2 right-2',
  'top-left': 'top-2 left-2',
  'bottom-right': 'bottom-2 right-2',
  'bottom-left': 'bottom-2 left-2',
};

export interface TileNotch {
  corner: Corner;
  /** Usually a <NotchButton/> or a counter. Sits inside the cut-out. */
  content: ReactNode;
  /** Radius of the circular bite in px (default 60). */
  size?: number;
}

export interface TileProps {
  tone?: Tone;
  notch?: TileNotch;
  className?: string;
  children?: ReactNode;
}

/**
 * Bento tile with large rounded corners and an optional circular "notch" cut-out.
 * The coloured background is a separate masked layer so the notch content (which sits
 * in the bite) is never clipped by the mask.
 */
export function Tile({ tone = 'white', notch, className = '', children }: TileProps) {
  let maskStyle: CSSProperties | undefined;
  if (notch) {
    const r = notch.size ?? 60;
    const mask = `radial-gradient(circle at ${CORNER_ORIGIN[notch.corner]}, transparent ${r}px, #000 ${r + 0.5}px)`;
    maskStyle = { maskImage: mask, WebkitMaskImage: mask };
  }
  const textColor = tone === 'dark' ? 'text-white' : 'text-ink';

  return (
    <div className={`relative rounded-tile ${textColor} ${className}`}>
      <div
        aria-hidden="true"
        className={`absolute inset-0 rounded-tile ${TONE_BG[tone]}`}
        style={maskStyle}
      />
      <div className="relative h-full p-5">{children}</div>
      {notch && <div className={`absolute ${CORNER_POSITION[notch.corner]}`}>{notch.content}</div>}
    </div>
  );
}
