// Grass-focused visual audit: random procedural spots per land biome, five framings each.
// node tmp/capture-grass-audit-2026-10-17.mjs   (env GRASS_AUDIT_URL, GRASS_AUDIT_OUT, GRASS_AUDIT_SEED)
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { prepareVisualPose } from '../scripts/lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from '../scripts/lib/world-visual-canvas.mjs';
import { waitForPerfRunLock } from '../scripts/perf-run-lock.mjs';
import { createBrowserErrorMonitor } from '../scripts/lib/perf-browser-errors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(root, process.env.GRASS_AUDIT_OUT ?? 'tmp/grass-audit-2026-10-17');
const url = process.env.GRASS_AUDIT_URL ?? 'http://localhost:5191';
const seed = Number(process.env.GRASS_AUDIT_SEED ?? 20261017);
const only = process.env.GRASS_AUDIT_ONLY?.split(',').map(Number);
await mkdir(out, { recursive: true });
const config = yaml.load(await readFile(path.join(root, 'editor.config.yaml'), 'utf8'));
const generator = new ProceduralWorldGenerator({ seed: config.world.seed, version: config.world.generatorVersion,
  heightScale: config.world.heightScale, seaLevel: config.world.seaLevel });
const names = ['Marine', 'Hot desert', 'Cold desert', 'Savanna', 'Grassland', 'Tropical seasonal forest',
  'Temperate deciduous forest', 'Tropical rainforest', 'Temperate rainforest', 'Taiga', 'Tundra', 'Glacier', 'Wetland'];
let state = seed, sampled = 0;
const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
const found = new Map();
const wanted = only ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
while (found.size < wanted.length && sampled < 1000000) {
  sampled++;
  const cellX = Math.floor(next() * 16000) - 8000, cellZ = Math.floor(next() * 16000) - 8000;
  const id = generator.sampleTile(cellX, cellZ);
  // Require a homogeneous 5×5 neighbourhood so the shot sits inside the biome, not on a seam.
  if (!wanted.includes(id) || found.has(id)) continue;
  let same = true;
  for (let dz = -2; dz <= 2 && same; dz++) for (let dx = -2; dx <= 2; dx++) if (generator.sampleTile(cellX + dx * 3, cellZ + dz * 3) !== id) { same = false; break; }
  if (!same) continue;
  found.set(id, { id: `b${String(id).padStart(2, '0')}`, name: names[id], expectedBiomeId: id,
    x: (cellX + .5) * 2, z: -(cellZ + .5) * 2, yaw: next() * Math.PI * 2 });
}
const spots = [...found.values()].sort((a, b) => a.expectedBiomeId - b.expectedBiomeId);
// Framings: eye level, eye level reversed (other side of the sun), look-down close-up,
// knee-height hero shot, and a 45 m aerial to judge the far field and LOD transitions.
const framings = (s) => [
  { tag: 'eye', mode: 'player', heightAboveGround: 1.7, yaw: s.yaw, pitch: -0.08, fov: 68 },
  { tag: 'eye-rev', mode: 'player', heightAboveGround: 1.7, yaw: s.yaw + Math.PI, pitch: -0.08, fov: 68 },
  { tag: 'down', mode: 'player', heightAboveGround: 1.7, yaw: s.yaw + Math.PI / 2, pitch: -0.62, fov: 68 },
  { tag: 'low', mode: 'fly', heightAboveGround: 0.45, yaw: s.yaw, pitch: 0.03, fov: 55 },
  { tag: 'aerial', mode: 'fly', heightAboveGround: 45, yaw: s.yaw, pitch: -0.42, fov: 60 },
];
const report = { seed, sampled, startedAt: new Date().toISOString(), url, spots, shots: [], failures: [] };
console.log(JSON.stringify({ sampled, spots: spots.map((s) => [s.id, s.x, s.z]) }));
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let browser, monitor;
try {
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  monitor = createBrowserErrorMonitor(page);
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 300000 });
  await page.evaluate(() => window.__worldVisualQa.setLighting());
  await page.evaluate(() => window.__worldVisualQa.settleLighting());
  for (const spot of spots) {
    for (const [i, f] of framings(spot).entries()) {
      const pose = { ...spot, ...f, id: `${spot.id}-${f.tag}` };
      console.log(`Capturing ${pose.id} ${spot.name}`);
      try {
        await prepareVisualPose(page, pose, { minimumMs: i === 0 ? 16000 : 4000 });
        await page.evaluate(() => window.__worldVisualQa.settleLighting());
        const d = await page.evaluate(() => { const d = window.__worldVisualQa.diagnostics(); return { biome: d.actualBiomeId, ready: d.readiness?.ready, pose: d.pose ?? d.camera }; });
        if (!await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true))) throw new Error('Capture UI was blocked.');
        await captureWorldCanvas(page, path.join(out, `${pose.id}.png`));
        await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
        report.shots.push({ id: pose.id, name: spot.name, x: spot.x, z: spot.z, ...f, ...d });
      } catch (error) {
        report.failures.push({ id: pose.id, error: error.message });
        console.log(`FAILED ${pose.id}: ${error.message}`);
      }
      await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  report.errors = monitor?.snapshot() ?? null;
  report.finishedAt = new Date().toISOString();
  await browser?.close(); release();
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ shots: report.shots.length, failures: report.failures.length, failure: report.failure }));
}
