import { chromium } from 'playwright';
import sharp from 'sharp';
import yaml from 'js-yaml';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { captureVisualSource } from './lib/world-visual-source.mjs';
import {
  analyzeRegion,
  buildFamilyMask,
  compareRegions,
} from './lib/wsc-color-metrics.mjs';
import { buildContactSheet } from './lib/wsc-contact-sheets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outRoot = path.resolve(root, 'docs/qa/world-surface-context/pr-00');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:5181' },
    groups: { type: 'string', default: 'stillmeadow,biomes,lighting,lod,fixture,streaming' },
    'skip-sheets': { type: 'boolean', default: false },
    resume: { type: 'boolean', default: false },
    'metrics-only': { type: 'boolean', default: false },
  },
});

const camerasConfig = yaml.load(await readFile(path.join(outRoot, 'cameras.yaml'), 'utf8'));
const diagConfig = yaml.load(await readFile(path.join(root, 'config/wsc-diagnostics.yaml'), 'utf8'));
const viewport = camerasConfig.viewport ?? { width: 1920, height: 1080 };
const requestedGroups = new Set(args.groups.split(',').map((s) => s.trim()).filter(Boolean));

const manifestPath = path.join(outRoot, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  manifest = {
    schemaVersion: 1,
    pr: 'PR-00',
    startedAt: new Date().toISOString(),
    viewport,
    source: null,
    adapter: null,
    screenshots: [],
    streamingTests: [],
    diagnosticOverhead: null,
  };
}

async function saveManifest() {
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function upsertEntry(entry) {
  const idx = manifest.screenshots.findIndex((item) => item.id === entry.id);
  if (idx >= 0) manifest.screenshots[idx] = entry;
  else manifest.screenshots.push(entry);
}

async function openFreshPage(browser, url) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const monitor = createBrowserErrorMonitor(page);
  page.on('pageerror', (err) => console.error('[PR0][pageerror]', err.message));
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 120000 });
  const adapter = await page.evaluate(async () => {
    const gpu = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
    return {
      vendor: gpu?.info?.vendor ?? '',
      architecture: gpu?.info?.architecture ?? '',
      description: gpu?.info?.description ?? '',
      fallback: !!(gpu?.info?.isFallbackAdapter ?? gpu?.isFallbackAdapter),
      backend: window.__editor.terrainView.rendererBackendStatus.mode,
    };
  });
  if (adapter.backend !== 'webgpu' || adapter.fallback) {
    throw new Error(`Hardware WebGPU required, got ${JSON.stringify(adapter)}`);
  }
  manifest.adapter = adapter;
  return { context, page, monitor };
}

async function stampDiagnosticBadge(pngPath, modeId) {
  const info = diagConfig.modes?.[modeId];
  if (!info || modeId === 'D00') return;
  const meta = await sharp(pngPath).metadata();
  const badgeW = meta.width ?? viewport.width;
  const label = `${modeId} · ${info.label} | ${info.legend}`;
  const safe = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const svg = Buffer.from(`<svg width="${badgeW}" height="34">
    <rect x="0" y="0" width="${badgeW}" height="34" fill="rgba(12,16,22,0.84)"/>
    <text x="14" y="23" fill="#f3f7fb" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600">${safe}</text>
  </svg>`);
  const tmp = await sharp(pngPath).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
  await writeFile(pngPath, tmp);
}

const preparedPoseByPage = new WeakMap();

async function captureShot(page, {
  id,
  relDir,
  cameraId,
  locationId,
  pose,
  conditionName = 'clear',
  lighting = { weather: 'off', hour: 12 },
  modeId = 'D00',
  lossless = false,
  layers = null,
  prepare = true,
  skipAutoPrepare = false,
  minimumMs = 5500,
  notes = '',
}) {
  const modeInfo = diagConfig.modes?.[modeId] ?? { slug: modeId.toLowerCase(), label: modeId };
  const ext = lossless ? 'png' : 'jpg';
  const fileName = `${id}.${ext}`;
  const relPath = path.posix.join(relDir.replaceAll('\\', '/'), fileName);
  const fullPath = path.join(outRoot, relDir, fileName);
  if (args.resume) {
    const existing = manifest.screenshots.find((s) => s.id === id);
    if (existing) {
      try {
        await access(fullPath);
        console.log(`[PR0] Resume-skip ${relPath}`);
        return { fullPath, entry: existing };
      } catch {
        // Missing on disk — capture fresh.
      }
    }
  }
  await mkdir(path.dirname(fullPath), { recursive: true });

  const poseKey = `${locationId}:${cameraId}`;
  const needsPrepare = prepare || (!skipAutoPrepare && preparedPoseByPage.get(page) !== poseKey);
  if (needsPrepare) {
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
    preparedPoseByPage.set(page, poseKey);
  } else {
    await page.evaluate((l) => window.__worldVisualQa.setLighting(l), lighting);
  }

  await page.evaluate(({ mode, layerFlags }) => {
    const qa = window.__worldVisualQa;
    qa.setCaptureUi(true);
    qa.setAvatarVisible(false);
    if (layerFlags) qa.setLayers(layerFlags);
    else qa.layers.restore();
    qa.setDiagnosticMode(mode);
  }, { mode: modeId, layerFlags: layers });

  await page.waitForTimeout(modeId === 'D00' ? 900 : 700);
  // Render a few animation frames so mode swap & uniforms settle.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));

  const meta = await page.evaluate(() => {
    const qa = window.__worldVisualQa;
    const d = qa.diagnostics();
    const gc = qa.sampleGroundContactField(d.canonical.x, d.canonical.z);
    return {
      canonical: d.canonical,
      origin: d.origin,
      camera: d.camera,
      yaw: d.yaw,
      pitch: d.pitch,
      actualBiomeId: d.actualBiomeId,
      readiness: d.readiness.ready,
      assetIntegrityReady: d.assetIntegrity?.ready ?? false,
      backend: d.backend,
      renderPath: d.renderPath,
      clock: d.clock,
      weather: d.weather,
      groundContactSample: gc,
      renderStats: qa.renderStats(),
    };
  });

  const tmpPng = lossless ? fullPath : `${fullPath}.tmp.png`;
  await captureWorldCanvas(page, tmpPng);
  // Keep raw unbadged copy for D24 pixel masking; badge diagnostic visual outputs except D24.
  if (modeId !== 'D00' && modeId !== 'D24') {
    await stampDiagnosticBadge(tmpPng, modeId);
  }
  if (!lossless) {
    await sharp(tmpPng).jpeg({ quality: 88, mozjpeg: true }).toFile(fullPath);
    const { unlink } = await import('node:fs/promises');
    await unlink(tmpPng);
  }

  const entry = {
    id,
    relativePath: relPath,
    locationId,
    cameraId,
    worldPosition: meta.canonical,
    origin: meta.origin,
    biomeId: meta.actualBiomeId,
    condition: conditionName,
    weather: lighting.weather ?? 'off',
    hour: lighting.hour ?? 12,
    diagnosticMode: modeId,
    diagnosticSlug: modeInfo.slug,
    layers: layers ?? 'all',
    backend: meta.backend,
    renderPath: meta.renderPath,
    viewport,
    sourceCommit: manifest.source?.sourceSha ?? manifest.source?.commit ?? null,
    capturedAt: new Date().toISOString(),
    streamingReady: meta.readiness,
    assetIntegrityReady: meta.assetIntegrityReady,
    groundContactSample: meta.groundContactSample,
    renderStats: meta.renderStats,
    notes,
  };
  upsertEntry(entry);
  await saveManifest();
  console.log(`[PR0] Captured ${relPath} (biome=${meta.actualBiomeId}, ready=${meta.readiness}, gcMissing=${meta.groundContactSample.isMissingFallback})`);
  return { fullPath, entry };
}

