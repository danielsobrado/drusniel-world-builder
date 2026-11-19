import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { focusPerfBrowser } from './lib/perf-browser-focus.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';

const args = process.argv.slice(2);
const value = (key, fallback) => args.includes(`--${key}`) ? args[args.indexOf(`--${key}`) + 1] : fallback;
const url = value('url', 'http://localhost:5173');
const out = path.resolve(value('out', 'tmp/stonehold-meshlets'));
const modes = value('modes', 'baseline,native,external').split(',');
assert.ok(modes[0] === 'baseline' && new Set(modes).size === modes.length
  && modes.every(mode => ['baseline', 'native', 'external'].includes(mode)));
const viewport = { width: 1280, height: 720 };
const fixtures = ['Stonehold_Fang_Shrine', 'Stonehold_Twin_Outcrop'];
const report = { recordedAt: new Date().toISOString(), viewport, copies: 16, occlusion: false, runs: [], checks: [] };

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  assert.ok(sorted.length && sorted.every(Number.isFinite), 'empty or invalid timings');
  const percentile = p => sorted[Math.ceil(p * sorted.length) - 1];
  return { samples: sorted.length, p50: percentile(0.50), p95: percentile(0.95), max: sorted.at(-1) };
}

async function pixelDiff(imageA, imageB) {
  const decode = image => sharp(image).removeAlpha().raw().toBuffer();
  const [a, b] = await Promise.all([decode(imageA), decode(imageB)]);
  assert.equal(a.length, b.length);
  let different = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 20) different++;
  }
  return different / (a.length / 3);
}

async function waitFrames(page, count = 50) {
  await page.evaluate(count => new Promise(resolve => {
    const next = () => --count ? requestAnimationFrame(next) : resolve();
    requestAnimationFrame(next);
  }), count);
}

async function timeRoute(page, profileGpu) {
  return page.evaluate(profileGpu => {
    const { renderer, orbit, camera } = window.__stoneholdQa;
    const state = window.__stoneholdQa;
    const home = camera.position.clone().sub(orbit.target);
    const up = home.clone().set(0, 1, 0);
    const frames = [];
    const cpu = [];
    const gpu = [];
    const count = profileGpu ? 60 : 480;
    let pending;
    let index = 0;
    return new Promise((resolve, reject) => {
      state.beforeRender = () => {
        if (pending) return false;
        const fraction = index / count;
        const phase = fraction * Math.PI * 2;
        const turn = fraction >= 0.5 && fraction < 0.625 ? Math.PI : 0;
        camera.position.copy(home).applyAxisAngle(up, phase + turn)
          .multiplyScalar(1.55 - 1.18 * Math.cos(phase)).add(orbit.target);
        camera.lookAt(orbit.target);
        renderer.backend.trackTimestamp = profileGpu;
      };
      state.afterRender = (dt, elapsed) => {
        frames.push(dt);
        cpu.push(elapsed);
        if (profileGpu) {
          const compute = renderer.info.compute.frameCalls ? renderer.resolveTimestampsAsync('compute') : 0;
          pending = Promise.all([renderer.resolveTimestampsAsync('render'), compute]).then(([render, compute]) => {
            gpu.push([render, compute]);
            pending = null;
          }, reject);
        }
        renderer.backend.trackTimestamp = false;
        if (++index !== count) return;
        state.beforeRender = state.afterRender = undefined;
        camera.position.copy(home).add(orbit.target);
        camera.lookAt(orbit.target);
        Promise.resolve(pending).then(() => resolve({ frames, cpu, gpu }), reject);
      };
    });
  }, profileGpu);
}

async function inspect(page) {
  return page.evaluate(async () => {
    const state = window.__stoneholdQa;
    const { renderer, vg } = state;
    const backend = renderer.backend;
    const original = backend.draw;
    let indirect = 0;
    backend.draw = function (object, info) {
      if (object.getIndirect()) {
        const offsets = object.getIndirectOffset();
        indirect += Array.isArray(offsets) ? offsets.length : 1;
      }
      return original.call(this, object, info);
    };
    const sample = await new Promise(resolve => {
      state.afterRender = () => {
        backend.draw = original;
        state.afterRender = undefined;
        const { drawCalls, triangles } = renderer.info.render;
        resolve({ draws: { direct: drawCalls, indirect }, directTriangles: triangles,
          native: renderer.drawingPipeline.info ? { ...renderer.drawingPipeline.info } : undefined,
          memory: { ...renderer.info.memory } });
      };
    });
    if (vg) sample.external = await vg.readStats(renderer);
    return sample;
  });
}

