import assert from 'node:assert/strict';
import test from 'node:test';
import { stretchToTarget } from '../scripts/lib/noise-pack-math.mjs';
import { acquireWorldNoise, downsampleWorldNoiseLayer, WORLD_NOISE_NEUTRAL } from '../src/editor/stylized/worldNoise.js';
import { WORLD_NOISE_LAYER_NAMES, WORLD_NOISE_LAYERS, WORLD_NOISE_SIZE } from '../src/editor/stylized/worldNoiseLayout.js';

test('a packed channel is stretched to the shared mean and spread, inside 0..1', () => {
  // A narrow field like the library's Perlin: 0.5..0.9.
  const source = Float32Array.from({ length: 4096 }, (_, i) => 0.7 + 0.2 * Math.sin(i * 0.37));
  const out = stretchToTarget(source);
  const mean = out.reduce((sum, value) => sum + value, 0) / out.length;
  const std = Math.sqrt(out.reduce((sum, value) => sum + (value - mean) ** 2, 0) / out.length);
  assert.ok(Math.abs(mean - 0.5) < 0.01 && Math.abs(std - 0.2) < 0.01, `mean ${mean}, std ${std}`);
  assert.ok(out.every((value) => value >= 0 && value <= 1));
  assert.ok(stretchToTarget(new Float32Array(16).fill(0.3)).every((value) => value === 0.5), 'a flat field stays flat');
});

test('the world noise exists at full size and neutral before its file arrives', () => {
  const { texture, whenLoaded } = acquireWorldNoise();
  assert.strictEqual(acquireWorldNoise().texture, texture, 'one texture for every consumer');
  assert.equal(texture.image.depth, WORLD_NOISE_LAYER_NAMES.length);
  assert.equal(texture.image.width, WORLD_NOISE_SIZE);
  assert.ok(texture.image.data.every((byte) => byte === WORLD_NOISE_NEUTRAL));
  assert.deepEqual(WORLD_NOISE_LAYERS, { macro: 0, meso: 1, micro: 2, water: 3, sky: 4 });
  let called = false;
  const cancel = whenLoaded(() => { called = true; });
  assert.equal(typeof cancel, 'function');
  cancel();
  assert.equal(called, false, 'nothing loads without a bitmap decoder');
});

test('a layer box-filters down to the atlas resolution', () => {
  const pixels = new Uint8Array(WORLD_NOISE_SIZE * WORLD_NOISE_SIZE * 2 * 4);
  const layer = WORLD_NOISE_SIZE * WORLD_NOISE_SIZE * 4;
  // Layer 1: left half 0, right half 200 in red.
  for (let y = 0; y < WORLD_NOISE_SIZE; y += 1) {
    for (let x = WORLD_NOISE_SIZE / 2; x < WORLD_NOISE_SIZE; x += 1) pixels[layer + (y * WORLD_NOISE_SIZE + x) * 4] = 200;
  }
  const target = new Uint8Array(8 + 64 * 64 * 4);
  downsampleWorldNoiseLayer(pixels, 1, 64, target, 8);
  assert.equal(target[8], 0);
  assert.equal(target[8 + 63 * 4], 200);
  assert.equal(target[8 + (63 * 64 + 31) * 4], 0);
  assert.equal(target[8 + (63 * 64 + 32) * 4], 200);
});
