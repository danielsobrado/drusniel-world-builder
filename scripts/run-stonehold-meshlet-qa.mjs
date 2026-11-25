import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { focusPerfBrowser } from './lib/perf-browser-focus.mjs';
import { driverGpuMemory, trackGpuBuffers } from './lib/stonehold-gpu-buffers.mjs';
import { stoneholdVisualGates } from './lib/stonehold-visual-gates.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';

const args = process.argv.slice(2);
const value = (key, fallback) => args.includes(`--${key}`) ? args[args.indexOf(`--${key}`) + 1] : fallback;
const url = value('url', 'http://localhost:5173');
const out = path.resolve(value('out', 'tmp/stonehold-meshlets'));
const suite = value('suite', 'kit');
const suites = {
  kit: ['baseline', 'authored', 'native', 'external'],
  dense: ['authored', 'native', 'native-hzb'],
  buffers: ['baseline', 'authored', 'native', 'external'],
  drawing: ['baseline', 'native', 'visibility'],
  batch: ['separate', 'batched'],
};
assert.ok(Object.hasOwn(suites, suite), 'Unknown Stonehold suite');
const dense = suite === 'dense' || suite === 'drawing';
const modes = value('modes', suites[suite].join(',')).split(',');
const optionalModes = suite === 'drawing' ? ['native-hzb', 'visibility-hzb'] : suite === 'kit' ? ['visibility'] : [];
assert.ok(modes[0] === suites[suite][0] && new Set(modes).size === modes.length
  && modes.every(mode => [...suites[suite], ...optionalModes].includes(mode)), 'Invalid modes or missing reference arm');
const heights = dense ? value('resolutions', '1080,1440,2160').split(',').map(Number) : [720];
const instanceCounts = dense ? value('copies', suite === 'drawing' ? '1,16' : '1,16,100').split(',').map(Number) : [16];
const compileMode = value('compile', 'async');
const lodThreshold = Number(value('lod-threshold', '1'));
const cycles = Number(value('cycles', '3'));
assert.ok(['async', 'on-demand'].includes(compileMode) && Number.isFinite(lodThreshold) && lodThreshold > 0);
assert.ok(Number.isInteger(cycles) && cycles > 0);
assert.ok(heights.every(height => [720, 1080, 1440, 2160].includes(height)));
assert.ok(instanceCounts.every(count => [1, 16, 100].includes(count)));
const fixtures = dense ? ['Dense_Cliff'] : ['Stonehold_Fang_Shrine', 'Stonehold_Twin_Outcrop'];
const timingCases = suite === 'buffers' ? [] : fixtures.flatMap(fixture => heights.flatMap(height =>
  instanceCounts.map(copies => [fixture, height, copies])));
const report = { recordedAt: new Date().toISOString(), suite, compileMode, lodThreshold, runs: [], checks: [] };

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  assert.ok(sorted.length && sorted.every(Number.isFinite), 'empty or invalid timings');
  const percentile = p => sorted[Math.ceil(p * sorted.length) - 1];
  return { samples: sorted.length, p50: percentile(0.50), p95: percentile(0.95), p99: percentile(0.99), max: sorted.at(-1) };
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
    const far = Math.max(2.73, (state.lodRadius + 155) / Math.hypot(home.x, home.z));
    state.lodFrames = [0, 0];
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
          .multiplyScalar(0.37 + (far - 0.37) * (1 - Math.cos(phase)) / 2).add(orbit.target);
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
        const lodFrames = state.lodFrames;
        state.lodFrames = null;
        camera.position.copy(home).add(orbit.target);
        camera.lookAt(orbit.target);
        Promise.resolve(pending).then(() => resolve({ frames, cpu, gpu, lodFrames }), reject);
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
  if (mode === 'native' || mode === 'visibility') assert.ok(run.hero.native?.triangles > 0 && run.hero.draws.indirect > 0);
  if (mode === 'external') assert.ok(run.hero.external?.drawnTriangles > 0 && !run.hero.external.overflow && run.hero.draws.indirect > 0);
  if (mode === 'baseline') {
    await page.evaluate(() => window.__stoneholdQa.setSubjectVisible(false));
    await waitFrames(page);
    await take('empty');
    await page.evaluate(() => {
      window.__stoneholdQa.setSubjectVisible(true);
      window.__stoneholdQa.setShadows(false);
    });
    await waitFrames(page);
    await take('shadowless');
    await page.evaluate(() => window.__stoneholdQa.setShadows(true));
  }

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
  const reflection = await take('reflection');
  if (mode === 'baseline') {
    await page.evaluate(() => window.__stoneholdQa.setSubjectVisible(false));
    await waitFrames(page);
    await take('emptyReflection');
  }
  run.visualGates = await stoneholdVisualGates(comparisonShots, hero, reflection);
  if (mode !== 'external') assert.ok(Object.values(run.visualGates).every(metric => metric.passed), JSON.stringify(run.visualGates));
}

