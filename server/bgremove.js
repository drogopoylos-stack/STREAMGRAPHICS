// Background removal for player photos with the ISNet (general use) ONNX model.
// Model file: models/isnet-general-use.onnx (from the rembg project releases).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './util.js';

const MODEL = path.join(ROOT, 'models', 'isnet-general-use.onnx');
const MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx';
const SIZE = 1024;
let sessionPromise = null;

async function download() {
  fs.mkdirSync(path.dirname(MODEL), { recursive: true });
  const r = await fetch(MODEL_URL);
  if (!r.ok) throw new Error(`model download failed: HTTP ${r.status}`);
  const tmp = MODEL + '.part';
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  fs.renameSync(tmp, MODEL);
}

function session() {
  sessionPromise ??= (async () => {
    if (!fs.existsSync(MODEL)) await download();
    const ort = await import('onnxruntime-node');
    return ort.InferenceSession.create(MODEL, { graphOptimizationLevel: 'all' });
  })().catch((e) => { sessionPromise = null; throw e; });
  return sessionPromise;
}

/** Cut the subject out of an image. Returns { data, info } raw RGBA (same size as input). */
export async function removeBackground(input) {
  const ort = await import('onnxruntime-node');
  const sess = await session();
  const base = sharp(input).rotate();
  const { data: rgb, info } = await base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: small } = await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
    .resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });

  // ISNet input: CHW float, (x/255 - 0.5) / 1.0
  const plane = SIZE * SIZE;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    tensor[i] = small[i * 3] / 255 - 0.5;
    tensor[plane + i] = small[i * 3 + 1] / 255 - 0.5;
    tensor[2 * plane + i] = small[i * 3 + 2] / 255 - 0.5;
  }
  const feeds = { [sess.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) };
  const out = (await sess.run(feeds))[sess.outputNames[0]].data;

  let mi = Infinity, ma = -Infinity;
  for (let i = 0; i < plane; i++) { if (out[i] < mi) mi = out[i]; if (out[i] > ma) ma = out[i]; }
  const span = ma - mi || 1;
  const mask = Buffer.alloc(plane);
  for (let i = 0; i < plane; i++) {
    const v = (out[i] - mi) / span;
    // Small contrast curve: drop haze below 8 %, make the core solid above 92 %.
    mask[i] = Math.round(255 * Math.min(1, Math.max(0, (v - 0.08) / 0.84)));
  }
  // sharp can hand back 3 channels for a 1-channel raw input: read with the real stride.
  const { data: alphaBuf, info: ai } = await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .resize(info.width, info.height, { fit: 'fill', kernel: 'lanczos3' }).toColourspace('b-w').extractChannel(0)
    .raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = alphaBuf[i * ai.channels];

  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, n = info.width * info.height; i < n; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  return { data: rgba, info: { width: info.width, height: info.height, channels: 4 } };
}

export function modelReady() {
  return fs.existsSync(MODEL);
}
