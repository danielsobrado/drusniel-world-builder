import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { measureCoastalFrame } from './lib/coastal-review-browser.mjs';
import { focusPerfBrowser } from './lib/perf-browser-focus.mjs';
import { fileHash } from './lib/world-visual-report.mjs';

// FFT caustics (PR I [P9] follow-on): native underwater captures, FFT caustics off (the
// caustic web) and on, at fixed poses and a frozen water clock. The player dives to the bed
// (dive key held, so buoyancy cannot move it) and looks along it. Needs `npm run dev`.
//   node scripts/run-fft-caustics-review.mjs --url http://localhost:5174 --out tmp/fft-caustics/captures
//     [--poses docs/qa/ponlai-pr-i-fft-caustics-2026-11-21/poses.json] [--only id,id] [--time 126]
//     [--scan "x0,z0,x1,z1,steps;…"]  (print depth / shore distance along lines instead of capturing)
//     [--perf [--duration-ms 10000]]  (also time each pose underwater, uncapped and focus-verified, A/B/A)
const root = fileURLToPath(new URL('../', import.meta.url));
const option = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const url = new URL(option('--url', 'http://localhost:5174'));
const out = path.resolve(option('--out', 'tmp/fft-caustics/captures'));
const poses = JSON.parse(await readFile(option('--poses', path.join(root, 'docs/qa/ponlai-pr-i-fft-caustics-2026-11-21/poses.json')), 'utf8'))
  .filter((pose) => !option('--only', null) || option('--only').split(',').includes(pose.id));
const waterTime = Number(option('--time', 126));
const scan = option('--scan', null)?.split(';').map((line) => line.split(',').map(Number));
const viewport = { width: 1600, height: 900 };
const perf = process.argv.includes('--perf');
const durationMs = Number(option('--duration-ms', 10000));
const webVariant = { label: 'web', patch: { sea: { offshoreFft: { caustics: { enabled: false } } } } };
const variants = [webVariant, { label: 'fft', patch: { sea: { offshoreFft: { caustics: { enabled: true } } } } }, ...(perf ? [{ ...webVariant, label: 'web-repeat' }] : [])];
const deepMerge = (target, patch) => {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) deepMerge(target[key] ??= {}, value);
    else target[key] = value;
  }
  return target;
};

