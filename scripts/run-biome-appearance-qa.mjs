import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { compareRenderedImages } from './lib/rendered-image-metrics.mjs';

const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const url = option('--url', 'http://localhost:5173');
const output = path.resolve(option('--out', 'tmp/biome-reference/after'));
await mkdir(output, { recursive: true });
const release = await waitForPerfRunLock(path.resolve('tmp', `perf-browser-${process.platform}.lock`));
const captureOnly = process.argv.includes('--capture-only');
const report = { url, mode: captureOnly ? 'capture' : 'acceptance', checks: [], backends: {} }, images = new Map();
let browser;
try {
  browser = await chromium.launch({ headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  for (const backend of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 720, height: 480 }, deviceScaleFactor: 1 });
    const errors = createBrowserErrorMonitor(page);
    await page.goto(new URL(`/scripts/fixtures/biome-appearance.html?backend=${backend}`, url).href,
      { waitUntil: 'domcontentloaded' });
    let last = null;
    for (;;) {
      await page.waitForFunction(previous => window.__biomeFixture?.report.done
        || (window.__biomeFixture?.pendingCapture && window.__biomeFixture.pendingCapture !== previous), last, { timeout: 90000 });
      const state = await page.evaluate(() => ({ id: window.__biomeFixture.pendingCapture, report: window.__biomeFixture.report }));
      if (!state.id) { report.backends[backend] = state.report; break; }
      const png = await page.locator('canvas').screenshot();
      await writeFile(path.join(output, `${backend}-${state.id}.png`), png);
      const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      images.set(`${backend}-${state.id}`, { data, width: info.width, height: info.height, channels: info.channels });
      last = state.id; await page.evaluate(() => window.__biomeFixture.continue());
    }
    report.backends[backend].errors = errors.snapshot();
    assert.equal(report.backends[backend].failure, undefined);
    assert.equal(report.backends[backend].backend, backend);
    assert.equal(report.backends[backend].errors.count, 0, JSON.stringify(errors.snapshot()));
    if (backend === 'webgpu') {
      report.adapter = await page.evaluate(async () => {
        const adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility', powerPreference: 'high-performance' });
        return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture,
          description: adapter?.info.description, fallback: Boolean(adapter?.info.isFallbackAdapter ?? adapter?.isFallbackAdapter) };
      });
      assert.ok(report.adapter.vendor || report.adapter.architecture || report.adapter.description);
      assert.equal(report.adapter.fallback, false);
      assert.doesNotMatch(Object.values(report.adapter).join(' '), /swiftshader|lavapipe|llvmpipe|warp|basic render/i);
    }
    await page.close();
  }
  if (!captureOnly) {
  for (const backend of ['webgpu', 'webgl']) for (const biome of [3, 4, 7, 8, 9, 12]) {
    const comparison = compareRenderedImages(images.get(`${backend}-biome-${biome}`), images.get(`${backend}-biome-${biome}-rebased`),
      { maximumMeanColorError: 0.6, maximumCoverageDelta: 0.01, maximumMaskDifference: 0.01 });
    report.checks.push({ id: `${backend}: ${biome} rebase`, ...comparison }); assert.equal(comparison.passed, true);
  }
  for (const { id } of report.backends.webgpu.cases) {
    const comparison = compareRenderedImages(images.get(`webgpu-${id}`), images.get(`webgl-${id}`),
      { maximumMeanColorError: 8, maximumCoverageDelta: 0.03, maximumMaskDifference: 0.03 });
    report.checks.push({ id: `${id} backend parity`, ...comparison }); assert.equal(comparison.passed, true);
  }
  for (const [a, b] of [[3, 4], [4, 7], [8, 9], [9, 12]]) {
    const comparison = compareRenderedImages(images.get(`webgpu-biome-${a}`), images.get(`webgpu-biome-${b}`), { maximumMeanColorError: 255 });
    assert.ok(comparison.meanColorError > 0.5, `${a} and ${b} should retain distinct pigment`);
    report.checks.push({ id: `${a}/${b} biome distinction`, passed: true, meanColorError: comparison.meanColorError });
  }
  }
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.stack; process.exitCode = 1; }
finally { await browser?.close(); release(); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, output, failure: report.failure }, null, 2));
