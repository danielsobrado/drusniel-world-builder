import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBasicNodeMaterial, Scene } from 'three/webgpu';
import { MeadowGrassBatches } from '../src/editor/stylized/meadow/MeadowGrassBatches.js';
import { MeadowPublicationBudget } from '../src/editor/stylized/meadow/MeadowPublicationBudget.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';

function fixture(t) {
  const template = createMeadowTemplate({ detail: 2, count: 4096, tileSize: 8 });
  const material = new MeshBasicNodeMaterial();
  const batches = new MeadowGrassBatches({ scene: new Scene(), templates: { low: template }, material,
    name: 'retirement', boundsPadding: 1 });
  const tiles = Array.from({ length: 48 }, (_, i) => ({ buildId: 1, builtBand: 'low', renderX: i * 8, renderZ: 0,
    output: { count: 1024 + i % 5 * 128, position: new Float32Array(4096 * 4).fill(i),
      rotation: new Float32Array(4096 * 2), data: new Float32Array(4096 * 4), minHeight: 0, maxHeight: i } }));
  const commit = (members, budget) => { batches.begin(); for (const tile of members) batches.add('low', tile); return batches.commit(budget); };
  commit(tiles);
  t.after(() => { batches.dispose(); material.dispose(); template.dispose(); });
  return { batches, tiles, commit, pages: batches.batches.get('low').pages };
}

test('variable-count retirement repacks share one allowance and preserve complete resident data', t => {
  const f = fixture(t), survivors = f.tiles.filter((_, i) => i % 16 !== 1);
  const limit = 768 * 1024, budget = new MeadowPublicationBudget(limit);
  PerfCounters.reset();
  f.commit(survivors, budget);
  assert.ok(f.batches.pending > 0, 'other page rewrites wait instead of bursting in one frame');
  assert.ok(budget.used > 0);
  assert.equal(PerfCounters.get('meadowRepackBytes'), budget.used);
  const first = budget.used;
  f.commit(survivors, budget);
  assert.equal(budget.used, first, 'a repeated preparation pass cannot renew the frame allowance');
  let frames = 1;
  while (f.batches.pending) {
    budget.reset(limit); f.commit(survivors, budget); frames++;
    assert.ok(frames < 10);
    // At most one page exceeds the limit; all pages retain their original capacity.
    assert.ok(budget.used <= Math.max(limit, 65536 * 56));
  }
  assert.ok(frames > 1);
  assert.equal(f.pages.reduce((n, page) => n + page.geometry.instanceCount, 0),
    survivors.reduce((n, tile) => n + tile.output.count, 0));
  for (const tile of survivors) {
    assert.ok(f.batches.isPublished(tile));
    const page = f.batches.batches.get('low').slots.get(tile), slot = page.slots.get(tile);
    assert.deepEqual(page.geometry.getAttribute('instancePosition').array.subarray(slot.start * 4,
      (slot.start + slot.count) * 4), tile.output.position.subarray(0, tile.output.count * 4));
  }
});

test('origin maintenance is charged before optional work and keeps deferred pages spatially correct', t => {
  const f = fixture(t), budget = new MeadowPublicationBudget(1024);
  const versions = f.pages.map(p => p.geometry.getAttribute('instancePosition').version);
  const before = f.pages.map(p => ({ x: p.geometry.getAttribute('instanceTile').array[0],
    boundX: p.geometry.boundingBox.min.x }));
  f.batches.rebase(-4096, 4096, budget);
  assert.ok(budget.used > budget.limit);
  assert.equal(budget.take(56), false, 'mandatory work leaves no optional publication allowance');
  f.pages.forEach((page, i) => {
    assert.equal(page.geometry.getAttribute('instancePosition').version, versions[i]);
    assert.equal(page.geometry.getAttribute('instanceTile').array[0], before[i].x - 4096);
    assert.equal(page.geometry.boundingBox.min.x, before[i].boundX - 4096);
  });
});
