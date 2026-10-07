import { describe, expect, it } from 'vitest';
import type { CueCode, ScoreBand } from '../../engine/index.ts';
import { countPhrase } from './phrases.ts';
import { CueScheduler, type RepInput } from './scheduler.ts';
import type { VoiceStyle } from './types.ts';

const PRIORITY: Record<CueCode, number> = { knee_travel: 1, depth_short: 2, torso_forward: 3, torso_upright: 3 };
const rep = (index: number, codes: CueCode[] = [], band: ScoreBand = codes.length ? 'borderline' : 'good'): RepInput => ({
  index,
  score: band === 'good' ? 90 : 50,
  band,
  cues: [...codes].sort((a, b) => PRIORITY[a] - PRIORITY[b]).map((code) => ({ code, priority: PRIORITY[code] })),
});
const make = (style: VoiceStyle = 'calm') => new CueScheduler(() => style);

describe('countPhrase', () => {
  it('speaks small numbers as words and large ones as digits', () => {
    expect(countPhrase(1)).toBe('One.');
    expect(countPhrase(12)).toBe('Twelve.');
    expect(countPhrase(20)).toBe('Twenty.');
    expect(countPhrase(21)).toBe('21.');
  });
});

describe('after a rep: the count plus at most one correction', () => {
  it('merges the count and the most urgent correction into one utterance', () => {
    const u = make().onRep(rep(7, ['torso_forward', 'depth_short']))!;
    expect(u.text.startsWith('Seven. ')).toBe(true);
    expect(u.code).toBe('depth_short'); // depth outranks balance
    expect(u.kind).toBe('cue');
    expect(u.haptic).toBe(true);
    expect(u.interrupt).toBe(false);
  });

  it('puts safety (knee travel) above everything else', () => {
    expect(make().onRep(rep(1, ['torso_forward', 'depth_short', 'knee_travel']))!.code).toBe('knee_travel');
  });

  it('does not repeat the same correction every rep, and rotates the wording', () => {
    const s = make();
    const first = s.onRep(rep(1, ['torso_forward']))!;
    const second = s.onRep(rep(2, ['torso_forward']))!;
    const third = s.onRep(rep(3, ['torso_forward']))!;
    expect(first.kind).toBe('cue');
    expect(second.kind).toBe('count'); // cooldown: just the count
    expect(second.text).toBe('Two.');
    expect(third.kind).toBe('cue');
    expect(third.text.split('. ').slice(1).join('. ')).not.toBe(first.text.split('. ').slice(1).join('. '));
  });

  it('moves on to the next issue while the first is cooling down', () => {
    const s = make();
    s.onRep(rep(1, ['torso_forward']));
    const u = s.onRep(rep(2, ['torso_forward', 'depth_short']))!;
    expect(u.code).toBe('depth_short');
  });

  it('only counts when a mediocre rep has no specific issue', () => {
    expect(make().onRep(rep(4, [], 'borderline'))!.text).toBe('Four.');
  });
});

describe('praise is occasional', () => {
  it('praises the first clean rep, then only every third', () => {
    const s = make();
    const kinds = [1, 2, 3, 4, 5].map((i) => s.onRep(rep(i))!.kind);
    expect(kinds).toEqual(['praise', 'count', 'count', 'praise', 'count']);
  });
  it('motivating style uses its own praise', () => {
    expect(make('motivating').onRep(rep(1))!.text).toMatch(/Great rep|Perfect form|Strong/);
  });
});

describe('count-only style', () => {
  it('speaks just the count, never a correction or live cue', () => {
    const s = make('count');
    expect(s.onRep(rep(3, ['knee_travel', 'depth_short']))!.text).toBe('Three.');
    expect(s.onFrame(true, ['knee_travel'], 1)).toBeNull();
  });
});

describe('live cues during the descent', () => {
  it('only speaks the urgent safety cue, once per rep, interrupting', () => {
    const s = make();
    expect(s.onFrame(true, ['torso_forward', 'depth_short'], 0)).toBeNull();
    const u = s.onFrame(true, ['knee_travel', 'torso_forward'], 0.5)!;
    expect(u.kind).toBe('safety');
    expect(u.interrupt).toBe(true);
    expect(s.onFrame(true, ['knee_travel'], 0.6)).toBeNull(); // already said this rep
  });

  it('waits between safety cues across reps, and speaks again once the cooldown has passed', () => {
    const s = make();
    expect(s.onFrame(true, ['knee_travel'], 0)).not.toBeNull();
    s.onFrame(false, [], 3);
    expect(s.onFrame(true, ['knee_travel'], 4)).toBeNull(); // new rep, but only 4 s later
    s.onFrame(false, [], 5);
    expect(s.onFrame(true, ['knee_travel'], 10)).not.toBeNull();
  });

  it('does not say the same safety cue again right after the rep', () => {
    const s = make();
    s.onFrame(true, ['knee_travel'], 0);
    const u = s.onRep(rep(1, ['knee_travel', 'torso_forward']))!;
    expect(u.code).toBe('torso_forward'); // knee travel was already said live
  });

  it('is silent while standing', () => {
    expect(make().onFrame(false, ['knee_travel'], 0)).toBeNull();
  });
});

describe('set summary and profile announcements', () => {
  it('summarises the set', () => {
    expect(make().onSetFinished({ count: 8, average: 84 }).text).toBe('Set complete. 8 reps, average 84.');
    expect(make('count').onSetFinished({ count: 1, average: 90 }).text).toBe('Set complete. 1 rep.');
    expect(make('motivating').onSetFinished({ count: 8, average: 84 }).text).toContain('Nice work');
  });
  it('is honest about an average build', () => {
    expect(make().onProfileReady('average').text).toContain('not personalized');
    expect(make().onProfileReady('measured').text).toContain('Calibrated');
  });
});

describe('reset', () => {
  it('forgets cooldowns when a new source starts', () => {
    const s = make();
    s.onRep(rep(1, ['torso_forward']));
    expect(s.onRep(rep(2, ['torso_forward']))!.kind).toBe('count');
    s.reset();
    expect(s.onRep(rep(1, ['torso_forward']))!.kind).toBe('cue');
  });
});
