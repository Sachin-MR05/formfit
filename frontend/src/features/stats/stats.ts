/** Statistics for the dashboard and history. Pure functions over locally stored sessions and reps (no DOM, no clock). */
import { BORDERLINE_MIN, GOOD_MIN, type CueCode } from '../../engine/index.ts';
import type { StoredRep, StoredSession } from '../session/types.ts';

export const MS_DAY = 86_400_000;

/** Minutes to ADD to UTC to get local time (e.g. India +330). In the browser: -new Date().getTimezoneOffset(). */
export type TzOffsetMin = number;
export const localOffsetMin = (): TzOffsetMin => -new Date().getTimezoneOffset();

/** 'YYYY-MM-DD' of a timestamp in the given timezone. */
export function dayKey(ms: number, tz: TzOffsetMin): string {
  return new Date(ms + tz * 60_000).toISOString().slice(0, 10);
}

export function shiftDay(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * MS_DAY).toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(key: string): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ------------------------------------------------------------------ per day
export interface DailyStat {
  day: string;
  reps: number;
  avg: number;
  best: number;
}

export function dailyStats(reps: readonly StoredRep[], tz: TzOffsetMin): Map<string, DailyStat> {
  const buckets = new Map<string, number[]>();
  for (const r of reps) {
    const k = dayKey(r.createdAt, tz);
    const b = buckets.get(k);
    if (b) b.push(r.score);
    else buckets.set(k, [r.score]);
  }
  const out = new Map<string, DailyStat>();
  for (const [day, scores] of buckets) out.set(day, { day, reps: scores.length, avg: mean(scores)!, best: Math.max(...scores) });
  return out;
}

/** Consecutive training days ending today (or yesterday: the streak is not broken until a whole day passes without training). */
export function currentStreak(days: ReadonlySet<string>, today: string): number {
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

export function longestStreak(days: ReadonlySet<string>): number {
  let best = 0;
  for (const d of days) {
    if (days.has(shiftDay(d, -1))) continue; // not the start of a run
    let n = 0;
    for (let c = d; days.has(c); c = shiftDay(c, 1)) n += 1;
    best = Math.max(best, n);
  }
  return best;
}

// ------------------------------------------------------------------ weekly summary
export interface WeekSummary {
  reps: number;
  avg: number | null;
  prevReps: number;
  prevAvg: number | null;
  /** this week's average minus last week's (null if either week is empty) */
  delta: number | null;
}

/** The last 7 days (today included) against the 7 days before. */
export function weekSummary(reps: readonly StoredRep[], nowMs: number, tz: TzOffsetMin): WeekSummary {
  const today = dayKey(nowMs, tz);
  const thisFrom = shiftDay(today, -6);
  const prevFrom = shiftDay(today, -13);
  const cur: number[] = [];
  const prev: number[] = [];
  for (const r of reps) {
    const k = dayKey(r.createdAt, tz);
    if (k >= thisFrom && k <= today) cur.push(r.score);
    else if (k >= prevFrom && k < thisFrom) prev.push(r.score);
  }
  const avg = mean(cur);
  const prevAvg = mean(prev);
  return { reps: cur.length, avg, prevReps: prev.length, prevAvg, delta: avg !== null && prevAvg !== null ? avg - prevAvg : null };
}

// ------------------------------------------------------------------ calendar heatmap
export interface HeatCell {
  day: string;
  /** week column, 0 = oldest */
  col: number;
  /** 0 = Monday */
  row: number;
  reps: number;
  avg: number | null;
}

/** A Monday-first grid of the last `weeks` weeks ending with the current one; days after today are left out. */
export function heatmap(daily: ReadonlyMap<string, DailyStat>, today: string, weeks = 12): HeatCell[] {
  const thisMonday = shiftDay(today, -weekdayIndex(today));
  const start = shiftDay(thisMonday, -(weeks - 1) * 7);
  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const day = shiftDay(start, i);
    if (day > today) break;
    const d = daily.get(day);
    cells.push({ day, col: Math.floor(i / 7), row: i % 7, reps: d?.reps ?? 0, avg: d ? d.avg : null });
  }
  return cells;
}

