import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CameraIcon, UploadIcon, ArrowRight, TargetIcon, CheckIcon } from '@/components/icons';
import { Tile } from '@/components/ui/Tile';
import { Pill } from '@/components/ui/Pill';
import { getRuntime, useCoach } from '@/features/session/defaultRuntime.ts';
import { formatDate } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';

const STATUS_CLASS = {
  none: 'text-amber-700',
  running: 'text-amber-700',
  ok: 'text-green-700',
  failed: 'text-red-700',
} as const;

const KIND_LABEL = {
  measured: 'measured from photo/clip',
  manual: 'typed-in ratios',
  average: 'AVERAGE build (not personalized)',
} as const;

export function PersonalizePage() {
  usePageTitle('Personalize');
  const navigate = useNavigate();
  const rt = getRuntime();
  const cal = useCoach((s) => s.calibration);
  const profile = useCoach((s) => s.profile);
  const [ft, setFt] = useState('0.90');
  const [sf, setSf] = useState('1.00');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);


  const p = cal.progress;
  const progressText = p
    ? p.phase === 'warmup'
      ? `Stand tall and side-on… starting in ${p.remainingS.toFixed(1)} s`
      : `Hold still… ${p.remainingS.toFixed(1)} s · usable frames ${p.samples}` +
        (p.rejected > 0 ? ` · rejected ${p.rejected}${p.lastRejection ? ` (${p.lastRejection})` : ''}` : '')
    : null;

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsProcessing(true);
    try {
      await rt.calibrateFromFiles(files);
      const state = rt.store.getState();
      if (state.calibration.status === 'ok') {
        navigate('/coach');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAverageBuild = () => {
    rt.useAverageBuild();
    navigate('/coach');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = rt.setManualProfile(Number(ft), Number(sf));
    if (err) {
      setManualError(err);
    } else {
      setManualError(null);
      navigate('/coach');
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-soft">Body Calibration</p>
          <h1 className="font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">
            Personalize Your Squat
          </h1>
        </div>
        <Link
          to="/coach"
          className="inline-flex items-center gap-1.5 rounded-pill bg-slate-100 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-200"
        >
          Skip to Live Coach <ArrowRight size={14} />
        </Link>
      </div>

      {profile && (
        <Tile tone="good" className="border border-green-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CheckIcon size={18} className="text-green-800" />
                <p className="font-display text-lg font-black uppercase">Personalization Active</p>
                <Pill tone="good">{KIND_LABEL[profile.kind]}</Pill>
              </div>
              <p className="mt-1 text-sm text-ink-soft">Saved {formatDate(profile.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => rt.clearProfile()}
                className="text-sm font-medium text-ink-soft underline hover:text-ink"
              >
                Forget profile
              </button>
              <button
                type="button"
                onClick={() => navigate('/coach')}
                className="inline-flex items-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-sm"
              >
                Go to Live Coach <ArrowRight size={16} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/70 p-3 text-center">
              <div className="font-display text-xl font-black">{profile.profile.femurTorso.toFixed(2)}</div>
              <div className="text-xs text-ink-soft">Femur / Torso</div>
            </div>
            <div className="rounded-2xl bg-white/70 p-3 text-center">
              <div className="font-display text-xl font-black">{profile.profile.shankFemur.toFixed(2)}</div>
              <div className="text-xs text-ink-soft">Shank / Femur</div>
            </div>
            <div className="rounded-2xl bg-white/70 p-3 text-center">
              <div className="font-display text-xl font-black">{profile.profile.legTorso.toFixed(2)}</div>
              <div className="text-xs text-ink-soft">Leg / Torso</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2">
            <TargetIcon className="shrink-0 text-indigo-700" />
            <p className="text-sm">
              Your balanced torso lean at parallel:{' '}
              <b className="font-display text-base">
                {profile.torsoRange[0].toFixed(0)}° – {profile.torsoRange[1].toFixed(0)}°
              </b>
            </p>
          </div>
        </Tile>
      )}

      {/* Primary Calibration Card */}
      <section aria-labelledby="step1" className="rounded-tile border-2 border-orange-300 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="step1" className="text-xs font-extrabold uppercase tracking-wide text-orange-800">
          Personalize (body calibration)
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Upload one or more <b>standing, side-on photos</b> (relaxed, full body incl. feet) <b>or a short 2–3 s clip</b>.
          More frames make the ratios more robust. No photo? Calibrate with an average build or type in your ratios below.
          Everything is processed privately on your device.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill bg-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
            <UploadIcon size={18} />
            {isProcessing ? 'Processing frames…' : 'Upload standing photo(s) / short clip'}
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              disabled={isProcessing}
              className="sr-only"
              onChange={(e) => {
                const files: File[] = Array.from(e.target.files ?? []);
                e.target.value = '';
                void handleFiles(files);
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              navigate('/coach?calibrate=true');
            }}
            className="inline-flex items-center gap-2 rounded-pill bg-slate-700 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <CameraIcon size={18} />
            Calibrate with live camera in Coach
          </button>
        </div>

        <p className={`mt-4 text-sm font-medium ${STATUS_CLASS[cal.status]}`} role="status" aria-live="polite">
          {progressText ?? cal.message}
          {profile && cal.status === 'ok' && (
            <span className="ml-1 text-ink-soft">
              · {KIND_LABEL[profile.kind]} · saved {formatDate(profile.createdAt)}
            </span>
          )}
        </p>

        {/* After successful calibration, show quick-start buttons */}
        {profile && cal.status === 'ok' && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/coach"
              className="inline-flex items-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 shadow-sm"
            >
              Go to Live Coach <ArrowRight size={16} />
            </Link>
            <Link
              to="/review"
              className="inline-flex items-center gap-2 rounded-pill bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
            >
              Upload &amp; Analyse a Video <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {cal.details && cal.details.length > 0 && (
          <details className="mt-3 text-sm" open={cal.status === 'failed'}>
            <summary className="cursor-pointer font-medium text-ink">What the app saw in each frame</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-soft">
              {cal.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-6 border-t border-black/10 pt-5">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">
            Calibration not working? Other ways to continue
          </h3>

          <div className="mt-3 space-y-4 rounded-2xl bg-canvas/60 p-4">
            <div>
              <button
                type="button"
                onClick={handleAverageBuild}
                className="rounded-pill bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
              >
                Use an average build for now
              </button>
              <p className="mt-1 text-xs text-ink-soft">
                Everything works, but scores are NOT personalized. It is not saved.
              </p>
            </div>

            <form className="flex flex-wrap items-end gap-3" onSubmit={handleManualSubmit}>
              <label className="text-xs text-ink-soft">
                Femur / torso
                <input
                  value={ft}
                  onChange={(e) => setFt(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 block w-28 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-ink-soft">
                Shank / femur
                <input
                  value={sf}
                  onChange={(e) => setSf(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 block w-28 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm text-ink"
                />
              </label>
              <button
                type="submit"
                className="rounded-pill bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
              >
                Use my ratios
              </button>
              {manualError && <span role="alert" className="text-xs text-red-700">{manualError}</span>}
            </form>

            <p className="text-xs text-ink-soft">
              Typical femur / torso is 0.7 to 1.1 (thigh length divided by shoulder-to-hip length); typical shank / femur is 0.85 to 1.15.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
