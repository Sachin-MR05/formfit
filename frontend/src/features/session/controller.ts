/**
 * SessionController: turns a stream of pose frames into calibration, live feedback and completed reps.
 * Pure TypeScript (no DOM) so it can be tested with synthetic poses and reused by Review mode.
 */
import {
  CalibrationAccumulator,
  FeatureSmoother,
  RepTracker,
  clamp,
  coach,
  scoreRep,
  type BodyProfile,
  type CalibrationResult,
  type Engine,
  type UpSign,
} from '../../engine/index.ts';
import {
  SIDES,
  bestSide,
  facingSign,
  rawFeaturesFor,
  sideVisibility,
  thighLength2d,
  type PoseFrame,
  type Side,
} from '../pose/landmarks.ts';
import type { CalibrationOutcome, CalibrationProgress, CompletedRep, FrameResult, TrackInfo } from './types.ts';

/** Minimum visibility of the tracked joints before we trust a frame. */
export const MIN_VISIBILITY = 0.5;
/** A time jump larger than this (seek, tab sleep) abandons any rep in progress. */
export const MAX_TIME_GAP_S = 0.5;
const MIN_CALIB_SAMPLES = 15;

type CalibMode = 'camera' | 'video';
interface StreamingCalibration {
  mode: CalibMode;
  t0: number;
  acc: CalibrationAccumulator;
}

export class SessionController {
  private readonly smoother: FeatureSmoother;
  private readonly tracker: RepTracker;
  private profile: BodyProfile | null = null;
  private lockedSide: Side | null = null;
  private hipImageY0 = 0;
  private thigh2d = 0; // 0 = unknown (manual / average profile): hip_depth_ratio is then not shown
  private currentSide: Side | null = null;
  private facingEma = 1;
  private lastT: number | null = null;
  private calib: StreamingCalibration | null = null;
  private repCount = 0;

  constructor(private readonly engine: Engine) {
    this.smoother = new FeatureSmoother(engine.config.emaAlpha);
    this.tracker = new RepTracker(engine.config);
  }

  // ----------------------------------------------------------------------------- state
  get bodyProfile(): BodyProfile | null {
    return this.profile;
  }
  get isCalibrating(): boolean {
    return this.calib !== null;
  }
  get trackedSide(): Side | null {
    return this.lockedSide;
  }
  get calibrationMeta(): { hipImageY0: number; thigh2d: number } {
    return { hipImageY0: this.hipImageY0, thigh2d: this.thigh2d };
  }

  /** Install a profile (from photos, a finished streaming calibration, or storage). */
  setProfile(result: CalibrationResult): void {
    this.profile = result.profile;
    this.lockedSide = result.side;
    this.hipImageY0 = result.hipImageY0;
    this.thigh2d = result.thigh2d;
    this.calib = null;
    this.resetTracking();
  }

  clearProfile(): void {
    this.profile = null;
    this.lockedSide = null;
    this.calib = null;
    this.resetTracking();
  }

  /** Forget smoothing and any rep in progress (used on seek, source change). */
  resetTracking(): void {
    this.smoother.reset();
    this.tracker.reset();
    this.currentSide = null;
    this.lastT = null;
  }

  /** New set / new video: keep the profile, restart the rep counter. */
  resetSession(): void {
    this.repCount = 0;
    this.resetTracking();
  }

  // ----------------------------------------------------------------------------- streaming calibration
  startCalibration(mode: CalibMode, tSeconds: number): void {
    this.profile = null;
    this.lockedSide = null;
    this.resetTracking();
    this.calib = { mode, t0: tSeconds, acc: new CalibrationAccumulator() };
  }

  cancelCalibration(): void {
    this.calib = null;
  }

  /** Finish early with whatever was collected (e.g. the uploaded video ended). */
  finishCalibrationNow(): CalibrationOutcome | null {
    if (!this.calib) return null;
    return this.finishCalibration(this.calib);
  }

  private finishCalibration(c: StreamingCalibration): CalibrationOutcome {
    this.calib = null;
    const result = c.acc.finish(MIN_CALIB_SAMPLES);
    if (!result) {
      const why = c.acc.lastRejection ? ` Last problem: ${c.acc.lastRejection}.` : '';
      return {
        ok: false,
        reason: `Not enough clean standing frames (${c.acc.count} usable, ${c.acc.rejected} rejected).${why} Stand tall and side-on with your whole body in view, then try again.`,
      };
    }
    this.setProfile(result);
    return { ok: true, samples: result.samples, source: c.mode === 'camera' ? 'live camera' : 'a segment of the video' };
  }

