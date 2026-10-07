import { describe, expect, it } from 'vitest';
import { torsoNeeded } from '../../engine/index.ts';
import { engine } from '../../engine/test-utils.ts';
import { makePoseFrame, standingFrame, type FakePoseOptions } from '../pose/testing.ts';
import { SessionController, calibrateFromStills, summarizeNotes, trackFromStill, MAX_TIME_GAP_S } from './controller.ts';
import type { CompletedRep, FrameResult } from './types.ts';

const BODY = { femurTorso: 1.0, shankFemur: 0.95 }; // a long-femur build
const ASPECT = 4 / 3;
const DT = 1 / 30;

/** A full squat (down and back up) as pose frames. `tauOffset` adds torso lean beyond this body's balanced target. */
function squat(body = BODY, o: { alphaMax?: number; minPhi?: number; tauOffset?: number; extra?: Partial<FakePoseOptions> } = {}) {
  const { alphaMax = 38, minPhi = -8, tauOffset = 0, extra = {} } = o;
  const N = 40;
  const frames = [];
  for (let k = 0; k <= 2 * N; k++) {
    const u = k <= N ? k / N : (2 * N - k) / N;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const alpha = alphaMax * e;
    const phi = 88 + (minPhi - 88) * e;
    const need = torsoNeeded({ ...body }, alpha, phi, engine.config.footOffset);
    frames.push(makePoseFrame({ ...body, alpha, phi, tau: 3 + (need + tauOffset - 3) * e, ...extra }));
  }
  for (let k = 0; k < 12; k++) frames.push(standingFrame(body, extra));
  return frames;
}

function calibrated(extra: Partial<FakePoseOptions> = {}) {
  const c = new SessionController(engine);
  const cal = calibrateFromStills(Array.from({ length: 6 }, () => ({ frame: standingFrame(BODY, extra), aspect: ASPECT })));
  c.setProfile(cal.result!);
  return c;
}

function run(c: SessionController, frames: ReturnType<typeof squat>, t0 = 0): { results: FrameResult[]; reps: CompletedRep[]; t: number } {
  const results: FrameResult[] = [];
  let t = t0;
  for (const f of frames) {
    t += DT;
    results.push(c.process(f, t, ASPECT));
  }
  return { results, reps: results.flatMap((r) => (r.rep ? [r.rep] : [])), t };
}

describe('calibrateFromStills (photos / clip frames)', () => {
  for (const [name, extra] of [
    ['y-down, facing right', {}],
    ['y-up, facing left', { yDown: false, facing: -1 as const }],
    ['camera yawed 30°', { yawDeg: 30 }],
  ] as const) {
    it(`recovers body ratios: ${name}`, () => {
      const cal = calibrateFromStills([
        { frame: standingFrame(BODY, extra), aspect: ASPECT },
        { frame: standingFrame(BODY, extra), aspect: ASPECT },
      ]);
      expect(cal.result).not.toBeNull();
      const p = cal.result!.profile;
      expect(Math.abs(p.femurTorso - 1.0)).toBeLessThan(0.01);
      expect(Math.abs(p.shankFemur - 0.95)).toBeLessThan(0.01);
      expect(p.upSign).toBe(extra && 'yDown' in extra && extra.yDown === false ? 1 : -1);
      expect(cal.bestIndex).toBe(0);
    });
  }

  it('ignores missing detections and non-standing frames, and reports what it saw', () => {
    const deepSquat = makePoseFrame({ ...BODY, alpha: 38, phi: -8, tau: 40 });
    const cal = calibrateFromStills([
      { frame: null, aspect: ASPECT },
      { frame: deepSquat, aspect: ASPECT },
    ]);
    expect(cal.result).toBeNull();
    expect(cal.seen).toBe(1);
    expect(cal.notes[0]).toBe('no person detected');
    expect(cal.notes[1]).toContain('knee angle');
  });

  it('explains every rejected frame so the user can fix the photo', () => {
    const cal = calibrateFromStills([
      { frame: null, aspect: ASPECT },
      { frame: standingFrame(BODY, { visibility: 0.2, farVisibility: 0.1 }), aspect: ASPECT },
      { frame: makePoseFrame({ ...BODY, alpha: 38, phi: -8, tau: 40 }), aspect: ASPECT },
      { frame: standingFrame(BODY), aspect: ASPECT },
    ]);
    expect(cal.notes).toHaveLength(4);
    expect(cal.notes[1]).toContain('not clearly visible');
    expect(cal.notes[3]).toBe('ok');
    expect(cal.result).not.toBeNull();
    expect(summarizeNotes(cal.notes)).toContain('no person detected');
    expect(summarizeNotes(['ok', 'ok'])).toBe('');
  });

  it('treats a barely visible person as not seen', () => {
    const cal = calibrateFromStills([{ frame: standingFrame(BODY, { visibility: 0.2, farVisibility: 0.1 }), aspect: ASPECT }]);
    expect(cal.seen).toBe(0);
    expect(cal.result).toBeNull();
  });
});

