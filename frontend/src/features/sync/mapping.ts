/** Local records (camelCase) <-> API records (snake_case). */
import type { StoredProfile, StoredRep, StoredSession } from '../session/types.ts';
import type { WireProfile, WireRep, WireSession } from './types.ts';

const TS_MIN = 1_577_836_800_000;

/** Ensure wire timestamps are integer epoch milliseconds (healing relative performance.now() floats if any). */
function toWireTs(ts: number | null | undefined): number {
  if (ts == null || !Number.isFinite(ts)) return Date.now();
  if (!Number.isInteger(ts)) {
    const rounded = Math.round(ts);
    return rounded >= TS_MIN ? rounded : Date.now();
  }
  return ts;
}

export function profileToWire(p: StoredProfile): WireProfile {
  return {
    id: p.id,
    kind: p.kind ?? 'measured',
    femur_torso: p.profile.femurTorso,
    shank_femur: p.profile.shankFemur,
    leg_torso: p.profile.legTorso,
    up_sign: p.profile.upSign,
    side: p.side,
    samples: p.samples,
    source: p.source,
    hip_image_y0: p.hipImageY0,
    thigh2d: p.thigh2d,
    created_at: toWireTs(p.createdAt),
    updated_at: toWireTs(p.updatedAt),
  };
}

export function profileFromWire(w: WireProfile): StoredProfile {
  return {
    id: w.id,
    kind: w.kind,
    profile: { femurTorso: w.femur_torso, shankFemur: w.shank_femur, legTorso: w.leg_torso, upSign: w.up_sign },
    side: w.side,
    hipImageY0: w.hip_image_y0,
    thigh2d: w.thigh2d,
    samples: w.samples,
    source: w.source,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    syncedVersion: w.updated_at,
  };
}

export function sessionToWire(s: StoredSession): WireSession {
  if (s.deleted) return { id: s.id, updated_at: toWireTs(s.updatedAt), deleted: true };
  return {
    id: s.id,
    updated_at: toWireTs(s.updatedAt),
    started_at: toWireTs(s.startedAt),
    ended_at: s.endedAt == null ? null : toWireTs(s.endedAt),
    source: s.source,
    file_name: s.fileName,
    pose_model: s.poseModel as 'lite' | 'full' | 'heavy',
    model_version: s.modelVersion,
    profile: { femur_torso: s.profile.femurTorso, shank_femur: s.profile.shankFemur, leg_torso: s.profile.legTorso, up_sign: s.profile.upSign },
  };
}

/** A tombstone from the server becomes `{id, deleted: true, updatedAt}` (see RemoteBatch). */
export function sessionFromWire(w: WireSession): StoredSession | { id: string; deleted: true; updatedAt: number } {
  if (w.deleted) return { id: w.id, deleted: true, updatedAt: w.updated_at };
  if (!w.profile || w.started_at === undefined || !w.source || !w.pose_model || !w.model_version) {
    throw new Error(`incomplete session from the server: ${w.id}`);
  }
  return {
    id: w.id,
    startedAt: w.started_at,
    endedAt: w.ended_at ?? null,
    source: w.source,
    fileName: w.file_name ?? null,
    poseModel: w.pose_model,
    modelVersion: w.model_version,
    profile: { femurTorso: w.profile.femur_torso, shankFemur: w.profile.shank_femur, legTorso: w.profile.leg_torso, upSign: w.profile.up_sign },
    updatedAt: w.updated_at,
    syncedVersion: w.updated_at,
  };
}

export function repToWire(r: StoredRep): WireRep {
  return {
    id: r.id,
    session_id: r.sessionId,
    index: Math.round(r.index),
    created_at: toWireTs(r.createdAt),
    t_seconds: r.tSeconds,
    features: { knee: r.features.knee, hip: r.features.hip, torso: r.features.torso, shank: r.features.shank, phi: r.features.phi },
    profile: { femur_torso: r.profile.femurTorso, shank_femur: r.profile.shankFemur, leg_torso: r.profile.legTorso },
    score: Math.round(r.score),
    personalized: r.personalized,
    generic: r.generic,
    rule_ok: r.ruleOk,
    rule_reasons: r.ruleReasons,
    codes: r.codes,
    down_s: r.downS,
    up_s: r.upS,
    model_version: r.modelVersion,
    label: r.label,
    updated_at: toWireTs(r.updatedAt),
  };
}

/** The API stores a rep's three body ratios only; `upSign` is not needed for a finished rep. */
export function repFromWire(w: WireRep): StoredRep {
  return {
    id: w.id,
    sessionId: w.session_id,
    index: w.index,
    createdAt: w.created_at,
    tSeconds: w.t_seconds,
    features: w.features,
    profile: { femurTorso: w.profile.femur_torso, shankFemur: w.profile.shank_femur, legTorso: w.profile.leg_torso, upSign: -1 },
    score: w.score,
    personalized: w.personalized,
    generic: w.generic,
    ruleOk: w.rule_ok,
    ruleReasons: w.rule_reasons,
    codes: w.codes,
    downS: w.down_s,
    upS: w.up_s,
    modelVersion: w.model_version,
    label: w.label,
    updatedAt: w.updated_at,
    syncedVersion: w.updated_at,
  };
}
