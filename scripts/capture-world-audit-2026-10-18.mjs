import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { prepareVisualPose } from '../scripts/lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from '../scripts/lib/world-visual-canvas.mjs';
import { captureVisualSource, visualSourceStayedFixed } from '../scripts/lib/world-visual-source.mjs';
import { fileHash } from '../scripts/lib/world-visual-report.mjs';
import { waitForPerfRunLock } from '../scripts/perf-run-lock.mjs';
import { createBrowserErrorMonitor } from '../scripts/lib/perf-browser-errors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(root, process.env.AAA_AUDIT_OUT ?? 'docs/qa/visual-audit-2026-10-18');
const url = process.env.AAA_AUDIT_URL ?? 'http://localhost:5267';
await mkdir(out, { recursive: true });
const config = yaml.load(await readFile(path.join(root, 'editor.config.yaml'), 'utf8'));
const generator = new ProceduralWorldGenerator({ seed: config.world.seed, version: config.world.generatorVersion,
  heightScale: config.world.heightScale, seaLevel: config.world.seaLevel });
const names = ['Marine', 'Hot desert', 'Cold desert', 'Savanna', 'Grassland', 'Tropical seasonal forest',
  'Temperate deciduous forest', 'Tropical rainforest', 'Temperate rainforest', 'Taiga', 'Tundra', 'Glacier', 'Wetland'];
