import type { BodyProfile, CoachResult, Cue, CueCode, FrameFeatures, RepEvent, RepScore, RuleReason } from '../../engine/index.ts';
import type { NormLandmark, Side } from '../pose/landmarks.ts';

/** Everything the UI needs to draw/describe the tracked body for one frame. */
export interface TrackInfo {
  side: Side;
  landmarks: NormLandmark[];
  /** smoothed features */
  features: FrameFeatures;
  /** min visibility of the four tracked joints */
  visibility: number;
  /** +1 / -1: which way the person faces in the image */
  facing: 1 | -1;
  /** display-only: hip drop relative to standing, in thigh lengths (needs calibration) */
  hipDepthRatio: number | null;
}

export interface CalibrationProgress {
  phase: 'warmup' | 'collecting';
  /** seconds left in this phase */
  remainingS: number;
  samples: number;
  /** frames rejected so far (not a clean standing pose) */
  rejected: number;
  /** why the latest frame was rejected (null if none) */
  lastRejection: string | null;
}

export interface CompletedRep {
  /** 1-based index within the controller's lifetime */
  index: number;
  /** clock time (seconds) when the rep ended */
  tSeconds: number;
  event: RepEvent;
  score: RepScore;
  coach: CoachResult;
}

export type CalibrationOutcome =
  | { ok: true; samples: number; source: string }
  | { ok: false; reason: string };

export interface FrameResult {
  status: 'no_person' | 'low_visibility' | 'need_profile' | 'calibrating' | 'tracking';
  track?: TrackInfo;
  /** present while a streaming calibration is running */
  calibration?: CalibrationProgress;
  /** present on the frame where a streaming calibration finished */
  calibrated?: CalibrationOutcome;
  coach?: CoachResult;
  inRep?: boolean;
  /** 0..1 progress towards the depth target */
  depthPct?: number;
  /** present on the frame where a rep completed */
  rep?: CompletedRep;
}

// ----------------------------------------------------------------------------- persisted records
/** measured = from photos/clip/camera, manual = ratios typed in, average = generic build (not personalized) */
export type ProfileKind = 'measured' | 'manual' | 'average';

export interface StoredProfile {
  /** older saved records have no kind and are treated as 'measured' */
  kind?: ProfileKind;
  profile: BodyProfile;
  side: Side;
  hipImageY0: number;
  thigh2d: number;
  samples: number;
  /** human-readable origin, e.g. "2 photo(s)" or "live camera" */
  source: string;
  createdAt: number;
}

export interface StoredSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  source: 'live' | 'upload';
  fileName: string | null;
  poseModel: string;
  modelVersion: string;
  profile: BodyProfile;
}

export type RepLabel = 'good' | 'faulty' | null;

export interface StoredRep {
  id: string;
  sessionId: string;
  index: number;
  createdAt: number;
  /** seconds on the source clock (video time for uploads) */
  tSeconds: number;
  features: FrameFeatures;
  profile: BodyProfile;
  /** 0..100 personalized score shown to the user */
  score: number;
  personalized: number;
  generic: number;
  ruleOk: boolean;
  ruleReasons: RuleReason[];
  /** issue tags (cue codes) */
  codes: CueCode[];
  downS: number;
  upS: number;
  modelVersion: string;
  label: RepLabel;
}

export type { Cue };