await mkdir(out, { recursive: true });
const compiled = await (await fetch(new URL('/config/water-visual.yaml?import&compiled', url))).text();
const baseConfig = /^export default (.*);/m.exec(compiled);
assert.ok(baseConfig, 'Expected the Vite compiled water YAML module');
const manifest = { viewport, waterTime, url: url.href, captures: [], timings: [], failures: [] };
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let browser;
try {
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  const monitor = createBrowserErrorMonitor(page, 64);
  let patch = {};
  await page.route(/\/config\/water-visual\.yaml\?.*compiled/, (route) => route.fulfill({ contentType: 'application/javascript',
    body: `export default ${JSON.stringify(deepMerge(JSON.parse(baseConfig[1]), { water: patch }))};\n` }));
  for (const variant of scan ? [variants[1]] : variants) {
    patch = variant.patch;
    await page.goto(new URL(`/?qaVisual=1${perf ? '&gpuTimings=1' : ''}`, url).href, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
    await page.evaluate(() => {
      const { backend } = window.__editor.terrainView.renderer;
      window.__coastalTimestampSupported = backend.trackTimestamp === true;
      backend.trackTimestamp = false;
    });
    const adapter = await page.evaluate(async () => {
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
      return { vendor: a?.info.vendor, architecture: a?.info.architecture, backend: window.__editor.terrainView.rendererBackendStatus.mode,
        fallback: !!(a?.info.isFallbackAdapter ?? a?.isFallbackAdapter) };
    });
    assert.ok(adapter.backend === 'webgpu' && adapter.vendor && !adapter.fallback, `Hardware WebGPU required: ${JSON.stringify(adapter)}`);
    manifest.adapter = adapter;
    await page.evaluate(() => window.__worldVisualQa.setLighting({ hour: 12, weather: 'off', weatherIntensity: 1 }));
    if (scan) {
      for (const [x0, z0, x1, z1, steps] of scan) {
      const rows = await page.evaluate(({ x0, z0, x1, z1, steps }) => Array.from({ length: steps + 1 }, (_, i) => {
        const x = x0 + (x1 - x0) * i / steps, z = z0 + (z1 - z0) * i / steps;
        const w = window.__editor.terrainView.getCanonicalWater(x, z);
        return { x: Math.round(x), z: Math.round(z), kind: w.kind, depth: +(w.surfaceHeight - w.bedHeight).toFixed(2), shore: +(w.shoreDistance ?? -1).toFixed(1) };
      }), { x0, z0, x1, z1, steps });
      console.table(rows);
      }
      break;
    }
    for (const pose of poses) {
      const scope = `${pose.id}/${variant.label}`;
      try {
        await page.evaluate((p) => window.__worldVisualQa.cut({ mode: 'player', heightAboveGround: 1.7, fov: 70, ...p }), pose.camera);
        await page.evaluate(() => window.__editor.playerController.setHarnessKeys(['ControlLeft']));
        await page.evaluate(() => window.__worldVisualQa.settle({ minimumMs: 6000, timeoutMs: 120000 }));
        await page.evaluate((t) => window.__worldVisualQa.setWaterTime(t), waterTime);
        const state = await page.evaluate(async () => {
          for (let i = 0; i < 20; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
          await window.__editor.terrainView.renderer.backend.device.queue.onSubmittedWorkDone();
          const e = window.__editor, player = e.playerController.getStatus(), camera = e.viewModeController.camera;
          const canonical = e.terrainView.floatingOrigin.toCanonical(camera.position.x, camera.position.z);
          const water = e.terrainView.getCanonicalWater(canonical.x, canonical.z);
          return { headSubmerged: player.headSubmerged, underwater: e.playerController.underwaterView?.getStatus(),
            camera: { x: canonical.x, y: camera.position.y, z: canonical.z }, bedDepth: water.surfaceHeight - water.bedHeight, shoreDistance: water.shoreDistance };
        });
        assert.ok(state.headSubmerged && state.underwater?.blend === 1, `Not underwater: ${JSON.stringify(state)}`);
        const file = path.join(out, `${pose.id}-${variant.label}.png`);
        await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true));
        await captureWorldCanvas(page, file);
        manifest.captures.push({ scope, file: path.relative(out, file), sha256: await fileHash(file), ...state });
        console.log(scope, JSON.stringify({ bedDepth: state.bedDepth, shore: state.shoreDistance, fft: state.underwater.projectedCaustics?.fftCaustics }));
        if (perf) {
          // The live water clock, as in play; the dive key keeps the pose.
          await page.evaluate(() => window.__worldVisualQa.setWaterTime(null));
          let focus = { required: true, passed: false }, endFocus;
          try { endFocus = await focusPerfBrowser(browser, page, { headed: true }); } catch (error) { focus.error = error.message; }
          const frames = await page.evaluate(measureCoastalFrame, durationMs);
          if (endFocus) focus = await endFocus().catch((error) => ({ ...focus, error: error.message }));
          const still = await page.evaluate(() => window.__editor.playerController.getStatus().headSubmerged);
          manifest.timings.push({ scope, focus, stillSubmerged: still, raf: frames.raf, gpuRender: frames.gpuRender, renderCpu: frames.renderCpu });
          console.log(scope, JSON.stringify({ focus: focus.passed, submerged: still, raf: frames.raf, gpu: frames.gpuRender?.p50Ms }));
        }
      } catch (error) {
        manifest.failures.push({ scope, error: error.stack });
        console.error(scope, error.message);
      } finally {
        await page.evaluate(() => { window.__editor.playerController.setHarnessKeys([]); window.__worldVisualQa.setWaterTime(null); });
      }
    }
  }
  manifest.browserErrors = monitor.snapshot();
} finally {
  await browser?.close();
  release();
}
await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
if (manifest.failures.length || manifest.browserErrors?.count) process.exitCode = 1;
