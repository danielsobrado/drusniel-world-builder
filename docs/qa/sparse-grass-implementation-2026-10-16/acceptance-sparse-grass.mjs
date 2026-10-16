// G4 / lighting acceptance for the sparse-grass slice. Run against a frozen snapshot:
//   node docs/qa/sparse-grass-implementation-2026-10-16/acceptance-sparse-grass.mjs <url> <outDir> [motion,wind,lod,light,lightfrozen]
// Motion clips use the engine's own walk-sprint-turn-v1 sequence (walk 2–6 s, sprint 6–10 s,
// stop, 180° turn 12–13 s, walk 13–17 s). Overcast and wetness are pinned by QA-only
// instance overrides so no rain particles cross the frame and the soak is deterministic.
// `lightfrozen` repeats the lighting sweep with the meadow sway clock and the world wind
// field pinned to one instant, so both sides of an A/B show the same blade poses.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const lib = file => import(new URL(`../../../scripts/lib/${file}`, import.meta.url).href);
const { prepareVisualPose } = await lib('world-visual-prepare-pose.mjs');
const { captureWorldCanvas } = await lib('world-visual-canvas.mjs');
const { captureVisualSource, visualSourceStayedFixed } = await lib('world-visual-source.mjs');
const { createBrowserErrorMonitor } = await lib('perf-browser-errors.mjs');
const { selectMotionFrames, motionContactSheet, motionChecks } = await lib('world-visual-motion-report.mjs');
const { waitForPerfRunLock } = await import(new URL('../../../scripts/perf-run-lock.mjs', import.meta.url).href);

const url = process.argv[2] ?? 'http://localhost:5181';
const out = path.resolve(root, process.argv[3] ?? 'tmp/sparse-grass-acceptance/out');
const phases = (process.argv[4] ?? 'motion,wind,lod,light').split(',');
await mkdir(out, { recursive: true });
const audit = JSON.parse(await readFile(path.join(root, 'docs/qa/visual-audit-2026-10-15/manifest.json'), 'utf8'));
const poses = ['random-04', 'random-09'].map(id => audit.requestedPoses.find(p => p.id === id));
const turn = yaw => yaw + Math.PI;

// LOD views: eye height and grazing in both directions, plus a low camera and a 4 m
// look-down that puts the 6/14/30/50 m blade bands and the 9.2–14 m card fill in frame.
const lodViews = pose => [
  { ...pose, id: 'eye-fwd' }, { ...pose, id: 'eye-back', yaw: turn(pose.yaw) },
  { ...pose, id: 'graze-fwd', pitch: -0.015 }, { ...pose, id: 'graze-back', yaw: turn(pose.yaw), pitch: -0.015 },
  { ...pose, id: 'low-fwd', mode: 'fly', heightAboveGround: 0.55, pitch: -0.01 },
  { ...pose, id: 'low-back', mode: 'fly', heightAboveGround: 0.55, yaw: turn(pose.yaw), pitch: -0.01 },
  { ...pose, id: 'over-fwd', mode: 'fly', heightAboveGround: 4, pitch: -0.16 },
  { ...pose, id: 'over-back', mode: 'fly', heightAboveGround: 4, yaw: turn(pose.yaw), pitch: -0.16 },
];
const lightViews = pose => [
  { ...pose, id: 'ground', pitch: -0.65 }, { ...pose, id: 'eye-fwd' }, { ...pose, id: 'eye-back', yaw: turn(pose.yaw) },
];
const lightings = [
  { id: 'noon', preset: 'highfield', hour: 12 },
  { id: 'lowsun', preset: 'lowsway', hour: 12 },
  { id: 'golden', preset: 'emberfall', hour: 12 },
  { id: 'overcast', preset: 'highfield', hour: 12, overcast: 1 },
  { id: 'wet', preset: 'highfield', hour: 12, overcast: 0.8, wetness: 1 },
];

const report = { url, phases, startedAt: new Date().toISOString(), viewport: { width: 1600, height: 900 }, clips: [], stills: [], failures: [] };
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
let browser, page, monitor;
const save = () => writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');

async function applyLighting(l) {
  await page.evaluate(async ({ preset, hour, overcast = 0, wetness = 0 }) => {
    const qa = window.__worldVisualQa, e = window.__editor, sky = e.skyLooks, wet = e.surfaceWetness;
    await qa.setLighting({ preset, hour });
    delete sky.setOvercast; delete wet.update;
    if (overcast) sky.setOvercast = () => { sky.overcastTarget = overcast; };
    wet.update = () => { wet.value = wetness; wet.target.value = wetness; return wetness; };
  }, l);
  return page.evaluate(() => window.__worldVisualQa.settleLighting());
}
async function freezeWind(seconds = 100) {
  await page.evaluate(seconds => {
    const e = window.__editor, time = e.stylizedSurface.meadowGrass.uniforms.time, wind = e.worldWind;
    Object.defineProperty(time, 'value', { configurable: true, get: () => seconds, set: () => {} });
    const update = Object.getPrototypeOf(wind).update;
    wind.update = (dt, ...rest) => { wind.time = seconds; return update.call(wind, 0, ...rest); };
  }, seconds);
}
async function still(name, extra = {}) {
  if (!await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true))) throw new Error('Capture UI was blocked.');
  await captureWorldCanvas(page, path.join(out, `${name}.png`));
  await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
  const d = await page.evaluate(() => { const d = window.__worldVisualQa.diagnostics();
    return { canonical: d.canonical, yaw: d.yaw, pitch: d.pitch, biome: d.actualBiomeId, ready: d.readiness.ready, sky: d.sky?.preset ?? null,
      wetness: window.__editor.surfaceWetness.value, overcast: window.__editor.skyLooks.overcast }; });
  report.stills.push({ name, ...extra, ...d });
}
async function record(file, framesDir, body) {
  await mkdir(framesDir, { recursive: true });
  const captured = []; let last = -Infinity;
  await page.screencast.start({ path: file, size: report.viewport, quality: 90, onFrame: async frame => {
    if (frame.timestamp - last < 35) return; last = frame.timestamp;
    const f = path.join(framesDir, `${String(captured.length).padStart(5, '0')}.jpg`);
    captured.push({ file: f, wallTimeMs: frame.timestamp }); await writeFile(f, frame.data);
  } });
  try { return { result: await body(), captured }; } finally { await page.screencast.stop(); }
}

