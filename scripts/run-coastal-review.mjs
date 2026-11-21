import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { captureVisualSource } from './lib/world-visual-source.mjs';
import { fileHash, sha256 } from './lib/world-visual-report.mjs';
import { execFileSync } from 'node:child_process';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { focusPerfBrowser } from './lib/perf-browser-focus.mjs';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { advanceCoastalClock, inspectCoastalScene, measureCoastalFrame, sampleCoastalTransects } from './lib/coastal-review-browser.mjs';
import { inspectOceanFftScene } from './lib/ocean-fft-scene.mjs';
import { coastalDiagnostics, coastalLayerControls, installCoastalDiagnostics, setCoastalDiagnostic } from './lib/coastal-review-diagnostics.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const url = new URL(option('--url', 'http://127.0.0.1:5217'));
const out = path.resolve(option('--out', 'tmp/coastal-review'));
const fixtures = JSON.parse(await readFile(option('--fixtures',
  new URL('../docs/qa/coastal-review-2026-11-20/poses.json', import.meta.url)), 'utf8'));
const perf = process.argv.includes('--perf');
const measure = perf || process.argv.includes('--measure');
const minimumInterstageLimit = process.argv.includes('--minimum-interstage-limit');
const diagnostic = process.argv.includes('--diagnostics');
const only = option('--only', '').split(',').filter(Boolean);
// Extra app query flags, e.g. --query oceanFft=1 (PR I A/B); --ocean-fft-inspect records the FFT scene state.
const extraQuery = new URLSearchParams(option('--query', ''));
// --water-patch '{"sea":{"offshoreFft":{"enabled":false}}}': deep-merged into the served water config (A/B a feature off).
const waterPatch = JSON.parse(option('--water-patch', '{}'));
const deepMerge = (target, patch) => {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) deepMerge(target[key] ??= {}, value);
    else target[key] = value;
  }
  return target;
};
const oceanFftInspect = process.argv.includes('--ocean-fft-inspect');
const minimumMs = Number(option('--settle-ms', 5000));
const durationMs = Number(option('--duration-ms', 8000));
const viewport = { width: 1600, height: 900 };
assert.ok(Number.isFinite(minimumMs) && minimumMs >= 0 && Number.isFinite(durationMs) && durationMs >= 1000);

const jobs = fixtures.flatMap(({ tiers, controls = [], ...fixture }) => {
  const variants = [
    ...tiers.map(qualityTier => ({ qualityTier, diffraction: true })),
    ...controls.map(control => ({ diffraction: true, ...control })),
  ];
  const timings = fixture.benchmark && measure
    ? tiers.flatMap(qualityTier => (fixture.benchmark === 'on' ? [true] : [true, false])
      .map(diffraction => ({ qualityTier, diffraction }))) : [];
  const captures = perf ? [] : variants;
  for (const timing of timings) {
    const capture = captures.find(variant => variant.qualityTier === timing.qualityTier
      && variant.diffraction === timing.diffraction && variant.waveRefraction !== false);
    if (capture) capture.measure = true;
    else captures.push({ ...timing, measure: true, timingOnly: true });
  }
  return captures.map(variant => ({ ...fixture, ...variant }));
}).filter(job => !only.length || only.includes(job.id) || only.includes(job.label) || only.includes(job.qualityTier)
  || only.includes(`${job.id}/${job.qualityTier}`));
assert.ok(jobs.length, 'No matching coastal jobs.');
const configKey = job => JSON.stringify([job.qualityTier, job.diffraction,
  job.waveRefraction !== false, job.opticalRefraction !== false, job.calmScale ?? 1]);
const tiers = ['high', 'ultra', 'medium', 'low'];
jobs.sort((a, b) => tiers.indexOf(a.qualityTier) - tiers.indexOf(b.qualityTier)
  || Number(b.diffraction) - Number(a.diffraction)
  || Number(b.waveRefraction !== false) - Number(a.waveRefraction !== false)
  || Number(b.opticalRefraction !== false) - Number(a.opticalRefraction !== false)
  || (b.calmScale ?? 1) - (a.calmScale ?? 1));

