import { ArrowDown, ArrowUp } from '@/components/icons';
import { Tile } from '@/components/ui/Tile';
import { useCoach } from '@/features/session/defaultRuntime.ts';

export function TempoTile() {
  const reps = useCoach((s) => s.reps);
  const last = reps[reps.length - 1] ?? null;
  const recent = reps.slice(-8);
  const max = Math.max(1, ...recent.map((r) => Math.max(r.downS, r.upS)));

  return (
    <Tile tone="target" className="h-full">
      <p className="text-xs font-extrabold uppercase tracking-wide">
        Rep tempo <span className="font-medium normal-case text-ink-soft">(last rep)</span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2">
          <ArrowDown size={18} />
          <div>
            <div className="font-display text-xl font-black">{last ? `${last.downS.toFixed(1)}s` : '–'}</div>
            <div className="text-[11px] text-ink-soft">Down</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2">
          <ArrowUp size={18} />
          <div>
            <div className="font-display text-xl font-black">{last ? `${last.upS.toFixed(1)}s` : '–'}</div>
            <div className="text-[11px] text-ink-soft">Up</div>
          </div>
        </div>
      </div>
      {recent.length > 0 && (
        <svg viewBox="0 0 160 48" className="mt-2 h-12 w-full" role="img" aria-label="Down and up time for recent reps">
          {recent.map((r, i) => {
            const x = 6 + i * 19;
            return (
              <g key={r.id}>
                <rect x={x} y={46 - (r.downS / max) * 42} width="7" height={(r.downS / max) * 42} rx="2" fill="#0b0b0b" opacity="0.75" />
                <rect x={x + 8} y={46 - (r.upS / max) * 42} width="7" height={(r.upS / max) * 42} rx="2" fill="#3f6212" />
              </g>
            );
          })}
        </svg>
      )}
    </Tile>
  );
}
