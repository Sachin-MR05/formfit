/** The API's JSON shapes (snake_case). See docs/api.md. */
export interface WireRatios {
  femur_torso: number;
  shank_femur: number;
  leg_torso: number;
}

export interface WireProfile extends WireRatios {
  id: string;
  kind: 'measured' | 'manual' | 'average';
  up_sign: -1 | 1;
  side: 'left' | 'right';
  samples: number;
  source: string;
  hip_image_y0: number;
  thigh2d: number;
  created_at: number;
  updated_at: number;
  server_updated_at?: number;
}

export interface WireSession {
  id: string;
  updated_at: number;
  server_updated_at?: number;
  /** a deletion carries only id, updated_at and deleted */
  deleted?: boolean;
  started_at?: number;
  ended_at?: number | null;
  source?: 'live' | 'upload';
  file_name?: string | null;
  pose_model?: 'lite' | 'full' | 'heavy';
  model_version?: string;
  profile?: WireRatios & { up_sign: -1 | 1 };
}

export interface WireRep {
  id: string;
  session_id: string;
  index: number;
  created_at: number;
  t_seconds: number;
  features: { knee: number; hip: number; torso: number; shank: number; phi: number };
  profile: WireRatios;
  score: number;
  personalized: number;
  generic: number;
  rule_ok: boolean;
  rule_reasons: Array<'knee_over' | 'torso_over' | 'depth_short'>;
  codes: Array<'torso_forward' | 'torso_upright' | 'knee_travel' | 'depth_short'>;
  down_s: number;
  up_s: number;
  model_version: string;
  label: 'good' | 'faulty' | null;
  updated_at: number;
  server_updated_at?: number;
}

export interface PushPayload {
  profiles: WireProfile[];
  sessions: WireSession[];
  reps: WireRep[];
}

export interface PushOutcome {
  accepted: string[];
  stale: string[];
  rejected: Array<{ id: string; reason: string }>;
}

export interface PushResult {
  server_time: number;
  profiles: PushOutcome;
  sessions: PushOutcome;
  reps: PushOutcome;
}

export interface Cursors {
  profiles: string;
  sessions: string;
  reps: string;
}

export interface PullResult {
  server_time: number;
  profiles: WireProfile[];
  sessions: WireSession[];
  reps: WireRep[];
  cursors: Cursors;
  has_more: { profiles: boolean; sessions: boolean; reps: boolean };
}

/** What the sync engine needs from the server (the real ApiClient, or a test double). */
export interface SyncApi {
  /** false when no API address is configured: the app then runs fully offline */
  readonly enabled: boolean;
  push(payload: PushPayload): Promise<PushResult>;
  pull(cursors: Partial<Cursors>, limit?: number): Promise<PullResult>;
}