async function select(page, id, value) {
  await page.evaluate(async ([id, value]) => {
    document.getElementById(id).value = value;
    await window.__stoneholdQa.update();
  }, [id, value]);
  await waitFrames(page);
}

async function screenshot(page, key) {
  return page.screenshot({ path: path.join(out, `${key}.png`) });
}

async function capturePoses(page, run, comparisonShots) {
  const key = `${run.current.module}-${run.current.mode}`;
  const mode = run.current.mode;
  const take = async pose => {
    const image = await screenshot(page, `${key}-${pose}`);
    if (mode === 'baseline') comparisonShots.set(pose, image);
    else run.visualDiff[pose] = await pixelDiff(image, comparisonShots.get(pose));
    return image;
  };
  run.visualDiff = {};
  await select(page, 'view', 'hero');
  run.hero = await inspect(page);
  const hero = await take('hero');
  if (mode === 'native') assert.ok(run.hero.native?.triangles > 0 && run.hero.draws.indirect > 0);
  if (mode === 'external') assert.ok(run.hero.external?.drawnTriangles > 0 && !run.hero.external.overflow && run.hero.draws.indirect > 0);

  await page.evaluate(() => window.__stoneholdQa.shiftOrigin(-8192));
  await waitFrames(page);
  run.originDiff = await pixelDiff(hero, await take('origin'));
  await page.evaluate(() => window.__stoneholdQa.shiftOrigin(8192));

  await select(page, 'view', 'detail');
  run.detail = await inspect(page);
  await take('detail');
  await select(page, 'view', 'hero');
  await page.evaluate(() => {
    const { camera, orbit } = window.__stoneholdQa;
    camera.position.sub(orbit.target).multiplyScalar(3).add(orbit.target);
  });
  await waitFrames(page);
  run.distant = await inspect(page);
  await take('distant');
  const editMemory = [];
  // Swap pre-authored geometry and remove/reload explicitly to exercise the viewer's resource lifecycle.
  for (let cycle = 0; cycle < 3; cycle++) {
    await select(page, 'lod', '1');
    await page.evaluate(() => window.__stoneholdQa.unload());
    await waitFrames(page, 4);
    await select(page, 'lod', '0');
    editMemory.push((await inspect(page)).memory.total);
  }
  run.editMemoryBytes = editMemory;
  run.reloadDiff = await pixelDiff(hero, await screenshot(page, `${key}-reload`));
  assert.ok(run.reloadDiff < 0.01, `${mode} reload changed over 1% of pixels: ${run.reloadDiff}`);
  await page.evaluate(() => window.__stoneholdQa.addReflector());
  await waitFrames(page);
  await take('reflection');
}

