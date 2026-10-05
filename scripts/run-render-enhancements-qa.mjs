import fs from 'node:fs';
import { chromium } from 'playwright';

const value = (flag, fallback) => { const index = process.argv.indexOf(flag); return index < 0 ? fallback : process.argv[index + 1]; };
const url = value('--url', 'http://127.0.0.1:5180/?profile=1');
const out = value('--out', 'tmp/grass-test-remaining/render-enhancements.json');
const timeout = Number(value('--timeout', '120000'));
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
if (process.argv.includes('--stacks')) await page.addInitScript(() => {
  const original = console.error;
  console.error = (...args) => original(...args, new Error('Console error origin').stack);
});
const errors = []; let count = 0;
const record = message => { count++; if (errors.length < 30) errors.push(message); if (count <= 5) console.error(message.slice(0, 2500)); };
page.on('pageerror', error => record(error.message));
page.on('console', message => { if (message.type() === 'error') record(message.text()); });
const report = { url, errors };
let stage = 'startup';
let progressPending = false;
const progress = setInterval(() => {
  if (progressPending) return;
  progressPending = true;
  page.evaluate(() => ({ status: window.__assetStartupTelemetry?.status,
    fixture: window.__renderFixture?.current, label: document.querySelector('#status')?.textContent,
    roadside: window.__editor?.roadsideDetails && { parts: Boolean(window.__editor.roadsideDetails.parts),
      count: window.__editor.roadsideDetails.records.length, pending: window.__editor.roadsideDetails.pending?.rows.length,
      focus: window.__editor.terrainView.focusChunk } }))
    .then(state => console.log(JSON.stringify({ stage, ...state }))).catch(() => {}).finally(() => { progressPending = false; });
}, 30000);
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (;;) {
    await page.waitForFunction(() => window.__assetStartupTelemetry?.status === 'done' || window.__renderFixture?.report.done || window.__renderFixture?.pendingCapture, null, { timeout });
    const id = await page.evaluate(() => window.__renderFixture?.pendingCapture);
    if (!id) break;
    await page.screenshot({ path: out.replace(/\.json$/, `-${id}.png`) });
    await page.evaluate(() => { window.__renderFixture.pendingCapture = null; window.__renderFixture.continue(); });
  }
  await page.waitForTimeout(3000);
  if (process.argv.includes('--roadside')) {
    stage = 'imported road';
    if (process.argv.includes('--cpu-probe')) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
      setTimeout(async () => {
        const { profile } = await cdp.send('Profiler.stop');
        fs.writeFileSync(out.replace(/\.json$/, '.cpuprofile'), JSON.stringify(profile));
        console.log('Roadside CPU profile saved.');
      }, 20000);
    }
    report.roadside = await page.evaluate(async () => {
      const e = window.__editor;
      const { importAzgaarFullJson } = await import('/src/editor/import/AzgaarJsonImporter.js');
      const { RoadsideLanternGenerator } = await import('/src/editor/roadside/RoadsideLanternGenerator.js');
      const { PLAYER_MODE_WALK } = await import('/src/editor/player/playerConstants.js');
      const manifest = await (await fetch('/maps/manifest.json')).json();
      const source = await (await fetch('/maps/' + manifest.maps[0].url)).json();
      e.controller.loadDocument(importAzgaarFullJson(source, e.config));
      const generator = e.terrainView.worldStore.generator;
      const field = generator.ensureSettlementField(), lanterns = new RoadsideLanternGenerator(generator);
      const tileSize = e.terrainView.worldStore.tileSize, reach = e.terrainView.chunkWorldSize * 2;
      // This bundled reference town fixes the workload and avoids planning every
      // settlement on a campaign-scale map during a visual acceptance fixture.
      for (const { settlement } of field.entries.filter(entry => entry.settlement.id === 240)) {
        for (const detail of lanterns.candidates(settlement.cellX, settlement.cellZ, reach, tileSize)) {
          const water = e.terrainView.getCanonicalWater(detail.x, detail.z);
          const height = e.terrainView.worldStore.sampleHeight(detail.cellX, detail.cellZ);
          const slope = Math.max(Math.abs(e.terrainView.worldStore.sampleHeight(detail.cellX + 1, detail.cellZ) - height),
            Math.abs(e.terrainView.worldStore.sampleHeight(detail.cellX, detail.cellZ + 1) - height)) / tileSize;
          if (water.coverage > 0.05 || slope > 0.25) continue;
          e.viewModeController.setMode(PLAYER_MODE_WALK, { spawn: e.terrainView.floatingOrigin.toRender(detail.x, detail.z) });
          return { home: { x: detail.x, z: detail.z }, settlement: settlement.id };
        }
      }
      throw new Error('Imported-road fixture has no eligible roadside station.');
    });
    console.log(JSON.stringify(report.roadside)); stage = 'roadside residency';
    await page.waitForFunction(() => window.__editor.roadsideDetails.records.length > 0, null, { timeout });
    stage = 'roadside history'; report.roadside.checks = await page.evaluate(async () => {
      const e = window.__editor;
      const { changeRoadsideDetail } = await import('/src/editor/roadside/RoadsideDetailsCommands.js');
      const detail = e.roadsideDetails.records.find(row => e.controller.validateObjectPlacement({
        definitionKey: row.definitionKey, x: Math.floor(row.cellX), z: Math.floor(row.cellZ), rotation: 0 }).valid);
      if (!detail) throw new Error('No generated lantern can be promoted.');
      const object = changeRoadsideDetail(e.controller, detail, { promote: true });
      e.controller.undo(); const undone = !e.controller.roadsideDetails.has(detail.key) && !e.objectMap.getById(object.id);
      e.controller.redo(); const redone = e.controller.roadsideDetails.has(detail.key) && Boolean(e.objectMap.getById(object.id));
      const saved = e.controller.toDocument(); e.controller.loadDocument(saved);
      const restored = e.objectMap.getById(object.id);
      const preserved = restored?.roadsidePlacement.sourceKey === detail.key && e.controller.roadsideDetails.has(detail.key);
      if (!undone || !redone || !preserved) throw new Error('Roadside semantic history/save contract failed.');
      return { generated: e.roadsideDetails.records.length, meshes: e.roadsideDetails.meshes.flat().length,
        key: detail.key, undone, redone, preserved, pose: restored.roadsidePlacement };
    });
    await page.waitForTimeout(3000);
  }
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    return adapter ? { ...adapter.info.toJSON?.(), vendor: adapter.info.vendor, architecture: adapter.info.architecture,
      device: adapter.info.device, description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter } : null;
  });
  report.startup = await page.evaluate(() => window.__assetStartupTelemetry?.getReport());
  report.fixture = await page.evaluate(() => window.__renderFixture?.report);
  report.features = await page.evaluate(() => {
    const editor = window.__editor;
    if (!editor) return null;
    return { enhancements: editor.config?.stylizedSurface.enhancements,
      reflections: editor.stylizedSurface?.reflections?.valid.value,
      planar: editor.stylizedSurface?.reflections?.planarValid.value,
      roadside: { enabled: editor.roadsideDetails?.enabled, count: editor.roadsideDetails?.records.length },
      cascades: editor.stylizedSurface?.skyView?.cascades?.node.cascades,
      backend: editor.terrainView?.rendererBackendStatus };
  });
} catch (error) { report.failure = error.message; }
finally {
  clearInterval(progress);
  report.startup ??= await page.evaluate(() => window.__assetStartupTelemetry?.getReport()).catch(() => null);
  report.errorCount = count;
  report.body = await page.locator('body').innerText().catch(() => '');
  fs.mkdirSync(new URL('../tmp/grass-test-remaining/', import.meta.url), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  await page.screenshot({ path: out.replace(/\.json$/, '.png') }).catch(() => {});
  await browser.close();
  console.log(JSON.stringify({ out, failure: report.failure, errorCount: count, errors: errors.slice(0, 4), features: report.features }, null, 2));
  if (report.failure || report.fixture?.failure || report.fixture?.cases.some(row => row.failure) || count
    || report.adapter?.isFallbackAdapter || (report.fixture && report.fixture.backend !== 'webgpu')) process.exitCode = 1;
}
