import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { CollisionWorld } from '../src/editor/collision/CollisionWorld.js';
import { getCollisionWorldComposition } from '../src/editor/collision/CollisionWorldMetrics.js';
import { createPrimitiveCollider } from '../src/editor/collision/colliders/ColliderRecords.js';
import { buildOpportunityVisibilityViewModel } from '../src/sim/presentation/viewModels.js';

// Synthetic scaling probe; use the browser QA harness for gameplay acceptance.
// Usage: node scripts/benchmark-runtime-hotpaths.mjs [report-path]

function colliders(x, count = 64) {
  return Array.from({ length: count }, (_, i) => {
    const minX = x * 128 + 2 + (i % 8) * 12;
    const minZ = -4 - Math.floor(i / 8) * 12;
    return createPrimitiveCollider({ sourceId: `box:${x}:${i}`, type: 'box', ownerChunkX: x,
      ownerChunkZ: 0, aabb: { minX, maxX: minX + 2, minY: 0, maxY: 3, minZ, maxZ: minZ + 2 },
      position: [minX + 1, 1.5, minZ + 1], dimensions: [2, 3, 2] });
  });
}
const world = new CollisionWorld({ chunkWorldSize: 128, binSize: 16 });
for (let x = -128; x < 128; x++) world.replaceOwnerChunk({ chunkX: x, chunkZ: 0, revision: 1, colliders: colliders(x) });
function measure(name, run, iterations) {
  for (let i = 0; i < Math.min(100, iterations); i++) run();
  const samples = [];
  for (let repeat = 0; repeat < 5; repeat++) {
    const started = performance.now();
    for (let i = 0; i < iterations; i++) run();
    samples.push((performance.now() - started) / iterations);
  }
  samples.sort((a, b) => a - b);
  return { name, iterations, medianMs: samples[2], samplesMs: samples };
}
const local = { minX: 1, maxX: 5, minY: 0, maxY: 2, minZ: -5, maxZ: -1 };
let revision = 1;
const replacement = colliders(0);
const opportunities = Array.from({ length: 10000 }, (_, i) => ({ id: `opportunity:${i}`, data: {
  type: 'quest', visibility: i % 2 ? 'private' : 'public',
} }));
const result = [
  measure('local-query-16384-colliders', () => world.collectCandidates(local), 20000),
  measure('composition-16384-colliders', () => getCollisionWorldComposition(world), 2000),
  measure('replace-64-of-16384-colliders', () => world.replaceOwnerChunk({ chunkX: 0, chunkZ: 0, revision: ++revision, colliders: replacement }), 100),
  measure('visibility-10000-opportunities', () => buildOpportunityVisibilityViewModel({ list: () => opportunities }), 5),
];
const outputPath = process.argv[2] ?? 'tmp/runtime-hotpaths.json';
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ node: process.version, result }, null, 2));
console.log(JSON.stringify(result, null, 2));
