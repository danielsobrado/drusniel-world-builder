import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';

const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const output = path.resolve(option('--out', 'tmp/foliage-motion'));
await mkdir(output, { recursive: true });
const release = await waitForPerfRunLock(path.resolve('tmp', `perf-browser-${process.platform}.lock`));
const report = { backends: {}, checks: [] };
let browser;
try {
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  for (const backend of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
    const errors = createBrowserErrorMonitor(page);
    const url = new URL('/scripts/fixtures/foliage-motion.html', option('--url', 'http://localhost:5174'));
    url.searchParams.set('backend', backend);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    const images = new Map();
    let last = null;
    for (;;) {
      await page.waitForFunction(previous => window.__foliageFixture?.report.done
        || (window.__foliageFixture?.pendingCapture && window.__foliageFixture.pendingCapture !== previous), last, { timeout: 90000 });
      const state = await page.evaluate(() => ({ id: window.__foliageFixture.pendingCapture, report: window.__foliageFixture.report }));
      if (!state.id) { report.backends[backend] = state.report; break; }
      const png = await page.locator('canvas').screenshot();
      await writeFile(path.join(output, `${backend}-${state.id}.png`), png);
      images.set(state.id, await sharp(png).removeAlpha().raw().toBuffer());
      last = state.id;
      await page.evaluate(() => window.__foliageFixture.continue());
    }
    assert.equal(report.backends[backend].backend, backend);
    assert.equal(report.backends[backend].failure, undefined);
    assert.equal(errors.snapshot().count, 0, JSON.stringify(errors.snapshot()));
    if (backend === 'webgpu') {
      report.adapter = await page.evaluate(async () => {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture, fallback: adapter?.info.isFallbackAdapter };
      });
      assert.ok(report.adapter.vendor || report.adapter.architecture, 'A hardware adapter is required.');
      assert.equal(report.adapter.fallback, false);
    }
    const difference = (a, b) => {
      const left = images.get(a), right = images.get(b);
      return left.reduce((sum, value, i) => sum + Math.abs(value - right[i]), 0) / left.length;
    };
    for (const id of ['tree', 'tree-proxy', 'bush', 'bush-proxy']) {
      const motion = difference(`${id}-still`, `${id}-moving`);
      const rebase = difference(`${id}-moving`, `${id}-rebased`);
      const reanchor = difference(`${id}-moving`, `${id}-reanchored`);
      report.checks.push({ backend, id, motion, rebase, reanchor, passed: motion > 0.02 && rebase < 0.1 && reanchor < 0.1 });
    }
    for (const id of ['impostor-cpu', ...(backend === 'webgpu' ? ['impostor-gpu'] : [])]) {
      const motion = difference(`${id}-still`, `${id}-moving`);
      const rebase = difference(`${id}-moving`, `${id}-rebased`);
      // Bottom scanline is the billboard's tree foot, which must never slide.
      const foot = (pixels) => Array.from(pixels.subarray(479 * 640 * 3))
        .reduce((xs, value, i) => { if (i % 3 === 0 && value < 128) xs.push(i / 3); return xs; }, []);
      const footStill = foot(images.get(`${id}-still`)), footMoving = foot(images.get(`${id}-moving`));
      const planted = footStill.length > 0 && JSON.stringify(footStill) === JSON.stringify(footMoving);
      report.checks.push({ backend, id, motion, rebase, planted, passed: motion > 0.02 && rebase < 0.1 && planted });
    }
    await page.close();
  }
  report.passed = report.checks.every(check => check.passed);
  if (!process.argv.includes('--capture-only')) assert.ok(report.passed, 'Foliage must move and preserve its pose across origin rebases.');
} catch (error) { report.passed = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  await browser?.close(); release();
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, failure: report.failure, adapter: report.adapter,
    checks: report.checks, output }, null, 2));
}
