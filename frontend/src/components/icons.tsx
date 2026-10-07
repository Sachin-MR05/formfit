import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const SpeakerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const BarsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 20v-6M12 20V8M18 20V4" />
  </Svg>
);
export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5l11 7-11 7V5Z" fill="currentColor" />
  </Svg>
);
export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5v14M16 5v14" strokeWidth="3.5" />
  </Svg>
);
export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </Svg>
);
export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </Svg>
);
export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);
export const ArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v16M6 14l6 6 6-6" />
  </Svg>
);
export const ArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20V4M6 10l6-6 6 6" />
  </Svg>
);

export type ExerciseKind = 'squat' | 'lunge' | 'pushup' | 'deadlift';

/** Simple stick-figure glyphs for the exercise sidebar. */
export function ExerciseIcon({ kind, size = 34 }: { kind: ExerciseKind; size?: number }) {
  const paths: Record<ExerciseKind, ReactNode> = {
    squat: <path d="M8 4l5 6-3 5 5 0M13 10l6 1M10 15l-3 5" />,
    lunge: <path d="M12 4v8l-5 3-1 5M12 12l6 2 1 6" />,
    pushup: <path d="M3 17l5-4 8-1 5 5M8 13l-1 4" />,
    deadlift: <path d="M12 4l-2 7 5 3-2 6M10 11l-5 5M15 14l4 3" />,
  };
  return (
    <Svg size={size}>
      <circle cx={kind === 'pushup' ? 5 : 12} cy={kind === 'pushup' ? 11 : 3.2} r="1.8" fill="currentColor" stroke="none" />
      {paths[kind]}
    </Svg>
  );
}
