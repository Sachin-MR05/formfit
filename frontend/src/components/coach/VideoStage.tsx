import { useEffect, useRef } from 'react';
import { CameraIcon, FullscreenIcon } from '@/components/icons';
import { VoiceButton } from '@/components/coach/VoiceButton';
import { VoiceCaption } from '@/components/coach/VoiceCaption';
import { getRuntime, useCoach } from '@/features/session/defaultRuntime.ts';

const TONE_CLASS = {
  info: 'text-white',
  ok: 'text-good',
  warn: 'text-borderline',
  err: 'text-fix',
} as const;

/** The dark video tile: camera or uploaded video, the live skeleton overlay, status chips. */
export function VideoStage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const source = useCoach((s) => s.source);
  const fileName = useCoach((s) => s.fileName);
  const fps = useCoach((s) => s.fps);
  const banner = useCoach((s) => s.banner);
  const loading = useCoach((s) => s.modelLoading);
  const media = useCoach((s) => s.mediaSize);
  const profile = useCoach((s) => s.profile);
  const perfHint = useCoach((s) => s.perfHint);

  useEffect(() => {
    const rt = getRuntime();
    if (videoRef.current && canvasRef.current) rt.attach(videoRef.current, canvasRef.current);
    return () => rt.release();
  }, []);

  const ratio = media ? media.w / media.h : 16 / 9;
  const chip =
    source === 'camera' ? 'Live · video stays on this device' : source === 'file' ? `Video · ${fileName ?? ''}` : 'Idle';

  return (
    <div>
    <div
      ref={stageRef}
      className="relative mx-auto w-full overflow-hidden rounded-tile bg-slate-900"
      style={{ aspectRatio: `${ratio}`, width: `min(100%, calc(70vh * ${ratio}))`, minHeight: 220 }}
    >
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="absolute left-3 top-3 flex max-w-[70%] items-center gap-2 rounded-pill bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${source === 'none' ? 'bg-slate-400' : 'animate-pulse bg-good'}`}
        />
        <span className="truncate">{chip}</span>
        {fps > 0 && <span className="text-slate-300">· {fps} fps</span>}
      </div>

      <div className="absolute right-3 top-3">
        <VoiceButton variant="overlay" />
      </div>

      <VoiceCaption />

      <div
        className={`absolute bottom-3 left-3 right-16 flex items-start gap-2 rounded-2xl bg-black/60 px-3 py-2 text-sm font-semibold ${TONE_CLASS[banner.tone]}`}
        role="status"
        aria-live="polite"
      >
        <CameraIcon size={16} className="mt-0.5 shrink-0" />
        <span>{loading ? 'Loading pose model…' : banner.text}</span>
      </div>

      {source !== 'none' && !profile && (
        <div className="absolute left-1/2 top-14 -translate-x-1/2 rounded-pill bg-amber-500 px-3 py-1 text-xs font-bold text-ink">
          Not personalized: your target torso (dashed) appears after Step 1
        </div>
      )}
      {perfHint && (
        <div className="absolute right-3 top-16 flex max-w-[60%] items-center gap-2 rounded-2xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-ink">
          <span>{perfHint}</span>
          <button type="button" onClick={() => void getRuntime().setPoseVariant('lite')} className="shrink-0 rounded-pill bg-ink px-2 py-0.5 text-white">
            Use lite
          </button>
        </div>
      )}

      <button
        type="button"
        aria-label="Fullscreen"
        onClick={() => void stageRef.current?.requestFullscreen?.()}
        className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
      >
        <FullscreenIcon />
      </button>
    </div>
    <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Skeleton colour legend">
      <li><span className="mr-1 inline-block h-2 w-5 rounded-full bg-green-500 align-middle" />matches your geometry</li>
      <li><span className="mr-1 inline-block h-2 w-5 rounded-full bg-amber-500 align-middle" />depth not reached yet</li>
      <li><span className="mr-1 inline-block h-2 w-5 rounded-full bg-red-500 align-middle" />off your target</li>
      <li><span className="mr-1 inline-block h-0 w-5 border-t-[3px] border-dashed border-sky-400 align-middle" />your target torso</li>
    </ul>
    </div>
  );
}
