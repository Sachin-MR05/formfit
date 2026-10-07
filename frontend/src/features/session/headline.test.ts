import { describe, expect, it } from 'vitest';
import { headlineFor } from './headline.ts';
import type { RepView } from './store.ts';

const rep = (over: Partial<RepView>): RepView => ({
  id: 'x', index: 1, tSeconds: 0, score: 80, band: 'good', personalized: 0.8, generic: 0.7, ruleOk: true, ruleReasons: [], codes: [], cues: [],
  downS: 1, upS: 1, features: { knee: 60, hip: 50, torso: 35, shank: 38, phi: -5 }, label: null, ...over,
});

describe('headlineFor', () => {
  it('invites the first rep when there is none', () => expect(headlineFor(null)).toBe('Start squatting.'));
  it('is positive for a clean good rep', () => expect(headlineFor(rep({}))).toBe('Clean rep. Steady.'));
  it('is neutral for a mediocre rep without a specific issue', () => expect(headlineFor(rep({ band: 'borderline', score: 60 }))).toBe('Keep going.'));
  it('uses the most urgent cue when there is one', () => {
    const cues = [{ code: 'knee_travel' as const, priority: 1, text: 'long text', spoken: 'Knees are travelling far forward.' }];
    expect(headlineFor(rep({ cues, codes: ['knee_travel'] }))).toBe('Knees are travelling far forward.');
  });
});
