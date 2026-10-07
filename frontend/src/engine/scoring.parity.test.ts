import { describe, expect, it } from 'vitest';
import { coach } from './coach.ts';
import { scoreRep } from './scoring.ts';
import { close, engine, fixtures, toProfile } from './test-utils.ts';

describe('scoring + cue parity with the Python reference', () => {
  it('has fixtures for both phases', () => {
    expect(fixtures.scores.some((c) => c.phase === 'rep')).toBe(true);
    expect(fixtures.scores.some((c) => c.phase === 'live')).toBe(true);
  });

  it('scores and cue codes match on every case', () => {
    fixtures.scores.forEach((c, i) => {
      const profile = toProfile(c.profile);
      const s = scoreRep(engine, c.features, profile);
      const k = coach(engine.config, c.features, profile, c.phase);
      const e = c.expected;
      close(`scores[${i}].personalized`, s.personalized, e.personalized);
      close(`scores[${i}].generic`, s.generic, e.generic);
      expect(s.ruleOk).toBe(e.rule_ok);
      expect(s.ruleReasons).toEqual(e.rule_reasons);
      close(`scores[${i}].target`, k.target, e.target);
      close(`scores[${i}].diff`, k.diff, e.diff);
      expect(k.torso).toBe(e.torso);
      expect(k.depthOk).toBe(e.depth_ok);
      expect(k.alphaHigh).toBe(e.alpha_high);
      expect(k.codes).toEqual(e.codes);
    });
  });
});

describe('coach cues', () => {
  const profile = { femurTorso: 1.0, shankFemur: 0.95, legTorso: 1.95, upSign: -1 as const };
  const base = () => {
    const target = coach(engine.config, { knee: 60, hip: 50, torso: 0, shank: 38, phi: -5 }, profile).target;
    return { knee: 60, hip: 50, torso: target, shank: 38, phi: -5 };
  };

  it('stays quiet when the form matches this body', () => {
    expect(coach(engine.config, base(), profile).cues).toHaveLength(0);
  });

  it('flags forward lean and an upright torso relative to the personal target', () => {
    const f = base();
    expect(coach(engine.config, { ...f, torso: f.torso + 20 }, profile).codes).toEqual(['torso_forward']);
    expect(coach(engine.config, { ...f, torso: f.torso - 20 }, profile).codes).toEqual(['torso_upright']);
  });

  it('only mentions missed depth for a finished rep, never during the descent', () => {
    const shallow = { ...base(), phi: 20 };
    expect(coach(engine.config, shallow, profile, 'rep').codes).toContain('depth_short');
    expect(coach(engine.config, shallow, profile, 'live').codes).not.toContain('depth_short');
  });

  it('orders cues safety > depth > balance and provides short spoken text', () => {
    const f = { ...base(), shank: 60, phi: 20, torso: 80 };
    const r = coach(engine.config, f, profile, 'rep');
    expect(r.cues.map((c) => c.priority)).toEqual([...r.cues.map((c) => c.priority)].sort((a, b) => a - b));
    expect(r.cues[0]!.code).toBe('knee_travel');
    expect(r.cues.every((c) => c.spoken.length > 0 && c.spoken.length < 60)).toBe(true);
  });
});
