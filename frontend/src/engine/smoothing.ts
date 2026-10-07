import type { FrameFeatures } from './types.ts';

const CHANNELS = ['knee', 'hip', 'torso', 'shank', 'phi'] as const;

/** Exponential moving average over the five kinematic channels (first sample passes through). */
export class FeatureSmoother {
  private state: FrameFeatures | null = null;

  constructor(private readonly alpha: number) {}

  reset(): void {
    this.state = null;
  }

  update(raw: FrameFeatures): FrameFeatures {
    if (this.state === null) {
      this.state = { knee: raw.knee, hip: raw.hip, torso: raw.torso, shank: raw.shank, phi: raw.phi };
    } else {
      const next = { ...this.state };
      for (const k of CHANNELS) next[k] = this.alpha * raw[k] + (1 - this.alpha) * this.state[k];
      this.state = next;
    }
    return { ...this.state };
  }
}
