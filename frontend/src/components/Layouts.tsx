import { Link, Outlet } from 'react-router-dom';
import { Logo } from '@/components/TopNav';

/** Public pages (landing): a light header and footer, no app navigation. */
export function MarketingLayout() {
  return (
    <div className="mx-auto max-w-[1180px] p-3 sm:p-6">
      <div className="rounded-tile bg-surface p-4 shadow-sm sm:p-6">
        <header className="mb-6 flex items-center justify-between">
          <Logo to="/welcome" />
          <Link to="/dashboard" className="rounded-pill bg-ink px-5 py-2.5 text-sm font-semibold text-white">
            Open the app
          </Link>
        </header>
        <Outlet />
        <footer className="mt-10 border-t border-black/10 pt-4 text-xs text-ink-soft">
          <p>FormFit is a coaching aid, not medical advice. Video never leaves your device; only numbers (angles and scores) are saved.</p>
          <p className="mt-1">
            <Link to="/fairness" className="underline">Fairness Lab</Link> · <Link to="/settings" className="underline">Settings and privacy</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

/** Distraction-free flow (onboarding). */
export function FocusLayout() {
  return (
    <div className="mx-auto max-w-[900px] p-3 sm:p-6">
      <div className="rounded-tile bg-surface p-4 shadow-sm sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <Logo to="/welcome" />
          <Link to="/dashboard" className="text-sm font-medium text-ink-soft underline">
            Skip for now
          </Link>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
