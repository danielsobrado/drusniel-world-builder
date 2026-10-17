import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareVisualPose } from './lib/world-visual-prepare-pose.mjs';
import { captureWorldCanvas } from './lib/world-visual-canvas.mjs';
import { captureVisualSource, visualSourceStayedFixed } from './lib/world-visual-source.mjs';
import { fileHash } from './lib/world-visual-report.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
import { selectProceduralWaterPoses, selectImportedWaterPoses } from '../docs/qa/water-aaa-audit-2026-10-16/select-poses.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const out = path.resolve(option('--out', 'tmp/water-visual-review'));
const url = option('--url', 'http://localhost:5217');
await mkdir(out, { recursive: true });
const report = { schemaVersion: 1, kind: 'visual-investigation', startedAt: new Date().toISOString(),
  viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1,
  lighting: { preset: 'highfield', hour: 12, weather: 'off' }, poses: [], failures: [], artifacts: [] };
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let browser, page, monitor;
try {
  const source = await captureVisualSource(url, root);
  await writeFile(path.join(out, 'source-snapshot.json'), JSON.stringify(source, null, 2) + '\n');
  report.sourceSha = source.sourceSha; report.sourceSnapshotSha256 = source.sourceSnapshot?.sha256;
  report.captureScriptSha256 = await fileHash(fileURLToPath(import.meta.url));
  report.selectorSha256 = await fileHash(fileURLToPath(new URL('../docs/qa/water-aaa-audit-2026-10-16/select-poses.mjs', import.meta.url)));
  report.mapSha256 = await fileHash(path.join(root, 'maps/Eldara Full 2026-07-23-20-37.json'));
  report.browserPolicy = 'Headed hardware capture; background/occlusion throttling disabled; reload between poses.';
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
  page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
  monitor = createBrowserErrorMonitor(page);
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
  report.adapter = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
    return { vendor: a?.info.vendor, architecture: a?.info.architecture, description: a?.info.description,
      fallback: !!(a?.info.isFallbackAdapter ?? a?.isFallbackAdapter), backend: window.__editor.terrainView.rendererBackendStatus.mode };
  });
  if (report.adapter.backend !== 'webgpu' || report.adapter.fallback || !report.adapter.vendor || /swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(report.adapter))) throw new Error('Hardware WebGPU required.');
  console.log(JSON.stringify({ adapter: report.adapter }));
  let replay = null;
  if (option('--manifest', null)) replay = JSON.parse(await readFile(option('--manifest'), 'utf8'));
  const manifest = { schemaVersion: 1, sourceSha: report.sourceSha, selections: [], requestedPoses: [] };
  for (const world of ['procedural', 'eldara']) {
    const requestedIds = option('--poses', null)?.split(',');
    if (replay && !replay.requestedPoses.some(pose => pose.world === world && (!requestedIds || requestedIds.includes(pose.id)))) continue;
    if (world === 'eldara') { console.log('Loading Eldara imported map'); await page.evaluate(() => window.__worldVisualQa.loadWorld('eldara')); }
    await page.evaluate(() => window.__worldVisualQa.setLighting());
    const selection = replay ? { poses: replay.requestedPoses.filter(p => p.world === world), replay: true }
      : await page.evaluate(world === 'procedural' ? selectProceduralWaterPoses : selectImportedWaterPoses);
    const requested = option('--poses', null)?.split(',');
    if (requested) selection.poses = selection.poses.filter(p => requested.includes(p.id));
    manifest.selections.push({ world, ...selection }); manifest.requestedPoses.push(...selection.poses);
    await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ world, sampled: selection.sampled, poses: selection.poses.map(p => ({ id: p.id, x: p.x, z: p.z, biome: p.expectedBiomeId, water: p.expectedWaterKind })) }));
    let firstPose = true;
    for (const pose of selection.poses) {
      if (!firstPose) {
        await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
        if (world === 'eldara') await page.evaluate(() => window.__worldVisualQa.loadWorld('eldara'));
        await page.evaluate(() => window.__worldVisualQa.setLighting());
      }
      firstPose = false;
      console.log(`Capturing ${pose.id}`);
      try {
        const preparation = await prepareVisualPose(page, pose);
        const waterTime = option('--water-time', '123.4');
        if (waterTime !== 'live') await page.evaluate(seconds => window.__worldVisualQa.setWaterTime(Number(seconds)), waterTime);
        report.waterTime = waterTime;
        const lighting = await page.evaluate(() => window.__worldVisualQa.settleLighting());
        const state = await page.evaluate(target => {
          const d = window.__worldVisualQa.diagnostics(), e = window.__editor;
          d.placementCounts = Object.fromEntries(Object.entries(d.placements).map(([k, v]) => [k, v.length]));
          delete d.placements; delete d.preparationJobs;
          d.targetWater = e.terrainView.getCanonicalWater(target.x, target.z);
          d.cameraWater = e.terrainView.getCanonicalWater(d.canonical.x, d.canonical.z);
          d.waterConfig = structuredClone(e.config.stylizedSurface.water);
          d.fov = e.viewModeController.camera.fov;
          return d;
        }, pose.target);
        if (!state.readiness.ready || state.actualBiomeId !== pose.expectedBiomeId || state.targetWater.kind !== pose.expectedWaterKind) throw new Error(`Readiness/biome/water mismatch: biome ${state.actualBiomeId}, water ${state.targetWater.kind}`);
        await page.screenshot({ path: path.join(out, `${pose.id}-hud.png`) });
        if (!await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true))) throw new Error('Capture UI blocked.');
        await captureWorldCanvas(page, path.join(out, `${pose.id}.png`));
        state.controls = [];
        for (const variant of option('--variants', '').split(',').filter(Boolean)) {
          if (!['foam-off', 'glint-off', 'normals-off', 'reflections-off', 'refraction-off', 'swell-off'].includes(variant)) throw new Error(`Unknown variant ${variant}`);
          const controls = await page.evaluate(async variant => {
            const { SharedWaterMaterials, WATER_SLOT_OPTIONS } = await import('/src/editor/stylized/SharedWaterMaterials.js');
            const e = window.__editor, surface = e.stylizedSurface, config = structuredClone(e.config.stylizedSurface);
            if (variant === 'foam-off') config.water.foam.enabled = false;
            if (variant === 'glint-off') config.water.riverSurface.glintStrength = 0;
            if (variant === 'normals-off') config.water.riverSurface.normalStrength = 0;
            if (variant === 'refraction-off') config.water.refraction.enabled = false;
            if (variant === 'swell-off') config.water.sea.amplitude = 0;
            const previous = surface.sharedWaterMaterials;
            const pool = new SharedWaterMaterials(variant === 'reflections-off' ? { sample: (_direction, fallback) => fallback } : surface.reflections);
            surface.sharedWaterMaterials = pool;
            for (const slot of surface.waterSlots) {
              slot.materialOptions = { ...slot.materialOptions, config };
              slot.mesh.userData[WATER_SLOT_OPTIONS] = slot.materialOptions; slot.sharedMaterials = pool;
              slot.material = slot.createMaterial(false); slot.refractiveMaterial = null; slot.refractionPrewarmed = false;
              slot.mesh.material = slot.material;
            }
            previous?.dispose();
            await e.terrainView.renderer.compileAsync(e.terrainView.scene, e.viewModeController.camera);
            return { variant, waterTime: surface.waterSlots[0]?.time.value };
          }, variant);
          const readiness = await page.evaluate(() => window.__worldVisualQa.settle({ minimumMs: 0 }));
          const file = `${pose.id}-${variant}.png`;
          await captureWorldCanvas(page, path.join(out, file));
          report.artifacts.push({ path: file, sha256: await fileHash(path.join(out, file)) });
          state.controls.push({ ...controls, readiness });
        }
        await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
        report.poses.push({ ...pose, ...state, preparation, lighting });
        for (const suffix of ['.png', '-hud.png']) {
          const file = `${pose.id}${suffix}`; report.artifacts.push({ path: file, sha256: await fileHash(path.join(out, file)) });
        }
        console.log(`Captured ${pose.id}; ${Math.round(preparation.readiness.waitedMs)} ms preparation.`);
      } catch (error) {
        await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false)).catch(() => {});
        report.failures.push({ pose, error: error.stack, readiness: await page.evaluate(() => window.__worldVisualQa.readiness()) });
        await page.screenshot({ path: path.join(out, `failed-${pose.id}.png`) });
        console.log(`FAILED ${pose.id}: ${error.message}`);
      }
      await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
  report.sourceStayedFixed = visualSourceStayedFixed(source, await captureVisualSource(url, root));
  report.requestedCount = manifest.requestedPoses.length;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  report.errors = monitor?.snapshot() ?? { count: 0, errors: [] }; report.finishedAt = new Date().toISOString();
  await browser?.close(); release();
  report.captureValid = !report.failure && !report.failures.length && report.sourceStayedFixed && report.errors.count === 0 && report.poses.length === report.requestedCount;
  if (!report.captureValid) process.exitCode = 1;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ captureValid: report.captureValid, count: report.poses.length, failures: report.failures.length, errorCount: report.errors.count, failure: report.failure }));
}
