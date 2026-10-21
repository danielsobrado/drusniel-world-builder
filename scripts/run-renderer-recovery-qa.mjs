import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';

const option = (flag, fallback) => {
  const index = process.argv.indexOf(flag); return index < 0 ? fallback : process.argv[index + 1];
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(option('--out', 'tmp/renderer-recovery-qa'));
const url = new URL(option('--url', 'http://localhost:5173')); url.searchParams.set('qaRecovery', '1');
const requested = option('--scenario', 'all');
const scenarios = requested === 'all' ? ['repeated', 'during-restart'] : [requested];
assert.ok(scenarios.every(name => ['repeated', 'during-restart'].includes(name)));
await mkdir(output, { recursive: true });
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
const report = { url: url.href, scenarios: [] }; let browser;
try {
  browser = await chromium.launch({ headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = createBrowserErrorMonitor(page);
    page.on('console', message => {
      if (message.text().startsWith('Recovery boot:') || message.type() === 'error') console.log(`${scenario}: ${message.text().slice(0, 500)}`);
    });
    const result = { name: scenario }; report.scenarios.push(result);
    const ready = () => page.waitForFunction(() => window.__editor?.captureRecoveryState
      && !window.__editor.recovery.pending && window.__editor.exploration?.lastTimestamp != null,
    null, { timeout: 240000 });
    try {
      await page.goto(url.href, { waitUntil: 'domcontentloaded' }); await ready();
      console.log(`${scenario}: editor ready`);
      result.adapter = await page.evaluate(async () => {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture,
          fallback: Boolean(adapter?.info.isFallbackAdapter ?? adapter?.isFallbackAdapter),
          backend: window.__editor.terrainView.rendererBackendStatus.mode };
      });
      assert.equal(result.adapter.backend, 'webgpu'); assert.equal(result.adapter.fallback, false);
      assert.ok(result.adapter.vendor || result.adapter.architecture);
      await page.evaluate(() => {
        window.__editor.viewModeController.setMode('player', { spawn: { x: 0, z: 0 } });
        window.__editor.viewModeController.pause();
      });
      await page.locator('button[data-view-mode="player"]').click();
      await page.waitForFunction(() => window.__editor.playerController.pointerLocked);
      assert.equal(await page.evaluate(() => document.activeElement.matches('button[data-view-mode="player"]')), true,
        'The focused Play button must not suppress captured player input.');
      await page.keyboard.down('w');
      assert.equal(await page.evaluate(() => window.__editor.playerController.keys.has('KeyW')), true, 'Play accepts WASD.');
      await page.keyboard.up('w');
      await page.keyboard.down('Space');
      assert.equal(await page.evaluate(() => window.__editor.playerController.keys.has('Space')), true, 'Play accepts jumping.');
      await page.keyboard.up('Space');
      await page.keyboard.press('Shift'); await page.waitForTimeout(50); await page.keyboard.press('Shift');
      assert.equal(await page.evaluate(() => window.__editor.playerController.speedMode.active), true, 'Real double-tap enables fast travel.');
      await page.keyboard.press('Shift'); await page.waitForTimeout(50); await page.keyboard.press('Shift');
      assert.equal(await page.evaluate(() => window.__editor.playerController.speedMode.active), false, 'Next double-tap restores normal speed.');
      result.keyboard = true;
      await page.evaluate(() => { document.exitPointerLock(); window.__editor.viewModeController.pause(); });
      result.audio = await page.evaluate(async () => {
        const { audioBus } = await import('/src/editor/audio/index.js');
        const bank = audioBus.samples, context = audioBus.synthManager.ctx;
        if (!context) throw new Error('Gesture must initialize actual WebAudio.');
        const buffer = await bank.load('ambient/sea-surf.mp3');
        if (!buffer) throw new Error('Actual surf MP3 must decode.');
        const destination = context.createGain(); destination.gain.value = 0; destination.connect(context.destination);
        const original = context.createPanner; let panner, ended = 0;
        context.createPanner = function() { panner = original.call(this); return panner; };
        try {
          const voice = bank.playVoice('ambient/sea-surf.mp3', { destination, position: { x: 10, y: 1, z: -20 }, onEnded: () => ended++ });
          const spatial = panner?.panningModel === 'HRTF' && panner.positionX.value === 10 && panner.positionZ.value === -20;
          voice.setPosition({ x: -5, y: 2, z: 30 }); const moved = panner.positionX.value === -5 && panner.positionZ.value === 30;
          voice.stop(); voice.stop();
          const loop = bank.loop('ambient/sea-surf.mp3', destination), trimmed = loop.source.buffer;
          loop.source.stop(); loop.source.disconnect(); loop.gain.disconnect();
          return { spatial, moved, ended, sourceDuration: buffer.duration, loopDuration: trimmed.duration,
            preserved: bank.buffers.get('ambient/sea-surf.mp3') === buffer, cached: bank.loopBuffers.get(buffer) === trimmed };
        } finally { context.createPanner = original; destination.disconnect(); }
      });
      assert.ok(result.audio.spatial && result.audio.moved && result.audio.preserved && result.audio.cached);
      assert.equal(result.audio.ended, 1); assert.ok(result.audio.loopDuration <= result.audio.sourceDuration);
      await page.evaluate(() => {
        const e = window.__editor;
        const before = e.controller.tileMap.get(1, 1), after = before === 4 ? 5 : 4;
        e.controller.commitHistory({ kind: 'terrain', patch: e.controller.tileMap.paintSquare(1, 1, 1, after) });
        const redoBefore = e.controller.tileMap.get(2, 2), redoAfter = redoBefore === 4 ? 5 : 4;
        e.controller.commitHistory({ kind: 'terrain', patch: e.controller.tileMap.paintSquare(2, 2, 1, redoAfter) });
        e.controller.undo();
        e.viewModeController.setMode('player', { spawn: { x: 0, z: 0 } }); e.viewModeController.pause();
        e.playerController.setPose({ x: 17.25, z: -23.5, yaw: 0.7, pitch: -0.12 });
        // Use a paused, airborne pose so default spawn/ground state cannot pass.
        e.playerController.state.y += 2.5; e.playerController.state.footY += 2.5;
        e.playerController.state.grounded = false; e.playerController.state.verticalVelocity = -1.25;
        e.playerController.applyCameraState();
        e.playerController.speedMode.setActive(true);
        window.__recoveryTiles = { before, after, redoAfter };
        window.__recoveryExpected = e.captureRecoveryState();
      });
      if (scenario === 'during-restart') {
        await page.evaluate(async () => {
          const { RendererStartupGuard } = await import('/src/editor/lifecycle/RendererStartupGuard.js');
          const original = RendererStartupGuard.prototype.wait;
          window.__restoreStartupWait = () => { RendererStartupGuard.prototype.wait = original; };
          let injected = false;
          RendererStartupGuard.prototype.wait = function(operation) {
            const waiting = original.call(this, operation);
            if (!injected && this.renderer?.backend?.device) {
              injected = true; window.__restartLossInjected = true;
              this.renderer.backend.device.destroy();
              this.renderer.onDeviceLost({ api: 'WebGPU', reason: 'qa', message: 'Loss during restart acceptance' });
            }
            return waiting;
          };
        });
      }
      const lose = async expectedBackend => {
        console.log(`${scenario}: forcing loss, expecting ${expectedBackend}`);
        await page.evaluate(() => {
          const renderer = window.__editor.terrainView.renderer; window.__previousRenderer = renderer;
          renderer.backend.device.destroy();
          renderer.onDeviceLost({ api: 'WebGPU', reason: 'qa', message: 'Recovery stress acceptance' });
        });
        await page.waitForFunction(() => window.__editor?.captureRecoveryState
          && window.__editor.terrainView.renderer !== window.__previousRenderer
          && !window.__editor.recovery.pending, null, { timeout: 240000 });
        await ready();
        assert.equal(await page.evaluate(() => window.__editor.terrainView.rendererBackendStatus.mode), expectedBackend);
      };
      await lose(scenario === 'repeated' ? 'webgpu' : 'webgl');
      if (scenario === 'repeated') await lose('webgl');
      result.state = await page.evaluate(() => {
        const e = window.__editor, expected = window.__recoveryExpected, actual = e.captureRecoveryState();
        const authoring = value => { const copy = structuredClone(value); delete copy.savedAt; return JSON.stringify(copy); };
        const result = { backend: e.terrainView.rendererBackendStatus.mode, attempts: e.recovery.attempts,
          document: authoring(actual.document) === authoring(expected.document),
          workshop: JSON.stringify(actual.workshop) === JSON.stringify(expected.workshop),
          origin: JSON.stringify(actual.origin) === JSON.stringify(expected.origin),
          mode: actual.mode === expected.mode && actual.paused === expected.paused,
          player: actual.player.yaw === expected.player.yaw && actual.player.pitch === expected.player.pitch,
          playerPosition: ['x', 'y', 'z', 'footY'].every(key => actual.player.state[key] === expected.player.state[key]),
          playerPhysics: JSON.stringify(actual.player.state) === JSON.stringify(expected.player.state),
          bakePipelineDisabled: e.terrainView.stylizedConfig.materialBake.enabled === false
            && e.terrainView.stylizedSurface.materialBakeRuntime === null
            && e.terrainView.stylizedSurface.materialBakeGpuBridge === null
            && e.terrainView.materialBakeRuntime == null
            && e.terrainView.slots.every(slot => !slot.mesh.userData.terrainMaterialBakeGpu && !slot.materialBake),
          boost: actual.player.explorationBoost === true,
          history: actual.undoStack.length === expected.undoStack.length && actual.redoStack.length === expected.redoStack.length,
          canvases: document.querySelectorAll('canvas[aria-label="Drusniel World infinite world editor viewport"]').length,
          injected: Boolean(window.__restartLossInjected) };
        e.controller.undo(); result.undo = e.controller.tileMap.get(1, 1) === window.__recoveryTiles.before;
        e.controller.redo(); result.redo = e.controller.tileMap.get(1, 1) === window.__recoveryTiles.after;
        e.controller.redo(); result.futureRedo = e.controller.tileMap.get(2, 2) === window.__recoveryTiles.redoAfter;
        window.__restoreStartupWait?.(); return result;
      });
      for (const key of ['document', 'workshop', 'origin', 'mode', 'player', 'playerPosition', 'playerPhysics',
        'bakePipelineDisabled', 'boost', 'history', 'undo', 'redo', 'futureRedo']) {
        assert.equal(result.state[key], true, `${scenario}: ${key}`);
      }
      assert.equal(result.state.attempts, 2); assert.equal(result.state.canvases, 1);
      if (scenario === 'during-restart') assert.equal(result.state.injected, true);
      result.errors = errors.snapshot(); assert.equal(result.errors.count, 0, JSON.stringify(result.errors));
      await page.locator('canvas[aria-label="Drusniel World infinite world editor viewport"]').screenshot({ path: path.join(output, `${scenario}.png`) });
      result.passed = true;
    } finally { result.errors = errors.snapshot(); await page.close(); }
  }
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  await browser?.close(); release();
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
