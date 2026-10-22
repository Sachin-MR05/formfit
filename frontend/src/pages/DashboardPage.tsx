import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Heatmap } from '@/components/charts/Heatmap';
import { LineChart } from '@/components/charts/LineChart';
import { ArrowRight } from '@/components/icons';
import { Pill } from '@/components/ui/Pill';
import { Tile } from '@/components/ui/Tile';
import { useCoach } from '@/features/session/defaultRuntime.ts';
import { useLocalData } from '@/features/session/useLocalData.ts';
import { useAuth } from '@/features/sync/defaultSync.ts';
import {
  badges, bestRep, currentStreak, dailyStats, dayKey, faultCounts, heatmap, localOffsetMin, longestStreak, summarizeSessions, trend, weekSummary, CUE_CODES,
} from '@/features/stats/stats.ts';
import { formatDate } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';
import { scoreBand } from '@/lib/score';

const FAULT_LABEL = {
  torso_forward: 'Chest folding forward',
  torso_upright: 'Too upright',
  knee_travel: 'Knees travelling far forward',
  depth_short: 'Not deep enough',
} as const;

const BAND_TONE = { good: 'good', borderline: 'borderline', fix: 'fix' } as const;

export function DashboardPage() {
  usePageTitle('Dashboard');
  const { data } = useLocalData();
  const profile = useCoach((s) => s.profile);
  const name = useAuth((s) => s.user?.displayName);

  const stats = useMemo(() => {
    if (!data) return null;
    const tz = localOffsetMin();
    const now = Date.now();
    const today = dayKey(now, tz);
    const daily = dailyStats(data.reps, tz);
    const days = new Set(daily.keys());
    const streak = currentStreak(days, today);
    const longest = longestStreak(days);
    const summaries = summarizeSessions(data.sessions, data.reps);
    const recent = [...data.reps].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    return {
      week: weekSummary(data.reps, now, tz),
      streak,
      summaries,
      trend: trend(summaries, 30),
      heat: heatmap(daily, today, 12),
      best: bestRep(data.reps),
      faults: faultCounts(recent),
      badges: badges(data.reps, streak, longest),
      total: data.reps.length,
    };
  }, [data]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (!stats) return <p className="text-sm text-ink-soft" role="status">Loading your data…</p>;
  const topFaults = CUE_CODES.map((c) => ({ code: c, n: stats.faults[c] })).filter((f) => f.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);

  return (
    <main className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-soft">{greeting}{name ? `, ${name}` : ''}</p>
          <h1 className="font-display text-4xl font-black uppercase leading-none">Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/coach" className="rounded-pill bg-ink px-6 py-3 text-sm font-bold text-white">Start session</Link>
          <Link to="/review" className="rounded-pill bg-white px-6 py-3 text-sm font-bold ring-1 ring-black/10">Review a video</Link>
        </div>
      </div>

      {!profile && (
        <Tile tone="borderline">
          <p className="font-semibold">Personalize first, so your scores fit your body.</p>
          <p className="mt-1 text-sm">A standing side-view photo takes about a minute.</p>
          <Link to="/onboarding" className="mt-3 inline-block rounded-pill bg-ink px-5 py-2.5 text-sm font-semibold text-white">Set up my profile</Link>
        </Tile>
      )}

      {stats.total === 0 ? (
        <Tile tone="sand">
          <p className="font-display text-2xl font-black uppercase">No reps yet</p>
          <p className="mt-1 text-sm text-ink-soft">Finish your first set in Live Coach (or analyse a video) and your trends, streak and badges appear here.</p>
        </Tile>
      ) : (
        <div className="grid gap-3 md:grid-cols-12">
          <Tile tone="good" className="md:col-span-5">
            <p className="text-xs font-extrabold uppercase tracking-wide">This week</p>
            <div className="mt-1 flex items-end gap-3">
              <span className="font-display text-6xl font-black leading-none">{stats.week.avg === null ? '–' : Math.round(stats.week.avg)}</span>
              <span className="pb-1 text-sm text-ink-soft">average score</span>
            </div>
            <p className="mt-2 text-sm">
              {stats.week.delta === null ? 'Not enough data from last week to compare.' : stats.week.delta >= 0 ? `Up ${stats.week.delta.toFixed(1)} points on last week` : `Down ${Math.abs(stats.week.delta).toFixed(1)} points on last week`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{stats.week.reps} reps</Pill>
              <Pill tone="borderline">{stats.streak} day streak</Pill>
            </div>
          </Tile>

          <Tile tone="target" className="md:col-span-3">
            <p className="text-xs font-extrabold uppercase tracking-wide">Best rep</p>
            <p className="font-display text-5xl font-black">{stats.best?.score ?? '–'}</p>
            <p className="text-sm text-ink-soft">{stats.best ? formatDate(stats.best.createdAt) : ''}</p>
          </Tile>

          <Tile tone="body" className="md:col-span-4">
            <p className="text-xs font-extrabold uppercase tracking-wide">Focus areas (last 50 reps)</p>
            {topFaults.length === 0 ? (
              <p className="mt-2 text-sm">No recurring faults. Keep it up!</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {topFaults.map((f) => (
                  <li key={f.code}><Pill tone="borderline">{FAULT_LABEL[f.code]} · {f.n}</Pill></li>
                ))}
              </ul>
            )}
            <Link to="/history" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline">All sessions <ArrowRight size={14} /></Link>
          </Tile>

          <Tile tone="white" className="border border-black/5 md:col-span-7">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide">Score trend (average per session)</p>
            <LineChart
              label="Average score per session over time"
              points={stats.trend.map((p, i) => ({ x: i, y: p.value, label: formatDate(p.at) }))}
              yDomain={[0, 100]}
            />
          </Tile>

          <Tile tone="white" className="border border-black/5 md:col-span-5">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide">Last 12 weeks</p>
            <Heatmap cells={stats.heat} label="Calendar of training days coloured by average score" />
          </Tile>

          <Tile tone="sand" className="md:col-span-12">
            <p className="text-xs font-extrabold uppercase tracking-wide">Recent sessions</p>
            <ul className="mt-2 divide-y divide-black/10">
              {stats.summaries.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link to={`/history/${s.id}`} className="flex items-center gap-3 py-2.5">
                    <span className="w-44 text-sm">{formatDate(s.startedAt)}</span>
                    <span className="flex-1 text-sm text-ink-soft">{s.source === 'live' ? 'Live camera' : `Video: ${s.fileName ?? ''}`} · {s.reps} reps</span>
                    {s.avg !== null && <Pill tone={BAND_TONE[scoreBand(s.avg)]}>{Math.round(s.avg)}</Pill>}
                    <ArrowRight size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </Tile>

          <Tile tone="white" className="border border-black/5 md:col-span-12">
            <p className="text-xs font-extrabold uppercase tracking-wide">Badges</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {stats.badges.map((b) => (
                <li key={b.id} className={`rounded-2xl p-3 text-sm ${b.earned ? 'bg-good' : 'bg-canvas'}`}>
                  <p className="font-bold">{b.earned ? '✓ ' : ''}{b.title}</p>
                  <p className="text-xs text-ink-soft">{b.description}</p>
                  <p className="mt-1 text-xs font-medium">{b.earned ? 'Earned' : b.progress}</p>
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      )}
    </main>
  );
}
