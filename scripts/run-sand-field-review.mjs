/**
 * Desert sand field review (docs/plans/desert-sand-field-2026-11-22.md): matched
 * captures of a sandstorm and its aftermath over hot desert, sand field off and
 * on, at a fixed hour, on hardware WebGPU; the in-app WGSL hashes of the terrain,
 * dust and other storm readers per variant; and a microbenchmark of the shared
 * field pass with sand on.
 *
 *   node scripts/run-sand-field-review.mjs --url http://localhost:5241 --out tmp/sand-field-review
 *   node scripts/run-sand-field-review.mjs --url http://localhost:5240 --variants base --states storm
 *   node scripts/run-sand-field-review.mjs --url http://localhost:5241 --scout 8
 *
 * `--scout N` captures N candidate hot-desert spots with relief instead (to pick poses).
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
const url = option('--url', 'http://localhost:5241');
const out = path.resolve(option('--out', 'tmp/sand-field-review'));
const hour = Number(option('--hour', 15));
const afterCover = Number(option('--after-cover', 0.5));
const scout = Number(option('--scout', 0));
const variants = option('--variants', 'off,on').split(',');
const stateIds = option('--states', 'storm,after').split(',');

// Elevated views over hot desert (Azgaar 1) with relief, from --scout.
const poses = JSON.parse(option('--poses', 'null')) ?? [
  { id: 'erg-ridge', x: -5791, z: -27, yaw: 5.357, pitch: -0.4, mode: 'fly', heightAboveGround: 30, fov: 70 },
];
const states = [
  // A held full cover: the sandstorm blows, but the streaks hold still for matched frames.
  { id: 'storm', weather: 'sandstorm', freeze: { value: 1 } },
  { id: 'after', weather: 'off', freeze: { value: afterCover } },
].filter(state => stateIds.includes(state.id));

const report = { url, hour, afterCover, startedAt: new Date().toISOString(), captures: [], shaders: {}, bench: {}, errors: [] };
await mkdir(out, { recursive: true });
// One hardware QA run at a time: another session's GPU work would skew every frame.
const release = await waitForPerfRunLock(path.resolve('tmp', `perf-browser-${process.platform}.lock`));
const browser = await chromium.launch({ headless: false, args: [
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu-rasterization',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
] });

async function openPage(variant) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(240000);
  const errors = createBrowserErrorMonitor(page, 32);
  const target = new URL(url);
  target.searchParams.set('qaVisual', '1');
  if (variant === 'off' || variant === 'on') target.searchParams.set('sandField', variant === 'on' ? '1' : '0');
  await page.goto(target.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 240000 });
  const backend = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    return { mode: window.__editor.terrainView.rendererBackendStatus.mode, vendor: adapter?.info.vendor,
      architecture: adapter?.info.architecture, fallback: !!adapter?.info.isFallbackAdapter };
  });
  if (backend.mode !== 'webgpu' || backend.fallback) throw new Error(`Hardware WebGPU required: ${JSON.stringify(backend)}`);
  report.backend ??= backend;
  return { context, page, errors };
}

async function capture(page, file) {
  await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true));
  await mkdir(path.dirname(path.join(out, file)), { recursive: true });
  await captureWorldCanvas(page, path.join(out, file));
  await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
}

try {
  if (scout > 0) {
    const { context, page } = await openPage('on');
    await page.evaluate(h => window.__worldVisualQa.setLighting({ hour: h }), hour);
    const spots = await page.evaluate(findReliefSpots, scout);
    report.scout = spots;
    for (const [index, spot] of spots.entries()) {
      await prepareVisualPose(page, { x: spot.x, z: spot.z, yaw: spot.yaw, pitch: -0.4, mode: 'fly', heightAboveGround: 30, fov: 70 },
        { minimumMs: 4000 });
      await page.evaluate(() => window.__worldVisualQa.settle({ minimumMs: 0 }));
      await capture(page, `scout/${index}.png`);
    }
    await context.close();
  } else {
    for (const variant of variants) for (const state of states) {
      const { context, page, errors } = await openPage(variant);
      console.log(`sand field review: ${variant}/${state.id}`);
      // setLighting owns the weather in QA (it snaps the storm); the cover is held after it.
      await page.evaluate(async ([h, s]) => {
        await window.__worldVisualQa.setLighting({ hour: h, weather: s.weather, weatherIntensity: 1 });
        if (window.__editor.sandCover) window.__editor.sandCover.frozen = s.freeze;
      }, [hour, state]);
      for (const pose of poses) {
        await prepareVisualPose(page, pose, { minimumMs: 4000 });
        await page.evaluate(() => window.__worldVisualQa.settleLighting());
        await page.evaluate(() => window.__worldVisualQa.settle({ minimumMs: 0 }));
        const field = await page.evaluate(() => {
          const e = window.__editor, f = e.snowField;
          return { sandCover: e.sandCover?.value ?? null, sandstorm: e.weatherController.sandstorm ?? null,
            present: !!f, sand: !!f?.sand, ready: !!f?.ground.ready, center: f?.ground.center ?? null, offset: f ? { ...f.offset } : null };
        });
        const file = `${variant}/${state.id}/${pose.id}.png`;
        await capture(page, file);
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
  }
} finally {
  await browser.close();
  release();
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(out, scout > 0 ? 'scout.json' : 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ captures: report.captures.length, errors: report.errors.length, bench: report.bench, scout: report.scout }, null, 2));

/** Hot-desert cells well inside the biome with the most relief nearby (scouting). */
function findReliefSpots(count) {
  const e = window.__editor, store = e.terrainView.worldStore, generator = store.generator;
  const tileSize = store.tileSize ?? e.config.map.tileSize;
  const span = generator.source?.bounds ?? { minCellX: -8000, minCellZ: -8000, widthCells: 16000, heightCells: 16000 };
  let state = 20261122;
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const found = [];
  for (let tries = 0; tries < 400000 && found.length < count * 6; tries += 1) {
    const cx = span.minCellX + Math.floor(next() * span.widthCells);
    const cz = span.minCellZ + Math.floor(next() * span.heightCells);
    if (generator.sampleTile(cx, cz) !== 1) continue;
    const ring = [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, -4], [4, -4], [-4, 4]];
    if (!ring.every(([dx, dz]) => generator.sampleTile(cx + dx, cz + dz) === 1)) continue;
    const h = generator.sampleHeight(cx, cz);
    const relief = Math.max(...ring.map(([dx, dz]) => Math.abs(generator.sampleHeight(cx + dx, cz + dz) - h)));
    found.push({ x: (cx + 0.5) * tileSize, z: -(cz + 0.5) * tileSize, relief, yaw: next() * Math.PI * 2 });
  }
  return found.sort((a, b) => b.relief - a.relief).filter((_, i) => i % 3 === 0).slice(0, count);
}

