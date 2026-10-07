/** Vanilla Zustand store shared by the runtime (writer) and React components (readers). */
import { createStore } from 'zustand/vanilla';
import type { CoachResult, Cue, CueCode, FrameFeatures, BodyProfile, RuleReason, ScoreBand } from '../../engine/index.ts';
import type { PoseVariant } from '../pose/assets.ts';
import type { Side } from '../pose/landmarks.ts';
import type { CalibrationProgress, ProfileKind, RepLabel } from './types.ts';

export type SourceKind = 'none' | 'camera' | 'file';
export type Tone = 'info' | 'ok' | 'warn' | 'err';

export interface RepView {
  id: string;
  index: number;
  tSeconds: number;
  score: number;
  band: ScoreBand;
  personalized: number;
  generic: number;
  ruleOk: boolean;
  ruleReasons: RuleReason[];
  codes: CueCode[];
  cues: Cue[];
  downS: number;
  upS: number;
  features: FrameFeatures;
  label: RepLabel;
}

export interface ProfileView {
  kind: ProfileKind;
  profile: BodyProfile;
  side: Side;
  source: string;
  samples: number;
  createdAt: number;
  /** balanced torso lean at parallel depth across typical ankle mobility */
  torsoRange: [number, number];
  /** knee angle at parallel across typical ankle mobility */
  kneeRange: [number, number];
}

export interface LiveView {
  status: 'no_person' | 'low_visibility' | 'need_profile' | 'calibrating' | 'tracking';
  features: FrameFeatures | null;
  coach: CoachResult | null;
  inRep: boolean;
  depthPct: number;
  hipDepthRatio: number | null;
  /** normalised x,y of the tracked joints (for the feature panel) */
  joints: { shoulder: [number, number]; hip: [number, number]; knee: [number, number]; ankle: [number, number] } | null;
}

export interface SetSummary {
  count: number;
  average: number;
  good: number;
}

export interface CoachState {
  source: SourceKind;
  fileName: string | null;
  modelLoading: boolean;
  paused: boolean;
  poseVariant: PoseVariant;
  fps: number;
  banner: { text: string; tone: Tone };
  calibration: {
    status: 'none' | 'running' | 'ok' | 'failed';
    message: string;
    progress: CalibrationProgress | null;
    /** one line per analysed frame/photo explaining what was accepted or why not */
    details?: string[];
  };
  profile: ProfileView | null;
  live: LiveView | null;
  reps: RepView[];
  lastRep: RepView | null;
  setSize: number;
  lastSet: SetSummary | null;
  video: { currentTime: number; duration: number; rate: number; ended: boolean } | null;
  /** pixel size of the current video / photo, so the overlay canvas can match its aspect ratio */
  mediaSize: { w: number; h: number } | null;
  /** shown when the device is too slow for the selected pose model */
  perfHint: string | null;
  saveError: string | null;
}

export const initialCoachState: CoachState = {
  source: 'none',
  fileName: null,
  modelLoading: false,
  paused: false,
  poseVariant: 'full',
  fps: 0,
  banner: { text: 'Step 1: personalize with a standing side-view photo. Step 2: start the camera or upload a squat video.', tone: 'info' },
  calibration: { status: 'none', message: 'Not personalized yet. Upload a standing side-on photo to begin.', progress: null },
  profile: null,
  live: null,
  reps: [],
  lastRep: null,
  setSize: 12,
  lastSet: null,
  video: null,
  mediaSize: null,
  perfHint: null,
  saveError: null,
};

export const createCoachStore = () => createStore<CoachState>()(() => ({ ...initialCoachState }));
export type CoachStore = ReturnType<typeof createCoachStore>;
