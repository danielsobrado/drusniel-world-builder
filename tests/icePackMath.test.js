import assert from 'node:assert/strict';
import test from 'node:test';
import { iceHeight, iceRoughness, packNormal } from '../scripts/lib/ice-pack-math.mjs';

test('a flat height packs a straight-up normal, a slope tilts it away from the rise, and it wraps', () => {
  const size = 8;
  const flat = packNormal(new Float32Array(size * size).fill(0.5), size, 4);
  assert.ok(flat.every((byte) => byte === 128));
  // Height rising with x: the normal leans toward -x, the same on every row and across the wrap.
  const ramp = Float32Array.from({ length: size * size }, (_, i) => Math.sin((i % size) / size * Math.PI * 2) * 0.5 + 0.5);
  const tilted = packNormal(ramp, size, 4);
  assert.ok(tilted[0] < 128, 'rising at x = 0 leans the normal back');
  assert.equal(tilted[0], tilted[size * 2], 'rows agree');
  assert.ok(tilted[(size / 2) * 2] > 128, 'falling at mid-row leans it forward');
});

test('ice height and roughness stay in range and frost is rougher than clear ice', () => {
  const n = 4;
  const one = (v) => new Float32Array(n).fill(v);
  const height = iceHeight({ ripple: one(1), pits: one(0), cracks: one(0) });
  assert.ok(height.every((v) => v >= 0 && v <= 1));
  const clear = iceRoughness({ cloud: one(0), cracks: one(0), pits: one(1) })[0];
  const frosted = iceRoughness({ cloud: one(1), cracks: one(1), pits: one(0) })[0];
  assert.ok(clear < 0.1 && frosted > 0.7 && frosted <= 1);
});
