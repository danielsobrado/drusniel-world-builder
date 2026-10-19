import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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
import { focusPerfBrowser } from './lib/perf-browser-focus.mjs';
import { setVisualMaterialControl } from './lib/world-visual-material-controls.mjs';
import { captureVisualHarness } from './lib/world-visual-harness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(root, process.env.AAA_AUDIT_OUT ?? 'docs/qa/visual-audit-2026-10-18');
const url = process.env.AAA_AUDIT_URL ?? 'http://localhost:5267';
const settleTimeoutMs = Number(process.env.AAA_AUDIT_SETTLE_MS ?? 120000);
if (!Number.isFinite(settleTimeoutMs) || settleTimeoutMs < 16000) throw new Error('Invalid visual settle timeout.');
async function withDeadline(promise, timeoutMs, phase) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(`Capture phase timed out: ${phase}`),
        { captureDeadline: true })), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error(`Refusing to overwrite an existing audit: ${out}. Set AAA_AUDIT_OUT to an empty directory.`);
const config = yaml.load(await readFile(path.join(root, 'editor.config.yaml'), 'utf8'));
const replayPath = process.env.AAA_AUDIT_MANIFEST;
const replay = replayPath ? JSON.parse(await readFile(path.resolve(root, replayPath), 'utf8')) : null;
const generator = new ProceduralWorldGenerator({ seed: config.world.seed, version: config.world.generatorVersion,
  heightScale: config.world.heightScale, seaLevel: config.world.seaLevel });
const names = ['Marine', 'Hot desert', 'Cold desert', 'Savanna', 'Grassland', 'Tropical seasonal forest',
  'Temperate deciduous forest', 'Tropical rainforest', 'Temperate rainforest', 'Taiga', 'Tundra', 'Glacier', 'Wetland'];
const seed = Number(process.env.AAA_AUDIT_SEED ?? replay?.seed ?? 20261018);
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('AAA_AUDIT_SEED must be an unsigned 32-bit integer.');
let randomState = seed, sampled = 0;
const next = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
const found = new Map();
while (!replay && found.size < 12 && sampled < 1000000) {
  sampled++;
  const cellX = Math.floor(next() * 16000) - 8000, cellZ = Math.floor(next() * 16000) - 8000;
  const id = generator.sampleTile(cellX, cellZ);
  if (id < 1 || id > 12 || found.has(id)) continue;
  found.set(id, { id: `random-${String(id).padStart(2, '0')}`, name: names[id], world: 'procedural',
    expectedBiomeId: id, x: (cellX + .5) * 2, z: -(cellZ + .5) * 2,
    yaw: next() * Math.PI * 2, pitch: -.08, mode: 'player', heightAboveGround: 1.7, fov: 68 });
}
if (!replay && found.size !== 12) throw new Error(`Only found ${found.size} land biomes after ${sampled} candidates.`);
const shore = replay ? { map: replay.map ?? 'maps/Eldara Full 2026-07-23-20-37.json' }
  : JSON.parse(await readFile(path.join(root, 'docs/qa/world-visual-quality-2026-10-14/biomes/shore-review-poses.json'), 'utf8'));
let poses = replay ? replay.requestedPoses.map(pose => ({ ...pose }))
  : [...found.values()].sort((a, b) => a.expectedBiomeId - b.expectedBiomeId);
