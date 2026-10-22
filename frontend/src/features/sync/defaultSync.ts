/** The app's account + sync wiring (browser only): API client, auth, sync engine and the triggers that run it. */
import { useStore } from 'zustand';
import { browserStorage } from '@/lib/storage.ts';
import { getRuntime } from '@/features/session/defaultRuntime.ts';
import { ApiClient } from './api.ts';
import { AuthManager, type AuthState } from './auth.ts';
import { SyncEngine, type SyncState } from './syncEngine.ts';

/** Empty = the app runs fully offline (no accounts, no cloud sync). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface SyncKit {
  api: ApiClient;
  auth: AuthManager;
  engine: SyncEngine;
}

let kit: SyncKit | null = null;

export function getSync(): SyncKit {
  if (kit) return kit;
  const runtime = getRuntime();
  const auth = new AuthManager(browserStorage());
  const api = new ApiClient({ baseUrl: API_URL, fetch: (u, i) => window.fetch(u, i), getToken: () => auth.token });
  auth.bind(api);
  const engine = new SyncEngine({
    api,
    auth,
    repo: runtime.repository,
    now: () => Date.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (h) => window.clearTimeout(h as number),
    onRemoteApplied: (r) => {
      if (r.profileChanged) void runtime.reloadProfile();
    },
    onLocalDataReset: () => runtime.handleDataReset(),
  });
  kit = { api, auth, engine };

  engine.start();
  void auth.restore();

  window.addEventListener('online', () => engine.schedule(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') engine.schedule(500);
  });
  window.setInterval(() => engine.schedule(0), 60_000);
  runtime.subscribe((e) => {
    if (e.type === 'rep' || e.type === 'set_finished' || e.type === 'profile_ready' || e.type === 'data_changed') engine.schedule(1500);
  });
  return kit;
}

export function useAuth<T>(selector: (s: AuthState) => T): T {
  return useStore(getSync().auth.store, selector);
}

export function useSync<T>(selector: (s: SyncState) => T): T {
  return useStore(getSync().engine.store, selector);
}
