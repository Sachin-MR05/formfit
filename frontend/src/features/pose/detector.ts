/** MediaPipe Pose wrapper (browser only). Everything else depends on the small PoseDetector interface. */
import { poseModelUrl, WASM_BASE, type PoseVariant } from './assets.ts';
import type { NormLandmark, PoseFrame } from './landmarks.ts';

export interface PoseDetector {
  /** Detect on the current video frame. `timestampMs` must increase between calls. */
  detectVideo(video: HTMLVideoElement, timestampMs: number): PoseFrame | null;
  /** Detect on still images (photos or frames of a clip). Switches the model to image mode and back. */
  detectStills(sources: HTMLCanvasElement[]): Promise<Array<PoseFrame | null>>;
  close(): void;
}

interface MpLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}
interface MpResult {
  landmarks: MpLandmark[][];
  worldLandmarks: MpLandmark[][];
}

function toFrame(res: MpResult): PoseFrame | null {
  const lm = res.landmarks?.[0];
  const world = res.worldLandmarks?.[0];
  if (!lm || !world || lm.length < 33 || world.length < 33) return null;
  const norm: NormLandmark[] = lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 }));
  return { landmarks: norm, world: world.map((p) => ({ x: p.x, y: p.y, z: p.z })) };
}

/** Creates the MediaPipe pose landmarker from the self-hosted WASM + model files. Tries the GPU, falls back to CPU. */
export async function createMediaPipeDetector(variant: PoseVariant): Promise<PoseDetector> {
  const vision = await import('@mediapipe/tasks-vision');
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);

  const make = (mode: 'VIDEO' | 'IMAGE', delegate: 'GPU' | 'CPU') =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: poseModelUrl(variant), delegate },
      runningMode: mode,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  let preferredDelegate: 'GPU' | 'CPU' = 'GPU';
  type Landmarker = Awaited<ReturnType<typeof make>>;
  let videoLandmarker: Landmarker;
  try {
    videoLandmarker = await make('VIDEO', 'GPU');
  } catch {
    preferredDelegate = 'CPU';
    videoLandmarker = await make('VIDEO', 'CPU');
  }

  // Keep a separate instance for still images so runningMode: 'IMAGE' never corrupts the video stream timestamps
  let imageLandmarker: Landmarker | null = null;
  let lastTimestamp = -1;

  const recreateVideoLandmarker = async () => {
    try {
      videoLandmarker?.close();
    } catch {
      /* ignore */
    }
    videoLandmarker = await make('VIDEO', preferredDelegate);
    lastTimestamp = -1;
  };

  return {
    detectVideo(video, timestampMs) {
      if (!videoLandmarker) return null;
      // If timestamps jumped backwards significantly (e.g. video replayed or seeked backward), recreate the landmarker graph
      if (lastTimestamp > 0 && timestampMs < lastTimestamp - 50) {
        void recreateVideoLandmarker();
        return null;
      }
      // MediaPipe requires strictly monotonically increasing timestamps (+1 ms minimum step)
      const ts = timestampMs <= lastTimestamp ? lastTimestamp + 1 : timestampMs;
      lastTimestamp = ts;
      try {
        return toFrame(videoLandmarker.detectForVideo(video, ts) as unknown as MpResult);
      } catch (e) {
        console.warn('MediaPipe detectForVideo error, recreating video landmarker:', e);
        void recreateVideoLandmarker();
        return null;
      }
    },
    async detectStills(sources) {
      const out: Array<PoseFrame | null> = [];
      if (!imageLandmarker) {
        try {
          imageLandmarker = await make('IMAGE', preferredDelegate);
        } catch {
          imageLandmarker = await make('IMAGE', 'CPU');
        }
      }
      for (const src of sources) {
        out.push(toFrame(imageLandmarker.detect(src) as unknown as MpResult));
      }
      return out;
    },
    close() {
      try {
        videoLandmarker?.close();
      } catch {
        /* ignore */
      }
      try {
        imageLandmarker?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
