import assert from 'node:assert/strict';

export async function checkWorkshopShapeDirectEditing({ page, report, preset, settle, handlePoint }) {
  const primitive = () => page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.editor.primitive);
  async function drag(field, dx, dy) {
    await page.evaluate((field) => {
      const ui = window.__editor.proceduralWorkshop, T = window.__THREE_QA__;
      const h = ui.shapeBridge.preview.handles.handles.find((h) => h.visible && h.userData.field === field);
      const position = h.getWorldPosition(new T.Vector3()), normal = new T.Vector3(...h.userData.definition.normal);
      const direction = normal.y ? position.clone().setY(0).normalize() : normal.normalize();
      ui.controls.target.copy(position); ui.camera.position.copy(position).addScaledVector(direction, 12).add(new T.Vector3(0, 5, 0));
      ui.controls.update();
    }, field);
    await settle(page);
    const point = await handlePoint(page, field);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    const grabbed = await page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.preview.handles.drag?.field);
    assert.equal(grabbed, field, 'The pointer grabs the intended construction handle.');
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 5 }); await page.mouse.up(); await settle(page);
  }
  async function replay(before, after) {
    await page.locator('[data-shape-action="undo"]').click(); await settle(page); assert.deepEqual(await primitive(), before);
    await page.locator('[data-shape-action="redo"]').click(); await settle(page); assert.deepEqual(await primitive(), after);
  }
  await preset(page, 'rounded-cottage');
  await page.locator('[data-shape-action="opening"]').selectOption('door');
  let before = await primitive(); await drag('opening', 25, 0); let after = await primitive();
  assert.notDeepEqual(after.openings.find((o) => o.id === 'door'), before.openings.find((o) => o.id === 'door'),
    `Door drag result: ${JSON.stringify({ before, after })}`);
  assert.deepEqual(after.openings.filter((o) => o.id !== 'door'), before.openings.filter((o) => o.id !== 'door'));
  await replay(before, after);
  report.assertions.push('A real door drag moves its semantic opening, preserves windows and supports undo/redo.');

  await preset(page, 'rounded-cottage');
  const boxId = await page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.editor.resolvedPlans.get('cottage').decorations.find((d) => d.role === 'window-box').id);
  await page.locator('[data-shape-action="detail-select"]').selectOption(boxId);
  before = await primitive(); await drag('detail', 24, 8); after = await primitive();
  assert.ok(after.detailOverrides.some((d) => d.key === boxId)); await replay(before, after);
  await page.locator('[data-shape-action="detail-suppress"]').click(); await settle(page);
  assert.ok((await primitive()).suppressed.includes(boxId));
  await page.locator('[data-shape-action="undo"]').click(); await settle(page); assert.deepEqual(await primitive(), after);
  report.assertions.push('Individual planters move and hide through pointer and authoring controls with semantic replay.');

  await preset(page, 'rounded-cottage'); await page.locator('[data-shape-action="curve-edit"]').check();
  const pointField = await page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.preview.handles.handles
    .filter((h) => h.visible && h.userData.definition.type === 'curve-point').sort((a, b) => b.position.z - a.position.z)[0].userData.field);
  before = await primitive(); await drag(pointField, 14, 9); after = await primitive();
  assert.equal(after.footprint.family, 'custom'); assert.ok(after.footprint.path);
  await replay(before, after); await page.locator('[data-shape-action="curve-edit"]').uncheck();
  report.assertions.push('A footprint point drag authors a custom curve and survives undo/redo.');

  await preset(page, 'cottage-turret');
  report.editMeasurements = await page.evaluate(async () => {
    const { WorkshopShapeCache } = await import('/src/editor/workshop/shapes/WorkshopShapeCache.js');
    const { planWorkshopComposition } = await import('/src/editor/workshop/ProceduralWorkshopComposition.js');
    const ui = window.__editor.proceduralWorkshop, cache = new WorkshopShapeCache();
    const recipe = structuredClone(ui.readInput().recipe), samples = [];
    function update(interactive) {
      const start = performance.now(), plans = planWorkshopComposition(recipe).shapePlans;
      const planningMs = performance.now() - start;
      const result = cache.update({ ...recipe, shapeInteractive: interactive }, plans); cache.releaseRemoved(result);
      return { planningMs, ...result.stats, totalMs: performance.now() - start };
    }
    try {
      update(false); const turret = cache.entries.get('turret');
      for (let i = 0; i < 5; i++) {
        recipe.composition.primitives[0].openings.find((o) => o.role === 'window').bottom += 0.02;
        samples.push({ phase: 'drag', ...update(true), neighborReused: cache.entries.get('turret') === turret });
      }
      samples.push({ phase: 'settle', ...update(false), neighborReused: cache.entries.get('turret') === turret });
      return samples;
    } finally { cache.clear(); }
  });
  assert.ok(report.editMeasurements.every((s) => s.neighborReused));
  report.assertions.push('Five measured interactive opening edits and the settled upgrade preserve neighboring GPU products.');
}
