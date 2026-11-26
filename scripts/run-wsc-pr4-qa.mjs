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
  buildFamilyMask,
  compareRegions,
} from './lib/wsc-color-metrics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: '' },
    out: { type: 'string', default: 'docs/qa/world-surface-context/pr-04' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '720' },
  },
});

const OUT_ROOT = path.resolve(ROOT, args.out);
const VIEWPORT = { width: Number(args.width) || 1280, height: Number(args.height) || 720 };
const CAMERAS_PATH = path.resolve(ROOT, 'docs/qa/world-surface-context/pr-00/cameras.yaml');
const CAMERAS = yaml.load(await readFile(CAMERAS_PATH, 'utf8'));

const FULL_FRAME_ROI = Object.freeze({ x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.96 });
const LOWER_GROUND_ROI = Object.freeze({ x0: 0.05, y0: 0.42, x1: 0.95, y1: 0.96 });
const CONTACT_BASE_ROI = Object.freeze({ x0: 0.05, y0: 0.52, x1: 0.95, y1: 0.85 });
const UPPER_TRUNK_ROI = Object.freeze({ x0: 0.05, y0: 0.14, x1: 0.95, y1: 0.45 });

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

async function openHardwareWebGpuPage(browser, baseUrl) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const monitor = createBrowserErrorMonitor(page);
  page.on('pageerror', (err) => console.error('[WSC-PR4][pageerror]', err.message));
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
    throw new Error(`Hardware WebGPU required for WSC PR 4 QA, got ${JSON.stringify(adapter)}`);
  }
  return { context, page, monitor, adapter };
}