let randomState = 20261018, sampled = 0;
const next = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
const found = new Map();
while (found.size < 12 && sampled < 1000000) {
  sampled++;
  const cellX = Math.floor(next() * 16000) - 8000, cellZ = Math.floor(next() * 16000) - 8000;
  const id = generator.sampleTile(cellX, cellZ);
  if (id < 1 || id > 12 || found.has(id)) continue;
  found.set(id, { id: `random-${String(id).padStart(2, '0')}`, name: names[id], world: 'procedural',
    expectedBiomeId: id, x: (cellX + .5) * 2, z: -(cellZ + .5) * 2,
    yaw: next() * Math.PI * 2, pitch: -.08, mode: 'player', heightAboveGround: 1.7, fov: 68 });
}
if (found.size !== 12) throw new Error(`Only found ${found.size} land biomes after ${sampled} candidates.`);
const shore = JSON.parse(await readFile(path.join(root, 'docs/qa/world-visual-quality-2026-10-14/biomes/shore-review-poses.json'), 'utf8'));
const poses = [...found.values()].sort((a, b) => a.expectedBiomeId - b.expectedBiomeId);
poses.push(...shore.marine.map(p => ({ ...p, world: 'procedural', name: 'Marine coast (targeted supplement)', selection: 'existing coast fixture' })));
for (const biome of [6, 9, 11, 12]) {
  const choices = shore.imported.filter(p => p.expectedBiomeId === biome);
  const pose = choices[Math.floor(next() * choices.length)];
  poses.push({ ...pose, fov: pose.fov ?? 68, world: 'eldara', name: `Eldara ${names[biome]}`,
    selection: 'seeded choice of existing imported biome views' });
}
const report = { schemaVersion: 1, kind: 'visual-audit', startedAt: new Date().toISOString(),
  viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, seed: 20261018,
  selection: 'First encountered point for each land biome in seeded random cell samples, then two fixed coast supplements and four seeded imported-view choices.',
  sampledCandidates: sampled, generator: generator.toMetadata(), lighting: { preset: 'highfield', hour: 12, weather: 'off' },
  requestedPoses: poses, poses: [], failures: [], artifacts: [] };
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ sampled, poses: poses.map(p => ({ id: p.id, x: p.x, z: p.z, biome: p.expectedBiomeId })) }));
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let browser, page, monitor;
try {
  const source = await captureVisualSource(url, root);
  await writeFile(path.join(out, 'source-snapshot.json'), JSON.stringify(source, null, 2) + '\n');
  report.sourceSha = source.sourceSha;
  report.sourceSnapshotSha256 = source.sourceSnapshot?.sha256;
  if (source.sourceSnapshot?.files['editor.config.yaml'] !== await fileHash(path.join(root, 'editor.config.yaml'))) throw new Error('Selection config differs from frozen runtime.');
  for (const file of ['src/editor/world/ProceduralWorldGenerator.js', 'src/editor/world/ProceduralBiomeClassifier.js']) {
    if (source.sourceSnapshot?.files[file] && source.sourceSnapshot.files[file] !== await fileHash(path.join(root, file))) throw new Error(`Selection source changed: ${file}`);
  }
  report.configSha256 = await fileHash(path.join(root, 'editor.config.yaml'));
  report.mapSha256 = await fileHash(path.join(root, shore.map));
  report.captureScriptSha256 = await fileHash(fileURLToPath(import.meta.url));
  browser = await chromium.launch({ headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
  monitor = createBrowserErrorMonitor(page);
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
  report.adapter = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
    return { vendor: a?.info.vendor, architecture: a?.info.architecture, description: a?.info.description,
      fallback: !!(a?.info.isFallbackAdapter ?? a?.isFallbackAdapter), backend: window.__editor.terrainView.rendererBackendStatus.mode };
  });
  if (report.adapter.backend !== 'webgpu' || report.adapter.fallback || /swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(report.adapter)))
    throw new Error('Hardware WebGPU required.');
  console.log(JSON.stringify({ adapter: report.adapter }));
  await page.evaluate(() => window.__worldVisualQa.setLighting());
  report.lightingSettled = await page.evaluate(() => window.__worldVisualQa.settleLighting());
  let world = 'procedural';
  for (const pose of poses) {
    console.log(`Capturing ${pose.id}: ${pose.name}`);
    if (pose.world !== world) {
      await page.evaluate(name => window.__worldVisualQa.loadWorld(name), pose.world);
      await page.evaluate(() => window.__worldVisualQa.setLighting());
      world = pose.world;
    }
    try {
      const preparation = await prepareVisualPose(page, pose);
      const lighting = await page.evaluate(() => window.__worldVisualQa.settleLighting());
      const state = await page.evaluate(() => {
        const d = window.__worldVisualQa.diagnostics();
        d.placementCounts = Object.fromEntries(Object.entries(d.placements).map(([k, v]) => [k, v.length]));
        delete d.placements; delete d.counters; delete d.preparationJobs;
        return d;
      });
      if (!state.assetIntegrity?.ready) throw new Error('Required tree assets are degraded.');
      if (!state.readiness.ready || state.actualBiomeId !== pose.expectedBiomeId)
        throw new Error(`Pose readiness/biome mismatch: ${state.actualBiomeId}`);
      await page.screenshot({ path: path.join(out, `${pose.id}-hud.png`) });
      if (!await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true))) throw new Error('Capture UI was blocked.');
      await captureWorldCanvas(page, path.join(out, `${pose.id}.png`));
      await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
      report.poses.push({ ...pose, ...state, preparation, lighting });
      for (const suffix of ['.png', '-hud.png']) {
        const file = `${pose.id}${suffix}`;
        report.artifacts.push({ path: file, sha256: await fileHash(path.join(out, file)) });
      }
      console.log(`Captured ${pose.id}; ready in ${Math.round(preparation.readiness.waitedMs)} ms.`);
    } catch (error) {
      report.failures.push({ pose, error: error.stack, readiness: await page.evaluate(() => window.__worldVisualQa.readiness()) });
      console.log(`FAILED ${pose.id}: ${error.message}`);
    }
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  report.sourceStayedFixed = visualSourceStayedFixed(source, await captureVisualSource(url, root));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  report.errors = monitor?.snapshot() ?? { count: 0, errors: [] };
  report.finishedAt = new Date().toISOString();
  await browser?.close(); release();
  report.captureValid = !report.failure && !report.failures.length && report.sourceStayedFixed && report.errors.count === 0 && report.poses.length === poses.length;
  if (!report.captureValid) process.exitCode = 1;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ captureValid: report.captureValid, count: report.poses.length, failures: report.failures.length, errorCount: report.errors.count, failure: report.failure }));
}
