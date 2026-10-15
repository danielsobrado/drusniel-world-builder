// Art-review captures: every shape preset from several angles, without editing handles.
// Usage: node scripts/review-workshop-shapes.mjs [--only=id,id] [--coarse] [--out=dir]
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { terminateChildProcess } from './lib/processLifecycle.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { SHAPE_PRESETS } from '../src/editor/workshop/shapes/ShapePresets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = arg('only')?.split(',');
const coarse = process.argv.includes('--coarse');
const output = path.resolve(root, arg('out') ?? 'tmp/workshop-review');
const presets = SHAPE_PRESETS.filter((p) => !only || only.includes(p.id));
if (only?.some((id) => !SHAPE_PRESETS.some((p) => p.id === id))) throw new Error('Unknown preset in --only.');
const report = { coarse, captures: [], pageErrors: [] };
// Azimuth (degrees) around the framed target, distance scale, and height scale of the frame offset.
const VIEWS = [
  { id: 'a', azimuth: 0, distance: 1, lift: 1 },
  { id: 'b', azimuth: 110, distance: 1, lift: 1 },
  { id: 'c', azimuth: -110, distance: 1, lift: 1 },
  { id: 'close', azimuth: 25, distance: 0.55, lift: 0.35 },
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
  if (coarse) { await page.locator('select[name="detail"]').selectOption('1'); await settle(page); }
  for (const preset of presets) {
    await page.locator('[data-shape-action="preset"]').selectOption(preset.id);
    await settle(page);
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
      await settle(page);
      const file = path.join(output, `${preset.id}-${view.id}${coarse ? '-coarse' : ''}.png`);
      await page.screenshot({ path: file, clip });
      report.captures.push({ preset: preset.id, view, file: path.basename(file) });
    }
    console.log(`Captured ${preset.id}`);
  }
  assert.deepEqual(report.pageErrors, []);
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await writeFile(path.join(output, `report${coarse ? '-coarse' : ''}.json`), JSON.stringify(report, null, 2));
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
