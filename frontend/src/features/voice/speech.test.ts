import { describe, expect, it } from 'vitest';
import { BrowserSpeech, NoSpeech, pickVoice, type SynthLike, type UtteranceLike, type VoiceLike } from './speech.ts';
import type { VoiceInfo } from './types.ts';

const VOICES: VoiceLike[] = [
  { voiceURI: 'en-us', name: 'US', lang: 'en-US', default: true },
  { voiceURI: 'en-in', name: 'India', lang: 'en-IN', default: false },
  { voiceURI: 'ta-in', name: 'Tamil', lang: 'ta-IN', default: false },
];
const info = (v: VoiceLike): VoiceInfo => ({ uri: v.voiceURI, name: v.name, lang: v.lang, isDefault: v.default });

function fakeSynth() {
  const log: string[] = [];
  const spoken: UtteranceLike[] = [];
  const listeners: Array<() => void> = [];
  const synth = {
    speaking: false,
    pending: false,
    speak: (u: UtteranceLike) => { log.push(`speak:${u.text}`); spoken.push(u); },
    cancel: () => { log.push('cancel'); },
    getVoices: () => VOICES,
    addEventListener: (_t: 'voiceschanged', cb: () => void) => { listeners.push(cb); },
    removeEventListener: (_t: 'voiceschanged', cb: () => void) => { listeners.splice(listeners.indexOf(cb), 1); },
  } satisfies SynthLike & Record<string, unknown>;
  return { synth: synth as SynthLike & { speaking: boolean; pending: boolean }, log, spoken, listeners };
}
const utt = (text: string): UtteranceLike => ({ text, volume: 1, rate: 1, pitch: 1, lang: '', voice: null });
const make = (lang = 'en-IN', vib?: (p: number) => boolean) => {
  const f = fakeSynth();
  return { ...f, speech: new BrowserSpeech(f.synth, utt, { language: lang, vibrate: vib }, (fn) => fn()) };
};
const U = (text: string, interrupt = false) => ({ text, kind: 'cue' as const, interrupt, haptic: false });
const S = { volume: 0.6, rate: 1.1, voiceURI: null };

describe('pickVoice', () => {
  const infos = VOICES.map(info);
  it('honours an installed voice choice', () => expect(pickVoice(infos, 'ta-in', 'en-US')).toBe('ta-in'));
  it('falls back from a missing choice to the browser language', () => expect(pickVoice(infos, 'gone', 'en-IN')).toBe('en-in'));
  it('matches the language family when there is no exact match', () => expect(pickVoice(infos, null, 'en-GB')).toBe('en-us'));
  it('uses the default voice for an unknown language, and null with no voices', () => {
    expect(pickVoice(infos, null, 'fr-FR')).toBe('en-us');
    expect(pickVoice([], null, 'en-US')).toBeNull();
  });
});

describe('BrowserSpeech', () => {
  it('speaks with the user volume, rate and best voice', () => {
    const { speech, spoken } = make('en-IN');
    speech.speak(U('Seven. Chest up.'), S);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.volume).toBe(0.6);
    expect(spoken[0]!.rate).toBe(1.1);
    expect(spoken[0]!.voice?.voiceURI).toBe('en-in');
    expect(spoken[0]!.lang).toBe('en-IN');
  });

  it('does not queue lines: a new line replaces one that is still being spoken', () => {
    const { speech, synth, log } = make();
    synth.speaking = true;
    speech.speak(U('Two.'), S);
    expect(log).toEqual(['cancel', 'speak:Two.']);
  });

  it('interrupting cues cancel first even if nothing is speaking', () => {
    const { speech, log } = make();
    speech.speak(U('Knees!', true), S);
    expect(log).toEqual(['cancel', 'speak:Knees!']);
  });

  it('unlock() plays a silent utterance', () => {
    const { speech, spoken } = make();
    speech.unlock();
    expect(spoken[0]!.volume).toBe(0);
  });

  it('lists voices and reports when the browser loads more', () => {
    const { speech, listeners } = make();
    expect(speech.listVoices().map((v) => v.uri)).toEqual(['en-us', 'en-in', 'ta-in']);
    let n = 0;
    const off = speech.onVoicesChanged(() => n++);
    listeners.forEach((l) => l());
    expect(n).toBe(1);
    off();
    expect(listeners).toHaveLength(0);
  });

  it('vibrates when the device can, and never throws when it cannot', () => {
    let ms = 0;
    make('en-US', (p) => { ms = p; return true; }).speech.vibrate(80);
    expect(ms).toBe(80);
    make('en-US').speech.vibrate(80);
    make('en-US', () => { throw new Error('not allowed'); }).speech.vibrate(80);
  });
});

describe('NoSpeech', () => {
  it('is safely inert', () => {
    const n = new NoSpeech();
    expect(n.supported).toBe(false);
    n.speak();
    n.cancel();
    expect(n.listVoices()).toEqual([]);
  });
});
