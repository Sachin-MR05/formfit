import type { CueCode } from '../../engine/index.ts';

/** calm = short and neutral, motivating = encouraging, count = only the rep count (and set summary) */
export type VoiceStyle = 'calm' | 'motivating' | 'count';

export interface VoiceSettings {
  /** speak aloud (captions and haptics are independent, so "silent mode" still gives text feedback) */
  enabled: boolean;
  style: VoiceStyle;
  /** 0..1 */
  volume: number;
  /** speech rate multiplier, 0.7..1.4 */
  rate: number;
  /** a specific installed voice, or null for the best match to the browser language */
  voiceURI: string | null;
  /** show what the coach says as on-screen captions (also when the voice is off) */
  captions: boolean;
  /** short vibration on corrections, where the device supports it */
  vibrate: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  style: 'calm',
  volume: 1,
  rate: 1,
  voiceURI: null,
  captions: true,
  vibrate: false,
};

export type UtteranceKind = 'count' | 'cue' | 'praise' | 'safety' | 'summary' | 'info';

export interface Utterance {
  text: string;
  kind: UtteranceKind;
  /** the correction this utterance carries, if any */
  code?: CueCode;
  /** cancel whatever is being spoken first (safety cues) */
  interrupt: boolean;
  /** worth a short vibration */
  haptic: boolean;
}

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
  isDefault: boolean;
}
