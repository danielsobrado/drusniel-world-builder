import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectChunkTreeBases,
  microhabitatAffinityWeight,
  normalizeAffinity,
  sampleMicrohabitat,
} from '../src/editor/stylized/MicrohabitatField.js';
import { createBiomePrototypeSelector } from '../src/editor/stylized/BiomePrototypeSelector.js';

test('sampleMicrohabitat derives deterministic log, treeBase, water, shade, and gap signals across chunk boundaries', () => {
  const treeBases = collectChunkTreeBases(0, 0, (cx, cz) => (
    cx === 1 && cz === 0 ? [{ x: 64.2, z: -12, scale: 1.2 }] : []
  ));
  const logSpines = [{ x0: 10, z0: 4, x1: 14, z1: 4, radius: 0.24, older: true }];

  const nearLog = sampleMicrohabitat(12, 4.5, {
    habitat: { patchCoverage: 0.9, patchEdge: 0.1, waterDistance: 40 },
    treeBases,
    logSpines,
  });
  assert.ok(nearLog.log > 0.6, `expected strong log signal, got ${nearLog.log}`);
  assert.ok(nearLog.shade > 0.75);
  assert.equal(nearLog.water, 0);

  // Adjacent chunk tree at x = 64.2 affects sample at x = 63.0 across chunk boundary.
  const acrossBoundary = sampleMicrohabitat(63.0, -12, {
    habitat: { patchCoverage: 0.4, patchEdge: 0.75, waterDistance: 3.5 },
    treeBases,
    logSpines,
  });
  assert.ok(acrossBoundary.treeBase > 0.45);
  assert.ok(acrossBoundary.water > 0.7);
  assert.ok(acrossBoundary.gap >= 0.75);
});

test('normalizeAffinity and microhabitatAffinityWeight steer prototype selection by habitat zone', () => {
  assert.throws(() => normalizeAffinity({ desert: 1 }), /Unknown microhabitat channel/);
  assert.throws(() => normalizeAffinity({ water: Number.NaN }), /finite/);

  const selector = createBiomePrototypeSelector({
    rules: [
      { tileIds: [6], weight: 1, affinity: { log: 4.5, shade: 1.5, gap: -0.6 } },
      { tileIds: [6], weight: 1, affinity: { gap: 4.5, shade: -0.75 } },
    ],
  });
  assert.equal(selector.usesMicrohabitat, true);

  let shadeIndexCount = 0;
  let gapIndexCount = 0;
  const darkLog = { log: 0.9, treeBase: 0.4, water: 0, shade: 0.9, gap: 0.05 };
  const sunlitGap = { log: 0, treeBase: 0, water: 0, shade: 0.05, gap: 0.95 };
  for (let i = 0; i < 40; i += 1) {
    const r = (i + 0.5) / 40;
    if (selector(r, 6, 0, 0, null, darkLog) === 0) shadeIndexCount += 1;
    if (selector(r, 6, 0, 0, null, sunlitGap) === 1) gapIndexCount += 1;
  }
  assert.ok(shadeIndexCount >= 35, `expected log/shade species to dominate (${shadeIndexCount}/40)`);
  assert.ok(gapIndexCount >= 35, `expected sunlit gap species to dominate (${gapIndexCount}/40)`);
  assert.ok(microhabitatAffinityWeight({ water: 3, shade: -0.5 }, { water: 0.8, shade: 0.6 }) > 2.0);
});
