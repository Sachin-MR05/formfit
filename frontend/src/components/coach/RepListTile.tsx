import { ArrowRight } from '@/components/icons';
import { Tile } from '@/components/ui/Tile';
import { BAND_LABEL, type ScoreBand } from '@/lib/score';
import { useCoach } from '@/features/session/defaultRuntime.ts';

const ROW: Record<ScoreBand, string> = { good: 'bg-good', borderline: 'bg-borderline', fix: 'bg-fix' };

export function RepListTile({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const reps = useCoach((s) => s.reps);
  const setSize = useCoach((s) => s.setSize);
  const lastSet = useCoach((s) => s.lastSet);
  const rows = [...reps].reverse();

  return (
    <Tile tone="white" className="h-full border border-black/5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-extrabold uppercase tracking-wide">Reps this set</p>
        <p className="font-display text-xl font-black">
          {reps.length} <span className="text-ink-soft">/ {setSize}</span>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          {lastSet ? `Last set: ${lastSet.count} reps · average ${lastSet.average} · ${lastSet.good} judged good.` : 'No reps yet. Personalize, then squat.'}
        </p>
      ) : (
        <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-pressed={selectedId === r.id}
                className={`flex w-full items-center gap-2 rounded-pill pr-3 text-left text-sm ${selectedId === r.id ? 'outline-2 outline-ink' : ''}`}
              >
                <span className={`flex min-w-24 items-center gap-2 rounded-pill px-3 py-1.5 font-bold ${ROW[r.band]}`}>
                  <span>#{r.index}</span>
                  <span className="font-display text-base">{r.score}</span>
                </span>
                <span className="flex-1 text-ink-soft">{BAND_LABEL[r.band]}</span>
                <ArrowRight size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
