/** Speech output behind a small interface: the browser implementation, and anything else (tests, other engines) can plug in. */
import type { Utterance, VoiceInfo, VoiceSettings } from './types.ts';

export type SpeakSettings = Pick<VoiceSettings, 'volume' | 'rate' | 'voiceURI'>;

export interface SpeechOutput {
  /** false when the browser has no speech synthesis (captions still work) */
  readonly supported: boolean;
  speak(u: Utterance, s: SpeakSettings): void;
  cancel(): void;
  vibrate(ms: number): void;
  listVoices(): VoiceInfo[];
  /** called when the browser finishes loading its voice list (it is often empty at first) */
  onVoicesChanged(cb: () => void): () => void;
  /** must be called from a user gesture (a click) once, so later speech is allowed */
  unlock(): void;
}

/** Choose the voice to use: the user's pick if installed, else the best match for the browser language, else the default. */
export function pickVoice(voices: readonly VoiceInfo[], voiceURI: string | null, browserLang: string): string | null {
  if (voices.length === 0) return null;
  if (voiceURI && voices.some((v) => v.uri === voiceURI)) return voiceURI;
  const lang = (browserLang || 'en-US').toLowerCase();
  const primary = lang.split('-')[0]!;
  const exact = voices.find((v) => v.lang.toLowerCase() === lang);
  const sameLanguage = voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === primary);
  const fallback = voices.find((v) => v.isDefault) ?? voices[0]!;
  return (exact ?? sameLanguage ?? fallback).uri;
}

// ------- structural types so the real SpeechSynthesis AND test fakes both fit -------
export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  default: boolean;
}
export interface UtteranceLike {
  text: string;
  volume: number;
  rate: number;
  pitch: number;
  lang: string;
  voice: VoiceLike | null;
}
export interface SynthLike {
  readonly speaking: boolean;
  readonly pending: boolean;
  speak(u: UtteranceLike): void;
  cancel(): void;
  getVoices(): VoiceLike[];
  addEventListener(type: 'voiceschanged', cb: () => void): void;
  removeEventListener(type: 'voiceschanged', cb: () => void): void;
}
export interface NavLike {
  language: string;
  vibrate?: (pattern: number) => boolean;
}

export class BrowserSpeech implements SpeechOutput {
  readonly supported = true;

  constructor(
    private readonly synth: SynthLike,
    private readonly makeUtterance: (text: string) => UtteranceLike,
    private readonly nav: NavLike,
    /** Chrome drops a `speak()` issued in the same tick as `cancel()`; wait a moment (tests pass a synchronous version). */
    private readonly defer: (fn: () => void) => void = (fn) => void setTimeout(fn, 40),
  ) {}

  speak(u: Utterance, s: SpeakSettings): void {
    const busy = this.synth.speaking || this.synth.pending;
    const utt = this.makeUtterance(u.text);
    utt.volume = s.volume;
    utt.rate = s.rate;
    utt.pitch = 1;
    const uri = pickVoice(this.listVoices(), s.voiceURI, this.nav.language);
    const voice = uri ? (this.synth.getVoices().find((v) => v.voiceURI === uri) ?? null) : null;
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang;
    } else {
      utt.lang = this.nav.language || 'en-US';
    }
    // The newest coaching line is the useful one: never let lines queue up behind each other.
    if (busy || u.interrupt) {
      this.synth.cancel();
      this.defer(() => this.synth.speak(utt));
    } else {
      this.synth.speak(utt);
    }
  }

  cancel(): void {
    this.synth.cancel();
  }

  vibrate(ms: number): void {
    try {
      this.nav.vibrate?.(ms);
    } catch {
      /* some browsers throw when vibration is not allowed */
    }
  }

  listVoices(): VoiceInfo[] {
    return this.synth.getVoices().map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, isDefault: v.default }));
  }

  onVoicesChanged(cb: () => void): () => void {
    this.synth.addEventListener('voiceschanged', cb);
    return () => this.synth.removeEventListener('voiceschanged', cb);
  }

  unlock(): void {
    const u = this.makeUtterance(' ');
    u.volume = 0;
    this.synth.speak(u);
  }
}

/** Used when the browser has no speech synthesis: everything is a no-op, captions still work. */
export class NoSpeech implements SpeechOutput {
  readonly supported = false;
  speak(): void {}
  cancel(): void {}
  vibrate(): void {}
  listVoices(): VoiceInfo[] {
    return [];
  }
  onVoicesChanged(): () => void {
    return () => {};
  }
  unlock(): void {}
}

/** The real thing in a browser, or NoSpeech. */
export function createBrowserSpeech(): SpeechOutput {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return new NoSpeech();
  return new BrowserSpeech(
    window.speechSynthesis as unknown as SynthLike,
    (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
    navigator as unknown as NavLike,
  );
}