try {
  const source = await captureVisualSource(url, root);
  report.sourceSha = source.sourceSha;
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
  monitor = createBrowserErrorMonitor(page);
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
  report.backend = await page.evaluate(() => window.__editor.terrainView.rendererBackendStatus.mode);
  if (report.backend !== 'webgpu') throw new Error('Hardware WebGPU required.');
  await applyLighting(lightings[0]);

  for (const pose of poses) {
    const tag = pose.id === 'random-04' ? 'grassland' : 'taiga';
    if (phases.includes('motion')) for (const cameraMode of ['first-person', 'third-person']) {
      console.log(`motion ${tag} ${cameraMode}`);
      await applyLighting(lightings[0]);
      const request = { startPose: pose, cameraMode, sequenceId: 'walk-sprint-turn-v1' };
      await page.evaluate(r => window.__worldVisualQa.prepareMotion(r), request);
      await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true));
      const id = `motion-${tag}-${cameraMode}`;
      const { result: motion, captured } = await record(path.join(out, `${id}.webm`), path.join(out, id),
        () => page.evaluate(r => window.__worldVisualQa.runMotion({ ...r, prepared: true }), request));
      await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
      const contacts = selectMotionFrames(motion, captured), analysis = motionChecks(motion);
      await writeFile(path.join(out, `${id}.json`), JSON.stringify({ request, analysis, captured, frames: motion.frames.map(f => ({ elapsed: f.elapsed, keys: f.keys, position: f.position, yaw: f.yaw, ready: f.scenery.ready, missing: f.nearMeadow.missing.length, interactionPeak: f.interactionPeak })) }));
      report.clips.push({ id, cameraMode, pose: pose.id, contacts, checks: analysis.checks.map(c => ({ id: c.id, passed: c.passed })), stops: analysis.stops, maximumMissingNearTiles: analysis.maximumMissingNearTiles });
      await motionContactSheet([{ cameraMode, contacts }], path.join(out, `${id}-sheet.png`));
      await save();
    }
    await page.evaluate(() => { const v = window.__editor.viewModeController; if (v.isThirdPerson) v.toggleCameraView(); });
    if (phases.includes('wind')) {
      // Stationary 8 s look-down: wind on short stems and ground-detail stability without camera motion.
      for (const view of [{ ...pose, id: 'down', pitch: -0.5 }, { ...pose, id: 'mid', mode: 'fly', heightAboveGround: 1.7, pitch: -0.12 }]) {
        console.log(`wind ${tag} ${view.id}`);
        await prepareVisualPose(page, view); await applyLighting(lightings[0]);
        await page.evaluate(() => window.__worldVisualQa.setCaptureUi(true));
        const id = `wind-${tag}-${view.id}`;
        const { captured } = await record(path.join(out, `${id}.webm`), path.join(out, id), () => page.waitForTimeout(8000));
        await page.evaluate(() => window.__worldVisualQa.setCaptureUi(false));
        report.clips.push({ id, pose: pose.id, stationary: true, frames: captured.length });
        await save();
      }
    }
    if (phases.includes('lod')) for (const view of lodViews(pose)) {
      console.log(`lod ${tag} ${view.id}`);
      try { await prepareVisualPose(page, view); await applyLighting(lightings[0]); await still(`lod-${tag}-${view.id}`, { view }); }
      catch (error) { report.failures.push({ phase: 'lod', view, error: error.message }); }
      await save();
    }
    if (phases.includes('light')) for (const view of lightViews(pose)) {
      console.log(`light ${tag} ${view.id}`);
      try {
        await prepareVisualPose(page, view);
        for (const l of lightings) { await applyLighting(l); await still(`light-${tag}-${view.id}-${l.id}`, { view, lighting: l }); }
      } catch (error) { report.failures.push({ phase: 'light', view, error: error.message }); }
      await save();
    }
  }
  if (phases.includes('lightfrozen')) {
    await freezeWind();
    for (const pose of poses) for (const view of lightViews(pose)) {
      const tag = pose.id === 'random-04' ? 'grassland' : 'taiga';
      console.log(`lightfrozen ${tag} ${view.id}`);
      try {
        await prepareVisualPose(page, view);
        for (const l of lightings) { await applyLighting(l); await still(`lightfz-${tag}-${view.id}-${l.id}`, { view, lighting: l, windFrozen: true }); }
      } catch (error) { report.failures.push({ phase: 'lightfrozen', view, error: error.message }); }
      await save();
    }
  }
  report.sourceStayedFixed = visualSourceStayedFixed(source, await captureVisualSource(url, root));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  report.errors = monitor?.snapshot() ?? { count: 0, errors: [] };
  report.finishedAt = new Date().toISOString();
  await browser?.close(); release();
  report.captureValid = !report.failure && !report.failures.length && report.sourceStayedFixed && report.errors.count === 0;
  await save();
  console.log(JSON.stringify({ captureValid: report.captureValid, clips: report.clips.length, stills: report.stills.length, failures: report.failures, errors: report.errors.count, failure: report.failure }));
}
