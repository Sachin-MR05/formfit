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

export function RegisterPage() {
  usePageTitle('Register');
  const navigate = useNavigate();
  const { auth } = getSync();
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const busy = useAuth((s) => s.busy);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!terms) {
      setError('Please accept the terms of service to create your account.');
      return;
    }

    try {
      await auth.signUp(email.trim(), password, displayName.trim() || null, terms);
      navigate('/dashboard');
    } catch (err) {
      setError(describe(err));
    }
  };

  if (status === 'signed_in' && user) {
    return (
      <AuthLayout
        mode="register"
        titleLine1="YOUR FUTURE"
        titleLine2="BODY STARTS"
        titleHighlight="TODAY"
        subtitle={`You are currently signed in as ${user.displayName || user.email}.`}
      >
        <div className="space-y-5 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-good/30 grid place-items-center text-2xl font-bold font-display text-ink">
            {(user.displayName || user.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display font-black text-2xl uppercase tracking-tight">Existing Account</h2>
            <p className="mt-1 text-sm text-ink-soft">{user.email}</p>
          </div>
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="w-full rounded-pill bg-good py-3 px-6 font-display font-black uppercase text-sm tracking-wide text-ink shadow-sm hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
            >
              Continue to Dashboard
            </button>
            <button
              type="button"
              onClick={() => auth.signOut()}
              className="w-full rounded-pill border border-ink/15 py-3 px-6 text-sm font-semibold text-ink-soft hover:bg-black/5 active:scale-[0.98] transition-all cursor-pointer"
            >
              Sign Out & Create Another
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      mode="register"
      titleLine1="YOUR FUTURE"
      titleLine2="BODY STARTS"
      titleHighlight="TODAY"
      subtitle="Achieve peak performance with personalized fitness programs, real-time tracking, and AI-guided coaching built for your goals."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h2 className="font-display font-black text-2xl uppercase tracking-tight text-ink">
            Join FormFit
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-ink-soft">
            Create your account to start AI tracking and store your personal body profile.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-fix/30 bg-fix/15 p-3.5 text-xs sm:text-sm font-medium text-ink">
            {error}
          </div>
        )}

        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1" htmlFor="register-name">
              Full Name (Optional)
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Hunter"
              className="w-full rounded-2xl border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-good"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1" htmlFor="register-email">
              Email Address
            </label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full rounded-2xl border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-good"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1" htmlFor="register-password">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-2xl border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-good"
            />
          </div>

          <label className="flex items-start gap-2.5 pt-1 text-xs text-ink-soft cursor-pointer select-none">
            <input
              type="checkbox"
              required
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-lime-600"
            />
            <span>
              I accept the <span className="font-semibold text-ink">Terms of Service</span> and agree that FormFit is an exercise aid, not medical advice.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-pill bg-good py-3.5 px-6 font-display font-black uppercase text-sm tracking-wider text-ink shadow-md hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
        >
          {busy ? 'Creating Account...' : 'Create Account'}
        </button>

        <div className="pt-2 text-center text-xs text-ink-soft">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-ink hover:underline">
            Sign In
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

