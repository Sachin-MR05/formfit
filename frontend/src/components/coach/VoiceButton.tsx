import { SpeakerIcon } from '@/components/icons';
import { getVoice, useVoice } from '@/features/session/defaultRuntime.ts';

/** Speaker toggle. Must be a real click: browsers only allow speech after a user gesture. */
export function VoiceButton({ variant }: { variant: 'overlay' | 'notch' }) {
  const enabled = useVoice((s) => s.settings.enabled);
  const supported = useVoice((s) => s.supported);

  const base = 'relative grid h-11 w-11 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
  const look =
    variant === 'overlay'
      ? enabled
        ? 'bg-green-500 text-ink'
        : 'bg-black/55 text-slate-200 hover:bg-black/75'
      : enabled
        ? 'bg-green-500 text-ink'
        : 'bg-borderline text-ink';

  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn voice coaching off' : 'Turn voice coaching on'}
      title={supported ? (enabled ? 'Voice coaching on. Click to mute.' : 'Voice coaching off (captions still show). Click to turn on.') : 'This browser has no speech synthesis. Captions still work.'}
      onClick={() => getVoice().coach.setEnabled(!enabled)}
      className={`${base} ${look}`}
    >
      <SpeakerIcon />
      {!enabled && <span aria-hidden="true" className="absolute h-0.5 w-7 -rotate-45 rounded bg-current" />}
    </button>
  );
}
