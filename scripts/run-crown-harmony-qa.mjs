import { chromium } from 'playwright';
import sharp from 'sharp';
import yaml from 'js-yaml';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { startFrozenViteServer, prepareVisualPose } from './lib/wsc-capture.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CAMERAS_PATH = path.resolve(ROOT, 'docs/qa/world-surface-context/pr-00/cameras.yaml');
const VIEWPORT = { width: 1280, height: 720 };

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'tmp/crown-qa/run' },
    poses: { type: 'string', default: 'tmp/crown-qa/poses-resolved.json' },
    compare: { type: 'string', default: '' },
    url: { type: 'string', default: '' },
  },
});

const SHOTS = [
  { id: 'B02-C03-noon', world: 'procedural', loc: 'B02', cam: 'C03', light: 'clear', label: 'B02-C03 · Deciduous Canopy Aerial (Noon)' },
  { id: 'B02-C01-noon', world: 'procedural', loc: 'B02', cam: 'C01', light: 'clear', label: 'B02-C01 · Deciduous Floor & Crowns (Noon)' },
  { id: 'B15-C01-noon', world: 'procedural', loc: 'B15', cam: 'C01', light: 'clear', label: 'B15-C01 · Forest Edge & LOD Transition (Noon)' },
  { id: 'B15-C01-sunset', world: 'procedural', loc: 'B15', cam: 'C01', light: 'sunset', label: 'B15-C01 · Forest Edge Backlighting (Sunset)' },
  { id: 'B05-C01-noon', world: 'procedural', loc: 'B05', cam: 'C01', light: 'clear', label: 'B05-C01 · Taiga Conifers & 0.3 Snow (Noon)' },
  { id: 'B18-C01-noon', world: 'eldara', loc: 'B18', cam: 'C01', light: 'clear', label: 'B18-C01 · Town Stone & Edge Crowns (Noon)' },
];

async function settleShot(page, pose, minimumMs = 3500) {
  try {
    await prepareVisualPose(page, pose, { minimumMs, timeoutMs: 15000 });
    return true;
  } catch (error) {
    console.warn(`[crown-qa] settle fallback (${String(error.message).slice(0, 120)})`);
    await page.evaluate(p => window.__worldVisualQa.cut(p), pose);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const ok = await page.evaluate(() => {
        const r = window.__worldVisualQa.readiness();
        const s = r.scenery;
        return r.terrain.loading === 0 && r.terrain.pendingCommits === 0 && s.queueDepth === 0 && s.meadow === 0 && s.draws === 0;
      });
      if (ok) return true;
      await page.waitForTimeout(350);
    }
    return false;
  }
}

async function resolveShotPoses(page, cameras, posesPath) {
  if (existsSync(posesPath)) {
    return JSON.parse(await readFile(posesPath, 'utf8'));
  }
  const resolved = {};
  const canopyCache = new Map();
  for (const shot of SHOTS) {
    const loc = cameras.locations[shot.loc];
    const baseCam = loc.cameras[shot.cam];
    let pose = { ...baseCam };
    if (loc.canopy) {
      if (!canopyCache.has(shot.loc)) {
        console.log(`[crown-qa] Resolving canopy pose for ${shot.loc} (tileId=${loc.tileId})...`);
        const probe = { ...loc.cameras.C01, mode: 'player', heightAboveGround: 1.7 };
        await page.evaluate(p => window.__worldVisualQa.cut(p), probe);
        await page.waitForFunction(() => !!window.__editor?.stylizedSurface?.treeView?.manifestStore?.forestField, null, { timeout: 30000 });
        const found = await page.evaluate(p => window.__worldVisualQa.findCanopyPose(p), {
          ...probe,
          tileId: loc.tileId,
          canopy: true,
        });
        canopyCache.set(shot.loc, found ?? probe);
      }
      const anchor = canopyCache.get(shot.loc);
      pose = { ...pose, x: anchor.x, z: anchor.z };
    }
    resolved[shot.id] = pose;
  }
  await mkdir(path.dirname(posesPath), { recursive: true });
  await writeFile(posesPath, `${JSON.stringify(resolved, null, 2)}\n`);
  return resolved;
}

