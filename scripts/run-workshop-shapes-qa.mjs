import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { terminateChildProcess } from './lib/processLifecycle.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { SHAPE_PRESETS } from '../src/editor/workshop/shapes/ShapePresets.js';
import { checkWorkshopShapeReview } from './lib/workshopShapesReviewChecks.mjs';
import { checkWorkshopShapePolish } from './lib/workshopShapesPolishChecks.mjs';
import { checkWorkshopShapeExpansion } from './lib/workshopShapesExpansionChecks.mjs';
import { checkWorkshopShapeBalconies } from './lib/workshopShapesBalconyChecks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'tmp', 'workshop-shapes-qa');
const report = {
  presets: [],
  assertions: [],
  consoleErrors: [],
  pageErrors: [],
};
await mkdir(output, { recursive: true });
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const selected = server.address().port;
    server.close(() => resolve(selected));
  });
});
const releaseLock = await waitForPerfRunLock(
  path.join(root, 'tmp', `perf-browser-${process.platform}.lock`),
);
let server;
let serverOutput = '';
let browser;

async function settle(page) {
  await page.waitForFunction(() => {
    const ui = window.__editor.proceduralWorkshop;
    return (
      !ui.previewTimer &&
      ui.completedPlanRevision === ui.planRevision &&
      ui.shapeBridge.preview?.groups.size > 0 &&
      ui.status.textContent.startsWith('Final preview') &&
      !ui.status.classList.contains('is-error')
    );
  });
  // Allow the renderer to submit and present the new buffers.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function preset(page, id) {
  await page.locator('[data-shape-action="preset"]').selectOption(id);
  await settle(page);
}

