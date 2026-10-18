import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { captureVisualSource, visualSourceStayedFixed } from './lib/world-visual-source.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { fileHash } from './lib/world-visual-report.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'docs/qa/visual-audit-2026-10-18/foliage-motion');
const url = 'http://localhost:5267';
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(out, '../manifest.json'), 'utf8'));
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`), { timeoutMs: 900000 });
const report = { kind: 'foliage-motion-review', frames: [], surveys: [], startedAt: new Date().toISOString() };
let browser, context, monitor, video;
try {
  const source = await captureVisualSource(url, root);
  report.sourceSha = source.sourceSha;
  report.sourceSnapshotSha256 = source.sourceSnapshot.sha256;
  browser = await chromium.launch({ headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1,
    recordVideo: { dir: path.join(root, 'tmp/foliage-audit-2026-10-18-video'), size: { width: 1600, height: 900 } } });
  const page = await context.newPage();
  video = page.video(); monitor = createBrowserErrorMonitor(page);
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
    return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture,
      fallback: adapter?.info.isFallbackAdapter ?? adapter?.isFallbackAdapter,
      backend: window.__editor.terrainView.rendererBackendStatus.mode };
  });
  if (report.adapter.backend !== 'webgpu' || report.adapter.fallback) throw new Error('Hardware WebGPU required.');
  await page.evaluate(() => window.__worldVisualQa.setLighting());
  for (const id of ['random-06', 'random-09', 'random-07']) {
    const pose = manifest.requestedPoses.find(p => p.id === id);
    console.log(`Foliage survey: ${id}`);
    const preparation = await prepareVisualPose(page, pose);
    await page.evaluate(() => window.__worldVisualQa.settleLighting());
    const survey = await page.evaluate(() => {
      const qa = window.__worldVisualQa, e = window.__editor, d = qa.diagnostics();
      const trees = e.stylizedSurface.treeView;
      const nearest = [...trees.manifestStore.cache.values()].flatMap(entry => entry.placements ?? [])
        .map(p => ({ ...p, resolvedPrototypeIndex: trees.resolvePalettePrototypeIndex(p),
          distance: Math.hypot(p.x - d.canonical.x, p.z - d.canonical.z) }))
        .filter(p => p.distance < 160).sort((a, b) => a.distance - b.distance).slice(0, 80);
      delete d.placements; delete d.counters; delete d.preparationJobs;
      return { diagnostics: d, neighborhood: qa.neighborhood(), nearestTrees: nearest,
        treeVariantDefinitions: e.config.stylizedSurface.assets.treeVariants,
        prototypeAssetKeys: trees.prototypeAssetKeys ?? null };
    });
    if (!survey.diagnostics.readiness.ready || !survey.diagnostics.assetIntegrity.ready
      || survey.diagnostics.actualBiomeId !== pose.expectedBiomeId) throw new Error(`Invalid ${id}`);
    report.surveys.push({ pose, preparation, ...survey });
    await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true));
    await captureWorldCanvas(page, path.join(out, `${id}.png`));
    await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
  }
  await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true));
  console.log('Recording 12 seconds of unchanged live foliage motion.');
  const start = Date.now();
  report.motionStartedAt = new Date(start).toISOString();
  for (let i = 0; i < 12; i++) {
    const file = `frame-${String(i).padStart(2, '0')}.png`;
    const state = await page.evaluate(() => ({ time: performance.now(), wind: window.__editor.worldWind.getState(),
      ready: window.__worldVisualQa.readiness().ready }));
    await captureWorldCanvas(page, path.join(out, file));
    report.frames.push({ file, elapsedMs: Date.now() - start, ...state, sha256: await fileHash(path.join(out, file)) });
    await page.waitForTimeout(Math.max(0, start + (i + 1) * 1000 - Date.now()));
  }
  report.motionDurationMs = Date.now() - start;
  report.sourceStayedFixed = visualSourceStayedFixed(source, await captureVisualSource(url, root));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  report.errors = monitor?.snapshot();
  await context?.close();
  report.rawVideo = await video?.path();
  await browser?.close(); release();
  report.finishedAt = new Date().toISOString();
  report.captureValid = !report.failure && report.errors?.count === 0 && report.sourceStayedFixed
    && report.frames.length === 12 && report.frames.every(f => f.ready);
  if (!report.captureValid) process.exitCode = 1;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ captureValid: report.captureValid, failure: report.failure, frames: report.frames.length }));
}
