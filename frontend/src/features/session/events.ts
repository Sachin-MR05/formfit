import type { CoachResult } from '../../engine/index.ts';
import type { RepView, SetSummary, SourceKind } from './store.ts';
import type { ProfileKind } from './types.ts';

/** What the runtime announces to other features (voice coach, analytics). Listeners must be fast and must not throw. */
export type RuntimeEvent =
  /** every processed frame while tracking a personalized body */
  | { type: 'frame'; tSeconds: number; coach: CoachResult; inRep: boolean }
  | { type: 'rep'; rep: RepView }
  | { type: 'set_finished'; summary: SetSummary }
  /** `restored` = loaded from storage at start-up (should not be announced) */
  | { type: 'profile_ready'; kind: ProfileKind; restored: boolean }
  | { type: 'source_started'; source: SourceKind };

export type RuntimeListener = (event: RuntimeEvent) => void;
