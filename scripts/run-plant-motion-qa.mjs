import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { captureVisualSource, visualSourceStayedFixed } from './lib/world-visual-source.mjs';
import { fileHash } from './lib/world-visual-report.mjs';
const option = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : fallback;
const root = fileURLToPath(new URL('../', import.meta.url));
const url = option('--url', 'http://localhost:5173');
const out = path.resolve(option('--out', 'tmp/plant-motion-qa')); await mkdir(out, { recursive: true });
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
const report = { ...await captureVisualSource(url, root), backends: {}, artifacts: [] }; let browser;
try {
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  for (const backend of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 384, height: 384 }, deviceScaleFactor: 1 });
    const monitor = createBrowserErrorMonitor(page);
    await page.goto(`${url}/scripts/fixtures/plant-motion.html?backend=${backend}`, { waitUntil: 'domcontentloaded' });
    if (backend === 'webgpu') {
      report.adapter = await page.evaluate(async () => {
        const a = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility', powerPreference: 'high-performance' });
        return { vendor: a?.info.vendor, architecture: a?.info.architecture, description: a?.info.description,
          fallback: !!(a?.info.isFallbackAdapter ?? a?.isFallbackAdapter) };
      });
      if (report.adapter.fallback || !report.adapter.vendor || /swiftshader|lavapipe|llvmpipe|warp/i.test(JSON.stringify(report.adapter)))
        throw new Error('Hardware WebGPU required');
    }
    let previous = null;
    for (;;) {
      await page.waitForFunction(last => window.__plantMotionFixture?.report.done ||
        (window.__plantMotionFixture?.pendingCapture && window.__plantMotionFixture.pendingCapture !== last), previous, { timeout: 180000 });
      const fixture = await page.evaluate(() => ({ id: window.__plantMotionFixture.pendingCapture, report: window.__plantMotionFixture.report }));
      if (!fixture.id) { report.backends[backend] = fixture.report; break; }
      const file = `${backend}-${fixture.id}.png`; await page.screenshot({ path: path.join(out, file) });
      report.artifacts.push({ path: file, sha256: await fileHash(path.join(out, file)) });
      previous = fixture.id; await page.evaluate(() => window.__plantMotionFixture.continue());
    }
    report.backends[backend].errors = monitor.snapshot(); await page.close();
  }
  report.sourceStable = visualSourceStayedFixed(report, await captureVisualSource(url, root));
  report.passed = report.sourceStable && Object.values(report.backends).every(r => r.passed && r.errors.count === 0);
} catch (error) { report.failure = error.stack; report.passed = false; }
finally { await browser?.close(); release(); await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, backends: report.backends, failure: report.failure }));
if (!report.passed) process.exitCode = 1;
