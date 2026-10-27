import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { getSync, useAuth } from '@/features/sync/defaultSync';
import { ApiError } from '@/features/sync/api';
import { usePageTitle } from '@/lib/usePageTitle';

const describe = (e: unknown): string => {
  if (e instanceof ApiError) return e.retryAfterS ? `${e.message} Try again in ${e.retryAfterS}s.` : e.message;
  return e instanceof Error ? e.message : String(e);
};

export function LoginPage() {
  usePageTitle('Sign In');
  const navigate = useNavigate();
  const { auth } = getSync();
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const busy = useAuth((s) => s.busy);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await auth.signIn(email.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setError(describe(err));
    }
  };

  if (status === 'signed_in' && user) {
    return (
      <AuthLayout
        mode="login"
        titleLine1="YOU ARE"
        titleLine2="ALREADY"
        titleHighlight="SIGNED IN"
        subtitle={`Welcome back, ${user.displayName || user.email}! You are currently signed in and connected.`}
      >
        <div className="space-y-5 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-good/30 grid place-items-center text-2xl font-bold font-display text-ink">
            {(user.displayName || user.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display font-black text-2xl uppercase tracking-tight">Active Session</h2>
            <p className="mt-1 text-sm text-ink-soft">{user.email}</p>
          </div>
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="w-full rounded-pill bg-good py-3 px-6 font-display font-black uppercase text-sm tracking-wide text-ink shadow-sm hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
            >
              Go to Dashboard
            </button>
            <button
              type="button"
              onClick={() => auth.signOut()}
              className="w-full rounded-pill border border-ink/15 py-3 px-6 text-sm font-semibold text-ink-soft hover:bg-black/5 active:scale-[0.98] transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      mode="login"
      titleLine1="WELCOME BACK"
      titleLine2="CRUSH YOUR"
      titleHighlight="NEXT SET"
      subtitle="Sign in to sync your personalized biomechanics, track squat depth progress, and analyze reps in real time."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <h2 className="font-display font-black text-2xl uppercase tracking-tight text-ink">
            Sign In
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-ink-soft">
            Enter your credentials to access your FormFit account.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-fix/30 bg-fix/15 p-3.5 text-xs sm:text-sm font-medium text-ink">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full rounded-2xl border border-ink/20 bg-white px-4 py-3 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-good"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft" htmlFor="login-password">
                Password
              </label>
            </div>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-2xl border border-ink/20 bg-white px-4 py-3 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-good"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-pill bg-good py-3.5 px-6 font-display font-black uppercase text-sm tracking-wider text-ink shadow-md hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
        >
          {busy ? 'Signing In...' : 'Sign In'}
        </button>

        <div className="pt-2 text-center text-xs text-ink-soft">
          Don't have an account yet?{' '}
          <Link to="/register" className="font-bold text-ink hover:underline">
            Create an account
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

