import { describe, expect, it } from 'vitest';
import type { StoredRep, StoredSession } from '../session/types.ts';
import {
  MS_DAY, badges, bestRep, currentStreak, dailyStats, dayKey, faultCounts, heatmap, longestCleanRun, longestStreak, shiftDay,
  summarizeSessions, trend, weekSummary, weekdayIndex,
} from './stats.ts';

const DAY0 = Date.UTC(2026, 9, 7, 12); // Wed 2026-10-07 12:00 UTC
const ratios = { femurTorso: 1, shankFemur: 1, legTorso: 2, upSign: -1 as const };
const rep = (id: string, daysAgo: number, score: number, over: Partial<StoredRep> = {}, sessionId = 's1'): StoredRep => ({
  id, sessionId, index: 1, createdAt: DAY0 - daysAgo * MS_DAY, updatedAt: 1, syncedVersion: 1, tSeconds: 1,
  features: { knee: 60, hip: 50, torso: 35, shank: 38, phi: -5 }, profile: ratios, score, personalized: score / 100, generic: 0.5, ruleOk: true,
  ruleReasons: [], codes: [], downS: 1, upS: 1, modelVersion: 'v', label: null, ...over,
});
const session = (id: string, daysAgo: number, over: Partial<StoredSession> = {}): StoredSession => ({
  id, startedAt: DAY0 - daysAgo * MS_DAY, endedAt: null, updatedAt: 1, syncedVersion: 1, source: 'live', fileName: null, poseModel: 'full', modelVersion: 'v', profile: ratios, ...over,
});

describe('days', () => {
  it('keys days in the given timezone', () => {
    const ms = Date.UTC(2026, 9, 7, 22, 0); // 22:00 UTC
    expect(dayKey(ms, 0)).toBe('2026-10-07');
    expect(dayKey(ms, 330)).toBe('2026-10-08'); // India is already past midnight
    expect(dayKey(ms, -300)).toBe('2026-10-07');
  });
  it('shifts days across month boundaries and finds the weekday', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayIndex('2026-10-05')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-11')).toBe(6); // Sunday
  });
});

describe('streaks', () => {
  const days = (...d: string[]) => new Set(d);
  it('counts consecutive days ending today', () => {
    expect(currentStreak(days('2026-10-07', '2026-10-06', '2026-10-05'), '2026-10-07')).toBe(3);
  });
  it('is not broken until a whole day is missed', () => {
    expect(currentStreak(days('2026-10-06', '2026-10-05'), '2026-10-07')).toBe(2); // not trained yet today
    expect(currentStreak(days('2026-10-05'), '2026-10-07')).toBe(0);
    expect(currentStreak(days(), '2026-10-07')).toBe(0);
  });
  it('finds the longest run anywhere', () => {
    expect(longestStreak(days('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-07', '2026-10-08'))).toBe(3);
    expect(longestStreak(days())).toBe(0);
  });
});

describe('daily and weekly numbers', () => {
  const reps = [rep('a', 0, 80), rep('b', 0, 60), rep('c', 1, 90), rep('d', 8, 50), rep('e', 9, 70), rep('f', 30, 99)];
  it('averages per day', () => {
    const d = dailyStats(reps, 0);
    expect(d.get('2026-10-07')).toEqual({ day: '2026-10-07', reps: 2, avg: 70, best: 80 });
    expect(d.size).toBe(5);
  });
  it('compares the last 7 days with the 7 before', () => {
    const w = weekSummary(reps, DAY0, 0);
    expect([w.reps, w.avg, w.prevReps, w.prevAvg, w.delta]).toEqual([3, (80 + 60 + 90) / 3, 2, 60, (80 + 60 + 90) / 3 - 60]);
  });
  it('has no delta when a week is empty', () => {
    expect(weekSummary([rep('a', 0, 80)], DAY0, 0).delta).toBeNull();
    expect(weekSummary([], DAY0, 0)).toEqual({ reps: 0, avg: null, prevReps: 0, prevAvg: null, delta: null });
  });
});