async function computeImageStats(pngPath) {
  const { data, info } = await sharp(pngPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let lumaSum = 0;
  const count = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    lumaSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return {
    data,
    width: info.width,
    height: info.height,
    meanRgb: [rSum / count, gSum / count, bSum / count].map(v => Number(v.toFixed(2))),
    meanLuma: Number((lumaSum / count).toFixed(2)),
  };
}

async function buildBeforeAfterArtifacts(beforeDir, afterDir) {
  const comparisons = [];
  const pairPaths = [];
  const tileW = 640;
  const tileH = 360;
  const labelH = 26;

  for (const shot of SHOTS) {
    const beforePath = path.join(beforeDir, `${shot.id}.png`);
    const afterPath = path.join(afterDir, `${shot.id}.png`);
    if (!existsSync(beforePath) || !existsSync(afterPath)) continue;

    const beforeStats = await computeImageStats(beforePath);
    const afterStats = await computeImageStats(afterPath);
    let absDiff = 0;
    for (let i = 0; i < beforeStats.data.length; i += 3) {
      absDiff += (
        Math.abs(afterStats.data[i] - beforeStats.data[i])
        + Math.abs(afterStats.data[i + 1] - beforeStats.data[i + 1])
        + Math.abs(afterStats.data[i + 2] - beforeStats.data[i + 2])
      ) / 3;
    }
    const meanChannelDiff = Number((absDiff / (beforeStats.width * beforeStats.height)).toFixed(2));
    comparisons.push({
      id: shot.id,
      label: shot.label,
      beforeLuma: beforeStats.meanLuma,
      afterLuma: afterStats.meanLuma,
      lumaDelta: Number((afterStats.meanLuma - beforeStats.meanLuma).toFixed(2)),
      beforeRgb: beforeStats.meanRgb,
      afterRgb: afterStats.meanRgb,
      meanChannelDiff,
    });

    const beforeTile = await sharp(beforePath).resize(tileW, tileH, { fit: 'cover' }).png().toBuffer();
    const afterTile = await sharp(afterPath).resize(tileW, tileH, { fit: 'cover' }).png().toBuffer();
    const pairPath = path.join(afterDir, `before-vs-after-${shot.id}.jpg`);
    const safeTitle = shot.label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    await sharp({
      create: { width: tileW * 2, height: tileH + labelH, channels: 3, background: { r: 17, g: 22, b: 29 } },
    }).composite([
      {
        input: Buffer.from(`<svg width="${tileW * 2}" height="${labelH}">
          <rect width="${tileW * 2}" height="${labelH}" fill="#141a22"/>
          <text x="12" y="18" fill="#dbe5f0" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">BEFORE · ${safeTitle} (Luma ${beforeStats.meanLuma})</text>
          <text x="${tileW + 12}" y="18" fill="#a8e6b8" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">AFTER · ${safeTitle} (Luma ${afterStats.meanLuma}, ΔRGB=${meanChannelDiff})</text>
        </svg>`),
        left: 0,
        top: 0,
      },
      { input: beforeTile, left: 0, top: labelH },
      { input: afterTile, left: tileW, top: labelH },
    ]).jpeg({ quality: 88, mozjpeg: true }).toFile(pairPath);
    pairPaths.push(pairPath);
  }

  if (pairPaths.length > 0) {
    const rowH = tileH + labelH;
    const composites = await Promise.all(pairPaths.map(async (file, index) => ({
      input: await sharp(file).png().toBuffer(),
      left: 0,
      top: index * rowH,
    })));
    await sharp({
      create: { width: tileW * 2, height: pairPaths.length * rowH, channels: 3, background: { r: 17, g: 22, b: 29 } },
    }).composite(composites).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(afterDir, 'crown-before-after-sheet.jpg'));
  }
  return comparisons;
}

