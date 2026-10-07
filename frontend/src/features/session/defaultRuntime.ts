/** The one real CoachRuntime for the app (real camera, MediaPipe, IndexedDB). Components talk to it through hooks. */
import { useStore } from 'zustand';
import { engine } from '@/engine/loader.ts';
import { createMediaPipeDetector } from '@/features/pose/detector.ts';
import { framesFromFile, openCamera } from '@/features/pose/media.ts';
import { createBrowserSpeech, type SpeechOutput } from '@/features/voice/speech.ts';
import { VoiceCoach } from '@/features/voice/voiceCoach.ts';
import { createVoiceStore, type KeyValueStorage, type VoiceSettingsUpdater, type VoiceState, type VoiceStore } from '@/features/voice/voiceStore.ts';
import { createDefaultRepository } from './repository.ts';
import { CoachRuntime } from './runtime.ts';
import type { CoachState } from './store.ts';

let runtime: CoachRuntime | null = null;

export function getRuntime(): CoachRuntime {
  if (!runtime) {
    runtime = new CoachRuntime({
      engine,
      repo: createDefaultRepository(),
      createDetector: createMediaPipeDetector,
      framesFromFile,
      openCamera,
      createObjectUrl: (b) => URL.createObjectURL(b),
      revokeObjectUrl: (u) => URL.revokeObjectURL(u),
      now: () => performance.now(),
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
    });
    void runtime.init();
  }
  return runtime;
}

/** Subscribe a component to a slice of the coach state. Select primitives or existing references only. */
export function useCoach<T>(selector: (s: CoachState) => T): T {
  return useStore(getRuntime().store, selector);
}

// ----------------------------------------------------------------------------- voice coach (Phase 3)
export interface VoiceKit {
  coach: VoiceCoach;
  store: VoiceStore;
  update: VoiceSettingsUpdater;
  speech: SpeechOutput;
}

let voice: VoiceKit | null = null;

/** The voice coach for the app: created once, listening to the runtime's events. */
export function getVoice(): VoiceKit {
  if (!voice) {
    const speech = createBrowserSpeech();
    let storage: KeyValueStorage | null = null;
    try {
      storage = window.localStorage; // reading it can throw when storage is blocked
    } catch {
      storage = null;
    }
    const { store, update } = createVoiceStore(storage, speech.supported);
    const coach = new VoiceCoach({ speech, store, update });
    coach.connect(getRuntime());
    voice = { coach, store, update, speech };
  }
  return voice;
}

export function useVoice<T>(selector: (s: VoiceState) => T): T {
  return useStore(getVoice().store, selector);
}
