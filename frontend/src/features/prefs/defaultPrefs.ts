/** The app's saved preferences (browser only). Applied to the runtime once, at start-up. */
import { useStore } from 'zustand';
import { browserStorage } from '@/lib/storage.ts';
import { getRuntime } from '@/features/session/defaultRuntime.ts';
import { createPrefsStore, type Prefs, type PrefsStore, type PrefsUpdater } from './prefs.ts';

let kit: { store: PrefsStore; update: PrefsUpdater } | null = null;

export function getPrefs(): { store: PrefsStore; update: PrefsUpdater } {
  if (!kit) {
    kit = createPrefsStore(browserStorage());
    const { poseVariant, setSize } = kit.store.getState();
    const runtime = getRuntime();
    runtime.store.setState({ poseVariant });
    runtime.setSetSize(setSize);
  }
  return kit;
}

export function usePrefs<T>(selector: (p: Prefs) => T): T {
  return useStore(getPrefs().store, selector);
}
