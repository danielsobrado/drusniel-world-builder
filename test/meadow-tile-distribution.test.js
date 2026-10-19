import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { createCompaction } from '../src/editor/stylized/meadow/meadowGrassCompaction.js';

function compact(centerX, centerZ, count, cards = false) {
  const template = createMeadowTemplate({ detail: 2, count, tileSize: 8, cards });
  const job = createCompaction({ template, centerX, centerZ, sample: (x, z, rank, out) => {
    Object.assign(out, { height: x * .1 + z * .2, strength: 1, shape: 0, path: 0 });
    return rank % 3 !== 0;
  } });
  job.advance(); template.dispose(); return job.output;
}

test('neighbouring tiles break repeated clump coordinates while preserving bounds and density', () => {
  const a = compact(4, 4, 4096), b = compact(12, 4, 4096);
  assert.equal(a.count, b.count);
  let repeated = 0;
  const bins = new Uint32Array(16);
  for (let i = 0; i < a.count; i++) {
    const x = a.position[i * 4], z = a.position[i * 4 + 2];
    assert.ok(x >= -4 && x < 4 && z >= -4 && z < 4);
    assert.ok(Math.abs(a.position[i * 4 + 1] - ((4 + x) * .1 + (4 + z) * .2)) < 1e-6);
    bins[Math.floor((x + 4) / 2) + Math.floor((z + 4) / 2) * 4]++;
    if (x === b.position[i * 4] && z === b.position[i * 4 + 2]) repeated++;
  }
  assert.equal(repeated, 0);
  for (const count of bins) assert.ok(Math.abs(count - a.count / 16) < a.count / 160);
});

test('canonical large-coordinate distribution preserves near/card prefixes and eviction replay', () => {
  const full = compact(-4200004, 16000004, 4096), prefix = compact(-4200004, 16000004, 512, true);
  assert.deepEqual(prefix.position.subarray(0, prefix.count * 4), full.position.subarray(0, prefix.count * 4));
  assert.deepEqual(compact(-4200004, 16000004, 4096).position, full.position);
});
