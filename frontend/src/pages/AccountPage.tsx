import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SyncBadge } from '@/components/SyncBadge';
import { Pill } from '@/components/ui/Pill';
import { Tile } from '@/components/ui/Tile';
import { getRuntime } from '@/features/session/defaultRuntime.ts';
import { ApiError } from '@/features/sync/api.ts';
import { API_URL, getSync, useAuth, useSync } from '@/features/sync/defaultSync.ts';
import { formatDate } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';

function download(filename: string, text: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const describe = (e: unknown): string => {
  if (e instanceof ApiError) return e.retryAfterS ? `${e.message} Try again in ${e.retryAfterS} s.` : e.message;
  return e instanceof Error ? e.message : String(e);
};

export function AccountPage() {
  usePageTitle('Account');
  const { api, auth, engine } = getSync();
  const runtime = getRuntime();
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const busy = useAuth((s) => s.busy);
  const phase = useSync((s) => s.phase);
  const pending = useSync((s) => s.pending);
  const lastSyncedAt = useSync((s) => s.lastSyncedAt);
  const syncError = useSync((s) => s.error);
  const switched = useSync((s) => s.switchedAccount);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletePw, setDeletePw] = useState('');
  const [alsoWipe, setAlsoWipe] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  if (!API_URL) {
    return (
      <main className="space-y-3">
        <h1 className="font-display text-4xl font-black uppercase leading-none">Account</h1>
        <Tile tone="sand">
          <p className="font-semibold">Cloud sync is not set up in this build.</p>
          <p className="mt-1 text-sm text-ink-soft">
            FormFit works fully offline: your sessions are saved on this device. To add accounts and sync between devices, run the backend (see
            <code className="mx-1">backend/README.md</code>) and set <code>VITE_API_URL</code> in <code>frontend/.env.local</code>.
          </p>
        </Tile>
      </main>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'signup') await auth.signUp(email, password, name.trim() || null, terms);
      else await auth.signIn(email, password);
      setPassword('');
    } catch (err) {
      setError(describe(err));
    }
  };

  const signOut = () => {
    if (pending > 0 && !confirm(`${pending} item(s) have not been uploaded yet. They stay on this device and sync after you sign in again. Sign out?`)) return;
    auth.signOut();
  };

  const signOutAndWipe = async () => {
    const warn = pending > 0 ? `${pending} item(s) have NOT been uploaded and will be lost. ` : '';
    if (!confirm(`${warn}Sign out and remove all FormFit data from this device? Your account keeps its data.`)) return;
    await runtime.repository.clearAll();
    runtime.handleDataReset();
    auth.signOut();
  };

  const deleteAccount = async () => {
    if (!confirm('Permanently delete your account and all cloud data? This cannot be undone.')) return;
    try {
      await api.deleteAccount(deletePw);
      if (alsoWipe) {
        await runtime.repository.clearAll();
        runtime.handleDataReset();
      }
      auth.signOut();
      setDeletePw('');
      setNote('Your account and cloud data were deleted.');
    } catch (err) {
      setError(describe(err));
    }
  };

  return (
    <main className="space-y-3">
      <h1 className="font-display text-4xl font-black uppercase leading-none">Account</h1>

      {note && <p role="status" className="rounded-2xl bg-good px-4 py-2 text-sm font-medium">{note}</p>}
      {switched && (
        <p role="status" className="rounded-2xl bg-borderline px-4 py-2 text-sm">
          This device had data from a different account. It was removed before syncing, so accounts never mix.
        </p>
      )}
      {error && <p role="alert" className="rounded-2xl bg-fix/40 px-4 py-2 text-sm">{error}</p>}

      {status !== 'signed_in' ? (
        <Tile tone="good">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sign in or create an account">
              <Pill selected={mode === 'signin'} onClick={() => setMode('signin')}>Sign in</Pill>
              <Pill selected={mode === 'signup'} onClick={() => setMode('signup')}>Create account</Pill>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/login" className="rounded-pill bg-ink text-white px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-black/80 transition-colors">
                Dedicated Login Page
              </Link>
              <Link to="/register" className="rounded-pill bg-white text-ink px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-white/80 transition-colors">
                Dedicated Register Page
              </Link>
            </div>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            An account backs up your sessions and lets you see them on every device. Anything you already recorded on this device is uploaded after you sign in.
          </p>
          <form onSubmit={(e) => void submit(e)} className="mt-3 grid max-w-md gap-3">
            <label className="text-sm font-medium">
              Email
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/15 bg-white px-3 py-2" />
            </label>
            {mode === 'signup' && (
              <label className="text-sm font-medium">
                Name (optional)
                <input value={name} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/15 bg-white px-3 py-2" />
              </label>
            )}
            <label className="text-sm font-medium">
              Password {mode === 'signup' && <span className="font-normal text-ink-soft">(at least 8 characters)</span>}
              <input type="password" required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/15 bg-white px-3 py-2" />
            </label>
            {mode === 'signup' && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-4 w-4 accent-black" />
                <span>I understand FormFit stores my angles and scores (never video) and is a coaching aid, not medical advice.</span>
              </label>
            )}
            <button type="submit" disabled={busy || (mode === 'signup' && !terms)} className="rounded-pill bg-ink px-6 py-3 text-sm font-bold text-white disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </Tile>
      ) : (
        <>
          <Tile tone="good">
            <p className="text-xs font-extrabold uppercase tracking-wide">Signed in</p>
            <p className="font-display text-2xl font-black">{user?.displayName ?? user?.email}</p>
            {user?.displayName && <p className="text-sm text-ink-soft">{user.email}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <SyncBadge />
              <span className="text-ink-soft">{lastSyncedAt ? `Last synced ${formatDate(lastSyncedAt)}` : 'Not synced yet'}</span>
              {pending > 0 && <span>{pending} waiting to upload</span>}
            </div>
            {syncError && <p role="alert" className="mt-2 text-sm text-red-800">Sync problem: {syncError}</p>}
            {phase === 'offline' && <p className="mt-2 text-sm">You are offline. Everything keeps working and uploads when you are back online.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void engine.syncNow()} disabled={phase === 'syncing'} className="rounded-pill bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                Sync now
              </button>
              <button type="button" onClick={signOut} className="rounded-pill bg-white px-5 py-2.5 text-sm font-semibold">
                Sign out
              </button>
            </div>
          </Tile>

          <Tile tone="sand">
            <h2 className="text-xs font-extrabold uppercase tracking-wide">Your data</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void api.exportJson().then((t) => download('formfit-export.json', t, 'application/json')).catch((e) => setError(describe(e)))} className="rounded-pill bg-white px-5 py-2.5 text-sm font-semibold">
                Download my cloud data (JSON)
              </button>
              <button type="button" onClick={() => void signOutAndWipe()} className="rounded-pill bg-white px-5 py-2.5 text-sm font-semibold">
                Sign out and remove data from this device
              </button>
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-red-800">Delete my account</summary>
              <div className="mt-2 max-w-md space-y-2 text-sm">
                <p className="text-ink-soft">This permanently deletes your account, sessions and reps from the server. Enter your password to confirm.</p>
                <input type="password" autoComplete="current-password" aria-label="Password to confirm deletion" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} className="block w-full rounded-lg border border-black/15 bg-white px-3 py-2" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={alsoWipe} onChange={(e) => setAlsoWipe(e.target.checked)} className="h-4 w-4 accent-black" />
                  Also remove the data stored on this device
                </label>
                <button type="button" disabled={!deletePw} onClick={() => void deleteAccount()} className="rounded-pill bg-red-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
                  Delete account permanently
                </button>
              </div>
            </details>
          </Tile>
        </>
      )}
    </main>
  );
}
