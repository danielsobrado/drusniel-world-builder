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
  const index = process.argv.indexOf(flag);
  return index < 0 ? fallback : process.argv[index + 1];
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = option('--url', 'http://localhost:5173');
const output = path.resolve(option('--out', 'tmp/environment-parity'));
await mkdir(output, { recursive: true });
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
const report = { url: baseUrl, checks: [], backends: {} };
let browser;
try {
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  const images = new Map();
  for (const backend of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
    const errors = createBrowserErrorMonitor(page);
    const url = new URL('/scripts/fixtures/environment-parity.html', baseUrl); url.searchParams.set('backend', backend);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    let lastId = null;
    for (;;) {
      await page.waitForFunction(last => window.__environmentFixture?.report.done
        || (window.__environmentFixture?.pendingCapture && window.__environmentFixture.pendingCapture !== last), lastId, { timeout: 90000 });
      const state = await page.evaluate(() => ({ id: window.__environmentFixture.pendingCapture, report: window.__environmentFixture.report }));
      if (!state.id) { report.backends[backend] = state.report; break; }
      const png = await page.locator('canvas').screenshot();
      await writeFile(path.join(output, `${backend}-${state.id}.png`), png);
      const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      images.set(`${backend}-${state.id}`, { data, width: info.width, height: info.height, channels: info.channels });
      lastId = state.id;
      await page.evaluate(() => window.__environmentFixture.continue());
    }
    report.backends[backend].errors = errors.snapshot();
    assert.equal(report.backends[backend].backend, backend, 'Requested backend must actually render.');
    assert.equal(report.backends[backend].failure, undefined);
    assert.equal(report.backends[backend].errors.count, 0, JSON.stringify(report.backends[backend].errors));
    if (backend === 'webgpu') {
      report.adapter = await page.evaluate(async () => {
        const adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility', powerPreference: 'high-performance' });
        return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture,
          description: adapter?.info.description, fallback: Boolean(adapter?.info.isFallbackAdapter ?? adapter?.isFallbackAdapter) };
      });
      assert.ok(report.adapter.vendor || report.adapter.architecture || report.adapter.description, 'Hardware adapter must be identified.');
      assert.equal(report.adapter.fallback, false);
      assert.doesNotMatch(Object.values(report.adapter).join(' '), /swiftshader|lavapipe|llvmpipe|warp|basic render/i);
    } else {
      report.backends[backend].adapter = await page.evaluate(() => {
        const gl = window.__environmentFixture.renderer.backend.gl;
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return { vendor: gl.getParameter(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
          renderer: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) };
      });
      assert.doesNotMatch(Object.values(report.backends[backend].adapter).join(' '), /swiftshader|lavapipe|llvmpipe|warp|basic render/i);
    }
    await page.close();
  }
  const check = (id, left, right, options = {}) => {
    const result = compareRenderedImages(images.get(left), images.get(right), options);
    report.checks.push({ id, ...result });
    assert.equal(result.passed, true, `${id}: ${result.failures.join(' ')}`);
  };
  for (const backend of ['webgpu', 'webgl']) {
    const changed = compareRenderedImages(images.get(`${backend}-surf-off`), images.get(`${backend}-surf-on`), { maximumMeanColorError: 255 });
    assert.ok(changed.meanColorError > 0.2, `${backend}: surf must visibly change the actual water material`);
    report.checks.push({ id: `${backend} surf visibly changes pixels`, passed: true, meanColorError: changed.meanColorError });
    const moving = compareRenderedImages(images.get(`${backend}-surf-on`), images.get(`${backend}-surf-moving`), { maximumMeanColorError: 255 });
    assert.ok(moving.meanColorError > 0.2, `${backend}: waves must animate`);
    report.checks.push({ id: `${backend} surf animates`, passed: true, meanColorError: moving.meanColorError });
    check(`${backend} surf survives rebase`, `${backend}-surf-on`, `${backend}-surf-rebased`, { maximumMeanColorError: 1 });
    const riverMotion = compareRenderedImages(images.get(`${backend}-river-high`), images.get(`${backend}-river-moving`), { maximumMeanColorError: 255 });
    assert.ok(riverMotion.meanColorError > 0.2, `${backend}: river ripples and whitewater must animate`);
    report.checks.push({ id: `${backend} river animates`, passed: true, meanColorError: riverMotion.meanColorError });
    check(`${backend} river survives rebase`, `${backend}-river-high`, `${backend}-river-rebased`, { maximumMeanColorError: 1 });
    check(`${backend} river foam composites like separate layers`, `${backend}-river-foam-layers`, `${backend}-river-foam-composite`,
      { maximumMeanColorError: 1, minimumBrightnessRatio: 0.99, maximumBrightnessRatio: 1.01 });
    for (const distance of ['near', 'far']) check(`${backend} compressed ${distance}`,
      `${backend}-foliage-raw-${distance}`, `${backend}-foliage-compressed-${distance}`);
    check(`${backend} frost visibly changes pixels`, `${backend}-frost-off`, `${backend}-frost-on`, {
      maximumCoverageDelta: 0.02, minimumBrightnessRatio: 1.1, maximumMeanColorError: 100,
    });
    check(`${backend} cached reflection follows camera motion`, `${backend}-reflection-refreshed-turn`, `${backend}-reflection-cached-turn`, {
      maximumMeanColorError: 8, minimumBrightnessRatio: 0.9, maximumBrightnessRatio: 1.1,
    });
    check(`${backend} reflection survives rebase`, `${backend}-reflection-refreshed-turn`, `${backend}-reflection-rebased`, {
      maximumMeanColorError: 1, maximumCoverageDelta: 0.01,
    });
    check(`${backend} orbit reflection visibly changes pixels`, `${backend}-reflection-orbit-off`, `${backend}-reflection-orbit-on`, {
      minimumBrightnessRatio: 1.1, maximumMeanColorError: 150,
    });
  }
  for (const id of ['foliage-raw-near', 'foliage-compressed-near', 'foliage-raw-far', 'foliage-compressed-far', 'frost-off', 'frost-on',
    'reflection-cached-turn', 'reflection-refreshed-turn', 'reflection-rebased', 'reflection-orbit-on', 'reflection-orbit-off',
    'surf-off', 'surf-on', 'surf-rebased', 'surf-moving',
    'river-medium', 'river-high', 'river-moving', 'river-rebased', 'river-fall', 'river-foam-composite', 'river-foam-layers']) {
    check(`backend parity ${id}`, `webgpu-${id}`, `webgl-${id}`, { minimumBrightnessRatio: 0.9, maximumBrightnessRatio: 1.1 });
  }
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  await browser?.close(); release();
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, failure: report.failure, checks: report.checks.map(({ id, passed }) => ({ id, passed })), output }, null, 2));
}