describe('SessionController status flow', () => {
  it('reports no person, then need_profile before calibration', () => {
    const c = new SessionController(engine);
    expect(c.process(null, 0, ASPECT).status).toBe('no_person');
    expect(c.process(standingFrame(BODY), DT, ASPECT).status).toBe('need_profile');
  });

  it('reports low visibility when the tracked joints are hidden', () => {
    const c = calibrated();
    const r = c.process(standingFrame(BODY, { visibility: 0.2, farVisibility: 0.2 }), DT, ASPECT);
    expect(r.status).toBe('low_visibility');
    expect(r.track).toBeDefined();
  });

  it('falls back to the better-visible side when the locked side is hidden', () => {
    const c = calibrated(); // locks the left side
    expect(c.trackedSide).toBe('left');
    // left joints hidden, right joints visible
    const frame = makePoseFrame({ ...BODY, alpha: 0, phi: 88, tau: 3, visibility: 0.1, farVisibility: 0.99 });
    expect(c.process(frame, DT, ASPECT).track?.side).toBe('right');
  });
});

describe('streaming calibration (camera / video segment)', () => {
  it('warms up for 1 s, collects 3 s of standing frames, then installs the profile', () => {
    const c = new SessionController(engine);
    c.startCalibration('camera', 100);
    const outcomes: FrameResult[] = [];
    let first: FrameResult | null = null;
    for (let i = 0; i < 160; i++) {
      const r = c.process(standingFrame(BODY), 100 + i * DT, ASPECT);
      first ??= r;
      outcomes.push(r);
    }
    expect(first!.calibration?.phase).toBe('warmup');
    const done = outcomes.find((r) => r.calibrated);
    expect(done?.calibrated?.ok).toBe(true);
    expect(done?.calibrated && done.calibrated.ok && done.calibrated.source).toBe('live camera');
    expect(c.bodyProfile).not.toBeNull();
    expect(Math.abs(c.bodyProfile!.femurTorso - 1.0)).toBeLessThan(0.01);
    expect(c.isCalibrating).toBe(false);
  });

  it('video calibration has no warm-up', () => {
    const c = new SessionController(engine);
    c.startCalibration('video', 5);
    expect(c.process(standingFrame(BODY), 5 + DT, ASPECT).calibration?.phase).toBe('collecting');
  });

  it('fails clearly when the person never stands cleanly', () => {
    const c = new SessionController(engine);
    c.startCalibration('video', 0);
    let failed: FrameResult | undefined;
    for (let i = 0; i < 140 && !failed; i++) {
      const r = c.process(makePoseFrame({ ...BODY, alpha: 38, phi: -8, tau: 40 }), i * DT, ASPECT);
      if (r.calibrated) failed = r;
    }
    expect(failed?.calibrated?.ok).toBe(false);
    expect(failed?.calibrated && !failed.calibrated.ok && failed.calibrated.reason).toContain('Last problem: knee angle');
    expect(failed?.calibration?.rejected).toBeGreaterThan(50);
    expect(c.bodyProfile).toBeNull();
  });

  it('can be finished early (video ended) with whatever was collected', () => {
    const c = new SessionController(engine);
    c.startCalibration('video', 0);
    for (let i = 0; i < 40; i++) c.process(standingFrame(BODY), i * DT, ASPECT);
    const outcome = c.finishCalibrationNow();
    expect(outcome?.ok).toBe(true);
  });
});

