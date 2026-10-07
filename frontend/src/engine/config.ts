/** Typed, validated view of generated/config.json (written by ml/scripts/export_for_frontend.py). */
export interface EngineConfig {
  footOffset: number;
  depthPhiOk: number;
  torsoTol: number;
  alphaRange: readonly [number, number];
  alphaMax: number;
  genericKneeMax: number;
  genericTorsoMax: number;
  repStartKnee: number;
  repEndKnee: number;
  minRepKnee: number;
  emaAlpha: number;
  calibSeconds: number;
  calibMaxFrames: number;
  calibClipMaxS: number;
  calibMaxPx: number;
  scoreGoodMin: number;
  scoreBorderlineMin: number;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`config.json: "${key}" must be a finite number`);
  }
  return v;
}

export function parseConfig(json: unknown): EngineConfig {
  if (typeof json !== 'object' || json === null) throw new Error('config.json is not an object');
  const o = json as Record<string, unknown>;
  const range = o['alpha_range'];
  if (!Array.isArray(range) || range.length !== 2 || range.some((x) => typeof x !== 'number')) {
    throw new Error('config.json: "alpha_range" must be [min, max]');
  }
  return {
    footOffset: num(o, 'foot_offset'),
    depthPhiOk: num(o, 'depth_phi_ok'),
    torsoTol: num(o, 'torso_tol'),
    alphaRange: [range[0] as number, range[1] as number],
    alphaMax: num(o, 'alpha_max'),
    genericKneeMax: num(o, 'generic_knee_max'),
    genericTorsoMax: num(o, 'generic_torso_max'),
    repStartKnee: num(o, 'rep_start_knee'),
    repEndKnee: num(o, 'rep_end_knee'),
    minRepKnee: num(o, 'min_rep_knee'),
    emaAlpha: num(o, 'ema_alpha'),
    calibSeconds: num(o, 'calib_seconds'),
    calibMaxFrames: num(o, 'calib_max_frames'),
    calibClipMaxS: num(o, 'calib_clip_max_s'),
    calibMaxPx: num(o, 'calib_max_px'),
    scoreGoodMin: num(o, 'score_good_min'),
    scoreBorderlineMin: num(o, 'score_borderline_min'),
  };
}
