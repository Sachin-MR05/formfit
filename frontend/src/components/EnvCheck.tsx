import { useCallback, useEffect, useState } from 'react';
import { WASM_BASE, poseModelUrl } from '@/features/pose/assets';

interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
}

/** A missing file on the Vite dev server falls back to index.html (HTTP 200), so also check the MIME type. */
async function assetExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    const ok = res.ok && !type.includes('text/html');
    await res.body?.cancel();
    return ok;
  } catch {
    return false;
  }
}

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function hasMediaPipe(): Promise<boolean> {
  try {
    const mp = await import('@mediapipe/tasks-vision');
    return typeof mp.PoseLandmarker === 'function' && typeof mp.FilesetResolver === 'function';
  } catch {
    return false;
  }
}

async function runChecks(): Promise<CheckResult[]> {
  const [mediapipe, wasm, lite, full] = await Promise.all([
    hasMediaPipe(),
    assetExists(`${WASM_BASE}/vision_wasm_internal.wasm`),
    assetExists(poseModelUrl('lite')),
    assetExists(poseModelUrl('full')),
  ]);
  const needModels = 'Run `npm run setup:models` in /frontend, then re-run this check.';
  return [
    {
      id: 'secure',
      label: 'Secure context (camera allowed)',
      ok: window.isSecureContext,
      hint: 'Use http://localhost or HTTPS.',
    },
    {
      id: 'camera',
      label: 'Camera API available',
      ok: !!navigator.mediaDevices?.getUserMedia,
      hint: 'Use a current Chrome, Edge, Safari or Firefox.',
    },
    { id: 'wasm-support', label: 'WebAssembly supported', ok: typeof WebAssembly === 'object' },
    {
      id: 'webgl',
      label: 'WebGL2 (GPU acceleration)',
      ok: hasWebGL2(),
      hint: 'Without it MediaPipe falls back to the slower CPU path.',
    },
    { id: 'mediapipe', label: 'MediaPipe package installed', ok: mediapipe, hint: 'Run `npm install`.' },
    { id: 'wasm', label: 'MediaPipe WASM files served', ok: wasm, hint: needModels },
    { id: 'lite', label: 'Pose model: lite', ok: lite, hint: needModels },
    { id: 'full', label: 'Pose model: full', ok: full, hint: needModels },
  ];
}

export function EnvCheck() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults(await runChecks());
    setRunning(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <div>
      <ul className="space-y-1.5" aria-live="polite">
        {(results ?? []).map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                r.ok ? 'bg-good' : 'bg-fix'
              }`}
            >
              {r.ok ? '✓' : '✕'}
            </span>
            <span>
              {r.label}
              <span className="sr-only">{r.ok ? ': passed' : ': failed'}</span>
              {!r.ok && r.hint && <span className="block text-xs text-ink-soft">{r.hint}</span>}
            </span>
          </li>
        ))}
        {!results && <li className="text-sm text-ink-soft">Running checks…</li>}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-pill bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {running ? 'Checking…' : 'Re-run checks'}
        </button>
        {results && (
          <span className="text-sm font-medium">
            {failed.length === 0 ? 'Environment ready for Phase 1 ✓' : `${failed.length} item(s) need attention`}
          </span>
        )}
      </div>
    </div>
  );
}
