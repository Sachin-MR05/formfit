import { describe, expect, it } from 'vitest';
import { makePoseFrame } from '../pose/testing.ts';
import { BODY, personalize, setup, squatFrames } from '../session/test-harness.ts';
import type { SpeechOutput } from './speech.ts';
import type { Utterance, VoiceInfo } from './types.ts';
import { VoiceCoach } from './voiceCoach.ts';
import { createVoiceStore } from './voiceStore.ts';

class FakeSpeech implements SpeechOutput {
  readonly supported: boolean;
  spoken: Array<{ text: string; kind: string; volume: number }> = [];
  vibrations: number[] = [];
  unlocked = 0;
  cancelled = 0;
  constructor(supported = true) { this.supported = supported; }
  speak(u: Utterance, s: { volume: number }) { this.spoken.push({ text: u.text, kind: u.kind, volume: s.volume }); }
  cancel() { this.cancelled++; }
  vibrate(ms: number) { this.vibrations.push(ms); }
  listVoices(): VoiceInfo[] { return []; }
  onVoicesChanged() { return () => {}; }
  unlock() { this.unlocked++; }
}

function rig(opts: { supported?: boolean; settings?: Parameters<ReturnType<typeof createVoiceStore>['update']>[0] } = {}) {
  const h = setup();
  const speech = new FakeSpeech(opts.supported ?? true);
  const v = createVoiceStore(null, speech.supported);
  const timers: Array<() => void> = [];
  const coach = new VoiceCoach({ speech, store: v.store, update: v.update, schedule: (fn) => void timers.push(fn) });
  coach.connect(h.rt);
  if (opts.settings) v.update(opts.settings);
  return { ...h, speech, voice: v.store, update: v.update, coach, fireTimers: () => timers.splice(0).forEach((f) => f()) };
}

async function readyCamera(r: ReturnType<typeof rig>) {
  await personalize(r);
  await r.rt.startCamera();
  r.speech.spoken.length = 0; // ignore the "calibrated" announcement
}

describe('voice coaching, end to end through the runtime', () => {
  it('says nothing aloud while the voice is off, but still shows captions (silent mode)', async () => {
    const r = rig();
    await readyCamera(r);
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.speech.spoken).toHaveLength(0);
    expect(r.voice.getState().caption?.text).toMatch(/^One\./);
  });

  it('speaks the count and ONE correction after a rep with forward lean', async () => {
    const r = rig({ settings: { enabled: true } });
    await readyCamera(r);
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.speech.spoken).toHaveLength(1);
    expect(r.speech.spoken[0]!.text).toMatch(/^One\. (Chest up|Lift your chest)/);
    expect(r.speech.spoken[0]!.kind).toBe('cue');
  });

  it('keeps quiet about a clean rep except the count and an occasional praise', async () => {
    const r = rig({ settings: { enabled: true } });
    await readyCamera(r);
    for (let i = 0; i < 4; i++) for (const f of squatFrames(0)) r.feed(f);
    expect(r.speech.spoken.map((s) => s.kind)).toEqual(['praise', 'count', 'count', 'praise']);
    expect(r.speech.spoken[1]!.text).toBe('Two.');
  });

  it('count-only style never gives corrections', async () => {
    const r = rig({ settings: { enabled: true, style: 'count' } });
    await readyCamera(r);
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.speech.spoken.map((s) => s.text)).toEqual(['One.']);
  });

  it('applies the user volume', async () => {
    const r = rig({ settings: { enabled: true, volume: 0.4 } });
    await readyCamera(r);
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.speech.spoken[0]!.volume).toBe(0.4);
  });

  it('warns about knees live, during the descent, and does not repeat it after the rep', async () => {
    const r = rig({ settings: { enabled: true } });
    await readyCamera(r);
    for (const f of squatFrames(0, -8, 56)) r.feed(f); // shins lean past the limit
    const kinds = r.speech.spoken.map((s) => s.kind);
    expect(kinds[0]).toBe('safety');
    expect(r.speech.spoken.filter((s) => /Knees|knees/.test(s.text))).toHaveLength(1);
  });

  it('speaks a set summary when the set is finished', async () => {
    const r = rig({ settings: { enabled: true } });
    await readyCamera(r);
    for (const f of squatFrames(0)) r.feed(f);
    r.rt.finishSet();
    expect(r.speech.spoken[r.speech.spoken.length - 1]!.text).toMatch(/^Set complete\. 1 rep, average \d+\.$/);
  });

  it('announces a new calibration but not a profile restored from storage', async () => {
    const r = rig({ settings: { enabled: true } });
    await personalize(r);
    expect(r.speech.spoken.map((s) => s.text)).toEqual(['Calibrated. Start when you are ready.']);
    r.speech.spoken.length = 0;
    r.coach.handle({ type: 'profile_ready', kind: 'measured', restored: true });
    expect(r.speech.spoken).toHaveLength(0);
  });

  it('turning the voice on unlocks speech and confirms; turning it off cancels', () => {
    const r = rig();
    r.coach.setEnabled(true);
    expect(r.speech.unlocked).toBe(1);
    expect(r.speech.spoken[0]!.text).toBe('Voice coaching on.');
    expect(r.voice.getState().settings.enabled).toBe(true);
    r.coach.setEnabled(false);
    expect(r.speech.cancelled).toBe(1);
    expect(r.voice.getState().settings.enabled).toBe(false);
  });

  it('vibrates on corrections when asked, even with the voice off', async () => {
    const r = rig({ settings: { vibrate: true } });
    await readyCamera(r);
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.speech.vibrations).toEqual([80]);
    expect(r.speech.spoken).toHaveLength(0);
  });

  it('captions can be turned off, and expire', async () => {
    const r = rig({ settings: { captions: false } });
    await readyCamera(r);
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.voice.getState().caption).toBeNull();
    r.update({ captions: true });
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.voice.getState().caption).not.toBeNull();
    r.fireTimers();
    expect(r.voice.getState().caption).toBeNull();
  });

  it('a browser without speech still gets captions and does not crash', async () => {
    const r = rig({ supported: false, settings: { enabled: true } });
    await readyCamera(r);
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.speech.spoken).toHaveLength(0);
    expect(r.voice.getState().caption).not.toBeNull();
    expect(r.voice.getState().supported).toBe(false);
  });

  it('the test button speaks a sample in the chosen style', () => {
    const r = rig({ settings: { enabled: true, style: 'motivating' } });
    r.coach.test();
    expect(r.speech.spoken[0]!.text).toContain('you have got this');
    expect(r.speech.unlocked).toBe(1);
  });

  it('a new source resets cooldowns so the first correction is heard again', async () => {
    const r = rig({ settings: { enabled: true } });
    await readyCamera(r);
    for (const f of squatFrames(22)) r.feed(f);
    r.rt.stop();
    await r.rt.startCamera();
    r.speech.spoken.length = 0;
    for (const f of squatFrames(22)) r.feed(f);
    expect(r.speech.spoken[0]!.kind).toBe('cue');
    void makePoseFrame; void BODY;
  });
});
