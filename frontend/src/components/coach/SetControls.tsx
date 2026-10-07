import { PauseIcon, PlayIcon, StopIcon } from '@/components/icons';
import { Tile } from '@/components/ui/Tile';
import { getRuntime, useCoach } from '@/features/session/defaultRuntime.ts';

export function SetControls() {
  const source = useCoach((s) => s.source);
  const paused = useCoach((s) => s.paused);
  const reps = useCoach((s) => s.reps);
  const setSize = useCoach((s) => s.setSize);
  const rt = getRuntime();
  const active = source !== 'none';

  return (
    <Tile tone="sand" className="h-full">
      <p className="text-xs font-extrabold uppercase tracking-wide">Set controls</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!active}
          onClick={() => rt.togglePause()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 font-bold disabled:opacity-50"
        >
          {paused ? <PlayIcon size={18} /> : <PauseIcon size={18} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          disabled={reps.length === 0}
          onClick={() => rt.finishSet()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-3 py-3 font-bold text-white disabled:opacity-50"
        >
          <StopIcon size={18} />
          Finish set
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-ink-soft">Target reps</span>
        <span className="flex items-center gap-2">
          <button type="button" aria-label="Fewer reps" onClick={() => rt.setSetSize(setSize - 1)} className="h-7 w-7 rounded-full bg-white font-bold">
            −
          </button>
          <b className="w-6 text-center">{setSize}</b>
          <button type="button" aria-label="More reps" onClick={() => rt.setSetSize(setSize + 1)} className="h-7 w-7 rounded-full bg-white font-bold">
            +
          </button>
        </span>
      </div>
      <button type="button" onClick={() => rt.resetSet()} className="mt-2 text-xs font-medium text-ink-soft underline">
        Discard this set
      </button>
    </Tile>
  );
}
