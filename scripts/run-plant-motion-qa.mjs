import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { captureVisualSource, visualSourceStayedFixed } from './lib/world-visual-source.mjs';
import { fileHash } from './lib/world-visual-report.mjs';
const option = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : fallback;
const root = fileURLToPath(new URL('../', import.meta.url));
const url = option('--url', 'http://localhost:5173');
const fixture = option('--fixture', 'motion');
if (!['motion', 'appearance'].includes(fixture)) throw new Error('Unknown plant fixture');
const namespace = fixture === 'motion' ? '__plantMotionFixture' : '__plantAppearanceFixture';
const out = path.resolve(option('--out', 'tmp/plant-motion-qa')); await mkdir(out, { recursive: true });
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`), { timeoutMs: 900000 });
const report = { ...await captureVisualSource(url, root), backends: {}, artifacts: [] }; let browser;
report.fixture = fixture;
report.harness = {};
for (const ext of ['html', 'mjs']) report.harness[`plant-${fixture}.${ext}`] = await fileHash(path.join(root, `scripts/fixtures/plant-${fixture}.${ext}`));
try {
  const importMap = {};
  if (fixture === 'appearance') {
    const response = await fetch(`${url}/scripts/fixtures/plant-motion.mjs`);
    if (!response.ok) throw new Error('Cannot resolve the frozen fixture dependencies');
    const transformed = await response.text();
    for (const [bare, module] of [['three/webgpu', 'three_webgpu'], ['three/tsl', 'three_tsl']]) {
      const resolved = transformed.match(new RegExp(`from ["']([^"']*/${module}\\.js[^"']*)["']`))?.[1];
      if (!resolved) throw new Error(`Cannot resolve frozen ${bare}`);
      importMap[bare] = resolved;
    }
    report.harnessImportMap = importMap;
  }
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--js-flags=--max-old-space-size=8192', '--ignore-gpu-blocklist', '--use-angle=default'] });
  for (const backend of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 384, height: 384 }, deviceScaleFactor: 1 });
    const monitor = createBrowserErrorMonitor(page);
    if (fixture === 'appearance') {
      // The test harness is independent of the frozen runtime. Only these two
      // recorded harness files are supplied locally; all production imports
      // still come from the immutable server and its source manifest.
      for (const ext of ['html', 'mjs']) await page.route(`**/scripts/fixtures/plant-appearance.${ext}*`, async route => {
        let body = await readFile(path.join(root, `scripts/fixtures/plant-appearance.${ext}`), 'utf8');
        if (ext === 'mjs') for (const [bare, resolved] of Object.entries(importMap)) body = body.replaceAll(`from '${bare}'`, `from '${resolved}'`);
        await route.fulfill({ body,
          contentType: ext === 'html' ? 'text/html' : 'text/javascript' });
      });
      report.fixtureTransport = 'recorded local harness; frozen production imports';
    }
    await page.goto(`${url}/scripts/fixtures/plant-${fixture}.html?backend=${backend}`, { waitUntil: 'domcontentloaded' });
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
      await page.waitForFunction(({ key, last }) => window[key]?.report.done ||
        (window[key]?.pendingCapture && window[key].pendingCapture !== last), { key: namespace, last: previous }, { timeout: 180000 });
      const current = await page.evaluate(key => ({ id: window[key].pendingCapture, report: window[key].report }), namespace);
      if (!current.id) { report.backends[backend] = current.report; break; }
      const file = `${backend}-${current.id}.png`; await page.screenshot({ path: path.join(out, file) });
      report.artifacts.push({ path: file, sha256: await fileHash(path.join(out, file)) });
      previous = current.id; await page.evaluate(key => window[key].continue(), namespace);
    }
    report.backends[backend].errors = monitor.snapshot(); await page.close();
  }
  report.sourceStable = visualSourceStayedFixed(report, await captureVisualSource(url, root));
  report.harnessStable = true;
  for (const [file, hash] of Object.entries(report.harness)) if (await fileHash(path.join(root, 'scripts/fixtures', file)) !== hash) report.harnessStable = false;
  report.passed = report.sourceStable && report.harnessStable && Object.values(report.backends).every(r => r.passed && r.errors.count === 0);
} catch (error) { report.failure = error.stack; report.passed = false; }
finally { await browser?.close(); release(); await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, backends: report.backends, failure: report.failure }));
if (!report.passed) process.exitCode = 1;