async function field(page, name, value) {
  await page.locator(`[data-shape-field="${name}"]`).evaluate((element, v) => {
    element.value = String(v);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await settle(page);
}

async function handlePoint(page, fieldName) {
  return page.evaluate((field) => {
    const ui = window.__editor.proceduralWorkshop;
    const handle = ui.shapeBridge.preview.handles.handles.find(
      (h) => h.visible && h.userData.field === field,
    );
    const point = handle.getWorldPosition(new window.__THREE_QA__.Vector3()).project(ui.camera);
    const rect = ui.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((point.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - point.y) * rect.height) / 2,
    };
  }, fieldName);
}

try {
  server = spawn(process.execPath, [path.join(root, 'scripts/lib/workshopShapesQaServer.mjs'), String(port)],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverError;
  server.on('error', (error) => { serverError = error; });
  server.stdout.on('data', (data) => { serverOutput += data; });
  server.stderr.on('data', (data) => { serverOutput += data; });
  let ready = false;
  for (let attempt = 0; attempt < 300; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) { ready = true; break; }
    } catch {
      /* Starting Vite. */
    }
    await delay(100);
  }
  if (!ready) throw new Error(`Workshop QA server did not become ready. ${serverOutput}`);
  browser = await chromium.launch({
    headless: process.argv.includes('--headless'),
    args: [
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--use-angle=default',
      '--enable-gpu-rasterization',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/workshop-qa.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => window.__editor?.proceduralWorkshop);
  await page.locator('[data-tool="workshop"]').click();
  await page.waitForFunction(() =>
    window.__editor.proceduralWorkshop.status.textContent.startsWith('Final preview'),
  );
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    return {
      vendor: adapter.info.vendor,
      architecture: adapter.info.architecture,
      description: adapter.info.description,
      fallback: Boolean(adapter.isFallbackAdapter),
    };
  });
  assert.equal(report.adapter.fallback, false);
  assert.doesNotMatch(
    JSON.stringify(report.adapter),
    /swiftshader|lavapipe|llvmpipe|microsoft basic|warp/i,
  );
  report.renderer = await page.evaluate(() => {
    const backend = window.__editor.proceduralWorkshop.renderer.backend;
    const info = backend.device?.adapterInfo;
    return {
      webgpu: Boolean(backend.isWebGPUBackend),
      vendor: info?.vendor,
      architecture: info?.architecture,
      description: info?.description,
    };
  });
  assert.equal(report.renderer.webgpu, true, 'QA requires the actual renderer to use WebGPU.');
  assert.ok(report.renderer.vendor, 'QA requires adapter information from the renderer device.');
  assert.doesNotMatch(JSON.stringify(report.renderer), /swiftshader|lavapipe|llvmpipe|microsoft basic|warp/i);
  await page.locator('select[name="archetype"]').selectOption('composition');
  await settle(page);
  for (const item of SHAPE_PRESETS) {
    await preset(page, item.id);
    const state = await page.evaluate(() => {
      const ui = window.__editor.proceduralWorkshop;
      return {
        stats: ui.previewParts.stats,
        shapeIds: [...ui.shapeBridge.preview.groups.keys()],
        composition: ui.readInput().recipe.composition,
        status: ui.status.textContent,
      };
    });
    assert.equal(state.shapeIds.length, item.create().length);
    assert.ok(state.stats.drawParts <= state.shapeIds.length * 24, 'Preview domains must stay within 24 material batches per host. Runtime baking merges these domains.');
    await page.screenshot({ path: path.join(output, `${item.id}.png`) });
    report.presets.push({ id: item.id, label: item.label, ...state });
    console.log(
      `${item.id}: ${state.stats.drawParts} batches, ${state.stats.sourceVertices} vertices`,
    );
  }

  await preset(page, 'garden-gateway');
  await page.locator('[data-shape-action="select"]').selectOption('garden-wall');
  const gateState = () =>
    page.evaluate(() => {
      const editor = window.__editor.proceduralWorkshop.shapeBridge.editor;
      const host = editor.resolvedPlans.get('garden-wall');
      return {
        auto: host.automaticOpenings.length,
        authored: editor.primitive.openings.length,
        x: host.automaticOpenings[0]?.at,
        promotedFrom: editor.primitive.openings[0]?.promotedFrom,
      };
    });
  assert.equal((await gateState()).auto, 1);
  assert.equal((await gateState()).authored, 0);
  await page.locator('[data-shape-action="hide-gate"]').click();
  await settle(page);
  assert.equal((await gateState()).auto, 0);
  await page.locator('[data-shape-action="undo"]').click();
  await settle(page);
  assert.equal((await gateState()).auto, 1);
  report.assertions.push('Generated path gates remain derived and can be hidden and undone.');
  await page.locator('[data-shape-action="pin-gate"]').click();
  await settle(page);
  assert.equal((await gateState()).authored, 1);
  assert.ok((await gateState()).promotedFrom);
  await page.locator('[data-shape-action="select"]').selectOption('garden-path');
  await field(page, 'x', 10);
  await page.locator('[data-shape-action="select"]').selectOption('garden-wall');
  assert.equal((await gateState()).authored, 1);
  assert.equal((await gateState()).auto, 0);
  report.assertions.push(
    'Keeping a generated gate makes an editable opening that survives moving the path.',
  );
  await preset(page, 'garden-gateway');
  await page.locator('[data-shape-action="select"]').selectOption('garden-wall');
  await page.locator('[data-shape-field="automaticGates"]').uncheck();
  await settle(page);
  assert.equal((await gateState()).auto, 0);
  await page.locator('[data-shape-field="automaticGates"]').check();
  await settle(page);
  assert.equal((await gateState()).auto, 1);
  report.assertions.push(
    'Automatic gate creation can be disabled and restored from the wall controls.',
  );
  await preset(page, 'rounded-cottage');
  const facadeBuffers = () =>
    page.evaluate(() => {
      const domains =
        window.__editor.proceduralWorkshop.shapeBridge.preview.cache.entries.get('cottage').domains;
      return Object.fromEntries(
        ['walls', 'roof', 'ivy'].map((domain) => [
          domain,
          domains.get(domain)?.parts.map((part) => part.geometry.uuid),
        ]),
      );
    });
  const facadeBefore = await facadeBuffers();
  await page.locator('[data-shape-field="facade"]').selectOption('timber');
  await settle(page);
  await page.locator('[data-shape-field="shutters"]').uncheck();
  await settle(page);
  assert.deepEqual(await facadeBuffers(), facadeBefore);
  report.assertions.push(
    'Facade and shutter controls preserve existing wall, roof, and ivy buffers.',
  );

  await preset(page, 'curved-courtyard');
  const untouched = await page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop;
    return ui.shapeBridge.preview.groups
      .get('wall-right')
      .children.map((mesh) => mesh.geometry.uuid);
  });
  await field(page, 'height', 2.8);
  const after = await page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop;
    return {
      ids: ui.shapeBridge.preview.groups
        .get('wall-right')
        .children.map((mesh) => mesh.geometry.uuid),
      stats: ui.previewParts.stats,
    };
  });
  assert.deepEqual(after.ids, untouched);
  assert.equal(after.stats.rebuilt, 1);
  report.assertions.push('An isolated wall edit preserves the other shape and its GPU buffers.');

  await preset(page, 'rounded-cottage');
  const originalWalls = await page.evaluate(() =>
    window.__editor.proceduralWorkshop.shapeBridge.preview.cache.entries
      .get('cottage')
      .domains.get('walls')
      .parts.map((part) => part.geometry.uuid),
  );
  await field(page, 'roof-rise', 3.1);
  assert.deepEqual(
    await page.evaluate(() =>
      window.__editor.proceduralWorkshop.shapeBridge.preview.cache.entries
        .get('cottage')
        .domains.get('walls')
        .parts.map((part) => part.geometry.uuid),
    ),
    originalWalls,
  );
  report.assertions.push('Roof-only reshaping preserves the wall geometry buffers.');
  const original = await page.evaluate(
    () => window.__editor.proceduralWorkshop.shapeBridge.editor.primitive.height,
  );
  const point = await handlePoint(page, 'height');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y - 45, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  const dragged = await page.evaluate(
    () => window.__editor.proceduralWorkshop.shapeBridge.editor.primitive.height,
  );
  assert.ok(
    dragged > original + 0.2,
    'Dragging the height handle must reshape the canonical volume.',
  );
  await page.locator('[data-shape-action="undo"]').click();
  await settle(page);
  assert.equal(
    await page.evaluate(
      () => window.__editor.proceduralWorkshop.shapeBridge.editor.primitive.height,
    ),
    original,
  );
  await page.locator('[data-shape-action="redo"]').click();
  await settle(page);
  assert.equal(
    await page.evaluate(
      () => window.__editor.proceduralWorkshop.shapeBridge.editor.primitive.height,
    ),
    dragged,
  );
  const nextPoint = await handlePoint(page, 'height');
  await page.mouse.move(nextPoint.x, nextPoint.y);
  await page.mouse.down();
  await page.mouse.move(nextPoint.x, nextPoint.y - 35, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settle(page);
  assert.equal(
    await page.evaluate(
      () => window.__editor.proceduralWorkshop.shapeBridge.editor.primitive.height,
    ),
    dragged,
  );
  report.assertions.push(
    'Pointer reshaping commits one undoable edit; Escape restores the prior shape.',
  );

  await page.locator('[data-shape-action="add-arch"]').click();
  await settle(page);
  await field(page, 'opening-at', 0.85);
  await page.locator('[data-shape-action="remove-opening"]').click();
  await settle(page);
  report.assertions.push('Opening authoring, movement, and removal update the preview.');
  await page.locator('[data-workshop-action="material"]').click();
  const roofPoint = await page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop;
    const rect = ui.renderer.domElement.getBoundingClientRect();
    for (const y of [0.35, 0.4, 0.45, 0.3, 0.25])
      for (const x of [0.5, 0.45, 0.55, 0.6, 0.4]) {
        const event = {
          clientX: rect.left + rect.width * x,
          clientY: rect.top + rect.height * y,
        };
        if (ui.materialController.hitRegion(event)?.id === 'cottage:roof') return event;
      }
    return null;
  });
  assert.ok(roofPoint, 'The roof must remain selectable through the material pointer handler.');
  await page.mouse.click(roofPoint.clientX, roofPoint.clientY);
  await page.waitForFunction(
    () => window.__editor.proceduralWorkshop.materialController.palette.isOpen,
  );
  await page.locator('.radial-palette--workshop [data-radial-item]').first().click();
  await settle(page);
  await page.locator('[data-workshop-action="material"]').click();
  assert.ok(
    await page.evaluate(
      () =>
        window.__editor.proceduralWorkshop.readInput().recipe.materialAreaOverrides['cottage:roof'],
    ),
  );
  report.assertions.push('The existing area material inspector assigns a finish to the new roof.');
  await page.locator('.workshop-bake').click();
  const baked = await page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop;
    return {
      stored: ui.manager.store.toDocument().at(-1),
      recipe: ui.readInput().recipe,
    };
  });
  assert.deepEqual(baked.stored.recipe.composition, baked.recipe.composition);
  report.assertions.push('Bake saves the authored shape composition and material overrides.');
  const saved = await page.evaluate(async () => {
    const ui = window.__editor.proceduralWorkshop;
    const state = ui.captureRuntimeState();
    const expected = JSON.stringify(ui.readInput().recipe.composition);
    ui.releaseRendererState();
    await ui.restoreRuntimeState(state);
    return {
      expected,
      restored: JSON.stringify(ui.readInput().recipe.composition),
    };
  });
  await settle(page);
  assert.equal(saved.restored, saved.expected);
  report.assertions.push('Runtime restoration preserves the semantic composition.');
  await page.locator('select[name="archetype"]').selectOption('manor');
  await page.waitForFunction(() => {
    const ui = window.__editor.proceduralWorkshop;
    return (
      !ui.shapeBridge.active &&
      ui.componentController.groups.size > 0 &&
      ui.status.textContent.startsWith('Final preview')
    );
  });
  await page.locator('select[name="archetype"]').selectOption('composition');
  await settle(page);
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.__editor.proceduralWorkshop.readInput().recipe.composition),
    ),
    saved.expected,
  );
  report.assertions.push('Switching back to the existing workshop preserves freeform work.');
  await page.evaluate(async () => {
    await import('/src/editor/workshop/WorkshopRadialMenus.js');
  });
  await page.waitForSelector('[data-role="workshop-radial-menus"]');
  assert.equal(await page.locator('[data-shape-action="preset"]').isVisible(), true);
  assert.equal(
    await page
      .locator('[data-radial-lane="archetype"][data-radial-item="composition"]')
      .isVisible(),
    true,
  );
  await page.screenshot({ path: path.join(output, 'radial-workshop.png') });
  report.assertions.push(
    'The main radial workshop exposes Freeform shapes and its authoring controls.',
  );
  await checkWorkshopShapeReview({ page, report, preset, settle, field });
  await checkWorkshopShapePolish({ page, report, preset, settle, output });
  await checkWorkshopShapeExpansion({ page, report, preset, settle, field, output, handlePoint });
  await checkWorkshopShapeBalconies({ page, report, preset, settle, field, output, handlePoint });
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  let previousIds = new Set();
  try {
    const previous = JSON.parse(
      await readFile(path.join(root, 'tmp/workshop-next-before/report.json'), 'utf8'),
    );
    previousIds = new Set(previous.presets.map((p) => p.id));
  } catch {
    /* A standalone capture does not need a previous gallery. */
  }
  const cards = report.presets
    .map(
      (p) =>
        `<figure class="${previousIds.has(p.id) ? 'with-before' : 'new-design'}">${previousIds.has(p.id) ? `<img class="before" src="../workshop-next-before/${p.id}.png" loading="lazy">` : ''}<img class="after" src="${p.id}.png" loading="lazy"><figcaption>${p.label} · ${p.stats.drawParts} batches${previousIds.has(p.id) ? '' : ' · New design'}</figcaption></figure>`,
    )
    .join('');
  const details = report.details.map((p) => `<figure><img src="${p.id}.png" alt="${p.label}" loading="lazy"><figcaption>${p.label}</figcaption></figure>`).join('');
  await writeFile(
    path.join(output, 'comparison.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workshop architectural upgrades</title><style>body{margin:24px;background:#171b20;color:#eee;font:16px system-ui}main,.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:20px}figure{margin:0}img{width:100%;border-radius:8px}figcaption{padding:10px}.before{display:none}#before:checked~main .with-before .before{display:block}#before:checked~main .with-before .after{display:none}@media(max-width:900px){main,.details{grid-template-columns:1fr}}</style><h1>Procedural workshop architectural upgrades</h1><p>${report.presets.length} editable designs. New curved balconies have turned timber railings and carved supports. Hinged shutters can be open, ajar or closed, with stable natural variation. Architectural features now have direct placement handles alongside doors, windows, curves and generated details.</p><input type="checkbox" id="before"><label for="before">Show previous version where available</label><main>${cards}</main><h2>Craft and distance detail</h2><section class="details">${details}</section></html>`,
  );
  console.log(
    `Passed ${report.assertions.length} interaction checks. Gallery: ${path.join(output, 'comparison.html')}`,
  );
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  } finally {
    try {
      const cleanup = await Promise.allSettled([browser?.close(), server ? terminateChildProcess(server) : null]);
      for (const result of cleanup) if (result.status === 'rejected') {
        console.error(result.reason);
        process.exitCode = 1;
      }
    } finally { releaseLock(); }
  }
}