describe('heatmap', () => {
  const daily = dailyStats([rep('a', 0, 80), rep('b', 2, 40)], 0);
  const cells = heatmap(daily, '2026-10-07', 4);
  it('is a Monday-first grid ending today', () => {
    expect(cells[0]).toMatchObject({ day: '2026-09-14', col: 0, row: 0 }); // Monday three weeks before this week's Monday
    const last = cells[cells.length - 1]!;
    expect(last).toMatchObject({ day: '2026-10-07', col: 3, row: 2, reps: 1, avg: 80 }); // Wednesday
    expect(cells.length).toBe(3 * 7 + 3); // days after today are not drawn
  });
  it('marks empty days', () => {
    expect(cells.find((c) => c.day === '2026-10-06')).toMatchObject({ reps: 0, avg: null });
    expect(cells.find((c) => c.day === '2026-10-05')).toMatchObject({ reps: 1, avg: 40 });
  });
});

describe('sessions', () => {
  const sessions = [session('s1', 3), session('s2', 1, { source: 'upload', fileName: 'a.mp4', syncedVersion: null }), session('s3', 0, { deleted: true }), session('s4', 5)];
  const reps = [rep('a', 3, 80, {}, 's1'), rep('b', 3, 40, {}, 's1'), rep('c', 1, 95, {}, 's2')];
  const sum = summarizeSessions(sessions, reps);
  it('summarises newest first and hides deleted sessions', () => {
    expect(sum.map((s) => s.id)).toEqual(['s2', 's1', 's4']);
  });
  it('computes counts, average, best, passed and pending', () => {
    expect(sum.find((s) => s.id === 's1')).toMatchObject({ reps: 2, avg: 60, best: 80, passed: 1, pending: false });
    expect(sum.find((s) => s.id === 's2')).toMatchObject({ reps: 1, avg: 95, pending: true, fileName: 'a.mp4' });
    expect(sum.find((s) => s.id === 's4')).toMatchObject({ reps: 0, avg: null, best: null });
  });
  it('builds a trend, oldest first, skipping empty sessions', () => {
    expect(trend(sum).map((p) => [p.id, p.value])).toEqual([['s1', 60], ['s2', 95]]);
    expect(trend(sum, 1).map((p) => p.id)).toEqual(['s2']);
  });
});

describe('faults, best rep, badges', () => {
  const reps = [
    rep('a', 5, 60, { codes: ['torso_forward', 'depth_short'] }), rep('b', 4, 95, { codes: [] }), rep('c', 3, 95, { codes: ['torso_forward'] }),
  ];
  it('counts each kind of fault', () => {
    expect(faultCounts(reps)).toEqual({ torso_forward: 2, torso_upright: 0, knee_travel: 0, depth_short: 1 });
  });
  it('picks the best rep, newest on ties', () => {
    expect(bestRep(reps)?.id).toBe('c');
    expect(bestRep([])).toBeNull();
  });
  it('finds the longest run of good reps in time order', () => {
    const run = [rep('1', 6, 80), rep('2', 5, 75), rep('3', 4, 50), rep('4', 3, 90), rep('5', 2, 91), rep('6', 1, 92)];
    expect(longestCleanRun(run)).toBe(3);
    expect(longestCleanRun([])).toBe(0);
  });
  it('awards badges with progress', () => {
    const b = Object.fromEntries(badges(reps, 2, 3).map((x) => [x.id, x]));
    expect(b['first-rep']!.earned).toBe(true);
    expect(b['hundred-reps']).toMatchObject({ earned: false, progress: '3 / 100' });
    expect(b['score-ninety']!.earned).toBe(true);
    expect(b['streak-seven']).toMatchObject({ earned: false, progress: '3 / 7' });
    expect(badges([], 0, 0).every((x) => !x.earned)).toBe(true);
    expect(badges([], 7, 7).find((x) => x.id === 'streak-seven')!.earned).toBe(true);
  });
});
