import { Tile } from '@/components/ui/Tile';
import { useCoach } from '@/features/session/defaultRuntime.ts';
import { BAND_LABEL, type ScoreBand } from '@/lib/score';

const BG: Record<ScoreBand, string> = { good: 'bg-good', borderline: 'bg-borderline', fix: 'bg-fix' };

/** One circle per planned rep (all of them, filled or empty). Tap a rep to inspect it. */
export function RepStrip({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const reps = useCoach((s) => s.reps);
  const setSize = useCoach((s) => s.setSize);
  const slots = Math.max(setSize, reps.length);

  return (
    <Tile tone="sand" className="h-full">
      <p className="text-xs font-extrabold uppercase tracking-wide">
        Rep strip <span className="font-medium normal-case text-ink-soft">(tap a rep to inspect)</span>
      </p>
      <ol className="mt-3 flex flex-wrap gap-2" aria-label="Reps in this set">
        {Array.from({ length: slots }, (_, i) => {
          const r = reps[i];
          if (!r) {
            return (
              <li key={i} className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-black/25 text-sm text-ink-soft">
                {i + 1}
              </li>
            );
          }
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-pressed={selectedId === r.id}
                title={`Rep ${r.index}: ${r.score} (${BAND_LABEL[r.band]})`}
                className={`grid h-12 w-12 place-items-center rounded-full text-center text-xs font-bold leading-tight ${BG[r.band]} ${selectedId === r.id ? 'outline-[3px] outline-offset-2 outline-ink' : ''}`}
              >
                <span>
                  <span className="block text-[10px] font-medium">{r.index}</span>
                  {r.score}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Tile>
  );
}
