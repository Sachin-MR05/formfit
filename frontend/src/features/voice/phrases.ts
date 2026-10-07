/** What the coach says. English for now; the structure is per style so more languages can be added. */
import type { CueCode } from '../../engine/index.ts';
import type { VoiceStyle } from './types.ts';

const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

/** "Seven." (numbers above twenty are spoken as digits). */
export function countPhrase(n: number): string {
  const w = Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n]! : String(n);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}.`;
}

type SpokenStyle = Exclude<VoiceStyle, 'count'>;

/** Short corrective phrases, 2 variants each so the coach does not repeat itself word for word. */
export const CUE_PHRASES: Record<SpokenStyle, Record<CueCode, string[]>> = {
  calm: {
    torso_forward: ['Chest up.', 'Lift your chest a little.'],
    torso_upright: ['Sit your hips back a little.', 'Hinge forward slightly.'],
    knee_travel: ['Knees are travelling far forward.', 'Ease your knees back.'],
    depth_short: ['A little deeper.', 'Go a bit lower next time.'],
  },
  motivating: {
    torso_forward: ['Chest up, you have got this!', 'Proud chest!'],
    torso_upright: ['Hips back, nice and strong!', 'Sit back into it!'],
    knee_travel: ['Careful, knees are drifting forward!', 'Pull those knees back a touch!'],
    depth_short: ['Dig a little deeper!', 'Lower, you can do it!'],
  },
};

export const PRAISE_PHRASES: Record<SpokenStyle, string[]> = {
  calm: ['Clean rep.', 'Good form.'],
  motivating: ['Great rep!', 'Perfect form, keep it up!', 'Strong!'],
};

export function summaryPhrase(style: VoiceStyle, count: number, average: number): string {
  const reps = `${count} ${count === 1 ? 'rep' : 'reps'}`;
  if (style === 'count') return `Set complete. ${reps}.`;
  const base = `Set complete. ${reps}, average ${average}.`;
  return style === 'motivating' && average >= 70 ? `${base} Nice work!` : base;
}

export const PROFILE_READY_PHRASE = 'Calibrated. Start when you are ready.';
export const AVERAGE_BUILD_PHRASE = 'Using an average build. Scores are not personalized.';
