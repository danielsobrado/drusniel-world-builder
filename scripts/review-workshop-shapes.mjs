// Art-review captures: every shape preset from several angles, without editing handles.
// Usage: node scripts/review-workshop-shapes.mjs [--only=id,id] [--coarse] [--out=dir]
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { terminateChildProcess } from './lib/processLifecycle.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { SHAPE_PRESETS } from '../src/editor/workshop/shapes/ShapePresets.js';
import { workshopReviewSource, applyWorkshopReviewLighting } from './lib/workshopReviewManifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = arg('only')?.split(',');
let coarse = process.argv.includes('--coarse');
let lighting = arg('lighting') ?? 'stage';
const matrix = process.argv.includes('--matrix');
if (!['stage', 'neutral', 'grazing'].includes(lighting)) throw new Error('Unknown lighting preset.');
const output = path.resolve(root, arg('out') ?? 'tmp/workshop-review');
const presets = SHAPE_PRESETS.filter((p) => !only || only.includes(p.id));
if (only?.some((id) => !SHAPE_PRESETS.some((p) => p.id === id))) throw new Error('Unknown preset in --only.');
const report = { coarse, lighting, captures: [], pageErrors: [] };
const variantName = (coarse, lighting) => `report${coarse ? '-coarse' : ''}${lighting === 'stage' ? '' : `-${lighting}`}.json`;
const reportName = matrix ? 'report-matrix.json' : variantName(coarse, lighting);
let reference = !matrix && arg('reference') ? JSON.parse(await readFile(path.join(root, arg('reference'), reportName), 'utf8')) : null;
// Azimuth (degrees) around the framed target, distance scale, and height scale of the frame offset.
const VIEWS = [
  { id: 'a', azimuth: 0, distance: 1, lift: 1 },
  { id: 'b', azimuth: 110, distance: 1, lift: 1 },
  { id: 'c', azimuth: -110, distance: 1, lift: 1 },
  { id: 'close', azimuth: 25, distance: 0.55, lift: 0.35 },
  ...(process.argv.includes('--inside') ? [{ id: 'inside', azimuth: 45, distance: 0.42, lift: 0.18 }] : []),
];

