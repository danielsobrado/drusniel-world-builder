import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run with native Windows Node from WSL for the host's hardware WebGPU adapter.
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist', '--use-angle=default', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const errors = [], warnings = [], checks = {};
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => errors.push(error.stack));
  page.on('console', message => {
    if (message.text().startsWith('Recovery ')) console.log(message.text());
    if (message.type() === 'error') { errors.push(message.text()); console.log('Browser error:', message.text().slice(0, 500)); }
    if (message.type() === 'warn') { warnings.push(message.text()); console.log('Browser warning:', message.text().slice(0, 500)); }
  });
  await page.goto('http://localhost:5173/?qaRecovery=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__editor?.captureRecoveryState, null, { timeout: 180000 });
  await page.waitForFunction(() => window.__editor?.exploration?.lastTimestamp !== null && document.querySelector('.loading-overlay')?.hidden, null, { timeout: 60000 });
  checks.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility' });
    return { vendor: adapter?.info.vendor, architecture: adapter?.info.architecture,
      fallback: adapter?.info.isFallbackAdapter, backend: window.__editor.terrainView.rendererBackendStatus.mode };
  });
  assert.equal(checks.adapter.backend, 'webgpu'); assert.equal(checks.adapter.fallback, false);
  await page.evaluate(() => { const e = window.__editor; e.exploration.tour.start(); });
  await page.waitForFunction(() => window.__editor?.exploration.tour.elapsed > 0.5);
  checks.tour = await page.evaluate(() => {
    const e = window.__editor, tour = e.exploration.tour;
    const result = { active: tour.active, override: e.viewModeController.camera === tour.camera,
      preload: tour.preloadFocus(), clearance: tour.camera.position.y - e.terrainView.getWorldHeight(tour.camera.position.x, tour.camera.position.z) };
    tour.stop(); result.restored = !e.viewModeController.cameraOverride; return result;
  });
  assert.ok(checks.tour.active && checks.tour.override && checks.tour.restored); assert.ok(checks.tour.clearance >= 17.9);
  console.log('Tour passed.');
  // Real imported burgs exercise population projection and large canonical coordinates.
  checks.settlement = await page.evaluate(async () => {
    const e = window.__editor;
    const { importAzgaarFullJson } = await import('/src/editor/import/AzgaarJsonImporter.js');
    const manifest = await (await fetch('/maps/manifest.json')).json();
    const source = await (await fetch('/maps/' + manifest.maps[0].url)).json();
    const document = importAzgaarFullJson(source, e.config);
    e.controller.loadDocument(document);
    const field = e.terrainView.worldStore.generator.ensureSettlementField();
    const burg = field.entries.find(entry => entry.settlement.population > 0).settlement;
    const home = { x: (burg.cellX + 0.5) * field.tileSize, z: -(burg.cellZ + 0.5) * field.tileSize };
    e.viewModeController.setMode('player', { spawn: e.terrainView.floatingOrigin.toRender(home.x, home.z) });
    return { id: burg.id, population: burg.population, home };
  });
  console.log('Imported settlement:', JSON.stringify(checks.settlement));
  await page.waitForFunction(() => window.__editor?.exploration?.residents.npcs.entries.size > 0, null, { timeout: 45000 });
  checks.residents = await page.evaluate(() => {
    const e = window.__editor, npcs = e.exploration.residents.npcs;
    return { count: npcs.entries.size, finite: [...npcs.entries.values()].every(entry => entry.root.position.toArray().every(Number.isFinite)),
      lods: [...npcs.entries.values()].map(entry => entry.meshes.map(mesh => mesh.stages.map(stage => stage.index.count))), origin: e.terrainView.floatingOrigin.getState() };
  });
  assert.ok(checks.residents.count <= 24 && checks.residents.finite); console.log('Residents passed.');
  // An authored anchor is deterministic even when this burg is outside jungle.
  await page.evaluate(() => {
    const e = window.__editor, position = e.terrainView.floatingOrigin.toCanonical(e.playerController.state.x, e.playerController.state.z);
    e.exploration.serpents.settings.entries = [{ home: [position.x + 15, position.z], species: 'cobra', seed: 7 }];
    e.exploration.serpents.nextRefresh = 0;
  });
  await page.waitForFunction(() => window.__editor?.exploration?.serpents.entries.size > 0, null, { timeout: 60000 });
  await page.waitForFunction(() => { const skins = window.__editor?.exploration.serpents.skins; return skins && [...skins.coats.values()].every(coat => !coat.pending); }, null, { timeout: 60000 });
  checks.serpents = await page.evaluate(() => {
    const e = window.__editor, system = e.exploration.serpents;
    return { count: system.entries.size, finite: [...system.entries.values()].every(({ serpent }) => [...serpent.frames].every(Number.isFinite)),
      skins: [...system.skins.coats.values()].every(coat => !coat.pending), prepared: e.drawPreparation.pending.size === 0 };
  });
  assert.ok(checks.serpents.count <= 2 && checks.serpents.finite && checks.serpents.skins); console.log('Serpents passed.');
  // A closed workshop still owns a semantic draft and its undo history.
  await page.evaluate(async () => {
    const workshop = window.__editor.proceduralWorkshop;
    workshop.form.elements.namedItem('label').value = 'Recovery draft';
    workshop.form.elements.namedItem('detail').value = '1';
    await workshop.open(); await workshop.generatePreview();
    const components = workshop.componentController, before = components.captureEditState();
    const componentId = components.groups.keys().next().value;
    components.transforms[componentId] = { position: [0.25, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    components.semanticEditSession.record(before, components.captureEditState());
    workshop.close();
  });
  // Capture an edit and player pose, invalidate the actual device, then invoke
  // Three's public loss callback (intentional destroy is otherwise ignored by Three).
  await page.evaluate(() => {
    const e = window.__editor;
    console.log('Recovery QA: painting');
    window.__terrainBefore = e.controller.tileMap.get(1, 1);
    window.__terrainAfter = window.__terrainBefore === 4 ? 5 : 4;
    const patch = e.controller.tileMap.paintSquare(1, 1, 1, window.__terrainAfter);
    e.controller.commitHistory({ kind: 'terrain', patch });
    const other = e.controller.tileMap.get(2, 2);
    window.__redoTerrain = other === 4 ? 5 : 4;
    e.controller.commitHistory({ kind: 'terrain', patch: e.controller.tileMap.paintSquare(2, 2, 1, window.__redoTerrain) });
    e.controller.undo();
    console.log('Recovery QA: capturing');
    window.__recoveryExpected = e.captureRecoveryState();
    console.log('Recovery QA: captured');
    window.__oldRenderer = e.terrainView.renderer;
    e.terrainView.renderer.backend.device.destroy();
    console.log('Recovery QA: device destroyed');
    e.terrainView.renderer.onDeviceLost({ api: 'WebGPU', reason: 'qa', message: 'Exploration recovery acceptance' });
  });
  await page.waitForFunction(() => window.__editor?.captureRecoveryState
    && window.__editor.terrainView.renderer !== window.__oldRenderer && !window.__editor.recovery.pending, null, { timeout: 240000 });
  checks.recovery = await page.evaluate(() => {
    const e = window.__editor, expected = window.__recoveryExpected, actual = e.captureRecoveryState();
    const changes = [];
    const compare = (left, right, path = '') => {
      if (Object.is(left, right)) return;
      if (left && right && typeof left === 'object' && typeof right === 'object') {
        for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) compare(left[key], right[key], path + '/' + key);
      } else if (changes.length < 30) changes.push({ path, expected: left, actual: right });
    };
    // Export metadata changes on every capture; authoring data must be identical.
    const { savedAt: expectedSavedAt, ...expectedDocument } = expected.document;
    const { savedAt: actualSavedAt, ...actualDocument } = actual.document;
    compare(expectedDocument, actualDocument);
    compare(expected.workshop.input, actual.workshop.input, '/workshop/input');
    const workshop = e.proceduralWorkshop;
    const history = workshop.componentController.semanticEditSession;
    const beforeUndo = JSON.stringify(history.state);
    const undone = history.undo(); const redone = history.redo();
    const historyDepths = actual.undoStack.length === expected.undoStack.length && actual.redoStack.length === expected.redoStack.length;
    e.controller.undo(); const worldUndone = e.controller.tileMap.get(1, 1) === window.__terrainBefore;
    e.controller.redo(); const worldRedone = e.controller.tileMap.get(1, 1) === window.__terrainAfter;
    e.controller.redo(); const futureRedone = e.controller.tileMap.get(2, 2) === window.__redoTerrain;
    return { attempts: e.recovery.attempts, document: changes.length === 0, changes,
      workshop: actual.workshop.input.label === 'Recovery draft' && !actual.workshop.open
        && workshop.previewParts.length > 0 && !!undone && !!redone && JSON.stringify(redone) === beforeUndo,
      history: historyDepths && worldUndone && worldRedone && futureRedone,
      mode: actual.mode === expected.mode, origin: JSON.stringify(actual.origin) === JSON.stringify(expected.origin),
      yaw: actual.player.yaw === expected.player.yaw, canvases: document.querySelectorAll('canvas[aria-label="Drusniel World infinite world editor viewport"]').length };
  });
  assert.ok(checks.recovery.document && checks.recovery.workshop && checks.recovery.history
    && checks.recovery.mode && checks.recovery.origin && checks.recovery.yaw);
  assert.equal(checks.recovery.canvases, 1); console.log('Renderer recovery passed.');
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  mobile.on('pageerror', error => errors.push(error.stack));
  await mobile.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await mobile.waitForFunction(() => !!window.__editor?.captureRecoveryState, null, { timeout: 180000 });
  await mobile.evaluate(() => { const e = window.__editor; e.viewModeController.setMode('player', { spawn: { x: 0, z: 0 } }); e.exploration.syncMobileVisibility(); });
  checks.mobile = await mobile.evaluate(() => {
    const e = window.__editor; e.playerController.setMobileInput({ forward: 0.5 });
    const yaw = e.playerController.yaw; e.playerController.lookMobile(0.2, 0.1);
    return { enabled: e.playerController.mobile.enabled, visible: !e.exploration.mobile.root.hidden,
      pixelRatio: e.terrainView.renderer.getPixelRatio(), yaw: e.playerController.yaw !== yaw, analog: e.playerController.mobile.forward };
  });
  assert.ok(checks.mobile.enabled && checks.mobile.visible && checks.mobile.yaw); assert.equal(checks.mobile.pixelRatio, 1);
  assert.equal(checks.mobile.analog, 0.5);
  await mobile.waitForFunction(() => document.querySelector('.loading-overlay')?.hidden);
  await mobile.screenshot({ path: 'tmp/exploration-mobile.png' });
  await mobile.locator('.view-mode-switcher [data-view-mode="edit"]').tap();
  await mobile.waitForFunction(() => window.__editor.viewModeController.mode === 'edit' && window.__editor.exploration.mobile.root.hidden);
  checks.mobile.editSwitch = true; console.log('Mobile passed.');
  assert.deepEqual(errors, []);
} catch (error) {
  checks.failure = await page?.evaluate(() => {
    const e = window.__editor;
    if (!e) return { body: document.body.innerText.slice(-1500) };
    const residents = e.exploration?.residents;
    const focus = e.viewModeController.getFocusWorld();
    return { mode: e.viewModeController.mode, focus, canonical: e.terrainView.floatingOrigin.toCanonical(focus.x, focus.z),
      generator: e.terrainView.worldStore.generator.constructor.name, desired: [...(residents?.npcs.desired.values() ?? [])],
      failed: [...(residents?.npcs.failed ?? [])], pending: [...(residents?.npcs.pending.keys() ?? [])],
      nearest: residents?.generator?.ensureSettlementField?.()?.entries.slice(0, 2).map(entry => entry.settlement),
      residentsGenerator: residents?.generator?.constructor.name, frame: residents?.nextRefresh };
  }).catch(() => null);
  console.log('Failure state:', JSON.stringify(checks.failure));
  throw error;
} finally {
  await mkdir('tmp', { recursive: true });
  await writeFile('tmp/exploration-qa.json', JSON.stringify({ checks, errors, warnings }, null, 2));
  await browser.close();
}
console.log(JSON.stringify(checks, null, 2));
