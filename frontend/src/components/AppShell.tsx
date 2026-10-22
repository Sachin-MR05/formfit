import { Outlet } from 'react-router-dom';
import { TopNav } from '@/components/TopNav';

export function AppShell() {
  return (
    <div className="min-h-screen w-full bg-surface p-3 sm:p-5">
      <TopNav />
      <Outlet />
      <p className="mt-6 text-center text-xs text-ink-soft">
        FormFit is a coaching aid, not medical advice. Stop if something hurts and ask a qualified coach or clinician.
      </p>
    </div>
  );
}