if (!replay) {
poses.push(...shore.marine.map(p => ({ ...p, world: 'procedural', name: 'Marine coast (targeted supplement)', selection: 'existing coast fixture' })));
for (const biome of [6, 9, 11, 12]) {
  const choices = shore.imported.filter(p => p.expectedBiomeId === biome);
  const pose = choices[Math.floor(next() * choices.length)];
  poses.push({ ...pose, fov: pose.fov ?? 68, world: 'eldara', name: `Eldara ${names[biome]}`,
    selection: 'seeded choice of existing imported biome views' });
}
}
const only = process.env.AAA_AUDIT_ONLY?.split(',');
if (only) {
  if (only.some(id => !poses.some(pose => pose.id === id))) throw new Error('AAA_AUDIT_ONLY contains an unknown pose.');
  poses = poses.filter(pose => only.includes(pose.id));
}
const report = { schemaVersion: 1, kind: 'visual-audit', startedAt: new Date().toISOString(),
  viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, seed,
  selection: replay?.selection ?? 'First encountered point for each land biome in seeded random cell samples, then two fixed coast supplements and four seeded imported-view choices.',
  sampledCandidates: replay?.sampledCandidates ?? sampled, generator: replay?.generator ?? generator.toMetadata(), lighting: { preset: 'highfield', hour: 12, weather: 'off' },
  replayManifest: replayPath ?? null, only: only ?? null, reloadPerPose: process.env.AAA_AUDIT_RELOAD === '1', settleTimeoutMs,
  requestedPoses: poses, poses: [], failures: [], artifacts: [] };
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ sampled, poses: poses.map(p => ({ id: p.id, x: p.x, z: p.z, biome: p.expectedBiomeId })) }));
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let browser, page, monitor, finishFocus;
try {
  const source = await captureVisualSource(url, root);
  await writeFile(path.join(out, 'source-snapshot.json'), JSON.stringify(source, null, 2) + '\n');
  report.sourceSha = source.sourceSha;
  report.sourceSnapshotSha256 = source.sourceSnapshot?.sha256;
  if (!replay && source.sourceSnapshot?.files['editor.config.yaml'] !== await fileHash(path.join(root, 'editor.config.yaml'))) throw new Error('Selection config differs from frozen runtime.');
  for (const file of replay ? [] : ['src/editor/world/ProceduralWorldGenerator.js', 'src/editor/world/proceduralBiomeClassification.js']) {
    if (source.sourceSnapshot?.files[file] && source.sourceSnapshot.files[file] !== await fileHash(path.join(root, file))) throw new Error(`Selection source changed: ${file}`);
  }
  report.configSha256 = source.sourceSnapshot?.files['editor.config.yaml'] ?? await fileHash(path.join(root, 'editor.config.yaml'));
  if (replayPath) report.poseManifestSha256 = await fileHash(path.resolve(root, replayPath));
  report.mapSha256 = await fileHash(path.join(root, shore.map));
  report.captureScriptSha256 = await fileHash(fileURLToPath(import.meta.url));
  report.harness = await captureVisualHarness(import.meta.url, root);
  browser = await chromium.launch({ headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
  monitor = createBrowserErrorMonitor(page);
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
  finishFocus = await focusPerfBrowser(browser, page, { headed: true });
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
    if (report.reloadPerPose && pose !== poses[0]) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
      await page.evaluate(() => window.__worldVisualQa.setLighting());
      world = 'procedural';
    }
    if (pose.world !== world) {
      console.log(`Loading ${pose.world} for ${pose.id}.`);
      await withDeadline(page.evaluate(name => window.__worldVisualQa.loadWorld(name), pose.world), 240000, `load ${pose.world}`);
      await page.evaluate(() => window.__worldVisualQa.setLighting());
      world = pose.world;
      console.log(`Loaded ${world}.`);
    }
    try {
      const preparation = await withDeadline(prepareVisualPose(page, pose, {
        timeoutMs: settleTimeoutMs, onPhase: phase => console.log(`${pose.id}: ${phase}`),
      }), settleTimeoutMs + 60000, `prepare ${pose.id}`);
      const lighting = await page.evaluate(() => window.__worldVisualQa.settleLighting());
      const state = await page.evaluate(() => {
        const d = window.__worldVisualQa.diagnostics();
        d.vegetation = window.__worldVisualQa.vegetation?.() ?? null;
        d.neighborhood = window.__worldVisualQa.neighborhood();
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
      state.controls = [];
      for (const control of (process.env.AAA_AUDIT_CONTROLS ?? '').split(',').filter(Boolean)) {
        try {
          const diagnostic = await setVisualMaterialControl(page, control);
          const file = `${pose.id}-${control}.png`;
          await captureWorldCanvas(page, path.join(out, file));
          report.artifacts.push({ path: file, sha256: await fileHash(path.join(out, file)) });
          state.controls.push(diagnostic);
        } finally { await setVisualMaterialControl(page); }
      }
      await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
      report.poses.push({ ...pose, ...state, preparation, lighting });
      report.errors = monitor.snapshot();
      for (const suffix of ['.png', '-hud.png']) {
        const file = `${pose.id}${suffix}`;
        report.artifacts.push({ path: file, sha256: await fileHash(path.join(out, file)) });
      }
      console.log(`Captured ${pose.id}; ready in ${Math.round(preparation.readiness.waitedMs)} ms.`);
    } catch (error) {
      const readiness = await withDeadline(page.evaluate(() => window.__worldVisualQa.readiness()),
        5000, `failure diagnostics ${pose.id}`).catch(diagnostic => ({ unavailable: diagnostic.message }));
      report.failures.push({ pose, error: error.stack, readiness });
      console.log(`FAILED ${pose.id}: ${error.message}`);
      // A blocked renderer cannot safely prepare the next pose in this browser.
      if (error.captureDeadline) throw error;
    }
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  report.sourceStayedFixed = visualSourceStayedFixed(source, await captureVisualSource(url, root));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  report.errors = monitor?.snapshot() ?? { count: 0, errors: [] };
  if (finishFocus) {
    try { report.focus = await finishFocus(); }
    catch (error) { report.focus = { passed: false, failure: error.message }; }
  }
  report.finishedAt = new Date().toISOString();
  await browser?.close(); release();
  report.captureValid = !report.failure && !report.failures.length && report.sourceStayedFixed && report.errors.count === 0 && report.poses.length === poses.length;
  if (!report.captureValid) process.exitCode = 1;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ captureValid: report.captureValid, count: report.poses.length, failures: report.failures.length, errorCount: report.errors.count, failure: report.failure }));
}