// ------------------------------------------------------------------ sessions
export interface SessionSummary {
  id: string;
  startedAt: number;
  source: 'live' | 'upload';
  fileName: string | null;
  reps: number;
  avg: number | null;
  best: number | null;
  /** reps the model judged good form (score at or above the borderline threshold) */
  passed: number;
  /** waiting to be uploaded to the account */
  pending: boolean;
}

export function summarizeSessions(sessions: readonly StoredSession[], reps: readonly StoredRep[]): SessionSummary[] {
  const bySession = new Map<string, number[]>();
  for (const r of reps) {
    const b = bySession.get(r.sessionId);
    if (b) b.push(r.score);
    else bySession.set(r.sessionId, [r.score]);
  }
  return sessions
    .filter((s) => !s.deleted)
    .map((s) => {
      const scores = bySession.get(s.id) ?? [];
      return {
        id: s.id,
        startedAt: s.startedAt,
        source: s.source,
        fileName: s.fileName,
        reps: scores.length,
        avg: mean(scores),
        best: scores.length ? Math.max(...scores) : null,
        passed: scores.filter((x) => x >= BORDERLINE_MIN).length,
        pending: s.syncedVersion !== s.updatedAt,
      };
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** Average score per session, oldest to newest (sessions without reps are skipped), at most `max` points. */
export function trend(summaries: readonly SessionSummary[], max = 30): Array<{ id: string; at: number; value: number }> {
  return summaries
    .filter((s) => s.avg !== null)
    .map((s) => ({ id: s.id, at: s.startedAt, value: s.avg! }))
    .sort((a, b) => a.at - b.at)
    .slice(-max);
}

// ------------------------------------------------------------------ faults, best rep, badges
export const CUE_CODES: readonly CueCode[] = ['torso_forward', 'torso_upright', 'knee_travel', 'depth_short'];

export function faultCounts(reps: readonly StoredRep[]): Record<CueCode, number> {
  const out: Record<CueCode, number> = { torso_forward: 0, torso_upright: 0, knee_travel: 0, depth_short: 0 };
  for (const r of reps) for (const c of r.codes) out[c] += 1;
  return out;
}

export function bestRep(reps: readonly StoredRep[]): StoredRep | null {
  let best: StoredRep | null = null;
  for (const r of reps) if (!best || r.score > best.score || (r.score === best.score && r.createdAt > best.createdAt)) best = r;
  return best;
}

/** Longest run of consecutive reps (in time order) at "good" level. */
export function longestCleanRun(reps: readonly StoredRep[]): number {
  let best = 0;
  let run = 0;
  for (const r of [...reps].sort((a, b) => a.createdAt - b.createdAt)) {
    run = r.score >= GOOD_MIN ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  progress: string;
}

export function badges(reps: readonly StoredRep[], streak: number, longest: number): Badge[] {
  const total = reps.length;
  const clean = longestCleanRun(reps);
  const best = bestRep(reps)?.score ?? 0;
  const mk = (id: string, title: string, description: string, value: number, goal: number): Badge => ({
    id, title, description, earned: value >= goal, progress: `${Math.min(value, goal)} / ${goal}`,
  });
  return [
    mk('first-rep', 'First rep', 'Complete your first scored rep.', total, 1),
    mk('hundred-reps', '100 reps', 'Log 100 scored reps in total.', total, 100),
    mk('clean-ten', 'Ten clean in a row', `Ten reps in a row scoring ${GOOD_MIN} or more.`, clean, 10),
    mk('streak-seven', 'Seven-day streak', 'Train on seven days in a row.', Math.max(streak, longest), 7),
    mk('score-ninety', 'Ninety club', 'Score 90 or more on a rep.', best, 90),
  ];
}

