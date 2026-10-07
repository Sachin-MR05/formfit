import { Link } from 'react-router-dom';
import { ArrowRight, TargetIcon } from '@/components/icons';
import { Tile } from '@/components/ui/Tile';
import { useCoach } from '@/features/session/defaultRuntime.ts';

export function BuildTile() {
  const profile = useCoach((s) => s.profile);
  const chips = profile
    ? [
        { v: profile.profile.femurTorso.toFixed(2), l: 'Femur / Torso' },
        { v: profile.profile.shankFemur.toFixed(2), l: 'Shank / Femur' },
        { v: profile.profile.legTorso.toFixed(2), l: 'Leg / Torso' },
      ]
    : [];

  return (
    <Tile
      tone="body"
      className="h-full"
      notch={{
        corner: 'bottom-right',
        size: 52,
        content: (
          <Link to="/profile" aria-label="Open my body profile" className="grid h-10 w-10 place-items-center rounded-full bg-indigo-600 text-white">
            <ArrowRight size={18} />
          </Link>
        ),
      }}
    >
      <p className="text-xs font-extrabold uppercase tracking-wide">
        Your build{' '}
        <span className="font-medium normal-case text-ink-soft">
          ({profile ? (profile.kind === 'measured' ? 'from calibration' : profile.kind === 'manual' ? 'typed-in ratios' : 'average, not personalized') : 'not calibrated'})
        </span>
      </p>
      {profile ? (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {chips.map((c) => (
              <div key={c.l} className="rounded-2xl bg-white/60 px-2 py-2 text-center">
                <div className="font-display text-lg font-black">{c.v}</div>
                <div className="text-[11px] text-ink-soft">{c.l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2 pr-12">
            <TargetIcon className="shrink-0 text-indigo-700" />
            <p className="text-sm">
              Your balanced torso lean at parallel
              <br />
              <b className="font-display text-lg">
                {profile.torsoRange[0].toFixed(0)}° – {profile.torsoRange[1].toFixed(0)}°
              </b>
            </p>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm">Not personalized yet. Upload a standing side-view photo (Step 1) to see your ratios and your personal torso-lean range.</p>
      )}
    </Tile>
  );
}
