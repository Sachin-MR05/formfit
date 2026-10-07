import { describe, expect, it } from 'vitest';
import { BORDERLINE_MIN, GOOD_MIN } from './bands.ts';
import { createEngine, GENERIC_FEATURES, PERSONALIZED_FEATURES } from './engine.ts';
import { predictProba } from './network.ts';
import { close, configJson, engine, fixtures, modelJson } from './test-utils.ts';

describe('network parity with scikit-learn / numpy', () => {
  it('reproduces both networks on 100 rows', () => {
    fixtures.network.forEach((c, i) => {
      close(`network[${i}].personalized`, predictProba(engine.personalized, c.x), c.personalized);
      close(`network[${i}].generic`, predictProba(engine.generic, c.x.slice(0, 5)), c.generic);
    });
  });

  it('exported model and fixtures come from the same export run', () => {
    expect(engine.modelVersion).toBe(fixtures.model_version);
  });

  it('feature order matches what the engine builds', () => {
    expect(engine.personalized.features).toEqual([...PERSONALIZED_FEATURES]);
    expect(engine.generic.features).toEqual([...GENERIC_FEATURES]);
  });

  it('rejects a feature vector of the wrong length', () => {
    expect(() => predictProba(engine.personalized, [1, 2, 3])).toThrow();
  });

  it('refuses a model whose feature order differs from the engine', () => {
    const bad = { ...engine.personalized, features: [...engine.personalized.features].reverse() };
    expect(() => createEngine(configJson, { ...modelJson, personalized: bad })).toThrow();
  });

  it('score band thresholds in code match the exported config', () => {
    expect(GOOD_MIN).toBe(engine.config.scoreGoodMin);
    expect(BORDERLINE_MIN).toBe(engine.config.scoreBorderlineMin);
  });
});
