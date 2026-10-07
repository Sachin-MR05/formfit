/** Where the self-hosted MediaPipe assets live (filled by `npm run setup:models`). */
export type PoseVariant = 'lite' | 'full' | 'heavy';

const base = `${import.meta.env.BASE_URL}models`;

export const WASM_BASE = `${base}/wasm`;
export const poseModelUrl = (variant: PoseVariant): string => `${base}/pose_landmarker_${variant}.task`;
