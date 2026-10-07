import { useState } from 'react';
import { CameraIcon, UploadIcon } from '@/components/icons';
import { getRuntime, useCoach } from '@/features/session/defaultRuntime.ts';
import { formatDate } from '@/lib/format';

const STATUS_CLASS = { none: 'text-amber-700', running: 'text-amber-700', ok: 'text-green-700', failed: 'text-red-700' } as const;
const KIND_LABEL = { measured: 'measured', manual: 'typed-in ratios', average: 'AVERAGE build (not personalized)' } as const;

/** Step 1: measure the person's proportions from standing photo(s), a short clip, or the camera. */
export function PersonalizeCard() {
  const rt = getRuntime();
  const cal = useCoach((s) => s.calibration);
  const profile = useCoach((s) => s.profile);
  const source = useCoach((s) => s.source);
  const [ft, setFt] = useState('0.90');
  const [sf, setSf] = useState('1.00');
  const [manualError, setManualError] = useState<string | null>(null);

  const p = cal.progress;
  const progressText = p
    ? p.phase === 'warmup'
      ? `Stand tall and side-on… starting in ${p.remainingS.toFixed(1)} s`
      : `Hold still… ${p.remainingS.toFixed(1)} s · usable frames ${p.samples}` +
        (p.rejected > 0 ? ` · rejected ${p.rejected}${p.lastRejection ? ` (${p.lastRejection})` : ''}` : '')
    : null;

  return (
    <section aria-labelledby="step1" className="rounded-tile border-2 border-orange-300 bg-white p-4">
      <h2 id="step1" className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">
        Step 1 · Personalize (body calibration)
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Upload one or more <b>standing, side-on photos</b> (relaxed, full body incl. feet) <b>or a short 2–3 s clip</b>. More frames make the ratios
        more robust. No photo? Calibrate with the live camera, or with the first seconds of an uploaded video. Everything is processed on this device.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill bg-orange-600 px-4 py-2 text-sm font-semibold text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <UploadIcon size={16} />
          Upload standing photo(s) / short clip
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files: File[] = Array.from(e.target.files ?? []);
              e.target.value = '';
              void rt.calibrateFromFiles(files);
            }}
          />
        </label>
        <button
          type="button"
          disabled={source !== 'camera'}
          onClick={() => rt.startCameraCalibration()}
          className="inline-flex items-center gap-2 rounded-pill bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <CameraIcon size={16} />
          Calibrate with the camera (3 s)
        </button>
        <button
          type="button"
          disabled={source !== 'file'}
          onClick={() => rt.startVideoCalibration()}
          className="rounded-pill bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Use the next 3 s of this video
        </button>
        {profile && (
          <button type="button" onClick={() => rt.clearProfile()} className="text-sm font-medium text-ink-soft underline">
            Forget my profile
          </button>
        )}
      </div>

      <p className={`mt-3 text-sm font-medium ${STATUS_CLASS[cal.status]}`} role="status" aria-live="polite">
        {progressText ?? cal.message}
        {profile && cal.status === 'ok' && (
          <span className="ml-1 text-ink-soft">
            · {KIND_LABEL[profile.kind]} · saved {formatDate(profile.createdAt)}
          </span>
        )}
      </p>

      {cal.details && cal.details.length > 0 && (
        <details className="mt-2 text-sm" open={cal.status === 'failed'}>
          <summary className="cursor-pointer font-medium">What the app saw in each frame</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
            {cal.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">Calibration not working? Other ways to continue</summary>
        <div className="mt-2 space-y-3 rounded-2xl bg-canvas/60 p-3">
          <div>
            <button type="button" onClick={() => rt.useAverageBuild()} className="rounded-pill bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
              Use an average build for now
            </button>
            <p className="mt-1 text-xs text-ink-soft">Everything works, but scores are NOT personalized. It is not saved.</p>
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setManualError(rt.setManualProfile(Number(ft), Number(sf)));
            }}
          >
            <label className="text-xs text-ink-soft">
              Femur / torso
              <input value={ft} onChange={(e) => setFt(e.target.value)} inputMode="decimal" className="mt-0.5 block w-24 rounded-lg border border-black/15 bg-white px-2 py-1 text-sm text-ink" />
            </label>
            <label className="text-xs text-ink-soft">
              Shank / femur
              <input value={sf} onChange={(e) => setSf(e.target.value)} inputMode="decimal" className="mt-0.5 block w-24 rounded-lg border border-black/15 bg-white px-2 py-1 text-sm text-ink" />
            </label>
            <button type="submit" className="rounded-pill bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
              Use my ratios
            </button>
            {manualError && <span role="alert" className="text-xs text-red-700">{manualError}</span>}
          </form>
          <p className="text-xs text-ink-soft">
            Typical femur / torso is 0.7 to 1.1 (thigh length divided by shoulder-to-hip length); typical shank / femur is 0.85 to 1.15.
          </p>
        </div>
      </details>
    </section>
  );
}
