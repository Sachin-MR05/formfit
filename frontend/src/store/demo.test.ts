import { describe, expect, it } from 'vitest';
import { useDemoStore } from './demo';

describe('useDemoStore', () => {
  it('clamps the score to 0-100', () => {
    useDemoStore.getState().setScore(150);
    expect(useDemoStore.getState().score).toBe(100);
    useDemoStore.getState().setScore(-5);
    expect(useDemoStore.getState().score).toBe(0);
    useDemoStore.getState().setScore(64);
    expect(useDemoStore.getState().score).toBe(64);
  });
});
