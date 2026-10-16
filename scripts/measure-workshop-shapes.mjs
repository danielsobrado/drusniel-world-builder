// CPU planning/build benchmark; use browser QA for real input and render-frame measurements.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { WorkshopShapeCache } from '../src/editor/workshop/shapes/WorkshopShapeCache.js';
import { normalizeProceduralRecipe } from '../src/editor/workshop/ProceduralAssetStore.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';
import { workshopReviewSource } from './lib/workshopReviewManifest.mjs';

const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'tmp/workshop-cpu.json';
const report = { kind: 'workshop-cpu-build', source: await workshopReviewSource(process.cwd()), fixtures: [] };
for (const id of ['rounded-cottage', 'buttressed-chapel', 'balcony-tower', 'cottage-turret']) {
  const samples = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    const recipe = structuredClone(normalizeProceduralRecipe({ detail: 2, ivy: true, composition: createShapePreset(id) }));
    const cache = new WorkshopShapeCache();
    try {
      let result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans); cache.releaseRemoved(result);
      for (let i = 0; i < 6; i++) {
        recipe.composition.primitives[0].openings.find(o => o.role === 'window').bottom += 0.01;
        const start = performance.now(), plans = planWorkshopComposition(recipe).shapePlans, planningMs = performance.now() - start;
        result = cache.update({ ...recipe, shapeInteractive: true }, plans); cache.releaseRemoved(result);
        if (i) samples.push({ repeat, planningMs, generationMs: result.stats.generationMs, totalMs: performance.now() - start,
          rebuiltDomains: result.stats.rebuiltDomains, reused: result.stats.reused });
      }
    } finally { cache.clear(); }
  }
  const values = samples.map(s => s.totalMs).sort((a, b) => a - b);
  report.fixtures.push({ id, samples, p50: values[Math.floor(values.length * 0.5)], p95: values[Math.floor(values.length * 0.95)] });
}
report.beams = [];
for (let repeat = 0; repeat < 5; repeat++) {
  const mesh = new ShapeMesh(), start = performance.now();
  for (let i = 0; i < 1000; i++) mesh.beam([i / 10, 0, 0], [i / 10 + 0.5, 2, 0.25], 0.06, 0.08);
  report.beams.push(performance.now() - start);
}
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ fixtures: report.fixtures.map(({ id, p50, p95 }) => ({ id, p50, p95 })), beams: report.beams }));
