import { planarPoints, shankTorso, type BodyProfile, type Point2 } from '@/engine/index.ts';

const P = (p: Point2): string => `${p[0]},${-p[1]}`;

export interface PoseSnapshotProps {
  profile: Pick<BodyProfile, 'femurTorso' | 'shankFemur'>;
  /** shin lean (deg) */
  alpha: number;
  /** thigh elevation (deg), 0 = parallel */
  phi: number;
  /** actual torso lean (deg) */
  tau: number;
  /** this body's balanced torso lean at this depth (deg) */
  target: number;
  /** is the torso within tolerance of the target? */
  ok: boolean;
  className?: string;
}

/** Side view of one pose: solid = what was done, dashed cyan = the balanced torso for THIS body at that depth. */
export function PoseSnapshot({ profile, alpha, phi, tau, target, ok, className = 'h-56 w-full' }: PoseSnapshotProps) {
  const st = shankTorso(profile);
  const actual = planarPoints(profile.femurTorso, st, alpha, phi, tau);
  const ghost = planarPoints(profile.femurTorso, st, alpha, phi, target);
  const joints: Point2[] = [actual.ankle, actual.knee, actual.hip, actual.shoulder];
  return (
    <svg
      viewBox="-1.6 -3.0 3.4 3.3"
      className={`rounded-2xl bg-white/60 ${className}`}
      role="img"
      aria-label={`Side view: torso ${tau.toFixed(0)} degrees, balanced target ${target.toFixed(0)} degrees, ${ok ? 'within' : 'outside'} your range`}
    >
      <line x1="-1.5" y1="0.05" x2="1.7" y2="0.05" stroke="rgba(0,0,0,.25)" strokeWidth="0.03" />
      <line
        x1={ghost.hip[0]} y1={-ghost.hip[1]} x2={ghost.shoulder[0]} y2={-ghost.shoulder[1]}
        stroke="#0369a1" strokeWidth="0.06" strokeDasharray="0.12 0.1" strokeLinecap="round"
      />
      <circle cx={ghost.shoulder[0]} cy={-ghost.shoulder[1]} r="0.07" fill="none" stroke="#0369a1" strokeWidth="0.03" />
      <polyline points={`${P(actual.ankle)} ${P(actual.knee)} ${P(actual.hip)}`} fill="none" stroke="#3f6212" strokeWidth="0.07" strokeLinecap="round" strokeLinejoin="round" />
      <line
        x1={actual.hip[0]} y1={-actual.hip[1]} x2={actual.shoulder[0]} y2={-actual.shoulder[1]}
        stroke={ok ? '#3f6212' : '#b91c1c'} strokeWidth="0.07" strokeLinecap="round"
      />
      {joints.map((j, i) => (
        <circle key={i} cx={j[0]} cy={-j[1]} r="0.07" fill="#0b0b0b" />
      ))}
    </svg>
  );
}
