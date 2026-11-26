// WSC PR 6 hardware capture: ecological footprints at the PR 0 deciduous-forest
// cameras (B02-C02 trunk close-up, B02-C03 canopy aerial), D00 plus the raw
// ecological channels D08 contact, D10 litter and D11 vegetation coverage, so the
// lobed footprints can be read against PR 0's circular stamps (DEF-09).
import { chromium } from 'playwright';
import sharp from 'sharp';
import yaml from 'js-yaml';
import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5173' },
    out: { type: 'string', default: 'docs/qa/world-surface-context/pr-06' },
  },
});
const OUT = path.resolve(ROOT, args.out);
const VIEWPORT = { width: 1280, height: 720 };
const CAMERAS = yaml.load(await readFile(path.resolve(ROOT, 'docs/qa/world-surface-context/pr-00/cameras.yaml'), 'utf8'));
const MODES = ['D00', 'D08', 'D10', 'D11'];
const SHOTS = ['C02', 'C03'];

async function capture(page, mode, file) {
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

async function settle(page, pose, lighting) {
  await page.evaluate(() => window.__worldVisualQa.setDiagnosticMode('D00'));
  await page.evaluate(l => window.__worldVisualQa.setLighting(l), lighting);
  await prepareVisualPose(page, pose, { minimumMs: 6000, timeoutMs: 300000 });
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

async function sheet(files, outPath) {
  const tileW = 640;
  const tileH = 360;
  const columns = MODES.length;
  const rows = Math.ceil(files.length / columns);
  const composites = await Promise.all(files.map(async (f, i) => ({
    input: await sharp(f.path).resize(tileW, tileH, { fit: 'cover' }).png().toBuffer(),
    left: (i % columns) * tileW,
    top: Math.floor(i / columns) * tileH,
  })));
  await sharp({ create: { width: columns * tileW, height: rows * tileH, channels: 3, background: '#11161d' } })
    .composite(composites).jpeg({ quality: 86, mozjpeg: true }).toFile(outPath);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion', '--window-size=1320,820'],
});
const files = [];
try {
  const page = await (await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${args.url}/?qaVisual=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 120000 });
  const backend = await page.evaluate(() => window.__editor?.terrainView?.rendererBackendStatus?.mode);
  if (backend !== 'webgpu') throw new Error(`Hardware WebGPU required, got ${backend}`);
  const loc = CAMERAS.locations.B02;
  const clear = CAMERAS.lightingConditions.clear;
  // As PR 0 resolved it: a canopy pose found from C01, shared by the other cameras.
  await prepareVisualPose(page, { ...loc.cameras.C01, mode: 'player', heightAboveGround: 1.7 }, { minimumMs: 5000, timeoutMs: 300000 });
  const found = await page.evaluate(p => window.__worldVisualQa.findCanopyPose(p), { ...loc.cameras.C01, tileId: loc.tileId, canopy: true });
  for (const camId of SHOTS) {
    const pose = found ? { ...loc.cameras[camId], x: found.x, z: found.z } : loc.cameras[camId];
    const ready = await settle(page, pose, clear);
    console.log(`[WSC-PR6] B02-${camId} settled=${ready}`);
    for (const mode of MODES) {
      const file = path.join(OUT, `B02-${camId}-clear-${mode}.png`);
      await capture(page, mode, file);
      files.push({ path: file, camId, mode });
    }
  }
  await sheet(files, path.join(OUT, 'pr6-contact-sheet.jpg'));
  const commit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify({
    suite: 'wsc-pr6-qa', generatedAt: new Date().toISOString(), commit, pose: found, modes: MODES, shots: SHOTS,
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
