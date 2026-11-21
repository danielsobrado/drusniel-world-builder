/**
 * Storm snow field review (docs/plans/storm-snow-field-2026-11-21.md): matched
 * captures of a snapped snow storm and a held thaw, field off and on, at a fixed
 * hour, on hardware WebGPU; the coverage readers' WGSL hashes per variant; and a
 * microbenchmark of the field pass itself.
 *
 *   node scripts/run-snow-field-review.mjs --url http://localhost:5218 --out tmp/snow-field-review
 *
 * Every timing checks that the browser window held the foreground.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { focusPerfBrowser } from './lib/perf-browser-focus.mjs';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';

const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const url = option('--url', 'http://localhost:5174');
const out = path.resolve(option('--out', 'tmp/snow-field-review'));
const hour = Number(option('--hour', 10));
const thawCover = Number(option('--thaw-cover', 0.55));
const only = option('--only', '').split(',').filter(Boolean);

// Elevated views over temperate hills, where storm snow is not baked (no snow country).
const poses = [
  { id: 'deciduous-hills', x: -1945, z: 7795, yaw: 0.35, pitch: -0.42, mode: 'fly', heightAboveGround: 38, fov: 70 },
  { id: 'grassland-rise', x: -8957, z: 7737, yaw: 4.45, pitch: -0.38, mode: 'fly', heightAboveGround: 30, fov: 70 },
  { id: 'rainforest-slope', x: -1997, z: -2889, yaw: 1.5, pitch: -0.4, mode: 'fly', heightAboveGround: 34, fov: 70 },
];
const states = [
  { id: 'storm', query: { storm: '1', stormKind: 'snow', stormSnap: '1' } },
  { id: 'thaw', query: { storm: '0', stormKind: 'snow', stormSnap: '1' }, freeze: { value: thawCover, melting: 1 } },
];
const variants = ['off', 'on'];

const report = { url, hour, thawCover, startedAt: new Date().toISOString(), captures: [], shaders: {}, bench: {}, errors: [] };
await mkdir(out, { recursive: true });
// One hardware QA run at a time: another session's GPU work would skew every frame.
const release = await waitForPerfRunLock(path.resolve('tmp', `perf-browser-${process.platform}.lock`));
const browser = await chromium.launch({ headless: false, args: [
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu-rasterization',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
] });
try {
  for (const variant of variants) for (const state of states) {
    if (only.length && !only.includes(`${variant}/${state.id}`)) continue;
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    const errors = createBrowserErrorMonitor(page, 32);
    const target = new URL(url);
    for (const [key, value] of Object.entries({ qaVisual: '1', ...state.query, snowField: variant === 'on' ? '1' : '0' })) {
      target.searchParams.set(key, value);
    }
    console.log(`snow field review: ${variant}/${state.id}`);
    await page.goto(target.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
    const backend = await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      return { mode: window.__editor.terrainView.rendererBackendStatus.mode, vendor: adapter?.info.vendor,
        architecture: adapter?.info.architecture, fallback: !!adapter?.info.isFallbackAdapter };
    });
    if (backend.mode !== 'webgpu' || backend.fallback) throw new Error(`Hardware WebGPU required: ${JSON.stringify(backend)}`);
    report.backend ??= backend;
    await page.evaluate(([h, freeze]) => {
      if (freeze) window.__editor.snowCover.frozen = freeze;
      return window.__worldVisualQa.setLighting({ hour: h });
    }, [hour, state.freeze ?? null]);
    for (const pose of poses) {
      await prepareVisualPose(page, pose, { minimumMs: 4000 });
      await page.evaluate(() => window.__worldVisualQa.settleLighting());
      await page.evaluate(() => window.__worldVisualQa.settle({ minimumMs: 0 }));
      const field = await page.evaluate(() => {
        const e = window.__editor, f = e.snowField;
        return { cover: e.snowCover.value, melting: e.snowCover.melting, present: !!f, ready: !!f?.ground.ready,
          center: f?.ground.center ?? null, offset: f ? { ...f.offset } : null };
      });
      await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true));
      const file = `${variant}/${state.id}/${pose.id}.png`;
      await mkdir(path.dirname(path.join(out, file)), { recursive: true });
      await captureWorldCanvas(page, path.join(out, file));
      await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
      report.captures.push({ variant, state: state.id, pose: pose.id, file, field });
    }
    if (state.id === 'storm') {
      report.shaders[variant] = await page.evaluate(inspectShaders);
      if (variant === 'on') {
        const foreground = await focusPerfBrowser(browser, page, { headed: true });
        const bench = await page.evaluate(benchField);
        report.bench = { ...bench, foreground: await foreground() };
      }
    }
    const observed = errors.snapshot();
    report.errors.push(...observed.errors.map(error => ({ variant, state: state.id, error })));
    await context.close();
  }
} finally {
  await browser.close();
  release();
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ captures: report.captures.length, errors: report.errors.length, bench: report.bench }, null, 2));

/** Fragment/vertex WGSL hashes of every storm-snow reader in view, from the cached pipelines. */
async function inspectShaders() {
  const e = window.__editor, renderer = e.terrainView.renderer, camera = e.viewModeController.camera;
  const hash = text => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(16);
  const seen = new Map();
  e.terrainView.scene.traverse(object => {
    const material = object.material;
    if (!object.isMesh || Array.isArray(material) || !material?.isNodeMaterial || !object.visible || seen.has(material)) return;
    if (!/terrain|meadow|grass|alpine|rock|tree|leaf|trunk|crown|impostor/i.test(`${object.name} ${material.name}`)) return;
    seen.set(material, object);
  });
  const shaders = [];
  for (const [material, object] of seen) {
    try {
      const { fragmentShader, vertexShader } = await renderer.debug.getShaderAsync(e.terrainView.scene, camera, object);
      shaders.push({ object: object.name, material: material.name, fragment: hash(fragmentShader), vertex: hash(vertexShader),
        readsField: /storm-snow-field|stormSnowField/.test(fragmentShader + vertexShader) });
    } catch (error) {
      shaders.push({ object: object.name, material: material.name, error: String(error).slice(0, 200) });
    }
  }
  return shaders.sort((a, b) => `${a.material}${a.object}`.localeCompare(`${b.material}${b.object}`));
}

/** GPU time of the field pass: N forced draws, then the queue drained, against N empty iterations. */
async function benchField() {
  const e = window.__editor, field = e.snowField, renderer = e.terrainView.renderer, device = renderer.backend.device;
  if (!field) return { error: 'no field' };
  const run = async (draw, count) => {
    await device.queue.onSubmittedWorkDone();
    const start = performance.now();
    for (let i = 0; i < count; i++) {
      if (draw) { field.nextKey = null; field.render(renderer); }
      else device.queue.submit([]);
    }
    await device.queue.onSubmittedWorkDone();
    return (performance.now() - start) / count;
  };
  const samples = [];
  for (let round = 0; round < 5; round++) {
    const empty = await run(false, 200);
    const drawn = await run(true, 200);
    samples.push({ emptyMs: empty, drawnMs: drawn, passMs: drawn - empty });
  }
  const passes = samples.map(s => s.passMs).sort((a, b) => a - b);
  return { samples, medianPassMs: passes[2], cover: e.snowCover.value, resolution: field.config.resolution };
}
