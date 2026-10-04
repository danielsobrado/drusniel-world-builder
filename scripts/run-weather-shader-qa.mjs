import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { terminateChildProcess } from './lib/processLifecycle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'tmp', 'weather-shader-qa');
const modes = Object.freeze(['meadow', 'rain', 'snow', 'sandstorm', 'storm', 'wind']);
const viewportSelector = 'canvas[aria-label="Drusniel World infinite world editor viewport"]';
const shaderErrorPattern = /shader|wgsl|webgpu|gpu validation|pipeline|bind.?group|nodematerial|istexture|weather.*precompile/i;

function readArgument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

const headed = process.argv.includes('--headed');
const timeoutMs = Number(readArgument('timeoutMs', '180000'));
const settleMs = Number(readArgument('settleMs', '1200'));
const requestedPort = process.argv.includes('--port') ? Number(readArgument('port', '4178')) : 0;
const existingUrl = readArgument('url', null);

async function reservePort(preferredPort = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: preferredPort }, () => {
      const address = server.address();
      const selected = typeof address === 'object' ? address.port : preferredPort;
      server.close((error) => (error ? reject(error) : resolve(selected)));
    });
  });
}

function startServer(port) {
  return spawn(
    process.execPath,
    [
      path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
}

async function waitForServer(server, baseUrl) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Weather QA Vite server exited with code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
      lastError = new Error(`Vite returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError?.message ?? 'unknown error'}`);
}

async function setWeatherMode(page, mode) {
  await page.evaluate((nextMode) => {
    const select = document.querySelector('[data-weather="mode"]');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Weather mode selector is unavailable.');
    }
    select.value = nextMode;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, mode);
  await page.waitForFunction(
    (expected) => document.querySelector('[data-weather="mode"]')?.value === expected,
    mode,
    { timeout: 10000 },
  );
}

async function captureViewport(page, mode) {
  try {
    const canvas = await page.locator(viewportSelector).boundingBox({ timeout: 10000 });
    if (!canvas || canvas.width < 1 || canvas.height < 1) return null;
    const buffer = await page.screenshot({
      path: path.join(outputDirectory, `${mode}.png`),
      clip: canvas,
      timeout: 30000,
    });
    return createHash('sha256').update(buffer).digest('hex');
  } catch (error) {
    console.warn(`Skipped ${mode} screenshot: ${error.message}`);
    return null;
  }
}

function shaderErrors(messages) {
  return messages.filter((message) => shaderErrorPattern.test(message));
}

async function run() {
  await mkdir(outputDirectory, { recursive: true });
  const port = existingUrl ? null : await reservePort(requestedPort);
  const baseUrl = existingUrl ?? `http://127.0.0.1:${port}/`;
  const server = existingUrl ? null : startServer(port);
  let serverOutput = '';
  server?.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  server?.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  const report = {
    baseUrl,
    startedAt: new Date().toISOString(),
    headed,
    modes: [],
    errors: [],
  };
  let browser;
  let progressTimer;

  try {
    if (server) await waitForServer(server, baseUrl);
    browser = await chromium.launch({
      headless: !headed,
      channel: 'chromium',
      args: [
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
        '--use-angle=default',
        '--enable-gpu-rasterization',
        '--disable-gpu-vsync',
        '--disable-frame-rate-limit',
      ],
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    progressTimer = setInterval(async () => {
      try {
        const state = await page.evaluate(() => ({
          editor: Boolean(window.__editor),
          weather: Boolean(window.__editor?.weatherController),
          exploration: Boolean(window.__editor?.exploration),
          rendererFrame: window.__editor?.terrainView.renderer.info.render.frame,
          loading: [...document.querySelectorAll('[data-role="loading-detail"], .loading-detail')].map(node => node.textContent),
        }));
        console.log(`Weather QA startup: ${JSON.stringify(state)}`);
      } catch { /* Navigation or close may overlap the progress sample. */ }
    }, 15000);
    const runtimeErrors = [];
    report.errors = runtimeErrors;
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        runtimeErrors.push(`${message.type()}: ${message.text()}`);
      }
    });

    await page.goto(baseUrl, { waitUntil: 'load', timeout: timeoutMs });
    console.log('Weather QA: waiting for world startup.');
    await page.waitForSelector('[data-weather="mode"]', { timeout: timeoutMs });
    await page.waitForSelector(viewportSelector, { state: 'attached', timeout: timeoutMs });
    console.log('Weather QA: viewport attached.');
    const hasWebGpu = await page.evaluate(() => Boolean(navigator.gpu));
    assert.equal(hasWebGpu, true, 'Chromium did not expose WebGPU.');
    await page.waitForFunction(() => window.__editor?.weatherController && window.__editor?.exploration, null, { timeout: timeoutMs });
    console.log('Weather QA: world ready.');
    report.adapter = await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility', xrCompatible: false });
      if (!adapter) return null;
      const info = adapter.info;
      return { vendor: info.vendor, architecture: info.architecture, description: info.description,
        fallback: Boolean(adapter.isFallbackAdapter),
        webgpu: window.__editor.terrainView.renderer.backend.isWebGPUBackend === true };
    });
    assert.ok(report.adapter?.webgpu && report.adapter.fallback === false, 'Weather acceptance requires hardware WebGPU.');
    assert.doesNotMatch(`${report.adapter.vendor} ${report.adapter.architecture} ${report.adapter.description}`, /swiftshader|llvmpipe|software/i);
    console.log(`Weather QA: hardware WebGPU ${report.adapter.vendor} ${report.adapter.architecture}.`);
    await page.evaluate(() => {
      const editor = window.__editor;
      editor.playerController.setHarnessActive(true);
      editor.viewModeController.setMode('walk', { requestPointerLock: false });
      const sun = editor.godRays.sunDirection;
      editor.playerController.setPose({ x: 0, z: 0, yaw: Math.atan2(-sun.x, -sun.z), pitch: Math.asin(sun.y) });
    });

    await delay(settleMs);
    const warmupErrors = shaderErrors(runtimeErrors);
    assert.deepEqual(
      warmupErrors,
      [],
      `Weather shader warmup failed:\n${warmupErrors.join('\n')}`,
    );

    for (const mode of modes) {
      console.log(`Weather QA: ${mode}.`);
      const startedAt = performance.now();
      const errorStart = runtimeErrors.length;
      await setWeatherMode(page, mode);
      await delay(settleMs);
      const modeErrors = runtimeErrors.slice(errorStart);
      const modeShaderErrors = shaderErrors(modeErrors);
      const screenshotHash = await captureViewport(page, mode);
      report.modes.push({
        mode,
        activationMs: performance.now() - startedAt,
        screenshotHash,
        errors: modeErrors,
        stats: await page.evaluate(() => window.__editor.weatherController.getStats()),
      });
      assert.deepEqual(
        modeShaderErrors,
        [],
        `${mode} produced shader/runtime errors:\n${modeShaderErrors.join('\n')}`,
      );
    }

    report.errors = runtimeErrors;
    await setWeatherMode(page, 'off');
    report.godRays = await page.evaluate(() => {
      const effect = window.__editor.godRays;
      return { technique: effect.technique, maskScale: effect.cinematicShafts?.mask.getResolutionScale(),
        marchScale: effect.cinematicShafts?.march.getResolutionScale(), intensity: effect.cinematicIntensity.value };
    });
    assert.equal(report.godRays.technique, 'cinematic');
    assert.equal(report.godRays.maskScale, 0.25);
    assert.equal(report.godRays.marchScale, 0.25);
  } finally {
    clearInterval(progressTimer);
    await browser?.close();
    if (server) await terminateChildProcess(server);
    await writeFile(path.join(outputDirectory, 'vite.log'), serverOutput);
    report.finishedAt = new Date().toISOString();
    await writeFile(
      path.join(outputDirectory, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