async function settle(page) {
  await page.waitForFunction(() => {
    const ui = window.__editor.proceduralWorkshop;
    return !ui.previewTimer && ui.completedPlanRevision === ui.planRevision &&
      ui.shapeBridge.preview?.groups.size > 0 && ui.status.textContent.startsWith('Final preview') &&
      !ui.status.classList.contains('is-error');
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const selected = probe.address().port; probe.close(() => resolve(selected)); });
});
await mkdir(output, { recursive: true });
const releaseLock = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let server, browser;
try {
  report.source = await workshopReviewSource(root);
  server = spawn(process.execPath, [path.join(root, 'scripts/lib/workshopShapesQaServer.mjs'), String(port)],
    { cwd: root, windowsHide: true, stdio: 'ignore' });
  let serverError;
  server.on('error', (error) => { serverError = error; });
  for (let attempt = 0; ; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Review server exited with code ${server.exitCode}.`);
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* Starting Vite. */ }
    if (attempt > 300) throw new Error('Review server did not start.');
    await delay(100);
  }
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/workshop-qa.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.proceduralWorkshop);
  await page.locator('[data-tool="workshop"]').click();
  await page.waitForFunction(() => window.__editor.proceduralWorkshop.status.textContent.startsWith('Final preview'));
  await page.locator('select[name="archetype"]').selectOption('composition');
  await settle(page);
  report.renderer = await page.evaluate(() => {
    const backend = window.__editor.proceduralWorkshop.renderer.backend;
    const info = backend.device?.adapterInfo;
    return { webgpu: Boolean(backend.isWebGPUBackend), vendor: info?.vendor,
      architecture: info?.architecture, description: info?.description, fallback: info?.isFallbackAdapter };
  });
  assert.equal(report.renderer.webgpu, true, 'Art review requires the actual WebGPU renderer.');
  assert.ok(report.renderer.vendor, 'The renderer must identify its hardware adapter.');
  assert.notEqual(report.renderer.fallback, true);
  assert.doesNotMatch(JSON.stringify(report.renderer), /swiftshader|lavapipe|llvmpipe|microsoft basic|warp/i);
  const variants = matrix ? [{ coarse: false, lighting: 'stage' }, { coarse: true, lighting: 'stage' },
    { coarse: false, lighting: 'neutral' }, { coarse: false, lighting: 'grazing' }] : [{ coarse, lighting }];
  report.lightingVariants = {};
  for (const variant of variants) {
  coarse = variant.coarse; lighting = variant.lighting;
  if (matrix && arg('reference')) {
    try { reference = JSON.parse(await readFile(path.join(root, arg('reference'), variantName(coarse, lighting)), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; reference = null; }
  }
  report.lights = await page.evaluate(({ source, lighting }) =>
    new Function(`return (${source})`)()(window.__editor.proceduralWorkshop, lighting),
  { source: applyWorkshopReviewLighting.toString(), lighting });
  report.lightingVariants[lighting] = report.lights;
  await page.locator('select[name="detail"]').selectOption(coarse ? '1' : '2'); await settle(page);
  const selected = matrix && lighting !== 'stage' ? presets.filter(p => ['timber-cottage','balcony-tower','bay-porch-cottage','buttressed-chapel'].includes(p.id)) : presets;
  for (const preset of selected) {
    await page.locator('[data-shape-action="preset"]').selectOption(preset.id);
    await settle(page);
    const recipe = await page.evaluate(() => window.__editor.proceduralWorkshop.readInput().recipe);
    if (process.argv.includes('--ui')) await page.screenshot({ path: path.join(output, `${preset.id}-ui${coarse ? '-coarse' : ''}.png`) });
    for (const view of VIEWS) {
      const clip = await page.evaluate((view) => {
        const ui = window.__editor.proceduralWorkshop;
        // framePreview keeps the current direction, so every view starts from the same base one.
        window.__reviewBase ??= ui.camera.position.clone().sub(ui.controls.target);
        ui.camera.position.copy(ui.controls.target).add(window.__reviewBase);
        ui.framePreview();
        ui.shapeBridge.preview.handles.root.visible = false;
        const offset = ui.camera.position.clone().sub(ui.controls.target);
        const flat = Math.hypot(offset.x, offset.z), angle = Math.atan2(offset.z, offset.x) + (view.azimuth * Math.PI) / 180;
        offset.set(Math.cos(angle) * flat, offset.y * view.lift, Math.sin(angle) * flat).multiplyScalar(view.distance);
        ui.camera.position.copy(ui.controls.target).add(offset);
        ui.controls.update();
        const rect = ui.renderer.domElement.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }, view);
      const prior = reference?.captures.find(c => c.preset === preset.id && c.view.id === view.id);
      if (reference) assert.ok(prior, `Missing reference camera for ${preset.id}/${view.id}.`);
      if (prior) await page.evaluate(camera => {
        const ui = window.__editor.proceduralWorkshop;
        ui.camera.position.fromArray(camera.position); ui.controls.target.fromArray(camera.target);
        ui.camera.fov = camera.fov; ui.camera.updateProjectionMatrix(); ui.controls.update();
      }, prior.camera);
      await settle(page);
      const file = path.join(output, `${preset.id}-${view.id}${coarse ? '-coarse' : ''}${lighting === 'stage' ? '' : `-${lighting}`}.png`);
      await page.screenshot({ path: file, clip });
      const camera = await page.evaluate(() => { const ui = window.__editor.proceduralWorkshop;
        return { position: ui.camera.position.toArray(), target: ui.controls.target.toArray(), fov: ui.camera.fov }; });
      report.captures.push({ preset: preset.id, view, camera, recipe, lighting, detail: recipe.detail, kind: 'model', file: path.basename(file) });
    }
    console.log(`Captured ${preset.id}`);
  }
  }
  assert.deepEqual(report.pageErrors, []);
  report.sourceAfter = await workshopReviewSource(root);
  assert.equal(report.sourceAfter.hash, report.source.hash, 'Workshop sources changed during capture; repeat this run.');
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await writeFile(path.join(output, reportName), JSON.stringify(report, null, 2));
    if (matrix) for (const [coarse, lighting] of [[false,'stage'],[true,'stage'],[false,'neutral'],[false,'grazing']]) {
      const subset = { ...report, coarse, lighting, lights: report.lightingVariants?.[lighting],
        captures: report.captures.filter(c => c.lighting === lighting && (c.detail === 1) === coarse) };
      await writeFile(path.join(output, variantName(coarse, lighting)), JSON.stringify(subset, null, 2));
    }
  } finally {
    try {
      const cleanup = await Promise.allSettled([browser?.close(), server ? terminateChildProcess(server) : null]);
      for (const result of cleanup) if (result.status === 'rejected') {
        console.error(result.reason);
        process.exitCode = 1;
      }
    } finally { releaseLock(); }
  }
}
