/**
 * CueScheduler: decides WHAT to say and WHEN. Pure logic (no speech, no DOM, no clock of its own), so it is
 * fully testable. Principles:
 *   - Descent: only urgent safety cues, at most once per rep.
 *   - After the rep: the count plus at most ONE correction (most urgent first), merged into one utterance.
 *   - The same correction is not repeated every rep (cooldown), and phrases rotate.
 *   - Praise is occasional, not constant.
 */
import type { CueCode, ScoreBand } from '../../engine/index.ts';
import { AVERAGE_BUILD_PHRASE, CUE_PHRASES, PRAISE_PHRASES, PROFILE_READY_PHRASE, countPhrase, summaryPhrase } from './phrases.ts';
import type { Utterance, VoiceStyle } from './types.ts';

export interface SchedulerOptions {
  /** a correction can be spoken again only after this many reps */
  cooldownReps: number;
  /** same for safety cues (knee travel) */
  safetyCooldownReps: number;
  /** praise at most once every N reps */
  praiseEveryReps: number;
  /** minimum seconds between two live safety cues */
  safetyCooldownS: number;
}

export const DEFAULT_SCHEDULER_OPTIONS: SchedulerOptions = {
  cooldownReps: 2,
  safetyCooldownReps: 1,
  praiseEveryReps: 3,
  safetyCooldownS: 8,
};

export interface RepInput {
  index: number;
  score: number;
  band: ScoreBand;
  /** cues for the finished rep, most urgent first */
  cues: ReadonlyArray<{ code: CueCode; priority: number }>;
}

const SAFETY: CueCode = 'knee_travel';

export class CueScheduler {
  private lastSpokenRep = new Map<CueCode, number>();
  private lastPraiseRep = Number.NEGATIVE_INFINITY;
  private variant = new Map<string, number>();
  private wasInRep = false;
  private safetySpokenThisRep = false;
  private lastSafetyT = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly style: () => VoiceStyle,
    private readonly opts: SchedulerOptions = DEFAULT_SCHEDULER_OPTIONS,
  ) {}

  /** New source / new set: forget cooldowns. */
  reset(): void {
    this.lastSpokenRep.clear();
    this.lastPraiseRep = Number.NEGATIVE_INFINITY;
    this.variant.clear();
    this.wasInRep = false;
    this.safetySpokenThisRep = false;
    this.lastSafetyT = Number.NEGATIVE_INFINITY;
  }

  private pick(key: string, options: readonly string[]): string {
    const i = this.variant.get(key) ?? 0;
    this.variant.set(key, i + 1);
    return options[i % options.length]!;
  }

  /** Live frame while tracking. Only urgent safety cues are spoken mid-rep. */
  onFrame(inRep: boolean, codes: readonly CueCode[], tSeconds: number): Utterance | null {
    if (!inRep) {
      this.wasInRep = false;
      return null;
    }
    if (!this.wasInRep) {
      this.wasInRep = true;
      this.safetySpokenThisRep = false;
    }
    const style = this.style();
    if (style === 'count') return null;
    if (!codes.includes(SAFETY) || this.safetySpokenThisRep || tSeconds - this.lastSafetyT < this.opts.safetyCooldownS) return null;
    this.safetySpokenThisRep = true;
    this.lastSafetyT = tSeconds;
    return { text: this.pick(`${style}:${SAFETY}`, CUE_PHRASES[style][SAFETY]), kind: 'safety', code: SAFETY, interrupt: true, haptic: true };
  }

  /** A rep just finished: the count, then at most one correction or an occasional praise. */
  onRep(rep: RepInput): Utterance | null {
    const style = this.style();
    const count = countPhrase(rep.index);
    const spokeSafetyLive = this.safetySpokenThisRep;
    this.safetySpokenThisRep = false;
    this.wasInRep = false;
    if (spokeSafetyLive) this.lastSpokenRep.set(SAFETY, rep.index); // already said it during the descent

    if (style === 'count') return { text: count, kind: 'count', interrupt: false, haptic: false };

    const due = (code: CueCode): boolean => {
      const last = this.lastSpokenRep.get(code);
      const gap = code === SAFETY ? this.opts.safetyCooldownReps : this.opts.cooldownReps;
      return last === undefined || rep.index - last >= gap;
    };
    const next = rep.cues.find((c) => !(c.code === SAFETY && spokeSafetyLive) && due(c.code));
    if (next) {
      this.lastSpokenRep.set(next.code, rep.index);
      const phrase = this.pick(`${style}:${next.code}`, CUE_PHRASES[style][next.code]);
      return { text: `${count} ${phrase}`, kind: 'cue', code: next.code, interrupt: false, haptic: true };
    }

    if (rep.cues.length === 0 && rep.band === 'good' && rep.index - this.lastPraiseRep >= this.opts.praiseEveryReps) {
      this.lastPraiseRep = rep.index;
      return { text: `${count} ${this.pick(`${style}:praise`, PRAISE_PHRASES[style])}`, kind: 'praise', interrupt: false, haptic: false };
    }
    return { text: count, kind: 'count', interrupt: false, haptic: false };
  }

  onSetFinished(summary: { count: number; average: number }): Utterance {
    return { text: summaryPhrase(this.style(), summary.count, summary.average), kind: 'summary', interrupt: true, haptic: false };
  }

  onProfileReady(kind: 'measured' | 'manual' | 'average'): Utterance {
    return { text: kind === 'average' ? AVERAGE_BUILD_PHRASE : PROFILE_READY_PHRASE, kind: 'info', interrupt: false, haptic: false };
  }
}
