import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { compareRenderedImages } from './lib/rendered-image-metrics.mjs';

const option = (flag, fallback) => {
  const index = process.argv.indexOf(flag); return index < 0 ? fallback : process.argv[index + 1];
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = option('--url', 'http://localhost:5173');
const output = path.resolve(option('--out', 'tmp/shore-details/after'));
await mkdir(output, { recursive: true });
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
const report = { url: baseUrl, checks: [], backends: {} }, images = new Map();
const captureOnly = process.argv.includes('--capture-only');
let browser;
try {
  browser = await chromium.launch({ headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  for (const backend of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
    const errors = createBrowserErrorMonitor(page);
    const url = new URL('/scripts/fixtures/environment-parity.html', baseUrl);
    url.searchParams.set('backend', backend); url.searchParams.set('shoreDetails', '1');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    let last = null;
    for (;;) {
      await page.waitForFunction(previous => window.__environmentFixture?.report.done
        || (window.__environmentFixture?.pendingCapture && window.__environmentFixture.pendingCapture !== previous), last, { timeout: 90000 });
      const state = await page.evaluate(() => ({ id: window.__environmentFixture.pendingCapture,
        report: window.__environmentFixture.report }));
      if (!state.id) { report.backends[backend] = state.report; break; }
      const png = await page.locator('canvas').screenshot();
      await writeFile(path.join(output, `${backend}-${state.id}.png`), png);
      const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      images.set(`${backend}-${state.id}`, { data, width: info.width, height: info.height, channels: info.channels });
      last = state.id; await page.evaluate(() => window.__environmentFixture.continue());
    }
    report.backends[backend].errors = errors.snapshot();
    assert.equal(report.backends[backend].backend, backend);
    assert.equal(report.backends[backend].failure, undefined);
    assert.equal(report.backends[backend].errors.count, 0, JSON.stringify(report.backends[backend].errors));
    if (backend === 'webgpu') {
      report.adapter = await page.evaluate(async () => {
        const adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility', powerPreference: 'high-performance' });
        return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture,
          description: adapter?.info.description, fallback: Boolean(adapter?.info.isFallbackAdapter ?? adapter?.isFallbackAdapter) };
      });
      assert.ok(report.adapter.vendor || report.adapter.architecture || report.adapter.description);
      assert.equal(report.adapter.fallback, false);
      assert.doesNotMatch(Object.values(report.adapter).join(' '), /swiftshader|lavapipe|llvmpipe|warp|basic render/i);
    } else {
      report.backends[backend].adapter = await page.evaluate(() => {
        const gl = window.__environmentFixture.renderer.backend.gl, info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) };
      });
      assert.doesNotMatch(report.backends[backend].adapter.renderer, /swiftshader|lavapipe|llvmpipe|warp|basic render/i);
    }
    await page.close();
  }
  if (!captureOnly) {
    for (const backend of ['webgpu', 'webgl']) {
      const cases = report.backends[backend].cases;
      assert.ok(cases.find(c => c.id === 'beach-details').oceanInstances > 0);
      assert.equal(cases.find(c => c.id === 'lake-bank-details').lakeInstances, 0);
      assert.equal(cases.find(c => c.id === 'fitted-boulders').fitted, 3);
      const filtering = cases.find(c => c.id === 'surface-filtering');
      assert.equal(filtering.anisotropy, Math.min(16, filtering.maximum));
      report.checks.push({ id: `${backend}: coastal placement and filtering`, passed: true });
      for (const id of ['lake-pads', 'local-wet-rocks', 'fitted-boulders', 'beach-details']) {
        const result = compareRenderedImages(images.get(`${backend}-${id}`), images.get(`${backend}-${id}-rebased`),
          { maximumMeanColorError: 0.4, maximumCoverageDelta: 0.01, maximumMaskDifference: 0.01 });
        report.checks.push({ id: `${backend}: ${id} rebase`, ...result }); assert.equal(result.passed, true);
      }
      const motion = compareRenderedImages(images.get(`${backend}-lake-pads`), images.get(`${backend}-lake-pads-moving`),
        { maximumMeanColorError: 255 });
      assert.ok(motion.meanColorError > 0.2); report.checks.push({ id: `${backend}: lake motion`, passed: true, meanColorError: motion.meanColorError });
    }
    for (const id of report.backends.webgpu.cases.map(c => c.id)) {
      const result = compareRenderedImages(images.get(`webgpu-${id}`), images.get(`webgl-${id}`),
        { maximumMeanColorError: 8, maximumCoverageDelta: 0.03, maximumMaskDifference: 0.03 });
      report.checks.push({ id: `${id}: backend parity`, ...result }); assert.equal(result.passed, true);
    }
  }
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.stack; process.exitCode = 1; }
finally { await browser?.close(); release(); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, output, failure: report.failure }, null, 2));
