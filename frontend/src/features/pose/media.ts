/** Browser media helpers: camera, object URLs and turning photos / clips into frames for calibration. */
import type { EngineConfig } from '../../engine/index.ts';

export interface StillFrame {
  canvas: HTMLCanvasElement;
  aspect: number;
}

function toCanvas(src: CanvasImageSource, w: number, h: number, maxPx: number): StillFrame {
  const k = Math.min(1, maxPx / Math.max(w, h));
  const cw = Math.round(w * k);
  const ch = Math.round(h * k);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d')!.drawImage(src, 0, 0, cw, ch);
  return { canvas, aspect: cw / ch };
}

/** One frame for a photo; up to `calibMaxFrames` evenly spaced frames from the first seconds of a clip. */
export async function framesFromFile(file: File, cfg: EngineConfig): Promise<StillFrame[]> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.src = url;
      await img.decode();
      return [toCanvas(img, img.naturalWidth, img.naturalHeight, cfg.calibMaxPx)];
    }
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error(`Cannot decode ${file.name}`));
      v.src = url;
    });
    const dur = Math.min(Number.isFinite(v.duration) ? v.duration : cfg.calibClipMaxS, cfg.calibClipMaxS);
    const n = Math.min(cfg.calibMaxFrames, Math.max(4, Math.floor(dur * 5)));
    const out: StillFrame[] = [];
    for (let i = 0; i < n; i++) {
      await new Promise<void>((resolve) => {
        v.onseeked = () => resolve();
        v.currentTime = (dur * (i + 0.5)) / n;
      });
      out.push(toCanvas(v, v.videoWidth, v.videoHeight, cfg.calibMaxPx));
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const openCamera = (): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' },
    audio: false,
  });