async function prepareAndSettleTerrain(page, pose, lighting, minimumMs = 5500) {
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
    if (settleStats.ready && settleStats.wscValid && settleStats.loaded >= 4
      && settleStats.baked >= Math.min(20, settleStats.loaded)) {
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
  const tmpDir = path.join(os.tmpdir(), `wsc-pr4-qa-${Date.now()}`);
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
    suite: 'wsc-pr4-qa',
    generatedAt: new Date().toISOString(),
    git,
    viewport: VIEWPORT,
    rois: { lowerGround: LOWER_GROUND_ROI, contactBase: CONTACT_BASE_ROI, upperTrunk: UPPER_TRUNK_ROI },
    adapter: null,
    captures: [],
    artifacts: [],
  };
  const metrics = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    git,
    viewport: VIEWPORT,
    contactComparisons: [],
    identityPreservation: [],
  };

  let embeddedServer = null;
  let viteCacheDir = null;
  let targetUrl = args.url;
  if (!targetUrl) {
    viteCacheDir = path.join(os.tmpdir(), `wsc-pr4-vite-${Date.now()}`);
    const baseCfg = typeof viteConfig === 'function'
      ? await viteConfig({ command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false })
      : viteConfig;
    embeddedServer = await createViteServer({
      ...baseCfg,
      configFile: false,
      root: ROOT,
      cacheDir: viteCacheDir,
      server: { host: '127.0.0.1', port: 5191, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
    });
    await embeddedServer.listen();
    const addr = embeddedServer.httpServer.address();
    targetUrl = `http://127.0.0.1:${addr.port}`;
    console.log(`[WSC-PR4] Embedded isolated Vite server listening on ${targetUrl}`);
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

  const panels = [];

  try {
    // =========================================================================
    // 1. Stillmeadow B14-C03 (Tree Trunk Base) & B14-C04 (Understories)
    // =========================================================================
    console.log('[WSC-PR4] Session 1: Stillmeadow B14-C03 (Tree Trunks) & B14-C04 (Understories)');
    const eldara = await openHardwareWebGpuPage(browser, targetUrl);
    manifest.adapter = eldara.adapter;
    try {
      const approach = await eldara.page.evaluate(() => window.__worldVisualQa.loadStillmeadow(18));
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

      for (const item of [
        { id: 'B14-C01-overcast', camId: 'C01', cond: 'overcast', family: 'treeBark', label: 'Stillmeadow C01 · Forest Trunks & Roots' },
        { id: 'B14-C04-clear', camId: 'C04', cond: 'clear', family: 'shrub', alsoBark: true, label: 'Stillmeadow C04 · Trunks & Understories' },
      ]) {
        const pose = buildStillPose(item.camId);
        const lighting = CAMERAS.lightingConditions[item.cond];
        const settle = await prepareAndSettleTerrain(eldara.page, pose, lighting, 6500);
        console.log(`[WSC-PR4] ${item.id} settled: loaded=${settle.loaded} baked=${settle.baked}`);
        const d00Path = tmpFile(`${item.id}-D00.png`);
        const d01Path = tmpFile(`${item.id}-D01.png`);
        const d24Path = tmpFile(`${item.id}-D24.png`);
        const d00 = await captureModePng(eldara.page, 'D00', d00Path);
        const d01 = await captureModePng(eldara.page, 'D01', d01Path);
        const d24 = await captureModePng(eldara.page, 'D24', d24Path);
        manifest.captures.push({ id: item.id, world: 'eldara', pose, lighting, settle });

        const terMask = buildFamilyMask({ ...d24, family: 'terrain' });
        const familiesToMeasure = item.alsoBark ? [item.family, 'treeBark'] : [item.family];
        let primaryDiff = null;
        let primaryD01Diff = null;
        for (const fam of familiesToMeasure) {
          const famMask = buildFamilyMask({ ...d24, family: fam });
          const roi = fam === 'treeBark' ? FULL_FRAME_ROI : LOWER_GROUND_ROI;
          const d00Fam = analyzeRegion({ ...d00, roi, mask: famMask });
          const d00Ter = analyzeRegion({ ...d00, roi: LOWER_GROUND_ROI, mask: terMask });
          const d01Fam = analyzeRegion({ ...d01, roi, mask: famMask });
          const d01Ter = analyzeRegion({ ...d01, roi: LOWER_GROUND_ROI, mask: terMask });
          const d00Diff = compareRegions(d00Fam, d00Ter, { kind: 'contact' });
          const d01Diff = compareRegions(d01Fam, d01Ter, { kind: 'contact' });
          if (fam === item.family) {
            primaryDiff = d00Diff;
            primaryD01Diff = d01Diff;
          }
          metrics.contactComparisons.push({
            sceneId: item.id,
            family: fam,
            d00Lit: { family: d00Fam, terrain: d00Ter, comparison: d00Diff },
            d01Unlit: { family: d01Fam, terrain: d01Ter, comparison: d01Diff },
          });
          if (fam === 'treeBark') {
            const baseFam = analyzeRegion({ ...d01, roi: CONTACT_BASE_ROI, mask: famMask });
            const baseTer = analyzeRegion({ ...d01, roi: LOWER_GROUND_ROI, mask: terMask });
            const upperFam = analyzeRegion({ ...d01, roi: UPPER_TRUNK_ROI, mask: famMask });
            if (baseFam.count >= 40 && upperFam.count >= 40) {
              metrics.identityPreservation.push({
                sceneId: item.id,
                family: fam,
                baseVsTerrainD01: compareRegions(baseFam, baseTer, { kind: 'contact' }),
                upperVsTerrainD01: compareRegions(upperFam, baseTer, { kind: 'contact' }),
                baseMeanRgb: baseFam.meanRgb,
                upperMeanRgb: upperFam.meanRgb,
              });
            }
          }
        }
        panels.push(
          { imagePath: d00Path, label: `${item.label} · D00 (ΔE=${primaryDiff.deltaE00})` },
          { imagePath: d01Path, label: `${item.label} · D01 (ΔE=${primaryD01Diff.deltaE00})` },
        );
      }
    } finally {
      await eldara.context.close();
    }

    // =========================================================================
    // 2. Temperate Rainforest B03-C02 (Fallen Log Debris, Moss Mounds & Trunks)
    // =========================================================================
    console.log('[WSC-PR4] Session 2: Temperate Rainforest B03-C02 (Fallen Logs & Trunks)');
    const b03 = await openHardwareWebGpuPage(browser, targetUrl);
    try {
      const loc = CAMERAS.locations.B03;
      const clearLight = CAMERAS.lightingConditions.clear;
      await prepareVisualPose(b03.page, { ...loc.cameras.C01, mode: 'player', heightAboveGround: 1.7 }, { minimumMs: 4500 });
      const found = await b03.page.evaluate((p) => window.__worldVisualQa.findCanopyPose(p), {
        ...loc.cameras.C01,
        tileId: loc.tileId,
        canopy: true,
      });
      const pose = found ? { ...loc.cameras.C02, x: found.x, z: found.z } : { ...loc.cameras.C02 };
      const settle = await prepareAndSettleTerrain(b03.page, pose, clearLight, 6000);
      console.log(`[WSC-PR4] B03-C02-clear settled: loaded=${settle.loaded} baked=${settle.baked}`);
      const d00Path = tmpFile('B03-C02-clear-D00.png');
      const d01Path = tmpFile('B03-C02-clear-D01.png');
      const d24Path = tmpFile('B03-C02-clear-D24.png');
      const d00 = await captureModePng(b03.page, 'D00', d00Path);
      const d01 = await captureModePng(b03.page, 'D01', d01Path);
      const d24 = await captureModePng(b03.page, 'D24', d24Path);
      manifest.captures.push({ id: 'B03-C02-clear', world: 'procedural', pose, lighting: clearLight, settle });

      const debMask = buildFamilyMask({ ...d24, family: 'debris' });
      const terMask = buildFamilyMask({ ...d24, family: 'terrain' });
      const d00Deb = analyzeRegion({ ...d00, roi: FULL_FRAME_ROI, mask: debMask });
      const d00Ter = analyzeRegion({ ...d00, roi: LOWER_GROUND_ROI, mask: terMask });
      const d01Deb = analyzeRegion({ ...d01, roi: FULL_FRAME_ROI, mask: debMask });
      const d01Ter = analyzeRegion({ ...d01, roi: LOWER_GROUND_ROI, mask: terMask });
      const d00Diff = compareRegions(d00Deb, d00Ter, { kind: 'contact' });
      const d01Diff = compareRegions(d01Deb, d01Ter, { kind: 'contact' });
      metrics.contactComparisons.push({
        sceneId: 'B03-C02-clear',
        family: 'debris',
        d00Lit: { family: d00Deb, terrain: d00Ter, comparison: d00Diff },
        d01Unlit: { family: d01Deb, terrain: d01Ter, comparison: d01Diff },
      });
      panels.push(
        { imagePath: d00Path, label: `Rainforest B03 · Logs & Floor D00 (ΔE=${d00Diff.deltaE00})` },
        { imagePath: d01Path, label: `Rainforest B03 · Logs & Floor D01 (ΔE=${d01Diff.deltaE00})` },
      );
    } finally {
      await b03.context.close();
    }

    // =========================================================================
    // 3. Standardized 5-Substrate Fixture (B16 Grass-Sand Rock & B17 Snow-Rock)
    // =========================================================================
    console.log('[WSC-PR4] Session 3: Standardized Fixture (B16 Grass-Sand Rock & B17 Snow-Rock)');
    const fx = await openHardwareWebGpuPage(browser, targetUrl);
    try {
      await fx.page.evaluate(() => window.__worldVisualQa.loadWscFixture());
      const clearLight = CAMERAS.lightingConditions.clear;
      for (const locId of ['B16', 'B17']) {
        const loc = CAMERAS.locations[locId];
        const pose = loc.cameras.C01;
        const settle = await prepareAndSettleTerrain(fx.page, pose, clearLight, 5000);
        const sceneId = `${locId}-C01-clear`;
        console.log(`[WSC-PR4] ${sceneId} settled: loaded=${settle.loaded} baked=${settle.baked}`);
        const d00Path = tmpFile(`${sceneId}-D00.png`);
        const d01Path = tmpFile(`${sceneId}-D01.png`);
        const d24Path = tmpFile(`${sceneId}-D24.png`);
        const d00 = await captureModePng(fx.page, 'D00', d00Path);
        const d01 = await captureModePng(fx.page, 'D01', d01Path);
        const d24 = await captureModePng(fx.page, 'D24', d24Path);
        manifest.captures.push({ id: sceneId, world: 'fixture', pose, lighting: clearLight, settle });

        const rockMask = buildFamilyMask({ ...d24, family: 'rock' });
        const terMask = buildFamilyMask({ ...d24, family: 'terrain' });
        const d00Rock = analyzeRegion({ ...d00, roi: LOWER_GROUND_ROI, mask: rockMask });
        const d00Ter = analyzeRegion({ ...d00, roi: LOWER_GROUND_ROI, mask: terMask });
        const d01Rock = analyzeRegion({ ...d01, roi: LOWER_GROUND_ROI, mask: rockMask });
        const d01Ter = analyzeRegion({ ...d01, roi: LOWER_GROUND_ROI, mask: terMask });
        const d00Diff = compareRegions(d00Rock, d00Ter, { kind: 'contact' });
        const d01Diff = compareRegions(d01Rock, d01Ter, { kind: 'contact' });
        metrics.contactComparisons.push({
          sceneId,
          family: 'rock',
          d00Lit: { family: d00Rock, terrain: d00Ter, comparison: d00Diff },
          d01Unlit: { family: d01Rock, terrain: d01Ter, comparison: d01Diff },
        });
        panels.push(
          { imagePath: d00Path, label: `${loc.name} (${locId}) · D00 (rock ΔE=${d00Diff.deltaE00})` },
          { imagePath: d01Path, label: `${loc.name} (${locId}) · D01 (rock ΔE=${d01Diff.deltaE00})` },
        );
      }
    } finally {
      await fx.context.close();
    }

    const sheetPath = path.join(OUT_ROOT, 'pr4-contact-sheet.jpg');
    await buildTiledSheet({
      panels,
      columns: 2,
      tileW: 640,
      tileH: 360,
      title: 'WSC PR 4 — Generic Contact Material Blending (Trunks, Understories, Logs/Debris & Rocks)',
      outPath: sheetPath,
    });
    const metricsPath = path.join(OUT_ROOT, 'metrics.json');
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
    for (const f of [sheetPath, metricsPath]) {
      const info = await sha256File(f);
      manifest.artifacts.push({ file: path.relative(OUT_ROOT, f).replaceAll('\\', '/'), ...info });
    }
    const manifestPath = path.join(OUT_ROOT, 'capture-manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    console.log('\n=== WSC PR 4 Contact Comparisons ===');
    for (const c of metrics.contactComparisons) {
      console.log(
        `${c.sceneId} (${c.family}): D00 ΔE=${c.d00Lit.comparison.deltaE00} (${c.d00Lit.comparison.lumaDiffPct}%) | D01 ΔE=${c.d01Unlit.comparison.deltaE00} (${c.d01Unlit.comparison.lumaDiffPct}%)`,
      );
    }
    if (metrics.identityPreservation.length > 0) {
      console.log('=== WSC PR 4 Identity Preservation ===', JSON.stringify(metrics.identityPreservation));
    }
    console.log(`Artifacts written to ${OUT_ROOT}`);
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
