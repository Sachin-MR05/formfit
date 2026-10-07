import { Outlet } from 'react-router-dom';
import { TopNav } from '@/components/TopNav';

export function AppShell() {
  return (
    <div className="mx-auto max-w-[1280px] p-3 sm:p-5">
      <div className="rounded-tile bg-surface p-3 shadow-sm sm:p-5">
        <TopNav />
        <Outlet />
      </div>
    </div>
  );
}
