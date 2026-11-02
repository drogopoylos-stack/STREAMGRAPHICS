import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { editPhoto, executable, PhotoCraftMcp } from '../server/photocraft.js';
import os from 'node:os';

let available = true;
try { executable(); } catch { available = false; }

test('PhotoCraft MCP colour correction preserves the full alpha channel and canvas', { skip: !available }, async () => {
  const width = 48, height = 64;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 8; y < 60; y++) for (let x = 7; x < 41; x++) {
    const i = (y * width + x) * 4;
    data[i] = 80 + y; data[i + 1] = 55 + x; data[i + 2] = 50 + y;
    data[i + 3] = x === 7 ? 100 : 255;
  }
  const input = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await editPhoto(input, { correctColor: true, strength: 0.7 });
  const output = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(output.info.width, width);
  assert.equal(output.info.height, height);
  for (let i = 3; i < data.length; i += 4) assert.equal(output.data[i], data[i], `alpha at ${i}`);
  assert.notDeepEqual(output.data, data);
});

test('PhotoCraft MCP refinement keeps the subject and background hole transparent', { skip: !available }, async () => {
  const width = 64, height = 64;
  const original = Buffer.alloc(width * height * 4);
  const mask = Buffer.alloc(original.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const inside = x >= 12 && x < 52 && y >= 8 && y < 60 && !(x >= 26 && x < 38 && y >= 28 && y < 40);
    original.set(inside ? [140, 80, 55, 255] : [230, 230, 230, 255], i);
    mask.set(inside ? [140, 80, 55, 255] : [0, 0, 0, 0], i);
  }
  const encode = data => sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await editPhoto(await encode(original), { mask: await encode(mask) });
  const { data } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];
  assert.equal(alpha(0, 0), 0);
  assert.equal(alpha(32, 34), 0);
  assert.ok(alpha(20, 20) > 240);
});

test('PhotoCraft MCP exposes engine command failures instead of exporting a partial batch', { skip: !available }, async () => {
  const client = new PhotoCraftMcp(executable(), os.tmpdir(), 10_000);
  try {
    const init = await client.initialize();
    assert.equal(init.serverInfo.name, 'photocraft');
    await assert.rejects(client.tool('command_batch', { steps: [{ id: 'not.a.command' }] }), /failed|unknown|not found/i);
  } finally { client.close(); }
});
