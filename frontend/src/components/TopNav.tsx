import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/coach', label: 'Live Coach' },
  { to: '/review', label: 'Video Review' },
  { to: '/history', label: 'History' },
  { to: '/profile', label: 'My Profile' },
  { to: '/settings', label: 'Settings' },
] as const;

function Logo() {
  return (
    <NavLink to="/coach" aria-label="FormFit home" className="flex items-center gap-2">
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

/** Floating pill navigation (router links). */
export function TopNav() {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-pill bg-canvas/70 px-4 py-2">
      <Logo />
      <nav aria-label="Main" className="order-3 flex w-full flex-wrap justify-center gap-1 md:order-none md:w-auto">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `rounded-pill px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${isActive ? 'bg-borderline' : 'hover:bg-white/70'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-2 rounded-pill bg-white px-2 py-1 pr-4" title="Accounts arrive in Phase 4">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-target text-sm font-bold">G</span>
        <span className="text-sm font-medium">Guest</span>
      </div>
    </header>
  );
}