describe('rep detection, scoring and feedback', () => {
  it('scores a balanced rep high and counts it with tempo', () => {
    const { reps } = run(calibrated(), squat());
    expect(reps).toHaveLength(1);
    const r = reps[0]!;
    expect(r.index).toBe(1);
    expect(r.score.score).toBeGreaterThan(70);
    expect(r.score.band).toBe('good');
    expect(r.coach.codes).toEqual([]);
    expect(r.event.downS).toBeGreaterThan(0.5);
    expect(r.event.upS).toBeGreaterThan(0.5);
  });

  it('flags forward lean relative to THIS body and scores it low', () => {
    const { reps } = run(calibrated(), squat(BODY, { tauOffset: 22 }));
    expect(reps[0]!.coach.codes).toContain('torso_forward');
    expect(reps[0]!.score.score).toBeLessThan(40);
  });

  it('flags missed depth on a shallow rep', () => {
    const { reps } = run(calibrated(), squat(BODY, { minPhi: 22 }));
    expect(reps[0]!.coach.codes).toContain('depth_short');
    expect(reps[0]!.score.band).not.toBe('good');
  });

  it('ignores a tiny dip', () => {
    expect(run(calibrated(), squat(BODY, { alphaMax: 10, minPhi: 60 })).reps).toHaveLength(0);
  });

  it('counts two reps in a row with increasing indices', () => {
    const c = calibrated();
    const a = run(c, squat());
    const b = run(c, squat(), a.t);
    expect(b.reps[0]!.index).toBe(2);
  });

  it('gives live feedback during the descent and never nags about depth then', () => {
    const c = calibrated();
    const { results } = run(c, squat(BODY, { tauOffset: 22 }));
    const live = results.filter((r) => r.status === 'tracking' && r.inRep);
    expect(live.length).toBeGreaterThan(10);
    expect(live.some((r) => r.coach!.codes.includes('torso_forward'))).toBe(true);
    expect(live.every((r) => !r.coach!.codes.includes('depth_short'))).toBe(true);
    expect(Math.max(...live.map((r) => r.depthPct!))).toBeGreaterThan(0.95);
  });

  it('abandons a rep in progress when the clock jumps (video scrub)', () => {
    const c = calibrated();
    const frames = squat();
    let t = 0;
    for (const f of frames.slice(0, 30)) c.process(f, (t += DT), ASPECT);
    expect(c.repInProgress).toBe(true);
    c.process(standingFrame(BODY), t + MAX_TIME_GAP_S + 5, ASPECT);
    expect(c.repInProgress).toBe(false);
  });

  it('gives a body with a different build a different verdict for the same pose', () => {
    // Same joint angles, two bodies: balanced for the long-femur person, too upright for a short-femur one.
    const longProfile = calibrated();
    const shortBody = { femurTorso: 0.7, shankFemur: 1.0 };
    const shortCtl = new SessionController(engine);
    shortCtl.setProfile(calibrateFromStills([{ frame: standingFrame(shortBody), aspect: ASPECT }]).result!);
    const longRep = run(longProfile, squat(BODY)).reps[0]!;
    const shortRep = run(shortCtl, squat(BODY)).reps[0]!; // short-femur body performing the LONG-femur movement
    expect(longRep.coach.codes).toEqual([]);
    expect(shortRep.coach.codes).not.toEqual([]);
  });
});

describe('trackFromStill', () => {
  it('describes a photo without smoothing', () => {
    const t = trackFromStill(standingFrame(BODY));
    expect(t.features.knee).toBeGreaterThan(150);
    expect(t.facing).toBe(1);
  });
});
