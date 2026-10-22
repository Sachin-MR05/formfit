import { useAuth, useSync } from '@/features/sync/defaultSync.ts';

const TEXT = {
  disabled: 'Local only',
  signed_out: 'Not signed in',
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Sync problem',
} as const;

const DOT = {
  disabled: 'bg-slate-400',
  signed_out: 'bg-slate-400',
  idle: 'bg-green-600',
  syncing: 'animate-pulse bg-amber-500',
  offline: 'bg-amber-500',
  error: 'bg-red-600',
} as const;

/** Small status pill. The wording carries the meaning (the colour is only a hint). */
export function SyncBadge() {
  const phase = useSync((s) => s.phase);
  const pending = useSync((s) => s.pending);
  const signedIn = useAuth((s) => s.status === 'signed_in');
  const label = phase === 'idle' && pending > 0 ? `${pending} to upload` : TEXT[phase];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" role="status" aria-live="polite" title={signedIn ? 'Cloud sync status' : 'Data is saved on this device only'}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[phase]}`} />
      {label}
    </span>
  );
}