async function main() {
  const outDir = path.resolve(ROOT, args.out);
  const posesPath = path.resolve(ROOT, args.poses);
  const compareDir = args.compare ? path.resolve(ROOT, args.compare) : '';
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(ROOT, 'tmp'), { recursive: true });

  const cameras = yaml.load(await readFile(CAMERAS_PATH, 'utf8'));
  const releaseLock = await waitForPerfRunLock(path.join(ROOT, 'tmp', `perf-browser-${process.platform}.lock`));
  const server = args.url ? null : await startFrozenViteServer(5194);
  const targetUrl = args.url || `http://127.0.0.1:${server.httpServer.address().port}`;
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
        '--use-angle=default',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=CalculateNativeWinOcclusion',
        '--window-size=1320,820',
      ],
    });

    const worldGroups = [];
    for (const shot of SHOTS) {
      let group = worldGroups.find(g => g.world === shot.world);
      if (!group) {
        group = { world: shot.world, shots: [] };
        worldGroups.push(group);
      }
      group.shots.push(shot);
    }

    let adapter = null;
    let poses = existsSync(posesPath) ? JSON.parse(await readFile(posesPath, 'utf8')) : null;
    const results = [];
    const allErrors = [];

    for (const group of worldGroups) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const monitor = createBrowserErrorMonitor(page);

      try {
        await page.goto(`${targetUrl}/?qaVisual=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });

        if (!adapter) {
          adapter = await page.evaluate(async () => {
            const gpu = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
            return {
              vendor: gpu?.info?.vendor ?? '',
              architecture: gpu?.info?.architecture ?? '',
              description: gpu?.info?.description ?? '',
              fallback: !!(gpu?.info?.isFallbackAdapter ?? gpu?.isFallbackAdapter),
              backend: window.__editor?.terrainView?.rendererBackendStatus?.mode ?? 'unknown',
            };
          });
          if (adapter.backend !== 'webgpu' || adapter.fallback) {
            throw new Error(`Hardware WebGPU required, got ${JSON.stringify(adapter)}`);
          }
        }

        if (group.world !== 'procedural') {
          console.log(`[crown-qa] Loading world ${group.world} in fresh context...`);
          await page.evaluate(world => window.__worldVisualQa.loadWorld(world), group.world);
          await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 60000 });
        }

        if (!poses) {
          poses = await resolveShotPoses(page, cameras, posesPath);
        }

        for (const shot of group.shots) {
          const pose = poses[shot.id];
          const lighting = cameras.lightingConditions[shot.light];
          console.log(`[crown-qa] Capturing ${shot.id} (${shot.world})...`);
          await page.evaluate(l => window.__worldVisualQa.setLighting(l), lighting);
          await settleShot(page, pose, 3500);
          await page.evaluate(l => window.__worldVisualQa.setLighting(l), lighting);
          await page.evaluate(() => {
            window.__worldVisualQa.setCaptureUi(true);
            window.__worldVisualQa.setAvatarVisible(false);
          });
          await page.waitForTimeout(800);
          await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));

          const pngPath = path.join(outDir, `${shot.id}.png`);
          await captureWorldCanvas(page, pngPath);
          const diag = await page.evaluate(() => {
            const d = window.__worldVisualQa.diagnostics();
            return {
              actualBiomeId: d.actualBiomeId,
              readiness: d.readiness.ready,
              assetIntegrity: d.assetIntegrity,
              treeCounters: Object.fromEntries(Object.entries(d.counters ?? {}).filter(([k]) => /tree|impostor/i.test(k))),
            };
          });
          const stats = await computeImageStats(pngPath);
          results.push({
            id: shot.id,
            label: shot.label,
            world: shot.world,
            pose,
            lighting,
            meanLuma: stats.meanLuma,
            meanRgb: stats.meanRgb,
            ...diag,
          });
        }
      } finally {
        const snap = monitor.snapshot();
        if (snap.count > 0) allErrors.push({ world: group.world, ...snap });
        await context.close().catch(() => {});
      }
    }

    const comparisons = compareDir ? await buildBeforeAfterArtifacts(compareDir, outDir) : [];
    const manifest = {
      generatedAt: new Date().toISOString(),
      adapter,
      errors: { count: allErrors.reduce((n, e) => n + e.count, 0), byWorld: allErrors },
      results,
      comparisons,
    };
    await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[crown-qa] Done. Wrote ${results.length} captures to ${outDir}`);
    if (comparisons.length > 0) {
      console.log('[crown-qa] Before/After comparisons:', JSON.stringify(comparisons, null, 2));
    }
    if (manifest.errors.count > 0) {
      throw new Error(`Browser errors recorded during QA: ${JSON.stringify(manifest.errors)}`);
    }
  } finally {
    await browser?.close();
    await server?.close();
    releaseLock();
  }
}

await main();
