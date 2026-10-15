import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MeshBasicMaterial, Scene } from 'three/webgpu';
import { MeadowTileLayer } from '../src/editor/stylized/meadow/MeadowTileLayer.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { createCompaction } from '../src/editor/stylized/meadow/meadowGrassCompaction.js';

// Isolated work-count probe, not a gameplay timing benchmark.
// Models movement promoting a tile while its unchanged ground is still building.
// Usage: node scripts/benchmark-meadow-work.mjs [report-path]
const templates = {
  low: createMeadowTemplate({ detail: 2, count: 512, tileSize: 8 }),
  high: createMeadowTemplate({ detail: 5, count: 2048, tileSize: 8 }),
};
let samples = 0;
const sample = (x, z, rank, out) => {
  samples++;
  Object.assign(out, { height: x * 0.2 + z * 0.3, strength: 0.8, shape: 2, path: 0.2 });
  return rank % 3 !== 0;
};
const material = new MeshBasicMaterial();
const layer = new MeadowTileLayer({ scene: new Scene(), name: 'work-probe',
  tileSize: 8, reach: 0, templates, material, selectBand: () => 'high',
  ground: { revision: 1, revisionAt: () => 1, forTile: () => ({ revision: 1, sample }) } });

function partial() {
  const job = createCompaction({ template: templates.low, centerX: 4, centerZ: 4, sample });
  job.advance(256);
  return job;
}

try {
  const job = partial();
  const tile = { key: '0:0', centerX: 4, centerZ: 4, renderX: 4, renderZ: 4,
    band: 'high', preparationBand: 'high', preparationCapacity: 2048, revision: 1,
    output: null, buildId: 0, inView: true, distanceSquared: 0,
    job: { band: 'low', revision: 1, compaction: job } };
  layer.tiles.set(tile.key, tile);
  layer.rebuildStaleTiles();
  const partialDiscarded = tile.job === null;
  layer.time = 1;
  layer.buildTiles(layer.staleTiles, Infinity);
  const currentSamples = samples;

  // Exercise the existing compactor's prefix support without modifying the
  // runtime scheduler. A future change must retain an exact processed cursor.
  samples = 0;
  const retained = partial();
  const resumed = createCompaction({ template: templates.high, centerX: 4, centerZ: 4,
    sample, previous: { capacity: 256, output: retained.output } });
  resumed.advance();
  const resumedSamples = samples;
  assert.equal(resumed.output.count, tile.output.count);
  assert.equal(resumed.output.minHeight, tile.output.minHeight);
  assert.equal(resumed.output.maxHeight, tile.output.maxHeight);
  for (const [name, width] of [['position', 4], ['rotation', 2], ['data', 4]]) {
    assert.deepEqual(resumed.output[name].subarray(0, resumed.output.count * width),
      tile.output[name].subarray(0, tile.output.count * width));
  }
  const report = { kind: 'meadow-partial-promotion-work-probe', partialDiscarded,
    currentSamples, resumedSamples, repeatedSamples: currentSamples - resumedSamples,
    survivingStems: tile.output.count, outputByteIdentical: true,
    scope: 'One synthetic unchanged-ground promotion; no FPS or route-wide savings claim.' };
  const outputPath = process.argv[2] ?? 'tmp/meadow-work.json';
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  layer.dispose();
  material.dispose();
  for (const template of Object.values(templates)) template.dispose();
}
