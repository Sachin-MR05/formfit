import { BarsIcon } from '@/components/icons';
import { VoiceButton } from '@/components/coach/VoiceButton';
import { Tile } from '@/components/ui/Tile';
import { BAND_LABEL, type ScoreBand } from '@/lib/score';
import { getRuntime, useCoach } from '@/features/session/defaultRuntime.ts';
import { headlineFor } from '@/features/session/headline.ts';
import type { RepView } from '@/features/session/store.ts';

const TONE: Record<ScoreBand, 'good' | 'borderline' | 'fix'> = { good: 'good', borderline: 'borderline', fix: 'fix' };
const PILL: Record<ScoreBand, string> = { good: 'bg-green-600 text-white', borderline: 'bg-amber-500 text-ink', fix: 'bg-red-600 text-white' };

/** Last (or selected) rep score, with the coach's cue as a big headline. Live cues take over during a rep. */
export function ScoreTile({ rep }: { rep: RepView | null }) {
  const live = useCoach((s) => s.live);
  const liveCue = live?.inRep ? (live.coach?.cues[0] ?? null) : null;
  const band: ScoreBand = rep?.band ?? 'good';

  return (
    <Tile
      tone={rep ? TONE[band] : 'white'}
      className="h-full"
      notch={{
        corner: 'top-right',
        size: 56,
        content: <VoiceButton variant="notch" />,
      }}
    >
      <p className="text-xs font-extrabold uppercase tracking-wide">Last rep</p>
      <div className="mt-1 flex items-end gap-1">
        <span className="font-display text-7xl font-black leading-none" aria-label={rep ? `Score ${rep.score} out of 100` : 'No rep yet'}>
          {rep ? rep.score : '–'}
        </span>
        <span className="pb-1 text-xl text-ink-soft">/100</span>
      </div>
      {rep && (
        <span className={`mt-2 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-bold ${PILL[rep.band]}`}>
          <BarsIcon size={16} />
          {BAND_LABEL[rep.band]}
        </span>
      )}

      <p className="mt-4 text-xs font-extrabold uppercase tracking-wide">
        Coach says <span className="font-medium normal-case text-ink-soft">({liveCue ? 'live' : 'last rep'})</span>
      </p>
      <p className="font-display text-2xl font-black uppercase leading-tight" aria-live="polite">
        {liveCue ? liveCue.spoken : headlineFor(rep)}
      </p>
      {rep && rep.cues.length > 0 && !liveCue && <p className="mt-1 text-sm text-ink-soft">{rep.cues[0]!.text}</p>}
      {liveCue && <p className="mt-1 text-sm text-ink-soft">{liveCue.text}</p>}

      {rep && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-2 text-xs">
          <span className="text-ink-soft">Coach label:</span>
          {(['good', 'faulty'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={rep.label === l}
              onClick={() => getRuntime().labelRep(rep.id, rep.label === l ? null : l)}
              className={`rounded-pill border px-3 py-1 font-semibold ${rep.label === l ? 'border-transparent bg-ink text-white' : 'border-black/15 bg-white/60'}`}
            >
              {l === 'good' ? 'Good' : 'Faulty'}
            </button>
          ))}
        </div>
      )}
    </Tile>
  );
}