async function runStillmeadowGroup(browser) {
  console.log('=== Group: Stillmeadow (B14) + B18 + B10/B11/B12 Eldara ===');
  const { context, page } = await openFreshPage(browser, args.url);
  try {
    const approach = await page.evaluate(() => window.__worldVisualQa.loadStillmeadow(18));
    const baseX = approach.settlementFixture.canonicalX;
    const baseZ = approach.settlementFixture.canonicalZ;
    const baseYaw = (approach.yawDegrees * Math.PI) / 180;
    const dirX = -Math.sin(baseYaw);
    const dirZ = -Math.cos(baseYaw);

    const stillCams = camerasConfig.locations.B14.cameras;
    for (const [camId, spec] of Object.entries(stillCams)) {
      const dist = spec.offsetForward ?? 0;
      const pose = {
        x: baseX + dirX * dist,
        z: baseZ + dirZ * dist,
        yaw: baseYaw + (spec.yawOffset ?? 0),
        pitch: spec.pitch,
        mode: spec.mode,
        heightAboveGround: spec.heightAboveGround,
        fov: spec.fov,
      };
      const relDir = `stillmeadow/${spec.subfolder}`;
      // Hero C01/C02/C03 captured under overcast (matching Stillmeadow screenshot) + clear + core diagnostics.
      const isHero = ['C01', 'C02', 'C03'].includes(camId);
      const cond = isHero ? 'overcast' : 'clear';
      const light = camerasConfig.lightingConditions[cond];
      await captureShot(page, {
        id: `B14-${camId}-${cond}-D00-normal`,
        relDir, cameraId: camId, locationId: 'B14', pose, conditionName: cond, lighting: light,
        modeId: 'D00', lossless: isHero, prepare: true, minimumMs: 6500, notes: spec.label,
      });
      if (isHero) {
        await captureShot(page, {
          id: `B14-${camId}-clear-D00-normal`,
          relDir, cameraId: camId, locationId: 'B14', pose, conditionName: 'clear',
          lighting: camerasConfig.lightingConditions.clear, modeId: 'D00', lossless: false, prepare: false,
        });
        const diagList = camId === 'C01'
          ? ['D01', 'D05', 'D08', 'D09', 'D11', 'D12', 'D15', 'D18', 'D20', 'D24', 'D25']
          : camId === 'C02'
            ? ['D01', 'D02', 'D08', 'D11', 'D12', 'D13', 'D18', 'D24']
            : ['D01', 'D05', 'D06', 'D08', 'D12', 'D13', 'D14', 'D24'];
        for (const modeId of diagList) {
          const slug = diagConfig.modes[modeId].slug;
          await captureShot(page, {
            id: `B14-${camId}-${cond}-${modeId}-${slug}`,
            relDir, cameraId: camId, locationId: 'B14', pose, conditionName: cond, lighting: light,
            modeId, lossless: ['D01', 'D12', 'D24'].includes(modeId), prepare: false,
          });
        }
      } else {
        // C04/C05/C06: also capture D01 & D12 & D24 for road/foundation/understory analysis.
        for (const modeId of ['D01', 'D12', 'D24']) {
          const slug = diagConfig.modes[modeId].slug;
          await captureShot(page, {
            id: `B14-${camId}-${cond}-${modeId}-${slug}`,
            relDir, cameraId: camId, locationId: 'B14', pose, conditionName: cond, lighting: light,
            modeId, lossless: modeId === 'D24', prepare: false,
          });
        }
      }
    }

    // Lighting sweep on Stillmeadow C01 (sunrise, sunset, night, rain).
    const c01Pose = { x: baseX, z: baseZ, yaw: baseYaw, pitch: -0.06, mode: 'player', heightAboveGround: 1.7, fov: 68 };
    for (const cond of ['sunrise', 'sunset', 'night', 'rain']) {
      await captureShot(page, {
        id: `B14-C01-${cond}-D00-normal`,
        relDir: 'stillmeadow/forest-approach', cameraId: 'C01', locationId: 'B14',
        pose: c01Pose, conditionName: cond, lighting: camerasConfig.lightingConditions[cond],
        modeId: 'D00', lossless: false, prepare: true, minimumMs: 3500,
      });
    }

    // Eldara biomes: B10 Tundra, B11 Alpine Snow, B12 Rocky Mountain, B18 Settlement-to-terrain.
    for (const locId of ['B10', 'B11', 'B12', 'B18']) {
      const loc = camerasConfig.locations[locId];
      for (const [camId, pose] of Object.entries(loc.cameras)) {
        await captureShot(page, {
          id: `${locId}-${camId}-clear-D00-normal`,
          relDir: loc.folder, cameraId: camId, locationId: locId, pose, conditionName: 'clear',
          lighting: camerasConfig.lightingConditions.clear, modeId: 'D00', lossless: camId === 'C01' && locId === 'B10',
          prepare: true, minimumMs: 6500, notes: pose.label,
        });
        if (camId === 'C01') {
          for (const modeId of ['D01', 'D12', 'D23', 'D24']) {
            if (modeId === 'D23' && locId === 'B18') continue;
            const slug = diagConfig.modes[modeId].slug;
            await captureShot(page, {
              id: `${locId}-${camId}-clear-${modeId}-${slug}`,
              relDir: loc.folder, cameraId: camId, locationId: locId, pose, conditionName: 'clear',
              lighting: camerasConfig.lightingConditions.clear, modeId, lossless: modeId === 'D24', prepare: false,
            });
          }
        }
      }
    }
  } finally {
    await context.close();
  }
}

