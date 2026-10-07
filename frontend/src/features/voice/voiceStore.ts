/** Voice settings (persisted on the device) and what the UI shows about the coach's speech. */
import { createStore } from 'zustand/vanilla';
import { DEFAULT_VOICE_SETTINGS, type UtteranceKind, type VoiceInfo, type VoiceSettings, type VoiceStyle } from './types.ts';

export const VOICE_STORAGE_KEY = 'formfit.voice.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STYLES: readonly VoiceStyle[] = ['calm', 'motivating', 'count'];
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Validate anything (stored JSON, partial objects) into proper settings: unknown fields are dropped, numbers clamped. */
export function parseVoiceSettings(raw: unknown): VoiceSettings {
  const d = DEFAULT_VOICE_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return { ...d };
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);
  return {
    enabled: typeof o['enabled'] === 'boolean' ? o['enabled'] : d.enabled,
    style: STYLES.includes(o['style'] as VoiceStyle) ? (o['style'] as VoiceStyle) : d.style,
    volume: num(o['volume'], d.volume, 0, 1),
    rate: num(o['rate'], d.rate, 0.7, 1.4),
    voiceURI: typeof o['voiceURI'] === 'string' && o['voiceURI'].length > 0 ? o['voiceURI'] : null,
    captions: typeof o['captions'] === 'boolean' ? o['captions'] : d.captions,
    vibrate: typeof o['vibrate'] === 'boolean' ? o['vibrate'] : d.vibrate,
  };
}

export interface Caption {
  /** increases with every caption so the UI/timers can tell them apart */
  id: number;
  text: string;
  kind: UtteranceKind;
}

export interface VoiceState {
  settings: VoiceSettings;
  caption: Caption | null;
  /** does this browser have speech synthesis at all? */
  supported: boolean;
  voices: VoiceInfo[];
}

export function createVoiceStore(storage: KeyValueStorage | null, supported: boolean) {
  let initial = { ...DEFAULT_VOICE_SETTINGS };
  try {
    const raw = storage?.getItem(VOICE_STORAGE_KEY);
    if (raw) initial = parseVoiceSettings(JSON.parse(raw));
  } catch {
    /* corrupt or blocked storage: use defaults */
  }
  const store = createStore<VoiceState>()(() => ({ settings: initial, caption: null, supported, voices: [] }));

  /** Change settings (validated) and remember them. */
  const update = (patch: Partial<VoiceSettings>): VoiceSettings => {
    const next = parseVoiceSettings({ ...store.getState().settings, ...patch });
    store.setState({ settings: next });
    try {
      storage?.setItem(VOICE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: the setting still applies for this visit */
    }
    return next;
  };
  return { store, update };
}

export type VoiceStore = ReturnType<typeof createVoiceStore>['store'];
export type VoiceSettingsUpdater = ReturnType<typeof createVoiceStore>['update'];
