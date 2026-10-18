import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { captureVisualSource, visualSourceStayedFixed } from './lib/world-visual-source.mjs';
import { fileHash } from './lib/world-visual-report.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';

// Diagnostic controls only. These frames are not performance measurements or
// exact pixel A/B tests: particles, wind and water remain animated.
const root = fileURLToPath(new URL('../', import.meta.url));
const url = process.env.AAA_DIAGNOSTIC_URL ?? 'http://localhost:5269';
const out = path.resolve(root, process.env.AAA_DIAGNOSTIC_OUT ?? 'docs/qa/world-look-implementation-2026-10-18/diagnostics');
const manifest = JSON.parse(await readFile(path.join(root, 'docs/plans/aaa-look-and-feel-2026-10-18-poses.json'), 'utf8'));
const original = manifest.poses ?? manifest.requestedPoses;
const qualityReview = process.env.AAA_DIAGNOSTIC_QUALITY === '1';
const ids = qualityReview ? ['random-07', 'random-10'] : ['random-01', 'random-04', 'random-05', 'random-06', 'random-07', 'random-10', 'random-12'];
const poses = ids.map(id => original.find(p => p.id === id));
if (poses.some(p => !p)) throw new Error('Required diagnostic poses are missing.');
if (!qualityReview) poses.push({ id: 'marine-cell', name: 'True marine cell', world: 'procedural', expectedBiomeId: 0,
  x: -2045, z: 1731, yaw: -Math.PI / 2, pitch: -.45, mode: 'fly', heightAboveGround: 30, fov: 60 });
await mkdir(out, { recursive: true });
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`), { timeoutMs: 900000 });
const report = { startedAt: new Date().toISOString(), viewport: { width: 1600, height: 900 },
  interpretation: 'Live animation; distance fog control does not disable regional mist, sky haze, cloud shadows or finishing.',
  poses: [], artifacts: [] };
let browser, monitor, source;
try {
  source = await captureVisualSource(url, root);
  Object.assign(report, source);
  report.harnessSha256 = await fileHash(fileURLToPath(import.meta.url));
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
  monitor = createBrowserErrorMonitor(page);
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
    return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture, description: adapter?.info.description,
      fallback: !!(adapter?.info.isFallbackAdapter ?? adapter?.isFallbackAdapter), backend: window.__editor.terrainView.rendererBackendStatus.mode };
  });
  if (report.adapter.backend !== 'webgpu' || report.adapter.fallback ||
    /swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(report.adapter))) throw new Error('Hardware WebGPU required.');
  await page.evaluate(() => window.__worldVisualQa.setLighting());
  for (const pose of poses) {
    console.log(`Diagnostic ${pose.id}`);
    const preparation = await prepareVisualPose(page, pose);
    await page.evaluate(() => window.__worldVisualQa.settleLighting());
    const state = await page.evaluate(() => {
      const qa = window.__worldVisualQa, d = qa.diagnostics();
      delete d.placements; delete d.counters; delete d.preparationJobs;
      return { ...d, neighborhood: qa.neighborhood(), vegetation: qa.vegetation(), fogDensity: window.__editor.terrainView.scene.fog?.density };
    });
    if (!state.assetIntegrity.ready || !state.readiness.ready || state.actualBiomeId !== pose.expectedBiomeId) throw new Error(`Invalid diagnostic pose ${pose.id}`);
    await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true));
    const capture = async suffix => {
      const file = `${pose.id}-${suffix}.png`;
      await captureWorldCanvas(page, path.join(out, file));
      report.artifacts.push({ path: file, sha256: await fileHash(path.join(out, file)) });
    };
    await capture('normal');
    if (qualityReview) {
      state.qualities = [];
      for (const preset of ['low', 'balanced', 'high']) {
        const settings = await page.evaluate(async preset => {
          const { applyPostProcessingPreset } = await import('/src/render/postprocessing/PostProcessingPresets.js');
          const { postProcessingSettingsToPlain } = await import('/src/render/postprocessing/PostProcessingSettings.js');
          const store = window.__editor.postProcessingStore;
          store.set(postProcessingSettingsToPlain(applyPostProcessingPreset(preset, store.get())), { markCustom: false });
          await window.__worldVisualQa.settle({ minimumMs: 4000 });
          const d = window.__worldVisualQa.diagnostics();
          if (d.finishApplications !== 1 || store.get().preset !== preset) throw new Error('Quality preset or finishing mismatch');
          return { preset: store.get().preset, renderPath: d.renderPath, finishApplications: d.finishApplications };
        }, preset);
        state.qualities.push(settings); await capture(preset);
      }
    } else if (['random-01', 'random-04', 'random-05'].includes(pose.id)) {
      await page.evaluate(() => {
        const fog = window.__editor.terrainView.scene.fog;
        if (!fog?.isFogExp2) throw new Error('Expected exponential distance fog.');
        window.__diagnosticFogRestore = Object.getOwnPropertyDescriptor(fog, 'density');
        Object.defineProperty(fog, 'density', { configurable: true, get: () => 0, set: () => {} });
      });
      try {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await capture('distance-fog-off');
      } finally {
        await page.evaluate(() => Object.defineProperty(window.__editor.terrainView.scene.fog, 'density', window.__diagnosticFogRestore));
      }
    } else if (pose.id !== 'marine-cell') {
      await page.evaluate(() => window.__worldVisualQa.setLayers({ grass: false, bushes: false, flowers: false, details: false, tropical: false }));
      await capture('ground-and-trees');
      await page.evaluate(() => window.__worldVisualQa.setLayers({ trees: false, rocks: false, bushes: false, flowers: false, details: false, tropical: false }));
      await capture('ground-and-grass');
    }
    await page.evaluate(() => { window.__worldVisualQa.setLayers({}); window.__worldVisualQa.setCaptureUi(false); });
    report.poses.push({ ...pose, ...state, preparation });
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  }
  report.sourceStayedFixed = visualSourceStayedFixed(source, await captureVisualSource(url, root));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  report.errors = monitor?.snapshot() ?? { count: 0, errors: [] };
  await browser?.close(); release();
  report.finishedAt = new Date().toISOString();
  report.passed = !report.failure && report.errors.count === 0 && report.sourceStayedFixed && report.poses.length === poses.length;
  if (!report.passed) process.exitCode = 1;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, poses: report.poses.length, errors: report.errors.count, failure: report.failure }));
}
