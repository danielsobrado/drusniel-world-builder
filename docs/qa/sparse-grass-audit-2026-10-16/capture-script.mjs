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
const out = path.join(root, 'docs/qa/sparse-grass-audit-2026-10-16');
const url = 'http://localhost:5178';
await mkdir(out, { recursive: true });
const prior = JSON.parse(await readFile(path.join(root, 'docs/qa/visual-audit-2026-10-15/manifest.json'), 'utf8'));
const poses = prior.requestedPoses.filter(p => ['random-03', 'random-04', 'random-06', 'random-09', 'random-10'].includes(p.id));
for (const id of ['random-04', 'random-09']) {
  const pose = poses.find(p => p.id === id);
  poses.push({ ...pose, id: `${id}-ground`, name: `${pose.name} ground inspection`, pitch: -.65 });
}
const generator = {toMetadata: () => prior.generator};
const sampled = prior.sampledCandidates;
const report = { schemaVersion: 1, kind: 'visual-audit', startedAt: new Date().toISOString(),
  viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, seed: 20261015,
  selection: 'Five fixed procedural poses replayed from the October 15 manifest; two additional downward inspection views at the same coordinates.',
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
  report.configSha256 = await fileHash(path.join(root, 'editor.config.yaml'));
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
