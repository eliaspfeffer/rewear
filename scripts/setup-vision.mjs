import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const source = path.resolve('node_modules/@mediapipe/tasks-vision');
const target = path.resolve('public/vendor/vision');
await mkdir(path.join(target, 'wasm'), { recursive: true });
await copyFile(path.join(source, 'vision_bundle.mjs'), path.join(target, 'vision_bundle.mjs'));
for (const name of ['vision_wasm_internal', 'vision_wasm_nosimd_internal']) {
  for (const extension of ['js', 'wasm']) {
    const file = `${name}.${extension}`;
    await copyFile(path.join(source, 'wasm', file), path.join(target, 'wasm', file));
  }
  const wasm = await readFile(path.join(target, 'wasm', `${name}.wasm`));
  assert.equal(wasm.subarray(0, 4).toString('hex'), '0061736d', 'Invalid MediaPipe WebAssembly binary');
}
const model = path.join(target, 'face_landmarker.task');
const temporary = model + '.download';
try {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`MediaPipe model download failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.byteLength > 1000000 && bytes.byteLength < 30000000, 'Unexpected MediaPipe model size');
  await writeFile(temporary, bytes);
  await rename(temporary, model);
  console.log('Local portrait analysis is ready. No personal photographs were accessed.');
} finally { await rm(temporary, { force: true }); }
