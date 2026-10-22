import { Link, NavLink } from 'react-router-dom';
import { SyncBadge } from '@/components/SyncBadge';
import { useAuth } from '@/features/sync/defaultSync.ts';

const LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/coach', label: 'Live Coach' },
  { to: '/review', label: 'Video Review' },
  { to: '/history', label: 'History' },
  { to: '/profile', label: 'My Profile' },
  { to: '/settings', label: 'Settings' },
] as const;

export function Logo({ to = '/dashboard' }: { to?: string }) {
  return (
    <NavLink to={to} aria-label="FormFit home" className="flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
        <g stroke="#3f6212" strokeWidth="6" strokeLinecap="round" fill="none">
          <path d="M22 14 L32 32 L24 52" />
          <path d="M32 32 L48 40" />
        </g>
        <g fill="#65a30d">
          <circle cx="22" cy="14" r="6" />
          <circle cx="32" cy="32" r="6" />
          <circle cx="24" cy="52" r="6" />
          <circle cx="48" cy="40" r="6" />
        </g>
      </svg>
      <span className="font-display text-xl font-black tracking-tight">FormFit</span>
    </NavLink>
  );
}

/** Floating pill navigation (router links) with the account / sync status. */
export function TopNav() {
  const user = useAuth((s) => s.user);
  const signedIn = useAuth((s) => s.status === 'signed_in');
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-pill bg-canvas/70 px-4 py-2">
      <Logo />
      <nav aria-label="Main" className="order-3 flex w-full flex-wrap justify-center gap-1 md:order-none md:w-auto">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `rounded-pill px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${isActive ? 'bg-borderline' : 'hover:bg-white/70'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <Link to="/account" className="flex items-center gap-2 rounded-pill bg-white px-2 py-1 pr-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" title="Account and sync">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-target text-sm font-bold">
          {signedIn ? (user?.displayName ?? user?.email ?? 'U').charAt(0).toUpperCase() : 'G'}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-medium">{signedIn ? (user?.displayName ?? user?.email) : 'Sign in'}</span>
          <SyncBadge />
        </span>
      </Link>
    </header>
  );
}
