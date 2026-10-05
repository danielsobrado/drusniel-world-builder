import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';

const option = (flag, fallback) => {
  const index = process.argv.indexOf(flag); return index < 0 ? fallback : process.argv[index + 1];
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(option('--out', 'tmp/free-flight-qa'));
const url = new URL(option('--url', 'http://localhost:5173')); url.searchParams.set('qaRecovery', '1');
await mkdir(output, { recursive: true });
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
const report = { url: url.href, checks: {} }; let browser, errors;
try {
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  errors = createBrowserErrorMonitor(page);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.exploration?.lastTimestamp != null && window.__editor.captureRecoveryState,
    null, { timeout: 240000 });
  await page.waitForFunction(() => {
    const trees = window.__editor?.stylizedSurface.treeView;
    return trees?.impostorAtlases.length > 0 && trees.impostorAtlases.length === trees.prototypes.length;
  }, null, { timeout: 90000 });
  report.checks.compressedAtlases = await page.evaluate(() => {
    const atlases = window.__editor.stylizedSurface.treeView.impostorAtlases;
    return { total: atlases.length, compressed: atlases.filter(atlas => atlas.albedo.isCompressedTexture && atlas.source === 'asset').length };
  });
  assert.equal(report.checks.compressedAtlases.compressed, report.checks.compressedAtlases.total);
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility' });
    return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture,
      fallback: Boolean(adapter?.info.isFallbackAdapter ?? adapter?.isFallbackAdapter), backend: window.__editor.terrainView.rendererBackendStatus.mode };
  });
  assert.equal(report.adapter.backend, 'webgpu'); assert.equal(report.adapter.fallback, false);
  assert.ok(report.adapter.vendor || report.adapter.architecture);
  await page.evaluate(() => {
    const e = window.__editor;
    window.__flightOriginal = { mode: e.viewModeController.mode, pose: e.viewModeController.camera.position.toArray(),
      canonicalPlayer: e.terrainView.floatingOrigin.toCanonical(e.playerController.state.x, e.playerController.state.z) };
  });
  await page.locator('[data-view-mode="fly"]').click();
  await page.waitForFunction(() => window.__editor.viewModeController.mode === 'fly');
  report.checks.entry = await page.evaluate(() => {
    const e = window.__editor, view = e.viewModeController;
    return { mode: view.mode, camera: view.camera === view.freeFly.camera, pausedPhysics: !e.playerController.enabled,
      blockedEditing: e.controller.isWorldInputBlocked(), hints: !document.querySelector('.free-flight-hints').hidden };
  });
  assert.ok(report.checks.entry.camera && report.checks.entry.pausedPhysics && report.checks.entry.blockedEditing && report.checks.entry.hints);
  const pose = () => page.evaluate(() => window.__editor.viewModeController.camera.position.toArray());
  let before = await pose();
  await page.keyboard.down('w'); await page.waitForTimeout(350); await page.keyboard.up('w');
  let after = await pose(); assert.ok(Math.hypot(...after.map((value, i) => value - before[i])) > 1);
  before = after;
  await page.keyboard.down('Space'); await page.waitForTimeout(250); await page.keyboard.up('Space');
  after = await pose(); assert.ok(after[1] > before[1] + 1);
  before = after;
  await page.keyboard.down('Control'); await page.waitForTimeout(250); await page.keyboard.up('Control');
  after = await pose(); assert.ok(after[1] < before[1] - 1);
  report.checks.movement = true;
  await page.evaluate(() => window.__editor.gameplayOverlayController.open('inventory'));
  before = await pose(); await page.keyboard.down('w'); await page.waitForTimeout(250); await page.keyboard.up('w');
  assert.deepEqual(await pose(), before); report.checks.overlayBlocksMovement = true;
  await page.evaluate(() => window.__editor.gameplayOverlayController.closeActive());
  report.checks.rebase = await page.evaluate(async () => {
    const e = window.__editor, origin = e.terrainView.floatingOrigin;
    e.viewModeController.camera.position.x += 6000; e.viewModeController.camera.position.z -= 8000;
    const before = origin.toCanonical(e.viewModeController.camera.position.x, e.viewModeController.camera.position.z);
    const old = origin.getState();
    for (let i = 0; i < 10 && origin.getState().x === old.x && origin.getState().z === old.z; i++) await new Promise(requestAnimationFrame);
    const after = origin.toCanonical(e.viewModeController.camera.position.x, e.viewModeController.camera.position.z);
    return { before, after, origin: origin.getState(), old, focus: e.terrainView.focusChunk };
  });
  assert.deepEqual(report.checks.rebase.before, report.checks.rebase.after);
  assert.notDeepEqual(report.checks.rebase.origin, report.checks.rebase.old);
  await page.keyboard.press('Escape');
  report.checks.return = await page.evaluate(() => {
    const e = window.__editor, origin = e.terrainView.floatingOrigin;
    return { mode: e.viewModeController.mode, player: origin.toCanonical(e.playerController.state.x, e.playerController.state.z),
      original: window.__flightOriginal };
  });
  assert.equal(report.checks.return.mode, 'edit'); assert.deepEqual(report.checks.return.player, report.checks.return.original.canonicalPlayer);
  await page.evaluate(() => {
    const e = window.__editor;
    e.viewModeController.setMode('player', { spawn: e.viewModeController.getFocusWorld() });
    e.viewModeController.pause();
  });
  await page.keyboard.press('f'); assert.equal(await page.evaluate(() => window.__editor.viewModeController.mode), 'fly');
  await page.keyboard.press('f');
  report.checks.pausedReturn = await page.evaluate(() => ({ mode: window.__editor.viewModeController.mode, paused: window.__editor.viewModeController.paused }));
  assert.deepEqual(report.checks.pausedReturn, { mode: 'player', paused: true });
  await page.evaluate(() => {
    const e = window.__editor; e.viewModeController.setMode('fly');
    window.__flightExpected = e.viewModeController.captureFlightState();
    window.__flightOldRenderer = e.terrainView.renderer;
    e.terrainView.renderer.backend.device.destroy();
    e.terrainView.renderer.onDeviceLost({ api: 'WebGPU', reason: 'qa', message: 'Free flight recovery acceptance' });
  });
  await page.waitForFunction(() => window.__editor?.terrainView.renderer !== window.__flightOldRenderer
    && window.__editor?.captureRecoveryState && !window.__editor.recovery.pending, null, { timeout: 240000 });
  report.checks.recovery = await page.evaluate(() => ({ actual: window.__editor.viewModeController.captureFlightState(), expected: window.__flightExpected,
    mode: window.__editor.viewModeController.mode }));
  assert.equal(report.checks.recovery.mode, 'fly'); assert.deepEqual(report.checks.recovery.actual, report.checks.recovery.expected);
  await page.screenshot({ path: path.join(output, 'flight.png') });
  report.errors = errors.snapshot(); assert.equal(report.errors.count, 0, JSON.stringify(report.errors)); report.passed = true;
} catch (error) { report.passed = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  report.errors = errors?.snapshot() ?? null;
  await browser?.close(); release(); await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, failure: report.failure, checks: Object.keys(report.checks), output }, null, 2));
}
