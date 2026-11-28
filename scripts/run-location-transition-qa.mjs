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
const report = { kind: 'location-transition-qa', version: 1, generatedAt: new Date().toISOString(), href: url.href,
  site, cycles, dwellSeconds, afterSeconds, viewport: `${width}x${height}`, environment: null, adapter: null,
  surfaceReady: null, cycleResults: [], counters: null, errors: null, focus: null };
let exitCode = 0;
try {
  report.environment = await readPerfEnvironment(browser).catch(() => null);
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  page.setDefaultTimeout(300_000);
  const errors = createBrowserErrorMonitor(page);
  const startupFocus = await focusPerfBrowser(browser, page, { headed: true });
  if (!(await startupFocus()).passed) throw Object.assign(new Error('startup lost foreground focus'), { focus: true });
  await page.goto(url.href, { waitUntil: 'commit' });
  const focus = await focusPerfBrowser(browser, page, { headed: true });
  await page.waitForFunction(() => window.__editor?.locations && window.__editor.terrainView?.renderer, null, { polling: 250 });
  // One rAF recorder for the whole run; the phase label is switched from Node.
  await page.evaluate(() => {
    const state = window.__ltq = { phase: 'boot', frames: [], last: null };
    const tick = (now) => {
      if (state.last !== null) state.frames.push([now, now - state.last, state.phase]);
      state.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  report.adapter = await page.evaluate(() => {
    const info = window.__editor.terrainView.renderer.backend?.adapter?.info;
    return info ? { vendor: info.vendor, architecture: info.architecture, description: info.description,
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
    const view = window.__editor.terrainView;
    return window.__editor.locations.state === 'idle' && (view.getStreamingStatus?.().loading ?? 0) === 0
      && (view.stylizedSurface?.getPreparationStatus?.().ready ?? true);
  }, null, { polling: 250, timeout: 240_000 }).then(() => true, () => false);

  await setPhase('surface-boot');
  report.surfaceReady = await surfaceReady();
  await setPhase('surface-steady');
  await page.waitForTimeout(5000);
  for (let cycle = 0; cycle < cycles; cycle++) {
    const result = { cycle, before: await snapshot() };
    await setPhase('enter');
    const enterStarted = Date.now();
    result.entered = await page.evaluate(id => window.__editor.locations.enter(id), site);
    result.enterSeconds = (Date.now() - enterStarted) / 1000;
    await setPhase('inside');
    await page.waitForTimeout(dwellSeconds * 1000);
    result.inside = await snapshot();
    await setPhase('exit');
    const exitStarted = Date.now();
    result.exited = await page.evaluate(() => window.__editor.locations.exit());
    result.exitSeconds = (Date.now() - exitStarted) / 1000;
    await setPhase('first-return');
    await page.waitForFunction(() => {
      const frames = window.__ltq.frames;
      let count = 0;
      for (let i = frames.length - 1; i >= 0 && frames[i][2] === 'first-return'; i--) count++;
      return count >= 120;
    }, null, { polling: 100 });
    await setPhase('after');
    await page.waitForTimeout(afterSeconds * 1000);
    result.after = await snapshot();
    result.surfaceSettled = await surfaceReady();
    report.cycleResults.push(result);
    // Each cycle's frames carry their own phase prefix so repeated returns can be compared.
    await page.evaluate(index => { for (const frame of window.__ltq.frames) if (!/^c\d+:/.test(frame[2])) frame[2] = `c${index}:${frame[2]}`; }, cycle);
  }
  report.focus = await focus();
  if (!report.focus.passed) exitCode = PERF_FOCUS_EXIT_CODE;
  const frames = await page.evaluate(() => window.__ltq.frames);
  report.phases = summarizePhases(frames);
  report.frames = frames.map(([t, dt, phase]) => [Math.round(t * 10) / 10, Math.round(dt * 100) / 100, phase]);
  report.errors = errors.snapshot();
} catch (error) {
  report.failure = String(error?.stack ?? error);
  exitCode = error?.focus ? PERF_FOCUS_EXIT_CODE : 1;
} finally {
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
