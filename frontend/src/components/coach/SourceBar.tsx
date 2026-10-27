import { Link } from 'react-router-dom';
import { PauseIcon, PlayIcon, UploadIcon } from '@/components/icons';
import { getRuntime, useCoach } from '@/features/session/defaultRuntime.ts';
import type { PoseVariant } from '@/features/pose/assets.ts';
import { formatTime } from '@/lib/format';

/** SourceBar: Live camera controls on /coach, Video review controls on /review. */
export function SourceBar({ mode }: { mode: 'live' | 'review' }) {
  const rt = getRuntime();
  const source = useCoach((s) => s.source);
  const variant = useCoach((s) => s.poseVariant);
  const video = useCoach((s) => s.video);
  const paused = useCoach((s) => s.paused);
  const loading = useCoach((s) => s.modelLoading);
  const profile = useCoach((s) => s.profile);

  return (
    <section aria-labelledby="source-heading" className="rounded-tile bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="source-heading" className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">
          {mode === 'live' ? 'Live Camera Tracking' : 'Video Review'}
        </h2>
        {/* Profile indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          {profile ? (
            <span className="font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
              ✓ {profile.kind === 'measured' ? 'Personalized profile' : profile.kind === 'manual' ? 'Manual ratios' : 'Standard build'}
            </span>
          ) : (
            <Link to="/profile" className="font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 hover:bg-amber-100">
              Standard build · Calibrate in My Profile →
            </Link>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {mode === 'live' ? (
          <button
            type="button"
            disabled={loading || source === 'camera'}
            onClick={() => void rt.startCamera()}
            className="inline-flex items-center gap-2 rounded-pill bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-blue-700"
          >
            <PlayIcon size={16} />
            {source === 'camera' ? 'Camera active' : 'Start live camera'}
          </button>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill bg-blue-600 px-4 py-2 text-sm font-semibold text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink hover:bg-blue-700">
            <UploadIcon size={16} />
            Upload a squat video
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void rt.loadVideo(f);
              }}
            />
          </label>
        )}

        <button
          type="button"
          disabled={source === 'none'}
          onClick={() => rt.stop()}
          className="rounded-pill bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-slate-800"
        >
          Stop
        </button>

        <label className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
          Pose model
          <select
            value={variant}
            onChange={(e) => void rt.setPoseVariant(e.target.value as PoseVariant)}
            className="rounded-lg border border-black/15 bg-white px-2 py-1 text-sm text-ink"
          >
            <option value="lite">lite (fastest)</option>
            <option value="full">full (balanced)</option>
            <option value="heavy">heavy (most accurate)</option>
          </select>
        </label>
      </div>

      {mode === 'review' && video && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => rt.togglePause()}
            className="inline-flex items-center gap-2 rounded-pill bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300"
          >
            {video.ended ? <PlayIcon size={16} /> : paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
            {video.ended ? 'Replay' : paused ? 'Play' : 'Pause'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            Speed
            <select
              value={String(video.rate)}
              onChange={(e) => rt.setPlaybackRate(Number(e.target.value))}
              className="rounded-lg border border-black/15 bg-white px-2 py-1"
            >
              {[0.25, 0.5, 1, 1.5].map((r) => (
                <option key={r} value={String(r)}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <input
            type="range"
            min={0}
            max={1000}
            aria-label="Seek"
            value={video.duration ? Math.round((video.currentTime / video.duration) * 1000) : 0}
            onChange={(e) => rt.seek(Number(e.target.value) / 1000)}
            className="min-w-40 flex-1 accent-black"
          />
          <span className="font-mono text-sm text-ink-soft">
            {formatTime(video.currentTime)} / {formatTime(video.duration)}
          </span>
        </div>
      )}
    </section>
  );
}
