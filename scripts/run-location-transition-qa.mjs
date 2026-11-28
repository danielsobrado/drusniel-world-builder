// Deterministic surface → location → surface transition capture for the location GPU restoration
// acceptance (docs/qa/location-gpu-restoration-acceptance.md). Records per-frame rAF intervals by phase,
// every locationSurface counter, renderer-accounted memory, browser errors and native foreground focus.
//
// node scripts/run-location-transition-qa.mjs --site showcase-deep-workings --cycles 3 \
//   --flags "locationSurfaceReclamation=1&locationSurfaceShadowReclamation=1" --out tmp/location-qa/run.json
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PERF_CHROMIUM_GPU_ARGS, readPerfEnvironment } from './lib/perf-environment.mjs';
import { focusPerfBrowser, PERF_FOCUS_EXIT_CODE } from './lib/perf-browser-focus.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { locationTransitionVerdict } from './lib/location-transition-evidence.mjs';

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const number = (name, fallback) => {
  const value = Number(arg(name, fallback));
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number.`);
  return value;
};
const site = arg('site', 'showcase-deep-workings');
const cycles = Math.max(1, Math.floor(number('cycles', 1)));
const dwellSeconds = number('dwell', 20);
const afterSeconds = number('after', 30);
const width = number('width', 1280), height = number('height', 720);
const outPath = path.resolve(arg('out', 'tmp/location-qa/location-transition.json'));
const url = new URL(arg('url', 'http://localhost:5173/'));
for (const [key, value] of new URLSearchParams(arg('flags', ''))) url.searchParams.set(key, value);

const browser = await chromium.launch({ headless: false, args: PERF_CHROMIUM_GPU_ARGS });
const report = { kind: 'location-transition-qa', version: 2, generatedAt: new Date().toISOString(), href: url.href,
  site, cycles, dwellSeconds, afterSeconds, viewport: `${width}x${height}`, environment: null, adapter: null,
  surfaceReady: null, cycleResults: [], counters: null, errors: null, focus: null };
let exitCode = 0;
let page, errors, focus;
try {
  report.environment = await readPerfEnvironment(browser).catch(() => null);
  page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  page.setDefaultTimeout(300_000);
  errors = createBrowserErrorMonitor(page);
  const startupFocus = await focusPerfBrowser(browser, page, { headed: true });
  if (!(await startupFocus()).passed) throw Object.assign(new Error('startup lost foreground focus'), { focus: true });
  await page.goto(url.href, { waitUntil: 'commit' });
  focus = await focusPerfBrowser(browser, page, { headed: true });
  await page.waitForFunction(() => window.__editor?.locations && window.__editor.terrainView?.renderer, null, { polling: 250 });
  // One rAF recorder for the whole run; the phase label is switched from Node.
  await page.evaluate(() => {
    const state = window.__ltq = { phase: 'boot', frames: [], last: null, cycle: -1, returning: false,
      firstReturnFrames: 0, peakAccountedBytes: 0 };
    const tick = (now) => {
      const runtime = window.__editor.locations;
      const total = window.__editor.terrainView.renderer.info?.memory?.total;
      if (Number.isFinite(total)) state.peakAccountedBytes = Math.max(state.peakAccountedBytes, total);
      let phase = state.phase;
      if (state.returning && !runtime.active && state.firstReturnFrames < 120) {
        state.firstReturnFrames++;
        phase = 'first-return';
      }
      if (state.last !== null) state.frames.push([now, now - state.last, 'c' + state.cycle + ':' + phase, Number.isFinite(total) ? total : null]);
      state.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  report.adapter = await page.evaluate(() => {
    const backend = window.__editor.terrainView.renderer.backend;
    const info = backend?.adapter?.info;
    return info ? { webgpu: backend.isWebGPUBackend === true, vendor: info.vendor, architecture: info.architecture, description: info.description,
      isFallbackAdapter: info.isFallbackAdapter ?? null } : null;
  });
  const setPhase = phase => page.evaluate(value => { window.__ltq.phase = value; }, phase);
  const snapshot = () => page.evaluate(async () => {
    const { PerfCounters } = await import('/src/editor/performance/qa/PerfCounters.js');
    const all = PerfCounters.snapshot();
    const memory = window.__editor.terrainView.renderer.info?.memory ?? {};
    return { at: performance.now(), state: window.__editor.locations.state,
      counters: Object.fromEntries(Object.entries(all).filter(([key]) => /^location(Surface|Structure)\./.test(key))),
      memory: Object.fromEntries(Object.entries(memory).filter(([, value]) => typeof value === 'number')) };
  });
  const surfaceReady = () => page.waitForFunction(() => {
    const editor = window.__editor;
    const streaming = editor.terrainView.getStreamingStatus?.();
    const preparation = editor.stylizedSurface?.getPreparationStatus?.();
    return editor.locations.state === 'idle' && !editor.locations.active && streaming?.loading === 0
      && preparation?.ready === true;
  }, null, { polling: 250, timeout: 240_000 }).then(() => true, () => false);

  await setPhase('surface-boot');
  report.surfaceReady = await surfaceReady();
  if (!report.surfaceReady) throw new Error('Initial surface readiness gate failed.');
  await setPhase('surface-steady');
  await page.waitForTimeout(5000);
  for (let cycle = 0; cycle < cycles; cycle++) {
    await page.evaluate(index => Object.assign(window.__ltq, { cycle: index, returning: false, firstReturnFrames: 0, peakAccountedBytes: 0 }), cycle);
    const result = { cycle, before: await snapshot() };
    report.cycleResults.push(result);
    await setPhase('enter');
    const enterStarted = Date.now();
    result.entered = await page.evaluate(id => window.__editor.locations.enter(id), site);
    result.enterSeconds = (Date.now() - enterStarted) / 1000;
    if (!result.entered) throw new Error('Location entry failed: ' + site);
    await setPhase('inside');
    await page.waitForTimeout(dwellSeconds * 1000);
    result.inside = await snapshot();
    await page.evaluate(() => Object.assign(window.__ltq, { phase: 'exit', returning: true }));
    const exitStarted = Date.now();
    result.exited = await page.evaluate(() => window.__editor.locations.exit());
    result.exitSeconds = (Date.now() - exitStarted) / 1000;
    if (!result.exited) throw new Error('Location exit failed: ' + site);
    await page.waitForFunction(() => window.__ltq.firstReturnFrames >= 120, null, { polling: 100 });
    result.firstReturnFrames = await page.evaluate(() => window.__ltq.firstReturnFrames);
    await setPhase('after');
    await page.waitForTimeout(afterSeconds * 1000);
    result.after = await snapshot();
    result.surfaceSettled = await surfaceReady();
    result.peakAccountedBytes = await page.evaluate(() => window.__ltq.peakAccountedBytes);
    if (!result.surfaceSettled) throw new Error('Surface failed to settle after cycle ' + cycle);
  }
} catch (error) {
  report.failure = String(error?.stack ?? error);
  exitCode = error?.focus ? PERF_FOCUS_EXIT_CODE : 1;
} finally {
  if (focus) {
    try { report.focus = await focus(); }
    catch (error) { report.focus = { passed: false, error: String(error) }; }
  }
  if (page && !page.isClosed()) {
    try {
      const frames = await page.evaluate(() => window.__ltq?.frames ?? []);
      report.phases = summarizePhases(frames);
      report.frames = frames.map(([t, dt, phase, total]) => [Math.round(t * 10) / 10, Math.round(dt * 100) / 100, phase, total]);
    } catch (error) { report.captureError = String(error); }
  }
  report.errors = errors?.snapshot() ?? null;
  report.verdict = locationTransitionVerdict(report);
  if (report.focus?.passed === false) exitCode = PERF_FOCUS_EXIT_CODE;
  else if (!report.verdict.passed && exitCode === 0) exitCode = 1;
  await browser.close();
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report));
console.log(JSON.stringify({ out: outPath, phases: report.phases, exit: exitCode, failure: report.failure ?? null,
  errors: report.errors?.count ?? null, focus: report.focus?.passed ?? null }, null, 1));
process.exit(exitCode);

function summarizePhases(frames) {
  const groups = new Map();
  for (const [, dt, phase] of frames) {
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push(dt);
  }
  const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return Object.fromEntries([...groups].map(([phase, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [phase, { frames: sorted.length, medianMs: quantile(sorted, 0.5), p95Ms: quantile(sorted, 0.95),
      p99Ms: quantile(sorted, 0.99), maxMs: sorted.at(-1), over33: sorted.filter(v => v > 33.3).length,
      over50: sorted.filter(v => v > 50).length, totalMs: values.reduce((a, b) => a + b, 0) }];
  }));
}
