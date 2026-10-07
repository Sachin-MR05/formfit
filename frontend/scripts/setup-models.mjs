#!/usr/bin/env node
/**
 * Prepares the MediaPipe assets the app serves from /models:
 *   1. copies the WASM runtime out of node_modules  -> public/models/wasm
 *   2. downloads the pose landmarker model files    -> public/models/*.task
 *
 * Usage:  npm run setup:models [-- --heavy] [-- --force]
 */
import { access, cp, mkdir, rename, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'models');
const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');

const force = process.argv.includes('--force');
const variants = ['lite', 'full', ...(process.argv.includes('--heavy') ? ['heavy'] : [])];
const urlFor = (v) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/latest/pose_landmarker_${v}.task`;

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';

async function copyWasm() {
  if (!(await exists(wasmSrc))) {
    throw new Error('Could not find @mediapipe/tasks-vision/wasm. Run `npm install` first.');
  }
  const dest = path.join(outDir, 'wasm');
  await mkdir(dest, { recursive: true });
  await cp(wasmSrc, dest, { recursive: true, force: true });
  console.log('✓ MediaPipe WASM runtime copied to public/models/wasm');
}

async function download(variant) {
  const dest = path.join(outDir, `pose_landmarker_${variant}.task`);
  if (!force && (await exists(dest))) {
    console.log(`• ${variant}: already present (use --force to re-download)`);
    return;
  }
  process.stdout.write(`↓ ${variant}: downloading… `);
  const res = await fetch(urlFor(variant));
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${urlFor(variant)}`);
  const tmp = dest + '.part';
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await rename(tmp, dest);
  console.log(`done (${mb((await stat(dest)).size)})`);
}

try {
  await mkdir(outDir, { recursive: true });
  await copyWasm();
  for (const v of variants) await download(v);
  console.log('\nAll set. Start the app with: npm run dev');
} catch (err) {
  console.error('\n✗ ' + (err instanceof Error ? err.message : err));
  console.error(
    'If a download failed, fetch the .task files manually from the URL above and place them in public/models/.',
  );
  process.exit(1);
}