/** Fragment/vertex WGSL hashes of the terrain, storm readers and weather dust in view, from the cached pipelines. */
async function inspectShaders() {
  const e = window.__editor, renderer = e.terrainView.renderer, camera = e.viewModeController.camera;
  const hash = text => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(16);
  const seen = new Map();
  e.terrainView.scene.traverse(object => {
    const material = object.material;
    if (!object.isMesh || Array.isArray(material) || !material?.isNodeMaterial || !object.visible || seen.has(material)) return;
    if (!/terrain|meadow|grass|alpine|rock|tree|leaf|trunk|crown|impostor|weather|sandstorm/i.test(`${object.name} ${material.name}`)) return;
    seen.set(material, object);
  });
  const shaders = [];
  for (const [material, object] of seen) {
    try {
      const { fragmentShader, vertexShader } = await renderer.debug.getShaderAsync(e.terrainView.scene, camera, object);
      shaders.push({ object: object.name, material: material.name, fragment: hash(fragmentShader), vertex: hash(vertexShader) });
    } catch (error) {
      shaders.push({ object: object.name, material: material.name, error: String(error).slice(0, 200) });
    }
  }
  return shaders.sort((a, b) => `${a.material}${a.object}`.localeCompare(`${b.material}${b.object}`));
}

/** GPU time of the shared field pass with sand on: N forced draws, then the queue drained, against N empty iterations. */
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
  return { samples, medianPassMs: passes[2], sandCover: e.sandCover?.value, sand: !!field.sand, resolution: field.config.resolution };
}
