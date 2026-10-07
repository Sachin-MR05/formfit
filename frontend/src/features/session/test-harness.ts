/** Fakes shared by runtime and voice tests: a scripted pose detector, a fake <video>, a recording canvas, a controllable clock. */
import { torsoNeeded } from '../../engine/index.ts';
import { engine } from '../../engine/test-utils.ts';
import type { PoseDetector } from '../pose/detector.ts';
import type { PoseFrame } from '../pose/landmarks.ts';
import { makePoseFrame, standingFrame } from '../pose/testing.ts';
import { MemoryRepository, type SessionRepository } from './repository.ts';
import { CoachRuntime, type RuntimeDeps } from './runtime.ts';

export const BODY = { femurTorso: 1.0, shankFemur: 0.95 };

export type CanvasCall = [method: string, args: unknown[]];

/** A canvas whose 2-D context records every call, so tests can assert what was drawn. */
export function recordingCanvas() {
  const calls: CanvasCall[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : (...args: unknown[]) => void calls.push([String(k), args])),
      set: () => true,
    },
  );
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

export function fakeVideo() {
  const v = {
    readyState: 4, currentTime: 0, videoWidth: 640, videoHeight: 480, duration: 20, paused: true, ended: false, playbackRate: 1,
    srcObject: null as unknown, muted: false, playsInline: false,
    onended: null as null | (() => void), onplay: null as null | (() => void), onpause: null as null | (() => void),
    onloadedmetadata: null as null | (() => void), onerror: null as null | (() => void),
    play: async () => {
      v.paused = false;
      v.onplay?.();
    },
    pause: () => {
      v.paused = true;
      v.onpause?.();
    },
    removeAttribute: () => {},
    load: () => {},
    set src(_u: string) {
      queueMicrotask(() => v.onloadedmetadata?.());
    },
  };
  return v;
}

export function setup(repo: SessionRepository = new MemoryRepository()) {
  let clock = 1_000_000;
  let next: PoseFrame | null = null;
  const stills: PoseFrame[] = [];
  const rec = recordingCanvas();
  const detector: PoseDetector = {
    detectVideo: () => next,
    detectStills: async (sources) => sources.map((_, i) => stills[i] ?? null),
    close: () => {},
  };
  let stopped = 0;
  const deps: RuntimeDeps = {
    engine,
    repo,
    createDetector: async () => detector,
    framesFromFile: async () => [{ canvas: recordingCanvas().canvas, aspect: 4 / 3 }],
    openCamera: async () =>
      ({
        getTracks: () => [
          {
            stop: () => {
              stopped++;
            },
          },
        ],
      }) as unknown as MediaStream,
    createObjectUrl: () => 'blob:fake',
    revokeObjectUrl: () => {},
    now: () => clock,
    requestFrame: () => 1,
    cancelFrame: () => {},
  };
  const rt = new CoachRuntime(deps);
  const video = fakeVideo();
  rt.attach(video as unknown as HTMLVideoElement, rec.canvas);
  const feed = (frame: PoseFrame | null, dtMs = 33) => {
    next = frame;
    clock += dtMs;
    video.currentTime += dtMs / 1000;
    rt.step();
  };
  return { rt, video, repo, feed, stills, calls: rec.calls, tick: (ms: number) => void (clock += ms), stopped: () => stopped };
}

export type Harness = ReturnType<typeof setup>;

/** A full squat (and return to standing) for the long-femur BODY. `tauOffset` adds torso lean beyond that body's balanced target. */
export function squatFrames(tauOffset: number, minPhi = -8, alphaMax = 38): PoseFrame[] {
  const N = 40;
  const out: PoseFrame[] = [];
  for (let k = 0; k <= 2 * N; k++) {
    const u = k <= N ? k / N : (2 * N - k) / N;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const alpha = alphaMax * e;
    const phi = 88 + (minPhi - 88) * e;
    out.push(makePoseFrame({ ...BODY, alpha, phi, tau: 3 + (torsoNeeded(BODY, alpha, phi, engine.config.footOffset) + tauOffset - 3) * e }));
  }
  for (let k = 0; k < 12; k++) out.push(standingFrame(BODY));
  return out;
}

export const file = (name: string, type = 'video/mp4') => ({ name, type }) as unknown as File;

/** Personalize a harness with the standard BODY from one photo. */
export async function personalize(h: Harness): Promise<void> {
  h.stills.push(standingFrame(BODY));
  await h.rt.calibrateFromFiles([file('a.jpg', 'image/jpeg')]);
}
