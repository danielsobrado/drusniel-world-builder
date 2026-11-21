import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { captureVisualSource } from './lib/world-visual-source.mjs';

// Ground wetness field QA on headed hardware WebGPU: captures at fixed hour and
// pose in four weather states, every scene material's fragment-WGSL hash (the
// off-switch proof compares a field-off run with the pre-field commit), and the
// field pass's own GPU time from timestamp queries.
// Usage: node scripts/run-wetness-field-qa.mjs --url http://localhost:5182 --field 1 --out docs/qa/x/on
const root = fileURLToPath(new URL('../', import.meta.url));
const { values: args } = parseArgs({ options: {
  url: { type: 'string', default: 'http://localhost:5174' },
  field: { type: 'string', default: '1' },
  out: { type: 'string', default: 'tmp/wetness-field-qa' },
  hashes: { type: 'boolean', default: false },
  timing: { type: 'boolean', default: false },
} });

const POSES = [
  { id: 'grassland', world: 'procedural', x: -1869, z: -4003, yaw: 2.488, pitch: -0.12, mode: 'player', heightAboveGround: 1.7, fov: 68 },
  { id: 'grassland-air', world: 'procedural', x: -1869, z: -4003, yaw: 2.488, pitch: -0.5, mode: 'fly', heightAboveGround: 30, fov: 60 },
];
// Ground clocks are set by integrating SurfaceWetness from dry: its update is
// exact for any step, so one call per phase reproduces minutes of weather.
const STATES = [
  { id: 'dry', weather: 'off', phases: [] },
  { id: 'mid-rain', weather: 'rain', weatherIntensity: 1, phases: [[35, 1]] },
  { id: 'heavy-rain', weather: 'storm', weatherIntensity: 1, phases: [[1e6, 1]] },
  { id: 'drying', weather: 'off', phases: [[1e6, 1], [150, 0]] },
];

const out = path.resolve(root, args.out);
await mkdir(out, { recursive: true });
await mkdir(path.join(root, 'tmp'), { recursive: true });
const report = { startedAt: new Date().toISOString(), field: args.field, viewport: { width: 1600, height: 900 }, shots: [] };
const save = () => writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
let browser, monitor;
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
try {
  report.source = await captureVisualSource(args.url, root);
  browser = await chromium.launch({ headless: false, args: [
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default',
    '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  ] });
  const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
  monitor = createBrowserErrorMonitor(page);
  await page.goto(`${args.url}/?qaVisual=1&gpuTimings=1&wetnessField=${args.field}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 600000 });
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture, description: adapter?.info.description,
      backend: window.__editor.terrainView.rendererBackendStatus.mode };
  });
  if (report.adapter.backend !== 'webgpu') throw new Error('Hardware WebGPU required.');
  for (const pose of POSES) {
    await page.evaluate(() => window.__worldVisualQa.setLighting({ hour: 12, weather: 'off' }));
    const preparation = await prepareVisualPose(page, pose, { minimumMs: 6000 });
    for (const state of STATES) {
      const name = `${pose.id}-${state.id}`;
      console.log(`Capture ${name}`);
      const result = { name, pose, state, preparation: preparation.readiness?.ready };
      report.shots.push(result);
      try {
        await page.evaluate((state) => window.__worldVisualQa.setLighting({ hour: 12, ...state }), state);
        Object.assign(result, await page.evaluate(async (phases) => {
          const e = window.__editor, w = e.surfaceWetness, sunY = e.stylizedSurface.skyView?.sunDirectionValue?.y;
          await window.__worldVisualQa.settleLighting();
          w.value = 0; w.buildingValues.set(0, 0, 0); w.groundValues.set(0, 0, 0);
          for (const [seconds, rain] of phases) w.update(seconds, rain, sunY);
          e.wetnessField?.settle();
          await new Promise((resolve) => setTimeout(resolve, 600));
          window.__worldVisualQa.setCaptureUi(true); window.__worldVisualQa.setAvatarVisible(false);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const field = e.wetnessField;
          return { wetness: w.value, clocks: w.groundValues.toArray(), rain: e.weatherController?.storm?.rain ?? null,
            field: field ? { renders: field.renders, ready: field.ground.ready, rebuilds: field.ground.rebuilds } : null };
        }, state.phases));
        await captureWorldCanvas(page, path.join(out, `${name}.png`));
        await sharp(path.join(out, `${name}.png`)).resize(960, 540).jpeg({ quality: 84 }).toFile(path.join(out, `${name}.jpg`));
      } catch (error) { result.failure = error.stack; }
      await save();
    }
  }
  if (args.hashes) {
    report.shaders = await page.evaluate(async () => {
      const e = window.__editor, view = e.terrainView, camera = e.viewModeController.camera;
      const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(16);
      const seen = new Map();
      view.scene.traverseVisible((object) => {
        if (!object.isMesh || Array.isArray(object.material) || !object.material?.isNodeMaterial) return;
        if (!seen.has(object.material)) seen.set(object.material, object);
      });
      const rows = [];
      for (const [material, mesh] of seen) {
        try {
          const { fragmentShader } = await view.renderer.debug.getShaderAsync(view.scene, camera, mesh);
          rows.push({ name: material.name || material.type, hash: hash(fragmentShader), length: fragmentShader.length });
        } catch (error) { rows.push({ name: material.name || material.type, error: String(error) }); }
      }
      return rows.sort((a, b) => `${a.name}${a.hash}`.localeCompare(`${b.name}${b.hash}`));
    });
  }
  if (args.timing && args.field === '1') {
    report.timing = await page.evaluate(async () => {
      const e = window.__editor, renderer = e.terrainView.renderer, backend = renderer.backend, pass = e.wetnessField;
      const sun = e.stylizedSurface.skyView?.sunDirectionValue, origin = e.terrainView.floatingOrigin.getState();
      const samples = [];
      backend.trackTimestamp = false;
      for (let i = 0; i < 60; i++) {
        backend.trackTimestamp = true;
        await renderer.resolveTimestampsAsync('render');
        backend.trackTimestamp = true;
        pass.settle();
        pass.render(renderer, performance.now() / 1000, sun, origin);
        const read = renderer.resolveTimestampsAsync('render');
        backend.trackTimestamp = false;
        samples.push(await read);
      }
      const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
      return { samples: sorted.length, p50Ms: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        maxMs: sorted.at(-1), rendersTotal: pass.renders };
    });
  }
} catch (error) { report.failure = error.stack; }
finally {
  report.errors = monitor?.snapshot() ?? { count: 0, errors: [] };
  try { await browser?.close(); } finally { release(); }
  report.finishedAt = new Date().toISOString();
  report.passed = !report.failure && report.shots.every((shot) => !shot.failure);
  await save();
  console.log(JSON.stringify({ passed: report.passed, shots: report.shots.length, errors: report.errors.count, failure: report.failure,
    timing: report.timing, shaders: report.shaders?.length }));
}