await mkdir(out, { recursive: true });
const source = await captureVisualSource(url, root);
const runtimeSource = () => sha256(execFileSync('git', ['diff', 'HEAD', '--binary', '--',
  'src', 'config', 'editor.config.yaml', 'public/assets', 'assets/runtime-asset-manifest.json'],
{ cwd: root, maxBuffer: 64 * 1024 * 1024 }));
const runtimeDiffSha256 = source.sourceSnapshot ? null : runtimeSource();
const manifest = { schemaVersion: 1, viewport, sourceRevision: source.sourceSha,
  sourceSnapshotSha256: source.sourceSnapshot?.sha256 ?? null, runtimeDiffSha256,
  sourceOverrides: source.sourceSnapshot?.sourceOverrides?.map(file => ({
    file, sha256: source.sourceSnapshot.files[file],
  })) ?? [],
  screenshots: [], timings: [], timingFailures: [], failures: [], oceanFft: [], query: Object.fromEntries(extraQuery), waterPatch };
const save = () => writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let browser;
try {
  browser = await chromium.launch({ headless: false, args: [
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu-rasterization',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  ] });
  manifest.browser = browser.version();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120000);
  await page.addInitScript(() => {
    // Camera cuts and the water clock drive this owned QA page.
    for (const type of ['keydown', 'keyup']) {
      window.addEventListener(type, event => event.stopImmediatePropagation(), true);
    }
  });
  const monitor = createBrowserErrorMonitor(page, 64);
  const alerts = [];
  const warnings = new Set();
  page.on('console', message => {
    if (message.type() === 'error' || message.text().startsWith('Recovery boot:')) console.error(message.text().slice(0, 1200));
    if (message.type() === 'warning' && warnings.size < 24) warnings.add(message.text().slice(0, 512));
    if (/GPUValidationError|GPUOutOfMemoryError|Uncaptured WebGPU|Error while parsing WGSL|CreateShaderModule.*error/i.test(message.text())) {
      if (alerts.length < 64) alerts.push(message.text().slice(0, 4096));
    }
  });
  page.on('pageerror', error => console.error(error.message));
  if (diagnostic && jobs.some(job => job.diagnostics?.some(mode => !coastalLayerControls.includes(mode)))) {
    await installCoastalDiagnostics(page);
  }
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED' && alerts.length < 64) {
      alerts.push(`${request.failure()?.errorText} ${request.url()}`);
    }
  });
  page.on('response', response => {
    if (response.status() >= 400 && alerts.length < 64) alerts.push(`${response.status()} ${response.url()}`);
  });
  let job;
  if (minimumInterstageLimit) await page.route(/\/src\/render\/deviceLimits\.js(?:\?|$)/, async route => {
    const response = await route.fetch();
    const body = await response.text();
    assert.match(body, /maxInterStageShaderVariables: \d+/);
    await route.fulfill({ response, body: body.replace(/maxInterStageShaderVariables: \d+/, 'maxInterStageShaderVariables: 16') });
  });
  const compiled = await fetch(new URL('/config/water-visual.yaml?import&compiled', url));
  assert.ok(compiled.ok, 'Could not read the compiled water configuration');
  const baseConfig = /^export default (.*);/m.exec(await compiled.text());
  assert.ok(baseConfig, 'Expected the Vite compiled water YAML module');
  await page.route(/\/config\/water-visual\.yaml\?.*compiled/, async route => {
    const config = JSON.parse(baseConfig[1]);
    deepMerge(config.water, waterPatch);
    config.water.qualityTier = job.qualityTier;
    config.water.sea.surf.diffraction.enabled = job.diffraction;
    if (job.waveRefraction === false) config.water.sea.surf.refraction.enabled = false;
    if (job.opticalRefraction === false) config.water.refraction.enabled = false;
    if (job.calmScale !== undefined) {
      assert.ok(job.calmScale > 0 && job.calmScale < 1, 'Calm scale must be between zero and one.');
      config.water.sea.amplitude *= job.calmScale;
      config.water.coast.runupHeight *= job.calmScale;
    }
    await route.fulfill({ contentType: 'application/javascript', body: `export default ${JSON.stringify(config)};\n` });
  });
  const browserUrl = new URL('/?qaVisual=1', url);
  if (process.argv.includes('--startup-log')) browserUrl.searchParams.set('qaRecovery', '1');
  if (measure) browserUrl.searchParams.set('gpuTimings', '1');
  for (const [key, value] of extraQuery) browserUrl.searchParams.set(key, value);
  let currentConfig, adapter;
  for (job of jobs) {
    const name = job.label ?? job.qualityTier;
    const scope = `${job.id}/${name} (diffraction ${job.diffraction ? 'on' : 'off'})`;
    console.log(scope);
    const firstError = monitor.snapshot().count;
    const firstAlert = alerts.length;
    try {
      if (currentConfig !== configKey(job)) {
        console.log('  loading app');
        await page.goto(browserUrl.href, { waitUntil: 'commit' });
        await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
        adapter = await page.evaluate(async () => {
          const e = window.__editor, { backend } = e.terrainView.renderer;
          const adapter = backend.adapter ?? await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
          backend.device?.addEventListener('uncapturederror', event => console.error('Uncaptured WebGPU', event.error.message));
          window.__coastalTimestampSupported = backend.trackTimestamp === true;
          backend.trackTimestamp = false;
          const info = adapter?.info;
          return { backend: e.terrainView.rendererBackendStatus.mode, device: !!backend.device,
            vendor: info?.vendor, architecture: info?.architecture, description: info?.description || null,
            adapterInterstageVariables: adapter?.limits.maxInterStageShaderVariables,
            deviceInterstageVariables: backend.device?.limits.maxInterStageShaderVariables,
            fallback: info?.isFallbackAdapter ?? adapter?.isFallbackAdapter ?? null };
        });
        assert.ok(adapter.device && adapter.backend === 'webgpu' && adapter.vendor && !adapter.fallback
          && !/swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(adapter)),
        `Hardware WebGPU required: ${JSON.stringify(adapter)}`);
        if (minimumInterstageLimit) assert.equal(adapter.deviceInterstageVariables, 16);
        currentConfig = configKey(job);
        console.log(`  ${adapter.vendor} ${adapter.architecture} ${adapter.backend}`);
      }
      await page.evaluate(() => window.__worldVisualQa.setWaterTime(null));
      const lighting = { hour: job.hour ?? 12, weather: job.weather ?? 'off', weatherIntensity: job.weatherIntensity ?? 1 };
      await page.evaluate(settings => window.__worldVisualQa.setLighting(settings), lighting);
      const pose = { mode: 'fly', fov: 65, ...job.pose };
      if (pose.yaw === undefined) pose.yaw = Math.atan2(pose.x - job.target[0].x, pose.z - job.target[0].z);
      const preparation = await prepareVisualPose(page, pose, { minimumMs, onPhase: phase => console.log(`  ${phase}`) });
      await page.evaluate(() => window.__worldVisualQa.settleLighting());
      assert.ok(await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true)));
      const inspect = async () => {
        const state = await page.evaluate(inspectCoastalScene, job.target);
        assert.ok(state.readiness.ready && state.assetIntegrity.ready, 'Unsettled terrain or assets.');
        assert.equal(state.qualityTier, job.qualityTier);
        assert.equal(state.diffraction.enabled, job.diffraction);
        if (job.waveRefraction === false) assert.equal(state.finiteDepthRefraction.enabled, false);
        if (job.opticalRefraction === false) assert.equal(state.opticsRefraction.enabled, false);
        assert.ok(state.samples.some(sample => sample.water.kind === 1), 'Missing ocean at fixture.');
        return state;
      };
      const health = () => {
        const errors = monitor.snapshot();
        assert.ok(errors.count === firstError && alerts.length === firstAlert,
          JSON.stringify({ errors: errors.errors.slice(firstError), alerts: alerts.slice(firstAlert) }));
      };
      if (job.measure) {
        let endFocus;
        let focus = { required: true, passed: false };
        try {
          endFocus = await focusPerfBrowser(browser, page, { headed: true });
        } catch (error) {
          focus.error = error.message;
        }
        try {
          const frames = await page.evaluate(measureCoastalFrame, durationMs);
          if (endFocus) focus = await endFocus().catch(error => ({ ...focus, error: error.message }));
          const state = await inspect();
          health();
          manifest.timings.push({ id: job.id, pose, adapter, focus, frames, preparation, ...state });
          console.log(JSON.stringify({ scope, focus: focus.passed, raf: frames.raf, gpu: frames.gpuRender.p50Ms }));
          if (!focus.passed) manifest.timingFailures.push({ scope, focus });
        } catch (error) {
          await endFocus?.().catch(() => {});
          manifest.timingFailures.push({ scope, error: error.stack });
          console.error(error.message);
        }
      }
      if (oceanFftInspect) {
        const fft = await page.evaluate(inspectOceanFftScene);
        manifest.oceanFft.push({ scope, ...fft });
        console.log(`  ocean fft ${JSON.stringify({ state: fft.oceanFft?.state ?? 'off', origins: fft.slotOrigins, shaders: fft.shaders })}`);
      }
      if (!job.timingOnly) {
        async function capture(label, moment, diagnosticMode = null) {
          assert.ok(await page.evaluate(() => {
            const overlay = window.__editor.gameplayOverlayController;
            overlay.closeActive();
            return window.__worldVisualQa.setCaptureUi(true) && !overlay.isWorldInputBlocked();
          }), 'An overlay blocked the coastal capture.');
          const state = await inspect();
          await page.evaluate(async () => {
            await window.__editor.terrainView.renderer.backend.device.queue.onSubmittedWorkDone();
          });
          health();
          const file = `screenshots/${job.folder ?? job.id}/${label}.png`;
          await mkdir(path.dirname(path.join(out, file)), { recursive: true });
          await captureWorldCanvas(page, path.join(out, file));
          assert.ok(await page.evaluate(() => !window.__editor.gameplayOverlayController.isWorldInputBlocked()),
            'A gameplay overlay opened during capture.');
          const png = await readFile(path.join(out, file));
          assert.equal(png.readUInt32BE(16), viewport.width);
          assert.equal(png.readUInt32BE(20), viewport.height);
          manifest.screenshots.push({ path: file, sha256: await fileHash(path.join(out, file)),
            sourceRevision: source.sourceSha, captureMethod: 'Playwright screenshot of the active game canvas',
            id: job.id, pose, adapter, moment, diagnosticMode, preparation, ...state });
          console.log(`  captured ${file}`);
          await save();
        }
        if (job.impact) {
          await page.evaluate(advanceCoastalClock, { start: 110, end: 122 });
          const impact = await page.evaluate(advanceCoastalClock, { end: 142, impact: true });
          const crest = await page.evaluate(advanceCoastalClock, { end: impact.time + 0.1 });
          await capture(`${name}-${impact.impact ? 'impact' : 'shore'}`, {
            ...crest, impact: impact.impact, impactTime: impact.impact ? impact.time : null,
          });
          const decay = await page.evaluate(advanceCoastalClock, { end: impact.time + 0.6 });
          await capture(`${name}-decay`, decay);
        } else {
          let moment = await page.evaluate(advanceCoastalClock, { start: 110, end: job.simulationSeconds ?? 123.4 });
          if (job.transects) {
            const transects = await page.evaluate(sampleCoastalTransects, job.transects);
            await mkdir(path.join(out, 'logs'), { recursive: true });
            await writeFile(path.join(out, 'logs', `${job.id}-${name}-transects.json`), JSON.stringify(transects, null, 2) + '\n');
          }
          await capture(name, moment);
          for (const time of job.sequence ?? []) {
            moment = await page.evaluate(advanceCoastalClock, { end: time });
            await capture(`${name}-${time.toFixed(2)}`, moment);
          }
          for (const mode of diagnostic ? job.diagnostics ?? [] : []) {
            await page.evaluate(setCoastalDiagnostic, { mode, index: coastalDiagnostics.indexOf(mode) });
            await page.evaluate(async () => {
              for (let i = 0; i < 3; i++) await new Promise(resolve => requestAnimationFrame(resolve));
            });
            await capture(`${name}-${mode}`, moment, mode);
          }
          if (diagnostic) await page.evaluate(setCoastalDiagnostic, { mode: null, index: -1 });
        }
      }
      health();
    } catch (error) {
      currentConfig = undefined;
      manifest.failures.push({ scope, error: error.stack });
      console.error(error.message);
    }
    await save();
  }
  manifest.browserErrors = monitor.snapshot();
  manifest.gpuAndNetworkAlerts = alerts;
  manifest.browserWarnings = [...warnings];
  const endSource = await captureVisualSource(url, root);
  assert.equal(endSource.sourceSnapshot?.sha256 ?? runtimeSource(), manifest.sourceSnapshotSha256 ?? runtimeDiffSha256,
    'Runtime changed during coastal review.');
} catch (error) {
  manifest.failures.push({ error: error.stack });
  console.error(error);
} finally {
  await browser?.close();
  release();
  await save();
}
if (manifest.failures.length || manifest.timingFailures.length) process.exitCode = 1;
