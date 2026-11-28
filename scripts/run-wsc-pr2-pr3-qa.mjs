import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer as createViteServer } from 'vite';
import yaml from 'js-yaml';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import viteConfig from '../vite.config.js';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import {
  analyzeRegion,
  buildD15ValidInteriorMask,
  buildFamilyMask,
  comparePairedPixels,
  compareRegions,
  intersectMasks,
} from './lib/wsc-color-metrics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: '' },
    out: { type: 'string', default: 'docs/qa/world-surface-context/pr-02-03' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '720' },
  },
});

const OUT_ROOT = path.resolve(ROOT, args.out);
const VIEWPORT = { width: Number(args.width) || 1280, height: Number(args.height) || 720 };
const CAMERAS_PATH = path.resolve(ROOT, 'docs/qa/world-surface-context/pr-00/cameras.yaml');
const CAMERAS = yaml.load(await readFile(CAMERAS_PATH, 'utf8'));

const LOWER_GROUND_ROI = Object.freeze({ x0: 0.05, y0: 0.42, x1: 0.95, y1: 0.96 });
const LOD_PATCH_ROI = Object.freeze({ x0: 0.25, y0: 0.48, x1: 0.75, y1: 0.88 });
const LOD_DISTANCES_M = Object.freeze([0, 12, 32, 45, 58, 95]);

function readGitProvenance() {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
    return { commit, branch, dirty };
  } catch {
    return { commit: null, branch: null, dirty: null };
  }
}

async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return {
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.byteLength,
  };
}