await fs.mkdir(out, { recursive: true });
const release = await waitForPerfRunLock(path.resolve(`tmp/perf-browser-${process.platform}.lock`));
process.once('exit', release);
const browser = await chromium.launch({ headless: false, args: [
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu-rasterization',
  '--disable-gpu-vsync', '--disable-frame-rate-limit',
] });
report.browser = browser.version();
const page = await browser.newPage({ viewport });
const browserErrors = createBrowserErrorMonitor(page);
try {
  await (await focusPerfBrowser(browser, page, { headed: true }))();

  async function load(mode, module, material, copies, webgl = false) {
    const query = new URLSearchParams({ meshlets: mode, module, material, copies, webgl: webgl ? '1' : '0' });
    await page.goto(`${url}/stonehold-qa.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__stoneholdQa?.ready || window.__stoneholdQaError, null, { timeout: 120000 });
    const context = await page.evaluate(async () => {
      if (window.__stoneholdQaError) throw new Error(window.__stoneholdQaError);
      const { current, firstFrameMs, compileMs, renderer, timestamps } = window.__stoneholdQa;
      const adapter = renderer.backend.isWebGPUBackend ? (await navigator.gpu.requestAdapter())?.info : null;
      return { current, firstFrameMs, compileMs, timestamps, webgpu: renderer.backend.isWebGPUBackend === true,
        adapter: adapter ? { vendor: adapter.vendor, architecture: adapter.architecture, fallback: adapter.isFallbackAdapter } : null };
    });
    assert.equal(context.webgpu, !webgl);
    if (!webgl) assert.ok(context.adapter?.vendor && !context.adapter.fallback && !/swiftshader|llvmpipe|software/i.test(JSON.stringify(context.adapter)));
    await page.addStyleTag({ content: 'form, output { display: none }' });
    await waitFrames(page, 100);
    return context;
  }

  for (const fixture of fixtures) {
    const comparisonShots = new Map();
    for (const [index, mode] of [...modes, ...modes.toReversed()].entries()) {
      const context = await load(mode, fixture, 'static', report.copies);
      const run = { ...context, repeat: index < modes.length ? 1 : 2 };
      report.runs.push(run);
      assert.ok(context.timestamps, 'WebGPU timestamp queries are required for this comparison');
      for (let attempt = 0; attempt < 3; attempt++) {
        const finishFocus = await focusPerfBrowser(browser, page, { headed: true });
        const pacing = await timeRoute(page, false);
        const { gpu } = await timeRoute(page, true);
        run.focus = await finishFocus();
        if (!run.focus.passed) {
          (run.rejectedFocus ??= []).push(run.focus);
          continue;
        }
        assert.ok(gpu.length === 60 && gpu.every(([render, compute]) => render > 0 && compute >= 0),
          `Invalid GPU timestamp samples (${gpu.length}): ${JSON.stringify(gpu.slice(0, 12))}`);
        run.timings = { frameMs: stats(pacing.frames.slice(1)), renderCpuMs: stats(pacing.cpu),
          gpuPassMs: stats(gpu.map(([render, compute]) => render + compute)),
          gpuRenderMs: stats(gpu.map(([render]) => render)), gpuComputeMs: stats(gpu.map(([, compute]) => compute)) };
        break;
      }
      assert.ok(run.focus.passed, 'benchmark lost foreground focus');
      if (run.repeat === 1) await capturePoses(page, run, comparisonShots);
      assert.equal(browserErrors.snapshot().count, 0, JSON.stringify(browserErrors.snapshot()));
      console.log(`${fixture} ${mode} ${run.repeat}: ${JSON.stringify(run.timings)}`);
    }
  }

  let townBaseline;
  for (const mode of modes) {
    const context = await load(mode, 'Stonehold_Twin_Outcrop', 'town', 1);
    await page.evaluate(() => window.__stoneholdQa.setSnow(0.8));
    await select(page, 'light', 'dusk');
    const town = await screenshot(page, `town-${mode}-snow-dusk`);
    townBaseline ??= town;
    const diff = await pixelDiff(townBaseline, town);
    const { draws } = await inspect(page);
    report.checks.push({ ...context, check: 'town-material-snow-dusk', diff, draws });
    assert.ok(diff < 0.01 && draws.indirect === 0 && draws.direct > 0, `TownKit material fallback failed for ${mode}`);
  }

  for (const mode of modes.filter(mode => mode !== 'baseline')) {
    const context = await load(mode, 'Stonehold_Twin_Outcrop', 'static', 1, true);
    const draws = await page.evaluate(() => window.__stoneholdQa.renderer.info.render.drawCalls);
    report.checks.push({ ...context, check: 'webgl-fallback', draws });
    assert.ok(draws > 0 && context.current.converted === 0, `WebGL fallback failed for ${mode}`);
  }
  assert.equal(browserErrors.snapshot().count, 0, JSON.stringify(browserErrors.snapshot()));
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  report.browserErrors = browserErrors.snapshot();
  await browser.close();
  release();
  await fs.writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
