/** Preferences saved on this device (validated like the voice settings). */
import { createStore } from 'zustand/vanilla';
import type { KeyValueStorage } from '../../lib/storage.ts';
import type { PoseVariant } from '../pose/assets.ts';

export const PREFS_KEY = 'formfit.prefs.v1';

export interface Prefs {
  /** the welcome / calibration wizard has been completed (or skipped) once */
  onboarded: boolean;
  /** pose model to start with: lite is faster, heavy is more accurate */
  poseVariant: PoseVariant;
  /** target reps per set */
  setSize: number;
}

export const DEFAULT_PREFS: Prefs = { onboarded: false, poseVariant: 'full', setSize: 12 };
const VARIANTS: readonly PoseVariant[] = ['lite', 'full', 'heavy'];

export function parsePrefs(raw: unknown): Prefs {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS };
  const o = raw as Record<string, unknown>;
  const size = typeof o['setSize'] === 'number' && Number.isFinite(o['setSize']) ? Math.round(o['setSize']) : DEFAULT_PREFS.setSize;
  return {
    onboarded: typeof o['onboarded'] === 'boolean' ? o['onboarded'] : DEFAULT_PREFS.onboarded,
    poseVariant: VARIANTS.includes(o['poseVariant'] as PoseVariant) ? (o['poseVariant'] as PoseVariant) : DEFAULT_PREFS.poseVariant,
    setSize: Math.min(50, Math.max(1, size)),
  };
}

export function createPrefsStore(storage: KeyValueStorage | null) {
  let initial = { ...DEFAULT_PREFS };
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (raw) initial = parsePrefs(JSON.parse(raw));
  } catch {
    /* corrupt or blocked storage: defaults */
  }
  const store = createStore<Prefs>()(() => initial);
  const update = (patch: Partial<Prefs>): Prefs => {
    const next = parsePrefs({ ...store.getState(), ...patch });
    store.setState(next);
    try {
      storage?.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* the preference still applies for this visit */
    }
    return next;
  };
  return { store, update };
}

export type PrefsStore = ReturnType<typeof createPrefsStore>['store'];
export type PrefsUpdater = ReturnType<typeof createPrefsStore>['update'];
