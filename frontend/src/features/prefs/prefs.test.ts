import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../../lib/storage.ts';
import { DEFAULT_PREFS, PREFS_KEY, createPrefsStore, parsePrefs } from './prefs.ts';

const mem = (initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe('parsePrefs', () => {
  it('gives defaults for junk and clamps values', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs({ poseVariant: 'ultra', setSize: 999, onboarded: 'yes' })).toEqual({ ...DEFAULT_PREFS, setSize: 50 });
    expect(parsePrefs({ setSize: -4 }).setSize).toBe(1);
    expect(parsePrefs({ setSize: 8.6 }).setSize).toBe(9);
    expect(parsePrefs({ setSize: Number.NaN }).setSize).toBe(12);
  });
});

describe('createPrefsStore', () => {
  it('persists and restores', () => {
    const s = mem();
    createPrefsStore(s).update({ onboarded: true, poseVariant: 'lite', setSize: 8 });
    expect(JSON.parse(s.data[PREFS_KEY]!)).toEqual({ onboarded: true, poseVariant: 'lite', setSize: 8 });
    expect(createPrefsStore(s).store.getState()).toEqual({ onboarded: true, poseVariant: 'lite', setSize: 8 });
  });
  it('survives broken storage', () => {
    expect(createPrefsStore(mem({ [PREFS_KEY]: '{oops' })).store.getState()).toEqual(DEFAULT_PREFS);
    const blocked: KeyValueStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    const p = createPrefsStore(blocked);
    expect(p.update({ setSize: 5 }).setSize).toBe(5);
    expect(createPrefsStore(null).store.getState()).toEqual(DEFAULT_PREFS);
  });
});