async function captureBufferLifecycle(browser, page) {
  const cdp = await browser.newBrowserCDPSession();
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  await cdp.detach();
  const gpuPid = processInfo.find(item => item.type.toLowerCase() === 'gpu')?.id;
  const sample = async phase => {
    const data = await page.evaluate(async () => {
      const { renderer } = window.__stoneholdQa;
      await renderer.backend.device.queue.onSubmittedWorkDone();
      return { renderer: { ...renderer.info.memory }, webgpu: window.__stoneholdGpuBuffers() };
    });
    return { phase, ...data, driver: await driverGpuMemory(gpuPid) };
  };
  const control = await page.evaluate(() => {
    const before = window.__stoneholdGpuBuffers();
    const device = window.__stoneholdQa.renderer.backend.device;
    const buffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC });
    buffer.destroy();
    buffer.destroy();
    return { before, after: window.__stoneholdGpuBuffers() };
  });
  assert.equal(control.after.staging.createdBytes - (control.before.staging?.createdBytes ?? 0), 16);
  assert.equal(control.after.staging.destroyedBytes - (control.before.staging?.destroyedBytes ?? 0), 16);
  const samples = [await sample('initial-loaded')];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    await select(page, 'lod', '1');
    await page.evaluate(() => window.__stoneholdQa.unload());
    await waitFrames(page);
    samples.push(await sample(`unloaded-${cycle}`));
    await select(page, 'lod', '0');
    samples.push(await sample(`reloaded-${cycle}`));
  }
  await page.goto('about:blank');
  samples.push({ phase: 'document-closed', driver: await driverGpuMemory(gpuPid) });
  return samples;
}

