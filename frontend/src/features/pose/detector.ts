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
  const make = (delegate: 'GPU' | 'CPU') =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: poseModelUrl(variant), delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let landmarker: Awaited<ReturnType<typeof make>>;
  try {
    landmarker = await make('GPU');
  } catch {
    landmarker = await make('CPU');
  }

  return {
    detectVideo(video, timestampMs) {
      return toFrame(landmarker.detectForVideo(video, timestampMs) as unknown as MpResult);
    },
    async detectStills(sources) {
      const out: Array<PoseFrame | null> = [];
      await landmarker.setOptions({ runningMode: 'IMAGE' });
      try {
        for (const src of sources) out.push(toFrame(landmarker.detect(src) as unknown as MpResult));
      } finally {
        await landmarker.setOptions({ runningMode: 'VIDEO' });
      }
      return out;
    },
    close() {
      landmarker.close();
    },
  };
}