async function loadRawRgb(pngPath) {
  const { data, info } = await sharp(pngPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * Builds a road-tread mask from a D11 ecological vegetation coverage frame:
 * D11 encodes zero-grass roads/bare soil as warm brown (`R > B + 25` and low green dominance),
 * while vegetated turf/moss renders green-olive (`G >= R - 5`).
 */
function buildD11RoadAndNaturalMasks({ data, width, height, channels }) {
  const roadMask = new Uint8Array(width * height);
  const naturalMask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (r > g + 8 && r > b + 20) {
      roadMask[i] = 1;
    } else {
      naturalMask[i] = 1;
    }
  }
  return { roadMask, naturalMask };
}

async function openHardwareWebGpuPage(browser, baseUrl) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const urlHost = new URL(baseUrl).host;
  // Silence Vite HMR websocket notifications so concurrent edits never reload mid-capture.
  await page.routeWebSocket(new RegExp(urlHost.replaceAll('.', '\\.')), (ws) => {
    ws.onMessage(() => {});
  });
  const monitor = createBrowserErrorMonitor(page);
  page.on('pageerror', (err) => console.error('[WSC-QA][pageerror]', err.message));
  await page.goto(`${baseUrl}/?qaVisual=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 120000 });

  const adapter = await page.evaluate(async () => {
    const gpu = await navigator.gpu?.requestAdapter({
      powerPreference: 'high-performance',
      featureLevel: 'compatibility',
    });
    return {
      vendor: gpu?.info?.vendor ?? '',
      architecture: gpu?.info?.architecture ?? '',
      description: gpu?.info?.description ?? '',
      fallback: !!(gpu?.info?.isFallbackAdapter ?? gpu?.isFallbackAdapter),
      backend: window.__editor?.terrainView?.rendererBackendStatus?.mode ?? 'unknown',
    };
  });
  if (adapter.backend !== 'webgpu' || adapter.fallback) {
    throw new Error(`Hardware WebGPU required for WSC QA, got ${JSON.stringify(adapter)}`);
  }
  return { context, page, monitor, adapter };
}

async function prepareAndSettleTerrain(page, pose, lighting, minimumMs = 6000) {
  await page.evaluate(() => {
    window.__worldVisualQa.setDiagnosticMode('D00');
    window.__worldVisualQa.layers.restore();
  });
  await page.evaluate((l) => window.__worldVisualQa.setLighting(l), lighting);
  await prepareVisualPose(page, pose, { minimumMs });
  await page.evaluate((l) => window.__worldVisualQa.setLighting(l), lighting);
  if (lighting.weather && lighting.weather !== 'off') {
    await page.evaluate(() => window.__worldVisualQa.warmWeather(6));
  }
  // Wait for materialBake, forestFloor, and active WSC textures on visible slots so
  // no scene (especially Astalor Stillmeadow) is captured mid-bake.
  const deadline = Date.now() + 18000;
  let settleStats = null;
  while (Date.now() < deadline) {
    settleStats = await page.evaluate(() => {
      const qa = window.__worldVisualQa;
      const d = qa.diagnostics();
      const slots = window.__editor?.terrainView?.slots ?? [];
      let loaded = 0;
      let baked = 0;
      let forestFloor = 0;
      for (const s of slots) {
        if (!s?.page || s.loading) continue;
        loaded += 1;
        if (s.materialBake?.channels) baked += 1;
        if (s.forestFloorPixels) forestFloor += 1;
      }
      const gc = qa.sampleGroundContactField(d.canonical.x, d.canonical.z);
      return {
        ready: d.readiness.ready,
        loaded,
        baked,
        forestFloor,
        wscValid: !gc.isMissingFallback && gc.validity > 0.9,
        canonical: d.canonical,
        origin: d.origin,
        biomeId: d.actualBiomeId,
      };
    });
    if (settleStats.ready && settleStats.wscValid && settleStats.loaded >= 9
      && settleStats.baked >= Math.min(25, settleStats.loaded)
      && settleStats.forestFloor >= Math.min(25, settleStats.loaded)) {
      break;
    }
    await page.waitForTimeout(500);
  }
  return settleStats;
}

async function captureModePng(page, modeId, tmpPath) {
  await page.evaluate((mode) => {
    const qa = window.__worldVisualQa;
    qa.setCaptureUi(true);
    qa.setAvatarVisible(false);
    qa.layers.restore();
    qa.setDiagnosticMode(mode);
  }, modeId);
  await page.waitForTimeout(modeId === 'D00' ? 750 : 550);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await captureWorldCanvas(page, tmpPath);
  return loadRawRgb(tmpPath);
}

async function buildTiledSheet({ panels, columns, tileW = 640, tileH = 360, title, outPath }) {
  const headerH = 44;
  const labelH = 28;
  const rows = Math.ceil(panels.length / columns);
  const width = columns * tileW;
  const height = headerH + rows * (tileH + labelH);
  const composites = [];

  const safeTitle = title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  composites.push({
    input: Buffer.from(`<svg width="${width}" height="${headerH}">
      <rect width="${width}" height="${headerH}" fill="#11161d"/>
      <text x="16" y="29" fill="#f3f7fb" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700">${safeTitle}</text>
    </svg>`),
    left: 0,
    top: 0,
  });

  for (let i = 0; i < panels.length; i += 1) {
    const p = panels[i];
    const col = i % columns;
    const row = Math.floor(i / columns);
    const left = col * tileW;
    const top = headerH + row * (tileH + labelH);
    const resized = await sharp(p.imagePath).resize(tileW, tileH, { fit: 'cover' }).png().toBuffer();
    composites.push({ input: resized, left, top });
    const safeLabel = p.label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    composites.push({
      input: Buffer.from(`<svg width="${tileW}" height="${labelH}">
        <rect width="${tileW}" height="${labelH}" fill="#18202a"/>
        <text x="10" y="19" fill="#e2ebf5" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">${safeLabel}</text>
      </svg>`),
      left,
      top: top + tileH,
    });
  }

  await sharp({
    create: { width, height, channels: 3, background: { r: 17, g: 22, b: 29 } },
  }).composite(composites).jpeg({ quality: 86, mozjpeg: true }).toFile(outPath);
}

async function main() {
  await mkdir(OUT_ROOT, { recursive: true });
  const tmpDir = path.join(os.tmpdir(), `wsc-pr2-pr3-qa-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const tempFiles = [];
  const tmpFile = (name) => {
    const full = path.join(tmpDir, name);
    tempFiles.push(full);
    return full;
  };

  const git = readGitProvenance();
  const manifest = {
    schemaVersion: 1,
    suite: 'wsc-pr2-pr3-qa',
    generatedAt: new Date().toISOString(),
    git,
    viewport: VIEWPORT,
    rois: {
      lowerGround: LOWER_GROUND_ROI,
      lodPatch: LOD_PATCH_ROI,
    },
    lodDistancesMeters: [...LOD_DISTANCES_M],
    adapter: null,
    captures: [],
    artifacts: [],
  };

  const metrics = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    git,
    viewport: VIEWPORT,
    pr2PairedParity: [],
    pr2StreamingChecks: {},
    pr3GrassGround: [],
    pr3EmissiveCheck: {},
    pr3LodSweep: [],
  };

  let embeddedServer = null;
  let viteCacheDir = null;
  let targetUrl = args.url;
  if (!targetUrl) {
    viteCacheDir = path.join(os.tmpdir(), `wsc-qa-vite-${Date.now()}`);
    const baseCfg = typeof viteConfig === 'function'
      ? await viteConfig({ command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false })
      : viteConfig;
    embeddedServer = await createViteServer({
      ...baseCfg,
      configFile: false,
      root: ROOT,
      cacheDir: viteCacheDir,
      server: {
        host: '127.0.0.1',
        port: 5189,
        strictPort: false,
        hmr: false,
        watch: { ignored: ['**/*'] },
      },
    });
    await embeddedServer.listen();
    const addr = embeddedServer.httpServer.address();
    targetUrl = `http://127.0.0.1:${addr.port}`;
    console.log(`[WSC-QA] Embedded isolated Vite server listening on ${targetUrl}`);
  }

  const browser = await chromium.launch({
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

  const pr2Panels = [];
  const pr3BiomePanels = [];
  const pr3LodPanels = [];
  let stillHeroD00Path = null;
  let stillHeroD11Path = null;

  try {
    // =========================================================================
    // SESSION 1: Stillmeadow (Astalor burg 18) — C02, C01, C05 (road)
    // =========================================================================
    console.log('[WSC-QA] Session 1: Astalor Stillmeadow (B14-C02, B14-C01, B14-C05)');
    const astalor = await openHardwareWebGpuPage(browser, targetUrl);
    manifest.adapter = astalor.adapter;
    try {
      const approach = await astalor.page.evaluate(() => window.__worldVisualQa.loadStillmeadow(18));
      const baseX = approach.settlementFixture.canonicalX;
      const baseZ = approach.settlementFixture.canonicalZ;
      const baseYaw = (approach.yawDegrees * Math.PI) / 180;
      const dirX = -Math.sin(baseYaw);
      const dirZ = -Math.cos(baseYaw);

      const buildStillPose = (camId) => {
        const spec = CAMERAS.locations.B14.cameras[camId];
        const dist = spec.offsetForward ?? 0;
        return {
          x: baseX + dirX * dist,
          z: baseZ + dirZ * dist,
          yaw: baseYaw + (spec.yawOffset ?? 0),
          pitch: spec.pitch,
          mode: spec.mode,
          heightAboveGround: spec.heightAboveGround,
          fov: spec.fov,
        };
      };

      // Capture C02 first so Astalor streaming & terrain bakes are completely warm before C01!
      const stillScenes = [
        { id: 'B14-C02-overcast', camId: 'C02', cond: 'overcast', modes: ['D00', 'D01', 'D12', 'D15', 'D24'], pr2: true, pr3: true },
        { id: 'B14-C01-overcast', camId: 'C01', cond: 'overcast', modes: ['D00', 'D01', 'D11', 'D18', 'D24'], pr2: false, pr3: true },
        { id: 'B14-C05-clear', camId: 'C05', cond: 'clear', modes: ['D00', 'D01', 'D11', 'D12', 'D15', 'D24'], pr2: true, pr3: false, stratifyRoad: true },
      ];

      for (const scene of stillScenes) {
        const pose = buildStillPose(scene.camId);
        const lighting = CAMERAS.lightingConditions[scene.cond];
        const settle = await prepareAndSettleTerrain(astalor.page, pose, lighting, 7000);
        console.log(`[WSC-QA] ${scene.id} settled: loaded=${settle.loaded} baked=${settle.baked} ff=${settle.forestFloor} wscValid=${settle.wscValid}`);

        const imgs = {};
        const paths = {};
        for (const mode of scene.modes) {
          paths[mode] = tmpFile(`${scene.id}-${mode}.png`);
          imgs[mode] = await captureModePng(astalor.page, mode, paths[mode]);
        }

        manifest.captures.push({
          id: scene.id,
          world: 'astalor',
          pose,
          lighting,
          modes: scene.modes,
          settle,
        });

        const terrainMask = buildFamilyMask({ ...imgs.D24, family: 'terrain' });
        if (scene.pr2) {
          const validMask = buildD15ValidInteriorMask(imgs.D15);
          const mask = intersectMasks(terrainMask, validMask);
          const paired = comparePairedPixels(imgs.D12, imgs.D01, {
            roi: LOWER_GROUND_ROI,
            mask,
            kind: 'contact',
          });
          const entry = {
            sceneId: scene.id,
            label: `${scene.id}: D12 WSC albedo vs D01 unlit terrain (masked by D24 terrain ∩ D15 valid)`,
            roi: LOWER_GROUND_ROI,
            allValidTerrain: paired,
          };
          if (scene.stratifyRoad && imgs.D11) {
            const { roadMask, naturalMask } = buildD11RoadAndNaturalMasks(imgs.D11);
            entry.roadOnly = comparePairedPixels(imgs.D12, imgs.D01, {
              roi: LOWER_GROUND_ROI,
              mask: intersectMasks(mask, roadMask),
              kind: 'contact',
            });
            entry.naturalOnly = comparePairedPixels(imgs.D12, imgs.D01, {
              roi: LOWER_GROUND_ROI,
              mask: intersectMasks(mask, naturalMask),
              kind: 'contact',
            });
          }
          metrics.pr2PairedParity.push(entry);
          pr2Panels.push(
            { imagePath: paths.D01, label: `${scene.id} · D01 Unlit Terrain` },
            { imagePath: paths.D12, label: `${scene.id} · D12 WSC (med ΔE=${paired.pairedDeltaE00.median}, p95=${paired.pairedDeltaE00.p95})` },
            { imagePath: paths.D15, label: `${scene.id} · D15 Valid Interior` },
          );
        }

        if (scene.pr3) {
          const grassMask = buildFamilyMask({ ...imgs.D24, family: 'nearGrass' });
          const d00Grass = analyzeRegion({ ...imgs.D00, roi: LOWER_GROUND_ROI, mask: grassMask });
          const d00Terrain = analyzeRegion({ ...imgs.D00, roi: LOWER_GROUND_ROI, mask: terrainMask });
          const d01Grass = analyzeRegion({ ...imgs.D01, roi: LOWER_GROUND_ROI, mask: grassMask });
          const d01Terrain = analyzeRegion({ ...imgs.D01, roi: LOWER_GROUND_ROI, mask: terrainMask });
          const d00Diff = compareRegions(d00Grass, d00Terrain, { kind: 'contact' });
          const d01Diff = compareRegions(d01Grass, d01Terrain, { kind: 'contact' });
          metrics.pr3GrassGround.push({
            sceneId: scene.id,
            d00Lit: { grass: d00Grass, terrain: d00Terrain, comparison: d00Diff },
            d01Unlit: { grass: d01Grass, terrain: d01Terrain, comparison: d01Diff },
          });
          if (scene.id === 'B14-C01-overcast') {
            stillHeroD00Path = paths.D00;
            stillHeroD11Path = paths.D11;
            const d18Grass = analyzeRegion({ ...imgs.D18, roi: LOWER_GROUND_ROI, mask: grassMask });
            const d18Terrain = analyzeRegion({ ...imgs.D18, roi: LOWER_GROUND_ROI, mask: terrainMask });
            metrics.pr3EmissiveCheck = {
              sceneId: scene.id,
              grassMeanRgb: d18Grass.meanRgb,
              terrainMeanRgb: d18Terrain.meanRgb,
              grassMeanLuma: d18Grass.meanLinearLuminance,
              terrainMeanLuma: d18Terrain.meanLinearLuminance,
            };
          } else if (scene.id === 'B14-C02-overcast') {
            pr3BiomePanels.push({
              imagePath: paths.D00,
              label: `Stillmeadow C02 · D00 ΔE=${d00Diff.deltaE00} (${d00Diff.lumaDiffPct}%) | D01 ΔE=${d01Diff.deltaE00}`,
            });
          }
        }
      }
      const astalorErrors = astalor.monitor.snapshot();
      if (astalorErrors.count > 0) {
        console.warn('[WSC-QA] Session 1 browser errors:', astalorErrors);
      }
      manifest.browserErrors = { ...(manifest.browserErrors ?? {}), astalor: astalorErrors };
    } finally {
      await astalor.context.close();
    }

    // =========================================================================
    // SESSION 2: Procedural Biomes (B01 + Streaming + LOD, then B02, B03, B04)
    // =========================================================================
    console.log('[WSC-QA] Session 2: Procedural Biomes + Streaming + Grass LOD Sweep');
    const clearLight = CAMERAS.lightingConditions.clear;
    const biomeSpecs = [
      { locId: 'B01', pr2: true, pr3: true, runStreamingAndLod: true },
      { locId: 'B02', pr2: false, pr3: true },
      { locId: 'B03', pr2: true, pr3: true },
      { locId: 'B04', pr2: false, pr3: true },
    ];

    for (const spec of biomeSpecs) {
      const proc = await openHardwareWebGpuPage(browser, targetUrl);
      try {
        const loc = CAMERAS.locations[spec.locId];
        let pose = { ...loc.cameras.C02 };
        if (loc.canopy) {
          await proc.page.evaluate(() => {
            window.__worldVisualQa.setDiagnosticMode('D00');
            window.__worldVisualQa.layers.restore();
          });
          await prepareVisualPose(proc.page, { ...loc.cameras.C01, mode: 'player', heightAboveGround: 1.7 }, { minimumMs: 4500 });
          const found = await proc.page.evaluate((p) => window.__worldVisualQa.findCanopyPose(p), {
            ...loc.cameras.C01,
            tileId: loc.tileId,
            canopy: true,
          });
          if (found) {
            pose = { ...pose, x: found.x, z: found.z };
          }
        }
        const settle = await prepareAndSettleTerrain(proc.page, pose, clearLight, 6000);
        const sceneId = `${spec.locId}-C02-clear`;
        console.log(`[WSC-QA] ${sceneId} settled: loaded=${settle.loaded} baked=${settle.baked} ff=${settle.forestFloor} wscValid=${settle.wscValid}`);

        const modes = spec.pr2 ? ['D00', 'D01', 'D12', 'D15', 'D24'] : ['D00', 'D01', 'D24'];
        const imgs = {};
        const paths = {};
        for (const mode of modes) {
          paths[mode] = tmpFile(`${sceneId}-${mode}.png`);
          imgs[mode] = await captureModePng(proc.page, mode, paths[mode]);
        }

        manifest.captures.push({
          id: sceneId,
          world: 'procedural',
          pose,
          lighting: clearLight,
          modes,
          settle,
        });

        const terrainMask = buildFamilyMask({ ...imgs.D24, family: 'terrain' });
        if (spec.pr2) {
          const validMask = buildD15ValidInteriorMask(imgs.D15);
          const mask = intersectMasks(terrainMask, validMask);
          const paired = comparePairedPixels(imgs.D12, imgs.D01, {
            roi: LOWER_GROUND_ROI,
            mask,
            kind: 'contact',
          });
          metrics.pr2PairedParity.push({
            sceneId,
            label: `${sceneId}: D12 WSC albedo vs D01 unlit terrain (masked by D24 terrain ∩ D15 valid)`,
            roi: LOWER_GROUND_ROI,
            allValidTerrain: paired,
          });
          pr2Panels.push(
            { imagePath: paths.D01, label: `${sceneId} · D01 Unlit Terrain` },
            { imagePath: paths.D12, label: `${sceneId} · D12 WSC (med ΔE=${paired.pairedDeltaE00.median}, p95=${paired.pairedDeltaE00.p95})` },
            { imagePath: paths.D15, label: `${sceneId} · D15 Valid Interior` },
          );
        }

        if (spec.pr3) {
          const grassMask = buildFamilyMask({ ...imgs.D24, family: 'nearGrass' });
          const d00Grass = analyzeRegion({ ...imgs.D00, roi: LOWER_GROUND_ROI, mask: grassMask });
          const d00Terrain = analyzeRegion({ ...imgs.D00, roi: LOWER_GROUND_ROI, mask: terrainMask });
          const d01Grass = analyzeRegion({ ...imgs.D01, roi: LOWER_GROUND_ROI, mask: grassMask });
          const d01Terrain = analyzeRegion({ ...imgs.D01, roi: LOWER_GROUND_ROI, mask: terrainMask });
          const d00Diff = compareRegions(d00Grass, d00Terrain, { kind: 'contact' });
          const d01Diff = compareRegions(d01Grass, d01Terrain, { kind: 'contact' });
          metrics.pr3GrassGround.push({
            sceneId,
            d00Lit: { grass: d00Grass, terrain: d00Terrain, comparison: d00Diff },
            d01Unlit: { grass: d01Grass, terrain: d01Terrain, comparison: d01Diff },
          });
          pr3BiomePanels.push({
            imagePath: paths.D00,
            label: `${loc.name} (${spec.locId}) · D00 ΔE=${d00Diff.deltaE00} (${d00Diff.lumaDiffPct}%)`,
          });
        }

        if (spec.runStreamingAndLod) {
          // WSC Recenter (20 m step > 16 m hysteresis) + Floating-origin roundtrip rebase check!
          console.log('[WSC-QA] Streaming checks: 20 m WSC recenter + floating-origin roundtrip rebase');
          const rcPoseA = { x: -1869, z: -4003, yaw: 2.488, pitch: -0.24, mode: 'player', heightAboveGround: 1.7, fov: 68 };
          const rcPoseB = { x: -1849, z: -4003, yaw: 2.488, pitch: -0.24, mode: 'player', heightAboveGround: 1.7, fov: 68 };
          const settleRcA = await prepareAndSettleTerrain(proc.page, rcPoseA, clearLight, 5000);
          const foBeforePath = tmpFile('STR-FO-before-D00.png');
          const foBeforeImg = await captureModePng(proc.page, 'D00', foBeforePath);
          const rcBeforeD15Path = tmpFile('STR-RC-before-D15.png');
          const rcBeforeD15 = await captureModePng(proc.page, 'D15', rcBeforeD15Path);
          const rcBeforeMask = buildD15ValidInteriorMask(rcBeforeD15);

          const settleRcB = await prepareAndSettleTerrain(proc.page, rcPoseB, clearLight, 4500);
          const rcAfterD15Path = tmpFile('STR-RC-after-D15.png');
          const rcAfterD15 = await captureModePng(proc.page, 'D15', rcAfterD15Path);
          const rcAfterMask = buildD15ValidInteriorMask(rcAfterD15);

          // Jump >10 km away to force a floating-origin rebase, then return to exact pose rcPoseA.
          await proc.page.evaluate(() => {
            window.__worldVisualQa.setDiagnosticMode('D00');
            window.__worldVisualQa.cut({ x: -12000, z: 12000, yaw: 0, pitch: -0.1, mode: 'player' });
          });
          await proc.page.waitForTimeout(800);
          const settleFoAfter = await prepareAndSettleTerrain(proc.page, rcPoseA, clearLight, 6000);
          const foAfterPath = tmpFile('STR-FO-after-D00.png');
          const foAfterImg = await captureModePng(proc.page, 'D00', foAfterPath);
          const foPaired = comparePairedPixels(foAfterImg, foBeforeImg, {
            roi: LOWER_GROUND_ROI,
            kind: 'floating-origin',
          });

          const validRatio = (mask) => {
            let count = 0;
            let total = 0;
            const y0 = Math.floor(LOWER_GROUND_ROI.y0 * VIEWPORT.height);
            const y1 = Math.ceil(LOWER_GROUND_ROI.y1 * VIEWPORT.height);
            const x0 = Math.floor(LOWER_GROUND_ROI.x0 * VIEWPORT.width);
            const x1 = Math.ceil(LOWER_GROUND_ROI.x1 * VIEWPORT.width);
            for (let y = y0; y < y1; y += 1) {
              for (let x = x0; x < x1; x += 1) {
                total += 1;
                if (mask[y * VIEWPORT.width + x]) count += 1;
              }
            }
            return total > 0 ? Number((count / total).toFixed(4)) : 0;
          };

          metrics.pr2StreamingChecks = {
            recenter20m: {
              beforeOrigin: settleRcA.origin,
              afterOrigin: settleRcB.origin,
              beforeValidCoverage: validRatio(rcBeforeMask),
              afterValidCoverage: validRatio(rcAfterMask),
              beforeWscValid: settleRcA.wscValid,
              afterWscValid: settleRcB.wscValid,
            },
            floatingOriginRoundtrip: {
              beforeOrigin: settleRcA.origin,
              afterOrigin: settleFoAfter.origin,
              pairedD00: foPaired,
            },
          };

          // Configured Grass LOD Sweep at exact handoff distances: 0m, 12m, 32m, 45m, 58m, 95m.
          console.log('[WSC-QA] Grass LOD Sweep:', LOD_DISTANCES_M.join('m, ') + 'm');
          const baseLod = CAMERAS.lodSweeps.grassAndWoodland.basePose;
          const backX = Math.sin(baseLod.yaw);
          const backZ = Math.cos(baseLod.yaw);
          let prevReg = null;
          for (const dist of LOD_DISTANCES_M) {
            const lodPose = {
              ...baseLod,
              x: baseLod.x + backX * dist,
              z: baseLod.z + backZ * dist,
              heightAboveGround: dist > 60 ? 5.5 : 1.7,
              mode: dist > 60 ? 'fly' : 'player',
            };
            await prepareAndSettleTerrain(proc.page, lodPose, clearLight, 4500);
            const d00Path = tmpFile(`LOD-d${dist}m-D00.png`);
            const d20Path = tmpFile(`LOD-d${dist}m-D20.png`);
            const d00Img = await captureModePng(proc.page, 'D00', d00Path);
            await captureModePng(proc.page, 'D20', d20Path);
            const reg = analyzeRegion({ ...d00Img, roi: LOD_PATCH_ROI });
            const stepDiff = prevReg ? compareRegions(reg, prevReg, { kind: 'lod' }) : null;
            metrics.pr3LodSweep.push({
              distanceMeters: dist,
              roi: LOD_PATCH_ROI,
              region: reg,
              stepFromPrevious: stepDiff,
            });
            pr3LodPanels.push(
              { imagePath: d00Path, label: `${dist} m · D00 (luma=${reg.meanLinearLuminance}${stepDiff ? `, Δ=${stepDiff.lumaDiffPct}%` : ''})` },
              { imagePath: d20Path, label: `${dist} m · D20 LOD Bands` },
            );
            prevReg = reg;
          }
        }

        const procErrors = proc.monitor.snapshot();
        if (procErrors.count > 0) {
          console.warn(`[WSC-QA] ${spec.locId} browser errors:`, procErrors);
        }
        manifest.browserErrors = { ...(manifest.browserErrors ?? {}), [spec.locId]: procErrors };
      } finally {
        await proc.context.close();
      }
    }

    // =========================================================================
    // Compose compact committed visual comparison artefacts + SHA-256 manifest
    // =========================================================================
    const outPr2Sheet = path.join(OUT_ROOT, 'pr2-parity-sheet.jpg');
    await buildTiledSheet({
      panels: pr2Panels,
      columns: 3,
      tileW: 560,
      tileH: 315,
      title: 'WSC PR 2 — Paired Per-Pixel Parity (D01 Unlit Terrain | D12 WSC Albedo | D15 Valid Interior)',
      outPath: outPr2Sheet,
    });

    const outStillHero = path.join(OUT_ROOT, 'pr3-stillmeadow-hero.jpg');
    if (stillHeroD00Path && stillHeroD11Path) {
      await buildTiledSheet({
        panels: [
          { imagePath: stillHeroD00Path, label: 'Stillmeadow B14-C01 Overcast · D00 Lit (Standard IBL + WSC)' },
          { imagePath: stillHeroD11Path, label: 'Stillmeadow B14-C01 Overcast · D11 Ecological Veg Coverage' },
        ],
        columns: 2,
        tileW: 720,
        tileH: 405,
        title: 'WSC PR 3 — Stillmeadow Hero Forest Approach (B14-C01 Overcast)',
        outPath: outStillHero,
      });
    }

    const outBiomesSheet = path.join(OUT_ROOT, 'pr3-biomes-sheet.jpg');
    await buildTiledSheet({
      panels: pr3BiomePanels,
      columns: 3,
      tileW: 560,
      tileH: 315,
      title: 'WSC PR 3 — Cross-Biome Grass/Ground Conservation (D00 Lit)',
      outPath: outBiomesSheet,
    });

    const outLodSheet = path.join(OUT_ROOT, 'pr3-lod-sweep-sheet.jpg');
    await buildTiledSheet({
      panels: pr3LodPanels,
      columns: 4,
      tileW: 420,
      tileH: 236,
      title: 'WSC PR 3 — Configured Grass LOD Handoff Sweep (0m, 12m, 32m, 45m, 58m, 95m)',
      outPath: outLodSheet,
    });

    const metricsPath = path.join(OUT_ROOT, 'metrics.json');
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);

    const savedFiles = [outPr2Sheet, outStillHero, outBiomesSheet, outLodSheet, metricsPath];
    for (const f of savedFiles) {
      try {
        const info = await sha256File(f);
        manifest.artifacts.push({
          file: path.relative(OUT_ROOT, f).replaceAll('\\', '/'),
          ...info,
        });
      } catch {
        // Optional artifact absent.
      }
    }
    const manifestPath = path.join(OUT_ROOT, 'capture-manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    // Print concise summary table.
    console.log('\n=== WSC PR 2 Paired Per-Pixel Parity (D12 vs D01, D24 terrain ∩ D15 valid) ===');
    for (const p of metrics.pr2PairedParity) {
      const m = p.allValidTerrain;
      console.log(
        `${p.sceneId}: median=${m.pairedDeltaE00.median} p90=${m.pairedDeltaE00.p90} p95=${m.pairedDeltaE00.p95} p99=${m.pairedDeltaE00.p99} >5=${m.pctAbove5}% >10=${m.pctAbove10}% lumaDiff=${m.lumaDiffPct}% [${m.flag}]`,
      );
      if (p.roadOnly) {
        console.log(
          `  road-only (${p.roadOnly.count} px): median=${p.roadOnly.pairedDeltaE00.median} p95=${p.roadOnly.pairedDeltaE00.p95} lumaDiff=${p.roadOnly.lumaDiffPct}%`,
        );
        console.log(
          `  natural-only (${p.naturalOnly.count} px): median=${p.naturalOnly.pairedDeltaE00.median} p95=${p.naturalOnly.pairedDeltaE00.p95} lumaDiff=${p.naturalOnly.lumaDiffPct}%`,
        );
      }
    }
    console.log('\n=== WSC PR 3 Grass vs Terrain ===');
    for (const g of metrics.pr3GrassGround) {
      console.log(
        `${g.sceneId}: D00 ΔE=${g.d00Lit.comparison.deltaE00} (${g.d00Lit.comparison.lumaDiffPct}%) | D01 ΔE=${g.d01Unlit.comparison.deltaE00} (${g.d01Unlit.comparison.lumaDiffPct}%)`,
      );
    }
    console.log('\n=== WSC PR 3 Emissive Check (D18) ===', JSON.stringify(metrics.pr3EmissiveCheck));
    console.log('=== WSC Streaming Checks ===', JSON.stringify(metrics.pr2StreamingChecks));
    console.log(`\nArtifacts written to ${OUT_ROOT}`);
  } finally {
    await browser.close();
    if (embeddedServer) await embeddedServer.close();
    if (viteCacheDir) await rm(viteCacheDir, { recursive: true, force: true }).catch(() => {});
    for (const f of tempFiles) {
      await unlink(f).catch(() => {});
    }
  }
}

await main();