async function runBiomesGroup(browser) {
  console.log('=== Group: Procedural Biomes (B01–B09, B13, B15) ===');
  const batches = [
    ['B01', 'B02', 'B03', 'B04'],
    ['B05', 'B06', 'B07', 'B08'],
    ['B09', 'B13', 'B15'],
  ];
  for (const batch of batches) {
    const { context, page } = await openFreshPage(browser, args.url);
    try {
      for (const locId of batch) {
        const loc = camerasConfig.locations[locId];
        let resolvedCenter = null;
        if (loc.findBiome) {
          resolvedCenter = await page.evaluate((tileId) => window.__worldVisualQa.findBiomeSurfacePose(tileId), loc.tileId);
        }
        for (const [camId, rawCam] of Object.entries(loc.cameras)) {
          let pose = { ...rawCam };
          if (resolvedCenter) {
            pose.x = resolvedCenter.x;
            pose.z = resolvedCenter.z;
          }
          if (loc.canopy && camId === 'C01') {
            await prepareVisualPose(page, { ...pose, mode: 'player', heightAboveGround: 1.7 }, { minimumMs: 5000 });
            const found = await page.evaluate((p) => window.__worldVisualQa.findCanopyPose(p), { ...pose, tileId: loc.tileId, canopy: true });
            if (found) {
              resolvedCenter = found;
              pose = { ...pose, ...found };
            }
          } else if (loc.canopy && resolvedCenter) {
            pose = { ...pose, x: resolvedCenter.x, z: resolvedCenter.z };
          }
          const isLossless = ['B01', 'B02', 'B03', 'B04', 'B15'].includes(locId) && camId === 'C02';
          await captureShot(page, {
            id: `${locId}-${camId}-clear-D00-normal`,
            relDir: loc.folder, cameraId: camId, locationId: locId, pose, conditionName: 'clear',
            lighting: camerasConfig.lightingConditions.clear, modeId: 'D00', lossless: isLossless,
            prepare: true, minimumMs: 6000, notes: rawCam.label,
          });
          // Capture D01, D08, D12, D24 on ground-contact shots for quantitative ΔE00 comparison!
          if ((camId === 'C02' && ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B08', 'B15'].includes(locId))
            || (camId === 'C01' && ['B07', 'B09', 'B13'].includes(locId))) {
            const modes = ['B01', 'B02', 'B03'].includes(locId)
              ? ['D01', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D12', 'D13', 'D18', 'D24']
              : ['D01', 'D08', 'D12', 'D24'];
            for (const modeId of modes) {
              const slug = diagConfig.modes[modeId].slug;
              await captureShot(page, {
                id: `${locId}-${camId}-clear-${modeId}-${slug}`,
                relDir: loc.folder, cameraId: camId, locationId: locId, pose, conditionName: 'clear',
                lighting: camerasConfig.lightingConditions.clear, modeId,
                lossless: ['D01', 'D12', 'D24'].includes(modeId), prepare: false,
              });
            }
          }
        }
      }
    } finally {
      await context.close();
    }
  }
}

async function runLightingGroup(browser) {
  console.log('=== Group: Lighting Sweeps (B01, B02, B03) ===');
  const { context, page } = await openFreshPage(browser, args.url);
  try {
    for (const locId of ['B01', 'B02']) {
      const loc = camerasConfig.locations[locId];
      const pose = { ...loc.cameras.C01 };
      for (const cond of ['sunrise', 'overcast', 'sunset', 'night', 'rain']) {
        await captureShot(page, {
          id: `${locId}-C01-${cond}-D00-normal`,
          relDir: loc.folder, cameraId: 'C01', locationId: locId, pose, conditionName: cond,
          lighting: camerasConfig.lightingConditions[cond], modeId: 'D00', lossless: false,
          prepare: cond === 'sunrise', minimumMs: 4500,
        });
      }
    }
  } finally {
    await context.close();
  }
}

async function runLodGroup(browser) {
  console.log('=== Group: LOD Continuity Sweeps ===');
  const { context, page } = await openFreshPage(browser, args.url);
  try {
    const sweep = camerasConfig.lodSweeps.grassAndWoodland;
    const base = sweep.basePose;
    const backX = Math.sin(base.yaw);
    const backZ = Math.cos(base.yaw);
    for (const dist of sweep.distancesMeters) {
      const pose = {
        ...base,
        x: base.x + backX * dist,
        z: base.z + backZ * dist,
        heightAboveGround: dist > 60 ? 6 : 1.7,
        mode: dist > 60 ? 'fly' : 'player',
      };
      await captureShot(page, {
        id: `LOD-G01-d${String(dist).padStart(3, '0')}m-D00-normal`,
        relDir: 'fixtures/lod', cameraId: `d${dist}m`, locationId: 'LOD', pose,
        conditionName: 'clear', lighting: camerasConfig.lightingConditions.clear,
        modeId: 'D00', lossless: true, prepare: true, minimumMs: 5500, notes: `Distance ${dist}m from reference patch`,
      });
      await captureShot(page, {
        id: `LOD-G01-d${String(dist).padStart(3, '0')}m-D20-lod`,
        relDir: 'fixtures/lod', cameraId: `d${dist}m`, locationId: 'LOD', pose,
        conditionName: 'clear', lighting: camerasConfig.lightingConditions.clear,
        modeId: 'D20', lossless: false, prepare: false,
      });
    }
  } finally {
    await context.close();
  }
}

async function runFixtureGroup(browser) {
  console.log('=== Group: Standardized Environment Fixture + Object Isolation ===');
  const { context, page } = await openFreshPage(browser, args.url);
  try {
    const { cameras } = await page.evaluate(() => window.__worldVisualQa.loadWscFixture());
    // Capture all 4 standardized fixture cameras.
    for (const [key, pose] of Object.entries(cameras)) {
      await captureShot(page, {
        id: `${pose.id}-clear-D00-normal`,
        relDir: 'fixtures/normal', cameraId: pose.id, locationId: 'FIXTURE', pose,
        conditionName: 'clear', lighting: camerasConfig.lightingConditions.clear,
        modeId: 'D00', lossless: key === 'quadJunction', prepare: true, minimumMs: 6500,
      });
    }
    // B16 (grass-to-sand) and B17 (snow-to-rock) transitions from standardized fixture!
    for (const locId of ['B16', 'B17']) {
      const loc = camerasConfig.locations[locId];
      const pose = loc.cameras.C01;
      await captureShot(page, {
        id: `${locId}-C01-clear-D00-normal`,
        relDir: loc.folder, cameraId: 'C01', locationId: locId, pose, conditionName: 'clear',
        lighting: camerasConfig.lightingConditions.clear, modeId: 'D00', lossless: true, prepare: true, minimumMs: 5000,
      });
      for (const modeId of ['D01', 'D12', 'D23', 'D24']) {
        const slug = diagConfig.modes[modeId].slug;
        await captureShot(page, {
          id: `${locId}-C01-clear-${modeId}-${slug}`,
          relDir: loc.folder, cameraId: 'C01', locationId: locId, pose, conditionName: 'clear',
          lighting: camerasConfig.lightingConditions.clear, modeId, lossless: modeId === 'D24', prepare: false,
        });
      }
    }

    // Object isolation & lighting isolation on quadJunction (Section 9.4).
    const isoPose = cameras.quadJunction;
    await page.evaluate(() => {
      window.__worldVisualQa.setDiagnosticMode('D00');
      window.__worldVisualQa.layers.restore();
    });
    await prepareVisualPose(page, isoPose, { minimumMs: 5500 });
    preparedPoseByPage.set(page, `FIXTURE:${isoPose.id}`);
    const isolationPlans = [
      { id: 'FX-ISO-no-grass', layers: { grass: false }, modeId: 'D00', relDir: 'fixtures/normal' },
      { id: 'FX-ISO-no-trees', layers: { trees: false }, modeId: 'D00', relDir: 'fixtures/normal' },
      { id: 'FX-ISO-no-understory', layers: { bushes: false, details: false, flowers: false }, modeId: 'D00', relDir: 'fixtures/normal' },
      { id: 'FX-ISO-D01-albedo', layers: null, modeId: 'D01', relDir: 'fixtures/diagnostics' },
      { id: 'FX-ISO-D08-contact-ao', layers: null, modeId: 'D08', relDir: 'fixtures/diagnostics' },
      { id: 'FX-ISO-D16-direct', layers: null, modeId: 'D16', relDir: 'fixtures/lighting' },
      { id: 'FX-ISO-D17-indirect', layers: null, modeId: 'D17', relDir: 'fixtures/lighting' },
      { id: 'FX-ISO-D18-emissive', layers: null, modeId: 'D18', relDir: 'fixtures/lighting' },
      { id: 'FX-ISO-D19-shadow', layers: null, modeId: 'D19', relDir: 'fixtures/lighting' },
      { id: 'FX-ISO-D22-moss', layers: null, modeId: 'D22', relDir: 'fixtures/diagnostics' },
      { id: 'FX-ISO-D21-wetness', layers: null, modeId: 'D21', relDir: 'fixtures/diagnostics' },
    ];
    for (const plan of isolationPlans) {
      await captureShot(page, {
        id: plan.id, relDir: plan.relDir, cameraId: isoPose.id, locationId: 'FIXTURE', pose: isoPose,
        conditionName: 'clear', lighting: camerasConfig.lightingConditions.clear,
        modeId: plan.modeId, layers: plan.layers, lossless: false, prepare: false,
      });
    }

    // Measure diagnostic mode switch & frame-time overhead on the fixture!
    const diagOverhead = await page.evaluate(async () => {
      const qa = window.__worldVisualQa;
      const measureFrames = async (count = 30) => {
        const dts = [];
        let last = performance.now();
        for (let i = 0; i < count; i += 1) {
          await new Promise((r) => requestAnimationFrame(r));
          const now = performance.now();
          dts.push(now - last);
          last = now;
        }
        dts.sort((a, b) => a - b);
        return {
          p50Ms: Number(dts[Math.floor(dts.length * 0.5)].toFixed(2)),
          p95Ms: Number(dts[Math.floor(dts.length * 0.95)].toFixed(2)),
          avgFps: Number((1000 / (dts.reduce((s, v) => s + v, 0) / dts.length)).toFixed(1)),
        };
      };
      qa.setDiagnosticMode('D00');
      await measureFrames(10);
      const normal = await measureFrames(30);
      const t0 = performance.now();
      qa.setDiagnosticMode('D01');
      const d01SwitchMs = Number((performance.now() - t0).toFixed(2));
      await measureFrames(5);
      const d01 = await measureFrames(30);
      qa.setDiagnosticMode('D00');
      return { normal, d01, d01SwitchMs };
    });
    manifest.diagnosticOverhead = diagOverhead;
    await saveManifest();
  } finally {
    await context.close();
  }
}

async function runStreamingGroup(browser) {
  console.log('=== Group: Streaming, Chunk Boundaries, Teleportation & Floating Origin ===');
  const { context, page } = await openFreshPage(browser, args.url);
  try {
    // 1. Chunk boundary at canonical x = 0 (between chunks -1 and 0).
    const chunkPose = { x: 0, z: -4000, yaw: 0.0, pitch: -0.22, mode: 'player', heightAboveGround: 1.7, fov: 68 };
    await captureShot(page, {
      id: 'STR-CB01-clear-D00-normal', relDir: 'streaming/chunk-boundaries', cameraId: 'CB01',
      locationId: 'STREAMING', pose: chunkPose, modeId: 'D00', lossless: true, prepare: true, minimumMs: 6000,
    });
    await captureShot(page, {
      id: 'STR-CB01-clear-D25-chunk-boundaries', relDir: 'streaming/chunk-boundaries', cameraId: 'CB01',
      locationId: 'STREAMING', pose: chunkPose, modeId: 'D25', lossless: false, prepare: false,
    });

    // 2. GroundContactField recentering: shift 20m (>16m hysteresis threshold) and capture before/after D15.
    const recenterA = { x: -1869, z: -4003, yaw: 2.488, pitch: -0.20, mode: 'player', heightAboveGround: 1.7, fov: 68 };
    const recenterB = { x: -1849, z: -4003, yaw: 2.488, pitch: -0.20, mode: 'player', heightAboveGround: 1.7, fov: 68 };
    await captureShot(page, {
      id: 'STR-RC01-before-D15-gc-validity', relDir: 'streaming/field-recentering', cameraId: 'RC01',
      locationId: 'STREAMING', pose: recenterA, modeId: 'D15', lossless: false, prepare: true, minimumMs: 5500,
    });
    await captureShot(page, {
      id: 'STR-RC02-after-D15-gc-validity', relDir: 'streaming/field-recentering', cameraId: 'RC02',
      locationId: 'STREAMING', pose: recenterB, modeId: 'D15', lossless: false, prepare: true, minimumMs: 4500,
    });

    // 3. Teleportation: capture IMMEDIATELY after cut (unsettled!) vs after streaming settles (D00 + D15)!
    const tpPose = { x: 10119, z: 5719, yaw: 0.785, pitch: -0.16, mode: 'player', heightAboveGround: 1.7, fov: 68 };
    await page.evaluate((p) => window.__worldVisualQa.cut(p), tpPose);
    await page.waitForTimeout(180);
    await captureShot(page, {
      id: 'STR-TP01-unsettled-D15-gc-validity', relDir: 'streaming/teleportation', cameraId: 'TP01',
      locationId: 'STREAMING', pose: tpPose, modeId: 'D15', lossless: false, prepare: false, skipAutoPrepare: true,
      notes: 'Captured 180ms after teleport before terrain slots finish streaming',
    });
    await captureShot(page, {
      id: 'STR-TP02-settled-D15-gc-validity', relDir: 'streaming/teleportation', cameraId: 'TP02',
      locationId: 'STREAMING', pose: tpPose, modeId: 'D15', lossless: false, prepare: true, minimumMs: 6500,
      notes: 'Same pose after streaming settled',
    });

    // 4. Floating-origin rebasing & large negative canonical coordinates.
    const foPose = { x: -1869, z: -4003, yaw: 2.488, pitch: -0.22, mode: 'player', heightAboveGround: 1.7, fov: 68 };
    const beforeFo = await captureShot(page, {
      id: 'STR-FO01-before-rebase-D00-normal', relDir: 'streaming/floating-origin', cameraId: 'FO01',
      locationId: 'STREAMING', pose: foPose, modeId: 'D00', lossless: true, prepare: true, minimumMs: 5500,
    });
    // Jump far away (>4096m) to force a floating-origin rebase, then return to the exact same canonical pose!
    await page.evaluate(() => window.__worldVisualQa.cut({ x: -12000, z: 12000, yaw: 0, pitch: -0.1, mode: 'player' }));
    await page.waitForTimeout(800);
    const afterFo = await captureShot(page, {
      id: 'STR-FO02-after-rebase-D00-normal', relDir: 'streaming/floating-origin', cameraId: 'FO02',
      locationId: 'STREAMING', pose: foPose, modeId: 'D00', lossless: true, prepare: true, minimumMs: 6500,
    });
    manifest.streamingTests.push({
      test: 'floating-origin-roundtrip',
      beforeOrigin: beforeFo.entry.origin,
      afterOrigin: afterFo.entry.origin,
      beforeFile: beforeFo.entry.relativePath,
      afterFile: afterFo.entry.relativePath,
    });
    await saveManifest();
  } finally {
    await context.close();
  }
}

async function computeMetricsAndGalleries() {
  console.log('=== Computing Quantitative Color Metrics & Review Galleries ===');
  const findShot = (id) => {
    const found = manifest.screenshots.find((s) => s.id === id);
    return found ? path.join(outRoot, found.relativePath) : null;
  };
  const loadRaw = async (filePath) => {
    const { data, info } = await sharp(filePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels };
  };

  const measurements = {
    generatedAt: new Date().toISOString(),
    thresholds: {
      contactInvestigateDeltaE00: 5,
      contactMajorDeltaE00: 10,
      lodLuminanceDiffPct: 10,
      chunkBoundaryLuminanceDiffPct: 5,
      floatingOriginDeltaE00: 1.0,
    },
    comparisons: [],
  };

  // Helper to compare two material families inside a single D00/D01 shot using its companion D24 family mask!
  const compareFamiliesInShot = async ({ label, colorShotId, d24ShotId, familyA, familyB, roi = { x0: 0.05, y0: 0.42, x1: 0.95, y1: 0.96 }, kind = 'contact' }) => {
    const colorPath = findShot(colorShotId);
    const maskPath = findShot(d24ShotId);
    if (!colorPath || !maskPath) return;
    const img = await loadRaw(colorPath);
    const maskImg = await loadRaw(maskPath);
    const maskA = buildFamilyMask({ ...maskImg, family: familyA });
    const maskB = buildFamilyMask({ ...maskImg, family: familyB });
    const regA = analyzeRegion({ ...img, roi, mask: maskA });
    const regB = analyzeRegion({ ...img, roi, mask: maskB });
    if (regA.count < 80 || regB.count < 80) return;
    const diff = compareRegions(regA, regB, { kind });
    measurements.comparisons.push({
      label, colorShotId, d24ShotId, familyA, familyB, kind,
      regionA: regA, regionB: regB, comparison: diff,
    });
  };

  // Key PR 0 comparisons across Stillmeadow (B14), Grassland (B01), Deciduous (B02), Rainforest (B03, B04)!
  await compareFamiliesInShot({
    label: 'Stillmeadow C02 (overcast D00): Near grass vs adjacent terrain',
    colorShotId: 'B14-C02-overcast-D00-normal', d24ShotId: 'B14-C02-overcast-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Stillmeadow C02 (unlit D01): Near grass albedo vs terrain albedo',
    colorShotId: 'B14-C02-overcast-D01-albedo', d24ShotId: 'B14-C02-overcast-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Stillmeadow C01 (overcast D00): Near grass vs terrain',
    colorShotId: 'B14-C01-overcast-D00-normal', d24ShotId: 'B14-C01-overcast-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Stillmeadow C01 (unlit D01): Near grass albedo vs terrain albedo',
    colorShotId: 'B14-C01-overcast-D01-albedo', d24ShotId: 'B14-C01-overcast-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Stillmeadow C01 (overcast D00): Tree bark vs terrain',
    colorShotId: 'B14-C01-overcast-D00-normal', d24ShotId: 'B14-C01-overcast-D24-material-family',
    familyA: 'treeBark', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Stillmeadow C03 (overcast D00): Tree bark base vs nearby terrain',
    colorShotId: 'B14-C03-overcast-D00-normal', d24ShotId: 'B14-C03-overcast-D24-material-family',
    familyA: 'treeBark', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Stillmeadow C03 (unlit D01): Tree bark albedo vs nearby terrain albedo',
    colorShotId: 'B14-C03-overcast-D01-albedo', d24ShotId: 'B14-C03-overcast-D24-material-family',
    familyA: 'treeBark', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Stillmeadow C04 (clear D00): Shrub understory vs terrain',
    colorShotId: 'B14-C04-clear-D00-normal', d24ShotId: 'B14-C04-clear-D24-material-family',
    familyA: 'shrub', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Stillmeadow C06 (clear D00): Building foundation vs paving/terrain',
    colorShotId: 'B14-C06-clear-D00-normal', d24ShotId: 'B14-C06-clear-D24-material-family',
    familyA: 'building', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Grassland B01 C02 (clear D00): Near grass vs terrain',
    colorShotId: 'B01-C02-clear-D00-normal', d24ShotId: 'B01-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Grassland B01 C02 (unlit D01): Near grass albedo vs terrain albedo',
    colorShotId: 'B01-C02-clear-D01-albedo', d24ShotId: 'B01-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Deciduous B02 C02 (clear D00): Near grass vs terrain',
    colorShotId: 'B02-C02-clear-D00-normal', d24ShotId: 'B02-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Deciduous B02 C02 (unlit D01): Near grass albedo vs terrain albedo',
    colorShotId: 'B02-C02-clear-D01-albedo', d24ShotId: 'B02-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Temperate Rainforest B03 C02 (clear D00): Near grass vs terrain',
    colorShotId: 'B03-C02-clear-D00-normal', d24ShotId: 'B03-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Temperate Rainforest B03 C02 (unlit D01): Near grass albedo vs terrain albedo',
    colorShotId: 'B03-C02-clear-D01-albedo', d24ShotId: 'B03-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Tropical Rainforest B04 C02 (clear D00): Near grass vs terrain',
    colorShotId: 'B04-C02-clear-D00-normal', d24ShotId: 'B04-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Tropical Rainforest B04 C02 (clear D00): Shrub understory vs terrain',
    colorShotId: 'B04-C02-clear-D00-normal', d24ShotId: 'B04-C02-clear-D24-material-family',
    familyA: 'shrub', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Taiga B05 C02 (clear D00): Near grass vs terrain',
    colorShotId: 'B05-C02-clear-D00-normal', d24ShotId: 'B05-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Wetland B06 C02 (clear D00): Near grass vs terrain',
    colorShotId: 'B06-C02-clear-D00-normal', d24ShotId: 'B06-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Desert B08 C02 (clear D00): Rock vs sand terrain',
    colorShotId: 'B08-C02-clear-D00-normal', d24ShotId: 'B08-C02-clear-D24-material-family',
    familyA: 'rock', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Tundra B10 C01 (clear D00): Rock vs snow terrain',
    colorShotId: 'B10-C01-clear-D00-normal', d24ShotId: 'B10-C01-clear-D24-material-family',
    familyA: 'rock', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'Woodland Edge B15 C02 (clear D00): Near grass vs terrain',
    colorShotId: 'B15-C02-clear-D00-normal', d24ShotId: 'B15-C02-clear-D24-material-family',
    familyA: 'nearGrass', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'B16 Fixture Grass-Sand (clear D00): Rock vs terrain',
    colorShotId: 'B16-C01-clear-D00-normal', d24ShotId: 'B16-C01-clear-D24-material-family',
    familyA: 'rock', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'B17 Fixture Snow-Rock (clear D00): Rock vs snow terrain',
    colorShotId: 'B17-C01-clear-D00-normal', d24ShotId: 'B17-C01-clear-D24-material-family',
    familyA: 'rock', familyB: 'terrain',
  });
  await compareFamiliesInShot({
    label: 'B18 Settlement Edge (clear D00): Building vs terrain',
    colorShotId: 'B18-C01-clear-D00-normal', d24ShotId: 'B18-C01-clear-D24-material-family',
    familyA: 'building', familyB: 'terrain',
  });

  // GroundContactField soilColor (D12) vs actual unlit terrain albedo (D01) on Stillmeadow & Grassland!
  for (const pair of [
    { label: 'Stillmeadow C02: GroundContactField soil (D12) vs actual terrain albedo (D01)', a: 'B14-C02-overcast-D12-substrate', b: 'B14-C02-overcast-D01-albedo', d24: 'B14-C02-overcast-D24-material-family' },
    { label: 'Grassland B01 C02: GroundContactField soil (D12) vs actual terrain albedo (D01)', a: 'B01-C02-clear-D12-substrate', b: 'B01-C02-clear-D01-albedo', d24: 'B01-C02-clear-D24-material-family' },
    { label: 'Temp. Rainforest B03 C02: GroundContactField soil (D12) vs actual terrain albedo (D01)', a: 'B03-C02-clear-D12-substrate', b: 'B03-C02-clear-D01-albedo', d24: 'B03-C02-clear-D24-material-family' },
  ]) {
    const pA = findShot(pair.a);
    const pB = findShot(pair.b);
    const pM = findShot(pair.d24);
    if (pA && pB && pM) {
      const imgA = await loadRaw(pA);
      const imgB = await loadRaw(pB);
      const imgM = await loadRaw(pM);
      const terrainMask = buildFamilyMask({ ...imgM, family: 'terrain' });
      const roi = { x0: 0.1, y0: 0.52, x1: 0.9, y1: 0.94 };
      const regA = analyzeRegion({ ...imgA, roi, mask: terrainMask });
      const regB = analyzeRegion({ ...imgB, roi, mask: terrainMask });
      if (regA.count > 80 && regB.count > 80) {
        measurements.comparisons.push({
          label: pair.label, shotA: pair.a, shotB: pair.b, kind: 'contact',
          regionA: regA, regionB: regB, comparison: compareRegions(regA, regB, { kind: 'contact' }),
        });
      }
    }
  }

  // LOD distance comparisons (d000m near blades vs d032m low blades vs d058m far cards vs d095m terrain cover).
  const lodPairs = [
    ['LOD-G01-d000m-D00-normal', 'LOD-G01-d032m-D00-normal', 'LOD Grass: 0m near blades vs 32m low blades'],
    ['LOD-G01-d000m-D00-normal', 'LOD-G01-d058m-D00-normal', 'LOD Grass: 0m near blades vs 58m far cards'],
    ['LOD-G01-d058m-D00-normal', 'LOD-G01-d095m-D00-normal', 'LOD Grass: 58m far cards vs 95m terrain groundCover'],
  ];
  for (const [idA, idB, label] of lodPairs) {
    const pA = findShot(idA);
    const pB = findShot(idB);
    if (pA && pB) {
      const roi = { x0: 0.2, y0: 0.60, x1: 0.8, y1: 0.92 };
      const regA = analyzeRegion({ ...(await loadRaw(pA)), roi });
      const regB = analyzeRegion({ ...(await loadRaw(pB)), roi });
      measurements.comparisons.push({
        label, shotA: idA, shotB: idB, kind: 'lod',
        regionA: regA, regionB: regB, comparison: compareRegions(regA, regB, { kind: 'lod' }),
      });
    }
  }

  // Chunk boundary left vs right comparison.
  const cbPath = findShot('STR-CB01-clear-D00-normal');
  if (cbPath) {
    const img = await loadRaw(cbPath);
    const leftReg = analyzeRegion({ ...img, roi: { x0: 0.32, y0: 0.62, x1: 0.48, y1: 0.88 } });
    const rightReg = analyzeRegion({ ...img, roi: { x0: 0.52, y0: 0.62, x1: 0.68, y1: 0.88 } });
    measurements.comparisons.push({
      label: 'Chunk boundary x=0: West chunk vs East chunk ground band',
      shotA: 'STR-CB01-clear-D00-normal (west)', shotB: 'STR-CB01-clear-D00-normal (east)', kind: 'chunk-boundary',
      regionA: leftReg, regionB: rightReg, comparison: compareRegions(leftReg, rightReg, { kind: 'chunk-boundary' }),
    });
  }

  // Floating-origin before vs after rebase comparison.
  const foA = findShot('STR-FO01-before-rebase-D00-normal');
  const foB = findShot('STR-FO02-after-rebase-D00-normal');
  if (foA && foB) {
    const roi = { x0: 0.15, y0: 0.55, x1: 0.85, y1: 0.92 };
    const regA = analyzeRegion({ ...(await loadRaw(foA)), roi });
    const regB = analyzeRegion({ ...(await loadRaw(foB)), roi });
    measurements.comparisons.push({
      label: 'Floating-origin roundtrip: Before rebase vs after >12 km rebase',
      shotA: 'STR-FO01-before-rebase-D00-normal', shotB: 'STR-FO02-after-rebase-D00-normal', kind: 'floating-origin',
      regionA: regA, regionB: regB, comparison: compareRegions(regA, regB, { kind: 'floating-origin' }),
    });
  }

  await mkdir(path.join(outRoot, 'metrics'), { recursive: true });
  await writeFile(path.join(outRoot, 'metrics/color-measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`);

  if (args['skip-sheets']) return;

  const tile = (id, label, extra = {}) => ({ path: findShot(id), label, ...extra });

  // Gallery E -> overview.jpg (Biome consistency across all tested biomes)
  await buildContactSheet({
    title: 'Gallery E — Biome Consistency Baseline (PR 0)',
    subtitle: `Production baseline (${(manifest.source?.sourceSha ?? manifest.source?.commit ?? 'main').slice(0, 8)}) · Hardware WebGPU 1920x1080`,
    columns: 4,
    outPath: path.join(outRoot, 'galleries/overview.jpg'),
    tiles: [
      tile('B01-C01-clear-D00-normal', 'B01 Grassland (tile 4)'),
      tile('B02-C01-clear-D00-normal', 'B02 Temperate Deciduous (tile 6)'),
      tile('B03-C01-clear-D00-normal', 'B03 Temperate Rainforest (tile 8)'),
      tile('B04-C01-clear-D00-normal', 'B04 Tropical Rainforest (tile 7)'),
      tile('B05-C01-clear-D00-normal', 'B05 Taiga (tile 9)'),
      tile('B06-C01-clear-D00-normal', 'B06 Wetland (tile 12)'),
      tile('B07-C01-clear-D00-normal', 'B07 Savanna (tile 3)'),
      tile('B08-C01-clear-D00-normal', 'B08 Hot Desert (tile 1)'),
      tile('B09-C01-clear-D00-normal', 'B09 Cold Steppe (tile 2)'),
      tile('B10-C01-clear-D00-normal', 'B10 Tundra (tile 10)'),
      tile('B11-C01-clear-D00-normal', 'B11 Alpine Snow'),
      tile('B12-C01-clear-D00-normal', 'B12 Rocky Mountain / Glacier'),
      tile('B13-C01-clear-D00-normal', 'B13 Coastline'),
      tile('B14-C01-overcast-D00-normal', 'B14 Stillmeadow (Eldara burg 18)'),
      tile('B15-C01-clear-D00-normal', 'B15 Forest-to-Grassland'),
      tile('B18-C01-clear-D00-normal', 'B18 Settlement-to-Terrain'),
    ],
  });

  // Gallery A -> grass-ground.jpg
  await buildContactSheet({
    title: 'Gallery A — Grass & Terrain Diagnostic Decomposition',
    subtitle: 'Stillmeadow (B14-C02) & Grassland (B01-C02): D00 Normal, D01 Unlit Albedo, D02 Source, D12 GC Soil, D11 Coverage, D08 Contact AO, D18 Emissive, D24 Family',
    columns: 4,
    outPath: path.join(outRoot, 'galleries/grass-ground.jpg'),
    tiles: [
      tile('B14-C02-overcast-D00-normal', 'Stillmeadow D00 Normal'),
      tile('B14-C02-overcast-D01-albedo', 'Stillmeadow D01 Unlit Albedo'),
      tile('B14-C02-overcast-D02-source-albedo', 'Stillmeadow D02 Source Albedo'),
      tile('B14-C02-overcast-D12-substrate', 'Stillmeadow D12 GC Soil Color'),
      tile('B14-C02-overcast-D11-vegetation-coverage', 'Stillmeadow D11 Veg Coverage'),
      tile('B14-C02-overcast-D08-contact-ao', 'Stillmeadow D08 Contact AO'),
      tile('B14-C02-overcast-D18-emissive', 'Stillmeadow D18 Emissive (2x)'),
      tile('B14-C02-overcast-D24-material-family', 'Stillmeadow D24 Material Family'),
      tile('B01-C02-clear-D00-normal', 'Grassland D00 Normal'),
      tile('B01-C02-clear-D01-albedo', 'Grassland D01 Unlit Albedo'),
      tile('B01-C02-clear-D12-substrate', 'Grassland D12 GC Soil Color'),
      tile('B01-C02-clear-D05-normals', 'Grassland D05 Surface Normals'),
    ],
  });

  // Gallery B -> tree-contact.jpg
  await buildContactSheet({
    title: 'Gallery B — Trees & Root Contact Baseline',
    subtitle: 'Stillmeadow, Deciduous, Temperate Rainforest, Taiga: root terminations, contact AO, height delta & normals',
    columns: 4,
    outPath: path.join(outRoot, 'galleries/tree-contact.jpg'),
    tiles: [
      tile('B14-C03-overcast-D00-normal', 'Stillmeadow C03 Trunk D00'),
      tile('B14-C03-overcast-D01-albedo', 'Stillmeadow C03 D01 Albedo'),
      tile('B14-C03-overcast-D12-substrate', 'Stillmeadow C03 D12 GC Soil'),
      tile('B14-C03-overcast-D13-gc-height', 'Stillmeadow C03 D13 Height Delta'),
      tile('B14-C03-overcast-D05-normals', 'Stillmeadow C03 D05 Normals'),
      tile('B14-C03-overcast-D08-contact-ao', 'Stillmeadow C03 D08 Contact AO'),
      tile('B02-C02-clear-D00-normal', 'Deciduous B02 Trunk & Floor'),
      tile('B05-C02-clear-D00-normal', 'Taiga B05 Conifer & Moss'),
    ],
  });

  // Gallery C -> understory-contact.jpg
  await buildContactSheet({
    title: 'Gallery C — Understories, Shrubs & Ground Plants',
    subtitle: 'Shrubs, ferns, and ground details across sunlit meadows and shaded woodland floors',
    columns: 4,
    outPath: path.join(outRoot, 'galleries/understory-contact.jpg'),
    tiles: [
      tile('B14-C04-clear-D00-normal', 'Stillmeadow C04 Understory D00'),
      tile('B14-C04-clear-D01-albedo', 'Stillmeadow C04 D01 Albedo'),
      tile('B04-C02-clear-D00-normal', 'Tropical Rainforest B04 Understory'),
      tile('B04-C02-clear-D01-albedo', 'Tropical Rainforest B04 D01 Albedo'),
      tile('B03-C02-clear-D00-normal', 'Temp. Rainforest B03 Floor'),
      tile('B06-C02-clear-D00-normal', 'Wetland B06 Sedge & Peat'),
      tile('FX-ISO-no-grass', 'Fixture: Grass Disabled'),
      tile('FX-ISO-no-understory', 'Fixture: Understory Disabled'),
    ],
  });

  // Gallery D -> rock-contact.jpg
  await buildContactSheet({
    title: 'Gallery D — Rocks, Cliffs & Structures Across Substrates',
    subtitle: 'Identical boulders on grass, sand, road soil, and snow; cliffs & settlement masonry',
    columns: 4,
    outPath: path.join(outRoot, 'galleries/rock-contact.jpg'),
    tiles: [
      tile('FX-C04-rocks-clear-D00-normal', 'Fixture Rocks Across Substrates'),
      tile('B08-C02-clear-D00-normal', 'Desert B08 Rock on Sand'),
      tile('B10-C02-clear-D00-normal', 'Tundra B10 Rock in Snow'),
      tile('B12-C01-clear-D00-normal', 'Alpine Crags & Glacier'),
      tile('B16-C01-clear-D00-normal', 'B16 Grass-Road-Sand Transition'),
      tile('B17-C01-clear-D00-normal', 'B17 Snow-Rock Mound'),
      tile('B14-C06-clear-D00-normal', 'Stillmeadow Foundations'),
      tile('B18-C01-clear-D00-normal', 'B18 Settlement Paving Edge'),
    ],
  });

  // Gallery F -> lighting-comparison.jpg
  await buildContactSheet({
    title: 'Gallery F — Lighting & Weather Consistency',
    subtitle: 'Identical cameras across Sunrise, Clear Noon, Overcast, Sunset, Night, Rain & Direct/Indirect Isolation',
    columns: 4,
    outPath: path.join(outRoot, 'galleries/lighting-comparison.jpg'),
    tiles: [
      tile('B14-C01-sunrise-D00-normal', 'Stillmeadow Sunrise (06:30)'),
      tile('B14-C01-clear-D00-normal', 'Stillmeadow Clear Noon (12:00)'),
      tile('B14-C01-overcast-D00-normal', 'Stillmeadow Overcast (12:00)'),
      tile('B14-C01-sunset-D00-normal', 'Stillmeadow Sunset (18:36)'),
      tile('B14-C01-night-D00-normal', 'Stillmeadow Night (21:00)'),
      tile('B14-C01-rain-D00-normal', 'Stillmeadow Rain (12:00)'),
      tile('FX-ISO-D16-direct', 'Fixture D16 Direct Light Only'),
      tile('FX-ISO-D17-indirect', 'Fixture D17 Indirect + Emissive Only'),
      tile('B01-C01-sunrise-D00-normal', 'Grassland Sunrise'),
      tile('B01-C01-clear-D00-normal', 'Grassland Clear Noon'),
      tile('B01-C01-sunset-D00-normal', 'Grassland Sunset'),
      tile('B01-C01-rain-D00-normal', 'Grassland Rain'),
    ],
  });

  // Gallery G -> lod-continuity.jpg
  await buildContactSheet({
    title: 'Gallery G — LOD Continuity Sweep (0 m → 145 m)',
    subtitle: 'Configured thresholds: blades 0–50 m, far cards 40–90 m, groundCover 30–120 m, trees near/impostor @ 128 m',
    columns: 4,
    outPath: path.join(outRoot, 'galleries/lod-continuity.jpg'),
    tiles: [
      tile('LOD-G01-d000m-D00-normal', '0 m — High Blades (D00)'),
      tile('LOD-G01-d012m-D00-normal', '12 m — Medium Blades (D00)'),
      tile('LOD-G01-d032m-D00-normal', '32 m — Low Blades + Cover (D00)'),
      tile('LOD-G01-d058m-D00-normal', '58 m — Far Cards (D00)'),
      tile('LOD-G01-d095m-D00-normal', '95 m — Terrain Cover Only (D00)'),
      tile('LOD-G01-d145m-D00-normal', '145 m — Impostors + Mid Bake (D00)'),
      tile('LOD-G01-d032m-D20-lod', '32 m — D20 LOD Classes'),
      tile('LOD-G01-d095m-D20-lod', '95 m — D20 LOD Classes'),
    ],
  });

  // Settlement Contact -> settlement-contact.jpg
  await buildContactSheet({
    title: 'Stillmeadow & Settlement Contact Baseline (B14 / B18)',
    subtitle: 'Forest approach, sparse grass, trunk bases, understories, road edges, and building foundations',
    columns: 4,
    outPath: path.join(outRoot, 'galleries/settlement-contact.jpg'),
    tiles: [
      tile('B14-C01-overcast-D00-normal', 'C01 Approach (Overcast)'),
      tile('B14-C02-overcast-D00-normal', 'C02 Sparse Grass vs Ground'),
      tile('B14-C03-overcast-D00-normal', 'C03 Tree Trunk Base'),
      tile('B14-C04-clear-D00-normal', 'C04 Understory Under Trees'),
      tile('B14-C05-clear-D00-normal', 'C05 Road Transition'),
      tile('B14-C06-clear-D00-normal', 'C06 Building Foundations'),
      tile('B14-C01-overcast-D15-gc-validity', 'C01 D15 GC Field Validity'),
      tile('B14-C01-overcast-D25-chunk-boundaries', 'C01 D25 Chunk & Field Seams'),
    ],
  });

  // Gallery H -> critical-defects.jpg (Annotated copies; originals remain untouched!)
  await buildContactSheet({
    title: 'Gallery H — Prioritized Critical Defects (Annotated Copies)',
    subtitle: 'Original screenshots preserved unchanged. Red=Critical, Orange=High, Yellow=Medium.',
    columns: 4,
    outPath: path.join(outRoot, 'galleries/critical-defects.jpg'),
    tiles: [
      tile('B14-C01-overcast-D00-normal', 'DEF-01/02: Neon Floor & Dark Blades', {
        badgeColor: '#5c1414',
        callouts: [
          { id: 'DEF-01', x: 0.12, y: 0.62, w: 0.36, h: 0.28, severity: 'critical' },
          { id: 'DEF-02', x: 0.56, y: 0.66, w: 0.34, h: 0.24, severity: 'critical' },
        ],
      }),
      tile('B14-C01-overcast-D18-emissive', 'DEF-03: FOREST_FLOOR_FILL (0.8) Glow', {
        badgeColor: '#5c1414',
        callouts: [{ id: 'DEF-03', x: 0.08, y: 0.56, w: 0.84, h: 0.36, severity: 'critical' }],
      }),
      tile('B14-C02-overcast-D12-substrate', 'DEF-04: GC Soil != Terrain Albedo', {
        badgeColor: '#5c1414',
        callouts: [{ id: 'DEF-04', x: 0.10, y: 0.55, w: 0.80, h: 0.38, severity: 'critical' }],
      }),
      tile('B14-C02-overcast-D11-vegetation-coverage', 'DEF-05: 100% Green Floor, Sparse Blades', {
        badgeColor: '#5c1414',
        callouts: [{ id: 'DEF-05', x: 0.10, y: 0.58, w: 0.80, h: 0.34, severity: 'critical' }],
      }),
      tile('B14-C03-overcast-D00-normal', 'DEF-06: Abrupt 15cm Trunk Termination', {
        badgeColor: '#663300',
        callouts: [{ id: 'DEF-06', x: 0.18, y: 0.56, w: 0.42, h: 0.32, severity: 'critical' }],
      }),
      tile('B14-C03-overcast-D13-gc-height', 'DEF-07: Trunk Root Height Seam', {
        badgeColor: '#663300',
        callouts: [{ id: 'DEF-07', x: 0.18, y: 0.56, w: 0.42, h: 0.32, severity: 'high' }],
      }),
      tile('STR-TP01-unsettled-D15-gc-validity', 'DEF-08: Unloaded Slot Missing Validity', {
        badgeColor: '#5c1414',
        callouts: [{ id: 'DEF-08', x: 0.08, y: 0.52, w: 0.84, h: 0.40, severity: 'critical' }],
      }),
      tile('B14-C01-overcast-D08-contact-ao', 'DEF-09: Circular Contact Discs', {
        badgeColor: '#663300',
        callouts: [{ id: 'DEF-09', x: 0.12, y: 0.54, w: 0.72, h: 0.34, severity: 'high' }],
      }),
      tile('FX-ISO-D17-indirect', 'DEF-10: Rock/Building Emissive Mismatch', {
        badgeColor: '#663300',
        callouts: [{ id: 'DEF-10', x: 0.16, y: 0.46, w: 0.68, h: 0.36, severity: 'high' }],
      }),
      tile('B01-C02-clear-D00-normal', 'DEF-11: Grassland Root Darkening', {
        badgeColor: '#5c4b00',
        callouts: [{ id: 'DEF-11', x: 0.14, y: 0.62, w: 0.72, h: 0.28, severity: 'medium' }],
      }),
      tile('LOD-G01-d058m-D00-normal', 'DEF-12: Card-to-Terrain LOD Shift', {
        badgeColor: '#663300',
        callouts: [{ id: 'DEF-12', x: 0.15, y: 0.52, w: 0.70, h: 0.34, severity: 'high' }],
      }),
      tile('B14-C06-clear-D00-normal', 'DEF-13: Foundation-to-Ground Seam', {
        badgeColor: '#663300',
        callouts: [{ id: 'DEF-13', x: 0.16, y: 0.56, w: 0.68, h: 0.32, severity: 'high' }],
      }),
    ],
  });
}

await mkdir(path.join(root, 'tmp'), { recursive: true });
await mkdir(outRoot, { recursive: true });
if (args['metrics-only']) {
  await computeMetricsAndGalleries();
  console.log(`[PR0] Metrics & galleries rebuilt offline. Total screenshots in manifest: ${manifest.screenshots.length}`);
  process.exit(0);
}
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let browser;
try {
  manifest.source = await captureVisualSource(args.url, root);
  await saveManifest();
  browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--use-angle=default',
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  if (requestedGroups.has('stillmeadow')) await runStillmeadowGroup(browser);
  if (requestedGroups.has('biomes')) await runBiomesGroup(browser);
  if (requestedGroups.has('lighting')) await runLightingGroup(browser);
  if (requestedGroups.has('lod')) await runLodGroup(browser);
  if (requestedGroups.has('fixture')) await runFixtureGroup(browser);
  if (requestedGroups.has('streaming')) await runStreamingGroup(browser);
  await computeMetricsAndGalleries();
  console.log(`[PR0] Completed cleanly. Total screenshots in manifest: ${manifest.screenshots.length}`);
} finally {
  try { await browser?.close(); } finally { release(); }
}
