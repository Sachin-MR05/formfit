import { CheckIcon } from '@/components/icons';
import { Tile } from '@/components/ui/Tile';
import { engine } from '@/engine/loader.ts';
import { clamp } from '@/engine/index.ts';
import { useCoach } from '@/features/session/defaultRuntime.ts';
import type { RepView } from '@/features/session/store.ts';

/** Depth is "reached" when the hip crease is at or below the knee (parallel or deeper), not a percentage band. */
function depthOf(phi: number): number {
  return clamp((90 - phi) / (90 - engine.config.depthPhiOk), 0, 1);
}

export function DepthTile({ lastRep }: { lastRep: RepView | null }) {
  const live = useCoach((s) => s.live);
  const showLive = Boolean(live?.inRep);
  const pct = live?.inRep ? live.depthPct : lastRep ? depthOf(lastRep.features.phi) : 0;
  const reached = pct >= 0.999;

  return (
    <Tile tone="target" className="h-full">
      <p className="text-xs font-extrabold uppercase tracking-wide">
        Depth <span className="font-medium normal-case text-ink-soft">({showLive ? 'live' : 'last rep'})</span>
      </p>
      <div className="mt-2 flex items-center gap-4">
        <div className="relative h-28 w-7 overflow-hidden rounded-full bg-white/60" role="img" aria-label={`Depth ${Math.round(pct * 100)} percent of the way to parallel`}>
          <div className={`absolute bottom-0 w-full rounded-full transition-[height] duration-100 ${reached ? 'bg-green-600' : 'bg-lime-400'}`} style={{ height: `${pct * 100}%` }} />
        </div>
        <div>
          <p className="font-display text-5xl font-black leading-none">
            {Math.round(pct * 100)}
            <span className="text-2xl">%</span>
          </p>
          <p className="mt-2 flex items-center gap-1 text-sm">
            {reached && <CheckIcon size={16} className="text-green-700" />}
            Target: <b>parallel or below</b>
          </p>
          <p className="text-xs text-ink-soft">100% = hip crease level with the knee</p>
        </div>
      </div>
    </Tile>
  );
}