await fs.mkdir(out, { recursive: true });
const release = await waitForPerfRunLock(path.resolve(`tmp/perf-browser-${process.platform}.lock`));
process.once('exit', release);
const browser = await chromium.launch({ headless: false, args: [
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu-rasterization',
  '--disable-gpu-vsync', '--disable-frame-rate-limit',
] });
report.browser = browser.version();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const browserErrors = createBrowserErrorMonitor(page);
if (suite === 'buffers') await page.addInitScript(trackGpuBuffers);
try {
  await (await focusPerfBrowser(browser, page, { headed: true }))();

  async function load(mode, module, material, copies, webgl = false) {
    const occlusion = mode.endsWith('-hzb');
    const query = new URLSearchParams({ meshlets: mode.replace(/-hzb$/, ''), module, material, copies, compile: compileMode, lodThreshold,
      occlusion: occlusion ? '1' : '0', webgl: webgl ? '1' : '0', buffers: suite === 'buffers' ? '1' : '0' });
    await page.goto(`${url}/stonehold-qa.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__stoneholdQa?.ready || window.__stoneholdQaError, null, { timeout: 120000 });
    const context = await page.evaluate(async () => {
      if (window.__stoneholdQaError) throw new Error(window.__stoneholdQaError);
      const { current, firstFrameMs, firstRenderCpuMs, compileMs, renderer, timestamps, capabilities } = window.__stoneholdQa;
      const adapter = renderer.backend.isWebGPUBackend ? (await navigator.gpu.requestAdapter())?.info : null;
      return { current, firstFrameMs, firstRenderCpuMs, compileMs, timestamps, capabilities, webgpu: renderer.backend.isWebGPUBackend === true,
        adapter: adapter ? { vendor: adapter.vendor, architecture: adapter.architecture, fallback: adapter.isFallbackAdapter } : null };
    });
    assert.equal(context.webgpu, !webgl);
    assert.equal(context.current.occlusion, occlusion);
    assert.equal(context.current.copies, copies);
    if (!webgl) assert.ok(context.adapter?.vendor && !context.adapter.fallback && !/swiftshader|llvmpipe|software/i.test(JSON.stringify(context.adapter)));
    await page.addStyleTag({ content: 'form, output { display: none }' });
    await waitFrames(page, 100);
    return context;
  }

  if (suite === 'buffers') {
    for (const mode of modes.filter(mode => mode !== 'authored')) {
      const context = await load(mode, fixtures[0], 'static', 16);
      report.checks.push({ ...context, check: 'buffer-lifecycle', samples: await captureBufferLifecycle(browser, page) });
    }
  }
  for (const [fixture, height, copies] of timingCases) {
    const viewport = { width: Math.round(height * 16 / 9), height };
    await page.setViewportSize(viewport);
    const comparisonShots = new Map();
    const repeats = suite === 'drawing' || suite === 'batch' ? [...modes, ...modes.toReversed(), ...modes] : [...modes, ...modes.toReversed()];
    let batchReference;
    for (const [index, mode] of repeats.entries()) {
      const context = await load(mode, fixture, 'static', copies);
      const run = { ...context, viewport, repeat: Math.floor(index / modes.length) + 1 };
      report.runs.push(run);
      assert.ok(context.timestamps, 'WebGPU timestamp queries are required for this comparison');
      if (dense && context.current.mode === 'native') assert.ok(context.current.triangles >= 300000);
      for (let attempt = 0; attempt < 3; attempt++) {
        const finishFocus = await focusPerfBrowser(browser, page, { headed: true });
        const pacing = await timeRoute(page, false);
        const { gpu, lodFrames } = await timeRoute(page, true);
        run.focus = await finishFocus();
        if (!run.focus.passed) {
          (run.rejectedFocus ??= []).push(run.focus);
          continue;
        }
        assert.ok(gpu.length === 60 && gpu.every(([render, compute]) => render > 0 && compute >= 0),
          `Invalid GPU timestamp samples (${gpu.length}): ${JSON.stringify(gpu.slice(0, 12))}`);
        if (mode === 'authored') {
          assert.ok(pacing.lodFrames.every(count => count > 0) && lodFrames.every(count => count > 0), 'Authored route missed a LOD');
          run.lodFrames = { pacing: pacing.lodFrames, gpu: lodFrames };
        }
        run.timings = { frameMs: stats(pacing.frames.slice(1)), renderCpuMs: stats(pacing.cpu),
          gpuPassMs: stats(gpu.map(([render, compute]) => render + compute)),
          gpuRenderMs: stats(gpu.map(([render]) => render)), gpuComputeMs: stats(gpu.map(([, compute]) => compute)) };
        break;
      }
      assert.ok(run.focus.passed, 'benchmark lost foreground focus');
      if (run.repeat === 1 && !dense && mode !== 'authored' && suite !== 'batch') await capturePoses(page, run, comparisonShots);
      if (run.repeat === 1 && suite === 'batch') {
        await select(page, 'view', 'hero');
        const picks = await page.evaluate(() => {
          const { pickAt } = window.__stoneholdQa;
          const offsets = Array.from({ length: 21 }, (_, index) => (index - 10) * 0.07);
          return offsets.flatMap(y => offsets.map(x => pickAt(x, y)));
        });
        run.hero = await inspect(page);
        const image = await screenshot(page, `${fixture}-${mode}`);
        if (mode === 'separate') batchReference = { image, picks };
        else {
          assert.ok(batchReference.picks.some(pick => pick !== null), 'Batch comparison missed all subjects');
          assert.deepEqual(picks, batchReference.picks, 'Batch comparison changed picking IDs');
          run.batchPixelDiff = await pixelDiff(image, batchReference.image);
          assert.ok(run.batchPixelDiff < 0.01, `Batch comparison changed over 1% of pixels: ${run.batchPixelDiff}`);
        }
      }
      if (run.repeat === 1 && dense) {
        await waitFrames(page, 100);
        run.hero = await inspect(page);
        if (mode.startsWith('native') || mode.startsWith('visibility')) assert.ok(run.hero.native?.triangles > 0 && run.hero.draws.indirect > 0);
        if (height === 1080) await screenshot(page, `${fixture}-${mode}-${copies}-${height}`);
      }
      assert.equal(browserErrors.snapshot().count, 0, JSON.stringify(browserErrors.snapshot()));
      console.log(`${fixture} ${height}p ×${copies} ${mode} #${run.repeat} GPU p95 ${run.timings.gpuPassMs.p95.toFixed(3)} ms`);
    }
  }

  let townBaseline;
  const fallbackModes = suite === 'kit' ? modes.filter(mode => mode !== 'authored') : [];
  for (const mode of fallbackModes) {
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

  for (const mode of fallbackModes.filter(mode => mode !== 'baseline')) {
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
