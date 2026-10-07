import type { RepView } from './store.ts';

/** Short on-screen headline for a rep: the most urgent cue, or a positive/neutral line. */
export function headlineFor(rep: RepView | null): string {
  if (!rep) return 'Start squatting.';
  if (rep.cues.length > 0) return rep.cues[0]!.spoken;
  return rep.band === 'good' ? 'Clean rep. Steady.' : 'Keep going.';
}
