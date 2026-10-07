import { describe, expect, it } from 'vitest';
import { engine } from '../../engine/test-utils.ts';
import { makePoseFrame, standingFrame } from '../pose/testing.ts';
import { MemoryRepository } from './repository.ts';
import { BODY, file, personalize, setup, squatFrames } from './test-harness.ts';

describe('CoachRuntime: personalize from photos, then analyse an uploaded video', () => {
  it('runs the whole flow and saves locally', async () => {
    const { rt, video, repo, feed, stills } = setup();
    const s = () => rt.store.getState();

    // Step 1: two standing photos
    stills.push(standingFrame(BODY), standingFrame(BODY));
    await rt.calibrateFromFiles([file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')]);
    expect(s().calibration.status).toBe('ok');
    expect(Math.abs(s().profile!.profile.femurTorso - 1.0)).toBeLessThan(0.01);
    expect(s().profile!.torsoRange[1]).toBeGreaterThan(s().profile!.torsoRange[0]);
    await rt.flush();
    expect((await repo.loadProfile())?.profile.femurTorso).toBeGreaterThan(0.99);

    // Step 2: upload a squat video
    await rt.loadVideo(file('old_set.mp4'));
    expect(s().source).toBe('file');
    expect(s().fileName).toBe('old_set.mp4');
    for (const f of [...squatFrames(0), ...squatFrames(22)]) feed(f);

    expect(s().reps).toHaveLength(2);
    expect(s().reps[0]!.band).toBe('good');
    expect(s().reps[1]!.codes).toContain('torso_forward');
    expect(s().reps[1]!.score).toBeLessThan(s().reps[0]!.score);
    expect(s().lastRep!.index).toBe(2);
    expect(s().live?.features).not.toBeNull();
    expect(s().reps[0]!.downS).toBeGreaterThan(0.3);

    // coach labels a rep
    rt.labelRep(s().reps[1]!.id, 'faulty');
    expect(s().reps[1]!.label).toBe('faulty');

    // video ends: set saved and summarised
    video.ended = true;
    video.onended?.();
    await rt.flush();
    expect(s().lastSet?.count).toBe(2);
    expect(s().reps).toHaveLength(0);
    expect(s().banner.text).toContain('Video finished: 2 reps');

    const sessions = await repo.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.source).toBe('upload');
    expect(sessions[0]!.fileName).toBe('old_set.mp4');
    expect(sessions[0]!.endedAt).not.toBeNull();
    expect(sessions[0]!.modelVersion).toBe(engine.modelVersion);
    const saved = await repo.listReps(sessions[0]!.id);
    expect(saved.map((r) => r.index)).toEqual([1, 2]);
    expect(saved[1]!.label).toBe('faulty');
    expect(saved[0]!.modelVersion).toBe(engine.modelVersion);
  });

  it('tells the user when no one is personalized yet and when the person leaves the frame', async () => {
    const { rt, feed } = setup();
    await rt.loadVideo(file('x.mp4'));
    feed(standingFrame(BODY));
    expect(rt.store.getState().live?.status).toBe('need_profile');
    expect(rt.store.getState().banner.text).toContain('Not personalized');
    feed(null);
    expect(rt.store.getState().banner.text).toContain('No person detected');
  });

  it('can calibrate from the first seconds of the uploaded video', async () => {
    const { rt, feed } = setup();
    await rt.loadVideo(file('x.mp4'));
    rt.startVideoCalibration();
    expect(rt.store.getState().calibration.status).toBe('running');
    for (let i = 0; i < 140; i++) feed(standingFrame(BODY));
    expect(rt.store.getState().calibration.status).toBe('ok');
    expect(rt.store.getState().profile?.source).toBe('a segment of the video');
    for (const f of squatFrames(0)) feed(f);
    expect(rt.store.getState().reps).toHaveLength(1);
  });

  it('finishes an unfinished calibration when the video ends', async () => {
    const { rt, video, feed } = setup();
    await rt.loadVideo(file('x.mp4'));
    rt.startVideoCalibration();
    for (let i = 0; i < 40; i++) feed(standingFrame(BODY));
    video.ended = true;
    video.onended?.();
    expect(rt.store.getState().calibration.status).toBe('ok');
  });

  it('reports a clear error when the photos contain no usable person', async () => {
    const { rt } = setup();
    await rt.calibrateFromFiles([file('empty.jpg', 'image/jpeg')]);
    expect(rt.store.getState().calibration.status).toBe('failed');
    expect(rt.store.getState().banner.tone).toBe('err');
  });
});

describe('CoachRuntime: live camera', () => {
  it('calibrates from the camera, scores a rep, pauses, and stops cleanly', async () => {
    const { rt, feed, stopped } = setup();
    const s = () => rt.store.getState();
    await rt.startCamera();
    expect(s().source).toBe('camera');
    feed(standingFrame(BODY));
    expect(s().live?.status).toBe('need_profile');

    rt.startCameraCalibration();
    for (let i = 0; i < 160; i++) feed(standingFrame(BODY));
    expect(s().calibration.status).toBe('ok');

    for (const f of squatFrames(0)) feed(f);
    expect(s().reps).toHaveLength(1);

    rt.togglePause();
    expect(s().paused).toBe(true);
    const before = s().live;
    feed(makePoseFrame({ ...BODY, alpha: 30, phi: 10, tau: 20 }));
    expect(s().live).toBe(before); // nothing processed while paused
    rt.togglePause();
    expect(s().paused).toBe(false);

    rt.stop();
    expect(s().source).toBe('none');
    expect(stopped()).toBe(1);
    await rt.flush();
  });

  it('keeps coaching when saving fails and reports it', async () => {
    const repo = new MemoryRepository();
    repo.addRep = async () => { throw new Error('disk full'); };
    const { rt, feed, stills } = setup(repo);
    stills.push(standingFrame(BODY));
    await rt.calibrateFromFiles([file('a.jpg', 'image/jpeg')]);
    await rt.startCamera();
    for (const f of squatFrames(0)) feed(f);
    await rt.flush();
    expect(rt.store.getState().reps).toHaveLength(1);
    expect(rt.store.getState().saveError).toContain('disk full');
  });
});

describe('CoachRuntime: saved profile and sets', () => {
  it('restores the saved profile on start so the user does not recalibrate', async () => {
    const repo = new MemoryRepository();
    const a = setup(repo);
    a.stills.push(standingFrame(BODY));
    await a.rt.calibrateFromFiles([file('a.jpg', 'image/jpeg')]);
    await a.rt.flush();

    const b = setup(repo);
    expect(b.rt.store.getState().profile).toBeNull();
    await b.rt.init();
    expect(b.rt.store.getState().calibration.status).toBe('ok');
    expect(b.rt.store.getState().calibration.message).toContain('saved profile');
    await b.rt.loadVideo(file('x.mp4'));
    for (const f of squatFrames(0)) b.feed(f);
    expect(b.rt.store.getState().reps).toHaveLength(1);
  });

  it('finishSet saves a summary and starts a new set; clearProfile forgets the body', async () => {
    const { rt, feed, stills, repo } = setup();
    stills.push(standingFrame(BODY));
    await rt.calibrateFromFiles([file('a.jpg', 'image/jpeg')]);
    await rt.startCamera();
    for (const f of squatFrames(0)) feed(f);
    const summary = rt.finishSet();
    expect(summary?.count).toBe(1);
    expect(rt.store.getState().lastSet?.count).toBe(1);
    for (const f of squatFrames(0)) feed(f);
    expect(rt.store.getState().reps[0]!.index).toBe(1); // numbering restarts for the new set
    await rt.flush();
    expect(await repo.listSessions()).toHaveLength(2);

    rt.clearProfile();
    await rt.flush();
    expect(rt.store.getState().profile).toBeNull();
    expect(await repo.loadProfile()).toBeNull();
  });

  it('clamps the target set size', () => {
    const { rt } = setup();
    rt.setSetSize(500);
    expect(rt.store.getState().setSize).toBe(50);
    rt.setSetSize(0);
    expect(rt.store.getState().setSize).toBe(1);
  });
});

describe('CoachRuntime: ghost target torso and fallbacks (the "I cannot see it" fixes)', () => {
  const dashed = (calls: Array<[string, unknown[]]>) => calls.filter(([m, a]) => m === 'setLineDash' && (a[0] as number[]).length > 0);

  it('draws the dashed target torso as soon as you are personalized, even while standing', async () => {
    const h = setup();
    await personalize(h);
    await h.rt.startCamera();
    h.calls.length = 0;
    h.feed(standingFrame(BODY));
    expect(h.rt.store.getState().live?.status).toBe('tracking');
    expect(dashed(h.calls).length).toBeGreaterThan(0);
    expect(h.calls.some(([m, a]) => m === 'fillText' && String(a[0]).startsWith('Target '))).toBe(true);
  });

  it('draws it on the calibration photo too', async () => {
    const h = setup();
    h.calls.length = 0;
    await personalize(h);
    // the photo canvas is the runtime canvas: it must have received the dashed ghost
    expect(dashed(h.calls).length).toBeGreaterThan(0);
  });

  it('draws no ghost before personalization (it would be meaningless)', async () => {
    const h = setup();
    await h.rt.startCamera();
    h.calls.length = 0;
    h.feed(standingFrame(BODY));
    expect(dashed(h.calls)).toHaveLength(0);
  });

  it('"Your build" is filled with ratios and personal ranges once personalized', async () => {
    const h = setup();
    await personalize(h);
    const p = h.rt.store.getState().profile!;
    expect(p.kind).toBe('measured');
    expect(Math.abs(p.profile.femurTorso - 1.0)).toBeLessThan(0.01);
    expect(p.torsoRange[0]).toBeLessThan(p.torsoRange[1]);
    expect(p.kneeRange[0]).toBeLessThan(p.kneeRange[1]);
  });

  it('can use an average build, clearly labelled, never saved', async () => {
    const h = setup();
    h.rt.useAverageBuild();
    const s = h.rt.store.getState();
    expect(s.profile?.kind).toBe('average');
    expect(s.calibration.status).toBe('ok');
    expect(s.calibration.message).toContain('AVERAGE');
    await h.rt.flush();
    expect(await h.repo.loadProfile()).toBeNull();
    // and the whole pipeline works with it
    await h.rt.startCamera();
    for (const f of squatFrames(0)) h.feed(f);
    expect(h.rt.store.getState().reps).toHaveLength(1);
    expect(h.rt.store.getState().live?.hipDepthRatio).toBeNull();
  });

  it('accepts typed-in ratios, rejects implausible ones, and saves the valid ones', async () => {
    const h = setup();
    expect(h.rt.setManualProfile(3, 1)).toContain('Femur / torso');
    expect(h.rt.setManualProfile(0.9, 5)).toContain('Shank / femur');
    expect(h.rt.store.getState().profile).toBeNull();
    expect(h.rt.setManualProfile(0.95, 1.02)).toBeNull();
    expect(h.rt.store.getState().profile?.kind).toBe('manual');
    expect(h.rt.store.getState().profile?.profile.legTorso).toBeGreaterThan(1.8);
    await h.rt.flush();
    expect((await h.repo.loadProfile())?.kind).toBe('manual');
  });

  it('tells you exactly why a photo could not be used', async () => {
    const h = setup();
    h.stills.push(makePoseFrame({ ...BODY, alpha: 38, phi: -8, tau: 40 })); // a squat, not a standing photo
    await h.rt.calibrateFromFiles([file('squat.jpg', 'image/jpeg')]);
    const c = h.rt.store.getState().calibration;
    expect(c.status).toBe('failed');
    expect(c.message).toContain('knee angle');
    expect(c.details?.[0]).toContain('Frame 1:');
    expect(h.rt.store.getState().profile).toBeNull();
  });

  it('streaming calibration reports why frames were rejected', async () => {
    const h = setup();
    await h.rt.startCamera();
    h.rt.startCameraCalibration();
    let progress = h.rt.store.getState().calibration.progress;
    for (let i = 0; i < 160; i++) {
      h.feed(makePoseFrame({ ...BODY, alpha: 38, phi: -8, tau: 40 }));
      progress = h.rt.store.getState().calibration.progress ?? progress;
    }
    expect(h.rt.store.getState().calibration.status).toBe('failed');
    expect(h.rt.store.getState().calibration.message).toContain('Last problem');
  });
});

describe('CoachRuntime: events and performance hint', () => {
  it('announces frames, reps, set end and profile readiness to listeners', async () => {
    const h = setup();
    const seen: string[] = [];
    const off = h.rt.subscribe((e) => void seen.push(e.type));
    await personalize(h);
    await h.rt.startCamera();
    for (const f of squatFrames(0)) h.feed(f);
    h.rt.finishSet();
    expect(seen).toContain('profile_ready');
    expect(seen).toContain('source_started');
    expect(seen).toContain('frame');
    expect(seen).toContain('rep');
    expect(seen).toContain('set_finished');
    off();
    const n = seen.length;
    h.rt.finishSet();
    expect(seen.length).toBe(n);
  });

  it('a throwing listener never breaks coaching', async () => {
    const h = setup();
    h.rt.subscribe(() => {
      throw new Error('boom');
    });
    await personalize(h);
    await h.rt.startCamera();
    for (const f of squatFrames(0)) h.feed(f);
    expect(h.rt.store.getState().reps).toHaveLength(1);
  });

  it('suggests the lite model when the camera runs slowly, and clears the hint when switched', async () => {
    const h = setup();
    await personalize(h);
    await h.rt.startCamera();
    for (let i = 0; i < 60; i++) h.feed(standingFrame(BODY), 120); // ~8 fps for ~7 s
    expect(h.rt.store.getState().perfHint).toContain('lite');
    await h.rt.setPoseVariant('lite');
    expect(h.rt.store.getState().perfHint).toBeNull();
    for (let i = 0; i < 60; i++) h.feed(standingFrame(BODY), 120);
    expect(h.rt.store.getState().perfHint).toBeNull(); // already on lite: nothing to suggest
  });

  it('does not nag about speed for uploaded videos', async () => {
    const h = setup();
    await personalize(h);
    await h.rt.loadVideo(file('slow.mp4'));
    for (let i = 0; i < 60; i++) h.feed(standingFrame(BODY), 120);
    expect(h.rt.store.getState().perfHint).toBeNull();
  });
});
