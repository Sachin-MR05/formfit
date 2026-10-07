/**
 * VoiceCoach: listens to runtime events, asks the CueScheduler what to say, then delivers it three ways:
 * on-screen captions, speech (only if enabled), and an optional short vibration. The scheduler always runs, so
 * "silent mode" still gives the same text feedback.
 */
import type { RuntimeEvent } from '../session/events.ts';
import { CueScheduler } from './scheduler.ts';
import type { SpeechOutput } from './speech.ts';
import type { Utterance } from './types.ts';
import type { VoiceSettingsUpdater, VoiceStore } from './voiceStore.ts';

export interface VoiceCoachDeps {
  speech: SpeechOutput;
  store: VoiceStore;
  update: VoiceSettingsUpdater;
  /** how long a caption stays on screen (ms) */
  captionMs?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
}

interface Subscribable {
  subscribe(listener: (e: RuntimeEvent) => void): () => void;
}

export class VoiceCoach {
  private readonly scheduler: CueScheduler;
  private captionId = 0;
  private readonly captionMs: number;
  private readonly schedule: (fn: () => void, ms: number) => unknown;

  constructor(private readonly deps: VoiceCoachDeps) {
    this.scheduler = new CueScheduler(() => deps.store.getState().settings.style);
    this.captionMs = deps.captionMs ?? 3500;
    this.schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    // voices load asynchronously in most browsers
    const refresh = () => deps.store.setState({ voices: deps.speech.listVoices() });
    refresh();
    deps.speech.onVoicesChanged(refresh);
  }

  /** Start listening to a runtime. Returns an unsubscribe function. */
  connect(runtime: Subscribable): () => void {
    return runtime.subscribe((e) => this.handle(e));
  }

  handle(e: RuntimeEvent): void {
    switch (e.type) {
      case 'source_started':
        this.scheduler.reset();
        break;
      case 'frame': {
        const u = this.scheduler.onFrame(e.inRep, e.coach.codes, e.tSeconds);
        if (u) this.say(u);
        break;
      }
      case 'rep': {
        const u = this.scheduler.onRep({ index: e.rep.index, score: e.rep.score, band: e.rep.band, cues: e.rep.cues });
        if (u) this.say(u);
        break;
      }
      case 'set_finished':
        this.say(this.scheduler.onSetFinished(e.summary));
        break;
      case 'profile_ready':
        if (!e.restored) this.say(this.scheduler.onProfileReady(e.kind));
        break;
    }
  }

  /** Deliver one utterance: caption, speech, vibration. */
  say(u: Utterance): void {
    const { settings } = this.deps.store.getState();
    if (settings.captions) this.showCaption(u);
    if (settings.enabled && this.deps.speech.supported) {
      this.deps.speech.speak(u, { volume: settings.volume, rate: settings.rate, voiceURI: settings.voiceURI });
    }
    if (settings.vibrate && u.haptic) this.deps.speech.vibrate(80);
  }

  private showCaption(u: Utterance): void {
    const id = ++this.captionId;
    this.deps.store.setState({ caption: { id, text: u.text, kind: u.kind } });
    this.schedule(() => {
      if (this.captionId === id) this.deps.store.setState({ caption: null });
    }, this.captionMs);
  }

  /** Turn the voice on or off. Must be called from a click so the browser allows speech afterwards. */
  setEnabled(on: boolean): void {
    this.deps.update({ enabled: on });
    if (on) {
      this.deps.speech.unlock();
      this.say({ text: 'Voice coaching on.', kind: 'info', interrupt: true, haptic: false });
    } else {
      this.deps.speech.cancel();
    }
  }

  /** Let the user hear the current voice settings. */
  test(): void {
    this.deps.speech.unlock();
    const style = this.deps.store.getState().settings.style;
    const text = style === 'count' ? 'Seven.' : style === 'motivating' ? 'Seven. Chest up, you have got this!' : 'Seven. Chest up.';
    const { settings } = this.deps.store.getState();
    this.showCaption({ text, kind: 'cue', interrupt: true, haptic: false });
    if (this.deps.speech.supported) {
      this.deps.speech.speak({ text, kind: 'cue', interrupt: true, haptic: false }, { volume: settings.volume, rate: settings.rate, voiceURI: settings.voiceURI });
    }
  }
}
