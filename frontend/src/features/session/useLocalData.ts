import { useCallback, useEffect, useState } from 'react';
import { getRuntime } from './defaultRuntime.ts';
import { useSync } from '@/features/sync/defaultSync.ts';
import type { StoredRep, StoredSession } from './types.ts';

export interface LocalData {
  sessions: StoredSession[];
  reps: StoredRep[];
}

/** Everything saved on this device (including what was synced in from other devices), refreshed after saves and syncs. */
export function useLocalData(): { data: LocalData | null; error: string | null; reload: () => Promise<void> } {
  const runtime = getRuntime();
  const lastSyncedAt = useSync((s) => s.lastSyncedAt);
  const [data, setData] = useState<LocalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const repo = runtime.repository;
      const [sessions, reps] = await Promise.all([repo.listSessions(), repo.listAllReps()]);
      setData({ sessions, reps });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [runtime]);

  useEffect(() => {
    void reload();
  }, [reload, lastSyncedAt]);

  useEffect(
    () =>
      runtime.subscribe((e) => {
        if (e.type === 'set_finished' || e.type === 'data_changed') void runtime.flush().then(reload);
      }),
    [runtime, reload],
  );

  return { data, error, reload };
}