  // ----------------------------------------------------------------------------- per-frame processing
  /**
   * @param frame   detected pose, or null if nobody was found
   * @param tSeconds clock for this frame (video time for uploads, wall clock for the camera)
   * @param aspect  image width / height
   */
  process(frame: PoseFrame | null, tSeconds: number, aspect: number): FrameResult {
    const cfg = this.engine.config;
    if (this.lastT !== null && Math.abs(tSeconds - this.lastT) > MAX_TIME_GAP_S) this.resetTracking();
    this.lastT = tSeconds;
    if (!frame) return { status: 'no_person' };

    const lm = frame.landmarks;
    let side: Side = this.lockedSide ?? bestSide(lm);
    if (this.lockedSide && sideVisibility(lm, side) < MIN_VISIBILITY) {
      const alt = bestSide(lm);
      if (sideVisibility(lm, alt) >= MIN_VISIBILITY) side = alt;
    }
    if (this.currentSide !== side) {
      this.smoother.reset();
      this.tracker.reset();
      this.currentSide = side;
    }

    const upSign: UpSign = this.profile?.upSign ?? -1;
    const raw = rawFeaturesFor(frame, side, upSign);
    const features = this.smoother.update(raw);
    this.facingEma = 0.1 * facingSign(lm, side) + 0.9 * this.facingEma;
    const facing: 1 | -1 = this.facingEma >= 0 ? 1 : -1;
    const visibility = sideVisibility(lm, side);
    const ids = SIDES[side];

    const track: TrackInfo = {
      side,
      landmarks: lm,
      features,
      visibility,
      facing,
      hipDepthRatio: this.profile && this.thigh2d > 0 ? (lm[ids.hip]!.y - this.hipImageY0) / this.thigh2d : null,
    };

    if (visibility < MIN_VISIBILITY) return { status: 'low_visibility', track };

    if (this.calib) {
      const c = this.calib;
      const warm = c.mode === 'camera' ? 1 : 0;
      const elapsed = tSeconds - c.t0;
      const total = warm + cfg.calibSeconds;
      if (elapsed < warm) {
        return { status: 'calibrating', track, calibration: { phase: 'warmup', remainingS: warm - elapsed, samples: 0, rejected: 0, lastRejection: null } };
      }
      if (elapsed < total) {
        const w = frame.world;
        c.acc.add(raw, {
          side,
          hipKneeDy: w[ids.hip]!.y - w[ids.knee]!.y,
          hipImageY: lm[ids.hip]!.y,
          thigh2d: thighLength2d(lm, side, aspect),
        });
        const progress: CalibrationProgress = {
          phase: 'collecting',
          remainingS: total - elapsed,
          samples: c.acc.count,
          rejected: c.acc.rejected,
          lastRejection: c.acc.lastRejection,
        };
        return { status: 'calibrating', track, calibration: progress };
      }
      const outcome = this.finishCalibration(c);
      return {
        status: 'calibrating',
        track,
        calibrated: outcome,
        calibration: { phase: 'collecting', remainingS: 0, samples: c.acc.count, rejected: c.acc.rejected, lastRejection: c.acc.lastRejection },
      };
    }

    const profile = this.profile;
    if (!profile) return { status: 'need_profile', track };

    const live = coach(cfg, features, profile, 'live');
    const inRep = features.knee < cfg.repStartKnee;
    const depthPct = clamp((90 - features.phi) / (90 - cfg.depthPhiOk), 0, 1);
    const event = this.tracker.update(tSeconds, features);

    let rep: CompletedRep | undefined;
    if (event) {
      this.repCount += 1;
      rep = {
        index: this.repCount,
        tSeconds,
        event,
        score: scoreRep(this.engine, event.bottom, profile),
        coach: coach(cfg, event.bottom, profile, 'rep'),
      };
    }
    return { status: 'tracking', track, coach: live, inRep, depthPct, rep };
  }

  /** Close out a rep that was still in progress when the source ended (e.g. the video stopped mid-ascent). */
  get repInProgress(): boolean {
    return this.tracker.inRep;
  }
}

// ----------------------------------------------------------------------------- photos / clips
export interface StillInput {
  frame: PoseFrame | null;
  /** width / height of the image the pose was detected in */
  aspect: number;
}

export interface StillCalibration {
  /** one human-readable line per input: 'ok' or the reason it could not be used */
  notes: string[];
  result: CalibrationResult | null;
  /** frames in which a person with a visible side was found */
  seen: number;
  /** index of the first accepted standing frame (for showing the detected skeleton) */
  bestIndex: number | null;
}

/** Body profile from standing photos or frames of a short clip (relaxed standing check, one good frame suffices). */
export function calibrateFromStills(inputs: readonly StillInput[]): StillCalibration {
  const acc = new CalibrationAccumulator();
  const notes: string[] = [];
  let seen = 0;
  let bestIndex: number | null = null;
  inputs.forEach((input, i) => {
    if (!input.frame) {
      notes.push('no person detected');
      return;
    }
    const lm = input.frame.landmarks;
    const side = bestSide(lm);
    const vis = sideVisibility(lm, side);
    if (vis < MIN_VISIBILITY) {
      notes.push(`body side not clearly visible (visibility ${vis.toFixed(2)}): make sure the whole body, feet included, is in the photo`);
      return;
    }
    seen += 1;
    const raw = rawFeaturesFor(input.frame, side, -1);
    const ids = SIDES[side];
    const w = input.frame.world;
    const accepted = acc.add(
      raw,
      {
        side,
        hipKneeDy: w[ids.hip]!.y - w[ids.knee]!.y,
        hipImageY: lm[ids.hip]!.y,
        thigh2d: thighLength2d(lm, side, input.aspect),
      },
      true,
    );
    if (accepted) {
      notes.push('ok');
      if (bestIndex === null) bestIndex = i;
    } else {
      notes.push(acc.lastRejection ?? 'not a standing pose');
    }
  });
  return { notes, result: acc.finish(1), seen, bestIndex };
}

/** Short explanation for the UI: the distinct reasons, at most three. */
export function summarizeNotes(notes: readonly string[]): string {
  const reasons = [...new Set(notes.filter((n) => n !== 'ok'))];
  return reasons.slice(0, 3).join('; ');
}

/** Describe a single still frame (no smoothing): used to draw the detected skeleton on a calibration photo. */
export function trackFromStill(frame: PoseFrame): TrackInfo {
  const lm = frame.landmarks;
  const side = bestSide(lm);
  const raw = rawFeaturesFor(frame, side, -1);
  return {
    side,
    landmarks: lm,
    features: { knee: raw.knee, hip: raw.hip, torso: raw.torso, shank: raw.shank, phi: raw.phi },
    visibility: sideVisibility(lm, side),
    facing: facingSign(lm, side),
    hipDepthRatio: null,
  };
}
