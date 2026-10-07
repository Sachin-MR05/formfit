import type { EngineConfig } from './config.ts';
import type { FrameFeatures } from './types.ts';

export interface RepEvent {
  startT: number;
  bottomT: number;
  endT: number;
  /** seconds from the start of the descent to the lowest point */
  downS: number;
  /** seconds from the lowest point back to standing */
  upS: number;
  minKnee: number;
  /** features at the lowest point (this is what gets scored) */
  bottom: FrameFeatures;
}

interface OpenRep {
  startT: number;
  minPhi: number;
  minKnee: number;
  bottom: FrameFeatures | null;
  bottomT: number | null;
}

/**
 * Rep state machine driven by smoothed frames. A rep starts when the knee bends past `repStartKnee`,
 * its bottom is the frame with the lowest thigh elevation, and it ends when the knee extends past
 * `repEndKnee`. Dips that never reach `minRepKnee` are ignored. Tempo = downS / upS.
 */
export class RepTracker {
  private phase: 'standing' | 'down' = 'standing';
  private rep: OpenRep | null = null;

  constructor(private readonly cfg: EngineConfig) {}

  reset(): void {
    this.phase = 'standing';
    this.rep = null;
  }

  /** True while a descent/ascent is in progress. */
  get inRep(): boolean {
    return this.phase === 'down';
  }

  update(t: number, f: FrameFeatures): RepEvent | null {
    const c = this.cfg;
    if (this.phase === 'standing' && f.knee < c.repStartKnee) {
      this.phase = 'down';
      this.rep = { startT: t, minPhi: 999, minKnee: 999, bottom: null, bottomT: null };
    }
    if (this.phase === 'down' && this.rep) {
      const r = this.rep;
      r.minKnee = Math.min(r.minKnee, f.knee);
      if (f.phi < r.minPhi) {
        r.minPhi = f.phi;
        r.bottom = { knee: f.knee, hip: f.hip, torso: f.torso, shank: f.shank, phi: f.phi };
        r.bottomT = t;
      }
      if (f.knee > c.repEndKnee) {
        this.phase = 'standing';
        this.rep = null;
        if (r.bottom === null || r.bottomT === null || r.minKnee > c.minRepKnee) return null; // too shallow to count
        return {
          startT: r.startT,
          bottomT: r.bottomT,
          endT: t,
          downS: r.bottomT - r.startT,
          upS: t - r.bottomT,
          minKnee: r.minKnee,
          bottom: r.bottom,
        };
      }
    }
    return null;
  }
}
