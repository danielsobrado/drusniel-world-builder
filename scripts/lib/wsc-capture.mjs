// Shared hardware capture session for the WSC per-PR QA scripts: an embedded
// Vite server that ignores file changes (a concurrent edit cannot reload the
// page), a headed WebGPU page, settle-on-pose, per-mode PNG capture and a
// contact sheet. Callers only list their shots.
import { chromium } from 'playwright';
import sharp from 'sharp';
import yaml from 'js-yaml';
import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import viteConfig from '../../vite.config.js';
import { prepareVisualPose } from './world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './world-visual-canvas.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VIEWPORT = { width: 1280, height: 720 };
const SETTLE = { minimumMs: 6000, timeoutMs: 300000 };

export const loadWscCameras = async () => yaml.load(
  await readFile(path.resolve(ROOT, 'docs/qa/world-surface-context/pr-00/cameras.yaml'), 'utf8'),
);

/** A Vite dev server that ignores file changes, so a concurrent session's edits cannot reload a QA page. */
export async function startFrozenViteServer(port = 5193) {
  const baseCfg = typeof viteConfig === 'function'
    ? await viteConfig({ command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false })
    : viteConfig;
  const server = await createViteServer({
    ...baseCfg, configFile: false, root: ROOT,
    server: { host: '127.0.0.1', port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  });
  await server.listen();
  return server;
}

/** Moves to `pose` under `lighting` and waits for scenery and a valid WSC there. */
export async function settlePose(page, pose, lighting) {
  await page.evaluate(() => window.__worldVisualQa.setDiagnosticMode('D00'));
  await page.evaluate(l => window.__worldVisualQa.setLighting(l), lighting);
  await prepareVisualPose(page, pose, SETTLE);
  await page.evaluate(l => window.__worldVisualQa.setLighting(l), lighting);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const qa = window.__worldVisualQa;
      const d = qa.diagnostics();
      const gc = qa.sampleGroundContactField(d.canonical.x, d.canonical.z);
      return d.readiness.ready && !gc.isMissingFallback && gc.validity > 0.9;
    });
    if (ready) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/** Captures the current view in one diagnostic mode to a PNG. */
export async function captureMode(page, mode, file) {
  await page.evaluate((m) => {
    const qa = window.__worldVisualQa;
    qa.setCaptureUi(true);
    qa.setAvatarVisible(false);
    qa.layers.restore();
    qa.setDiagnosticMode(m);
  }, mode);
  await page.waitForTimeout(mode === 'D00' ? 750 : 550);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await captureWorldCanvas(page, file);
}

async function contactSheet(files, columns, outPath) {
  const tileW = 640;
  const tileH = 360;
  const composites = await Promise.all(files.map(async (file, i) => ({
    input: await sharp(file).resize(tileW, tileH, { fit: 'cover' }).png().toBuffer(),
    left: (i % columns) * tileW,
    top: Math.floor(i / columns) * tileH,
  })));
  await sharp({ create: { width: columns * tileW, height: Math.ceil(files.length / columns) * tileH, channels: 3, background: '#11161d' } })
    .composite(composites).jpeg({ quality: 86, mozjpeg: true }).toFile(outPath);
}

/**
 * Runs one capture suite. `shoot(page, take)` positions the camera and calls
 * `take(name)` per view; each view is captured in every mode, one sheet row.
 *
 * @param {{ suite: string, out: string, url?: string, modes: string[], shoot: Function }} options
 */
export async function runWscCapture({ suite, out, url = '', modes, shoot }) {
  const outDir = path.resolve(ROOT, out);
  await mkdir(outDir, { recursive: true });
  const server = url ? null : await startFrozenViteServer();
  const baseUrl = url || `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({
    headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--disable-features=CalculateNativeWinOcclusion', '--window-size=1320,820'],
  });
  const files = [];
  const views = [];
  try {
    const page = await (await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })).newPage();
    await page.goto(`${baseUrl}/?qaVisual=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 120000 });
    const backend = await page.evaluate(() => window.__editor?.terrainView?.rendererBackendStatus?.mode);
    if (backend !== 'webgpu') throw new Error(`Hardware WebGPU required, got ${backend}`);
    await shoot(page, async (name, detail = {}) => {
      views.push({ name, ...detail });
      for (const mode of modes) {
        const file = path.join(outDir, `${name}-${mode}.png`);
        await captureMode(page, mode, file);
        files.push(file);
      }
    });
    await contactSheet(files, modes.length, path.join(outDir, `${suite}-contact-sheet.jpg`));
    const commit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({
      suite: `wsc-${suite}-qa`, generatedAt: new Date().toISOString(), commit, modes, views,
    }, null, 2)}\n`);
  } finally {
    await browser.close();
    await server?.close();
  }
}

export { prepareVisualPose, SETTLE };
