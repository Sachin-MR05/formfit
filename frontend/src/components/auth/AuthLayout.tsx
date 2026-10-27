import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/TopNav';

interface AuthLayoutProps {
  titleLine1?: string;
  titleLine2?: string;
  titleHighlight?: string;
  subtitle?: string;
  children: ReactNode;
  mode: 'login' | 'register';
}

const ATHLETIC_PILLS = [
  'Personal Training',
  'Strength',
  'AI Pose Tracking',
  'Squat Depth',
  'Rep Counter',
  'Form Score',
];

export function AuthLayout({
  titleLine1 = 'YOUR FUTURE',
  titleLine2 = 'BODY STARTS',
  titleHighlight = 'TODAY',
  subtitle = 'Achieve peak performance with personalized fitness programs, real-time tracking, and AI-guided coaching built for your goals.',
  children,
  mode,
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full bg-[#070e17] text-white flex flex-col justify-between overflow-x-hidden">
      {/* Background with Athlete Image and Cinematic Overlay */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
        <img
          src="/auth-hero.png"
          alt="Athletic training background"
          className="h-full w-full object-cover object-center md:object-right filter brightness-[0.92] contrast-[1.05]"
        />
        {/* Gradients to ensure text readability while highlighting the athlete */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070e17] via-[#070e17]/85 to-transparent md:bg-gradient-to-r md:from-[#070e17]/95 md:via-[#070e17]/80 md:to-transparent" />
        <div className="absolute inset-0 bg-radial-at-c from-transparent via-[#070e17]/40 to-[#070e17]/90" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-3">
          <Logo to="/dashboard" />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            to="/dashboard"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-pill bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 text-white font-medium transition-all"
          >
            ← Back to App
          </Link>
          <Link
            to={mode === 'login' ? '/register' : '/login'}
            className="rounded-pill bg-good text-ink font-display font-black uppercase text-xs tracking-wider px-5 py-2.5 shadow-sm hover:brightness-105 active:scale-[0.98] transition-all"
          >
            {mode === 'login' ? 'Create Account' : 'Sign In'}
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto w-full max-w-7xl px-6 py-6 md:px-12 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left / Hero Column with Bold Typography */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
          {/* Big Bold Headline */}
          <div className="space-y-1">
            <h1 className="font-display font-black text-4xl sm:text-6xl xl:text-7xl uppercase leading-[0.9] tracking-tight text-white drop-shadow-md">
              <span>{titleLine1}</span>
              <br />
              <span>{titleLine2}</span>
              <br />
              <span className="text-good">{titleHighlight}</span>
            </h1>
          </div>

          {/* Subtitle / Pitch */}
          <p className="max-w-xl text-sm sm:text-base md:text-lg text-white/85 leading-relaxed font-sans">
            {subtitle}
          </p>

          {/* Social Proof & Rating Badge */}
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-baseline gap-1 text-good font-display font-black text-3xl sm:text-4xl">
              4.8<span className="text-xl sm:text-2xl">★</span>
            </div>
            <div className="text-xs uppercase tracking-wider text-white/90 font-semibold leading-tight">
              Fitness Lovers<br />
              Like You
            </div>
          </div>

          {/* Athletic Pills Row */}
          <div className="hidden sm:flex flex-wrap gap-2 pt-3">
            {ATHLETIC_PILLS.map((pill) => (
              <span
                key={pill}
                className="rounded-pill border border-white/25 bg-white/5 backdrop-blur-md px-4 py-1.5 text-xs font-medium text-white/90"
              >
                {pill}
              </span>
            ))}
          </div>
        </div>

        {/* Right Column: Form Container Card */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <div className="w-full max-w-md rounded-3xl bg-surface/95 backdrop-blur-xl p-6 sm:p-8 text-ink shadow-2xl border border-white/30">
            {children}
          </div>
        </div>
      </main>

      {/* Bottom Footer / Community Stats */}
      <footer className="relative z-10 px-6 py-5 md:px-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 text-xs text-white/70">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2 overflow-hidden">
            <span className="inline-block h-7 w-7 rounded-full ring-2 ring-white/30 bg-target grid place-items-center font-bold text-ink text-[10px]">
              JD
            </span>
            <span className="inline-block h-7 w-7 rounded-full ring-2 ring-white/30 bg-body grid place-items-center font-bold text-ink text-[10px]">
              SK
            </span>
            <span className="inline-block h-7 w-7 rounded-full ring-2 ring-white/30 bg-good grid place-items-center font-bold text-ink text-[10px]">
              AR
            </span>
          </div>
          <div>
            <span className="font-display font-bold uppercase tracking-wider text-white">Join Our Community</span>
            <span className="block text-[11px] text-white/60">100K+ Active Members & AI Sessions</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/coach" className="hover:text-white transition-colors">Live Camera</Link>
          <span>•</span>
          <Link to="/review" className="hover:text-white transition-colors">Video Review</Link>
          <span>•</span>
          <Link to="/profile" className="hover:text-white transition-colors">Calibration</Link>
        </div>
      </footer>
    </div>
  );
}

