import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE_SETTINGS } from './types.ts';
import { VOICE_STORAGE_KEY, createVoiceStore, parseVoiceSettings, type KeyValueStorage } from './voiceStore.ts';

const memStorage = (initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe('parseVoiceSettings', () => {
  it('returns defaults for junk', () => {
    expect(parseVoiceSettings(null)).toEqual(DEFAULT_VOICE_SETTINGS);
    expect(parseVoiceSettings('x')).toEqual(DEFAULT_VOICE_SETTINGS);
    expect(parseVoiceSettings({})).toEqual(DEFAULT_VOICE_SETTINGS);
  });
  it('clamps numbers and rejects unknown styles', () => {
    const s = parseVoiceSettings({ volume: 9, rate: 0.1, style: 'shouty', enabled: true, extra: 1 });
    expect(s.volume).toBe(1);
    expect(s.rate).toBe(0.7);
    expect(s.style).toBe('calm');
    expect(s.enabled).toBe(true);
    expect('extra' in s).toBe(false);
  });
  it('ignores non-finite numbers and empty voice ids', () => {
    expect(parseVoiceSettings({ volume: Number.NaN, voiceURI: '' })).toEqual(DEFAULT_VOICE_SETTINGS);
  });
});

describe('createVoiceStore', () => {
  it('starts from defaults with voice OFF', () => {
    const { store } = createVoiceStore(memStorage(), true);
    expect(store.getState().settings.enabled).toBe(false);
    expect(store.getState().supported).toBe(true);
  });

  it('persists changes and restores them next visit', () => {
    const storage = memStorage();
    const a = createVoiceStore(storage, true);
    a.update({ enabled: true, style: 'motivating', rate: 1.2 });
    expect(JSON.parse(storage.data[VOICE_STORAGE_KEY]!).style).toBe('motivating');
    const b = createVoiceStore(storage, true);
    expect(b.store.getState().settings).toEqual({ ...DEFAULT_VOICE_SETTINGS, enabled: true, style: 'motivating', rate: 1.2 });
  });

  it('survives corrupt storage and a storage that throws', () => {
    expect(createVoiceStore(memStorage({ [VOICE_STORAGE_KEY]: '{not json' }), true).store.getState().settings).toEqual(DEFAULT_VOICE_SETTINGS);
    const broken: KeyValueStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    const v = createVoiceStore(broken, true);
    expect(v.update({ volume: 0.5 }).volume).toBe(0.5);
    expect(v.store.getState().settings.volume).toBe(0.5);
  });

  it('validates every update', () => {
    const v = createVoiceStore(memStorage(), true);
    expect(v.update({ volume: 5 }).volume).toBe(1);
  });
});
