/** Canvas drawing for the live skeleton overlay. Colour meaning matches the design tokens. */
import type { CoachResult } from '../../engine/index.ts';
import type { TrackInfo } from '../session/types.ts';
import { CONNECTIONS, SIDES } from './landmarks.ts';

const GOOD = '#22c55e';
const WARN = '#f59e0b';
const BAD = '#ef4444';
const NEUTRAL = '#22d3ee';
const TARGET = '#38bdf8';
const BONE = 'rgba(255,255,255,0.45)';
const D2R = Math.PI / 180;

export interface DrawState {
  coach: CoachResult | null;
  inRep: boolean;
}

function label(ctx: CanvasRenderingContext2D, w: number, x: number, y: number, text: string): void {
  const size = Math.max(12, w / 55);
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width + 10;
  const th = size * 1.5;
  const px = Math.min(Math.max(2, x), w - tw - 2);
  ctx.fillStyle = 'rgba(15,23,42,0.78)';
  ctx.fillRect(px, y - th + 6, tw, th);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, px + 5, y);
}

/** Draw the skeleton for one tracked frame. Does not clear the canvas (call `ctx.clearRect` first, or draw over a still). */
export function drawTrack(ctx: CanvasRenderingContext2D, w: number, h: number, track: TrackInfo, state: DrawState): void {
  const lm = track.landmarks;
  const px = (i: number): [number, number] => [lm[i]!.x * w, lm[i]!.y * h];

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, w / 400);
  ctx.strokeStyle = BONE;
  for (const [a, b] of CONNECTIONS) {
    if (lm[a]!.visibility < 0.3 || lm[b]!.visibility < 0.3) continue;
    const pa = px(a);
    const pb = px(b);
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < lm.length; i++) {
    if (lm[i]!.visibility < 0.3) continue;
    const p = px(i);
    ctx.beginPath();
    ctx.arc(p[0], p[1], w / 300 + 1, 0, Math.PI * 2);
    ctx.fill();
  }

  const ids = SIDES[track.side];
  const sh = px(ids.shoulder);
  const hip = px(ids.hip);
  const kn = px(ids.knee);
  const an = px(ids.ankle);
  const c = state.coach;

  // Segment colours: only judged while a rep is in progress, otherwise neutral cyan.
  const torsoCol = !state.inRep || !c ? NEUTRAL : c.torso === 'ok' ? GOOD : BAD;
  const thighCol = !state.inRep || !c ? NEUTRAL : c.depthOk ? GOOD : WARN;
  const shankCol = c?.alphaHigh ? BAD : state.inRep ? GOOD : NEUTRAL;

  ctx.lineWidth = Math.max(4, w / 160);
  const seg = (a: [number, number], b: [number, number], col: string) => {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  };
  seg(sh, hip, torsoCol);
  seg(hip, kn, thighCol);
  seg(kn, an, shankCol);
  ctx.fillStyle = '#fff';
  for (const p of [sh, hip, kn, an]) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], Math.max(5, w / 130), 0, Math.PI * 2);
    ctx.fill();
  }

  // Ghost torso: where YOUR torso should be for your proportions at this depth. Always shown once personalized
  // (subtler while standing, bold during a rep) so the target is never hidden.
  if (c) {
    const len = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]);
    const t = c.target * D2R;
    const end: [number, number] = [hip[0] + track.facing * len * Math.sin(t), hip[1] - len * Math.cos(t)];
    ctx.save();
    ctx.setLineDash([12, 9]);
    ctx.strokeStyle = TARGET;
    ctx.shadowColor = TARGET;
    ctx.shadowBlur = state.inRep ? 12 : 6;
    ctx.globalAlpha = state.inRep ? 1 : 0.8;
    ctx.lineWidth = Math.max(state.inRep ? 5 : 4, w / (state.inRep ? 150 : 190));
    ctx.beginPath();
    ctx.moveTo(hip[0], hip[1]);
    ctx.lineTo(end[0], end[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = TARGET;
    ctx.beginPath();
    ctx.arc(end[0], end[1], Math.max(6, w / 110), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    label(ctx, w, end[0] + 10, end[1] - 6, `Target ${c.target.toFixed(0)}°`);
  }

  const f = track.features;
  label(ctx, w, kn[0] + 12, kn[1], `Knee ${f.knee.toFixed(0)}°`);
  label(ctx, w, hip[0] + 12, hip[1] - 4, `Hip ${f.hip.toFixed(0)}°`);
  label(ctx, w, sh[0] + 12, sh[1], `Torso ${f.torso.toFixed(0)}°`);
}

/** Draw a still image (calibration photo) with its detected skeleton. */
export function drawStill(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  image: CanvasImageSource,
  track: TrackInfo,
  state: DrawState = { coach: null, inRep: false },
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  drawTrack(ctx, w, h, track, state);
}
