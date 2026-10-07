import { SpeakerIcon } from '@/components/icons';
import { useVoice } from '@/features/session/defaultRuntime.ts';

/** What the coach just said, as text: the voice feedback for silent mode, noisy gyms and deaf or hard-of-hearing users. */
export function VoiceCaption() {
  const caption = useVoice((s) => s.caption);
  const enabled = useVoice((s) => s.settings.enabled);
  if (!caption) return null;

  const urgent = caption.kind === 'safety' || caption.kind === 'cue';
  return (
    <div
      role="status"
      className={`absolute bottom-16 left-3 right-16 flex items-center gap-2 rounded-2xl px-4 py-2 font-display text-base font-black ${urgent ? 'bg-borderline text-ink' : 'bg-white/90 text-ink'}`}
    >
      <SpeakerIcon size={18} className={enabled ? '' : 'opacity-40'} />
      <span>{caption.text}</span>
      {!enabled && <span className="ml-auto text-[10px] font-semibold uppercase text-ink-soft">caption only</span>}
    </div>
  );
}
