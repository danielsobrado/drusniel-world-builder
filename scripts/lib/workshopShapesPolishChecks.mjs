import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkWorkshopShapePolish({ page, report, preset, settle, output }) {
  await preset(page, 'rounded-cottage');
  const read = () => page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop, editor = ui.shapeBridge.editor;
    const domains = ui.shapeBridge.preview.cache.entries.get(editor.selectedId).domains;
    return {
      primitive: editor.primitive,
      decorations: editor.resolvedPlans.get(editor.selectedId).decorations,
      buffers: Object.fromEntries(['walls', 'roof', 'facade', 'ivy'].map((name) =>
        [name, domains.get(name)?.parts.map((p) => p.geometry.uuid)])),
    };
  });
  const before = await read();
  assert.ok(before.decorations.some((d) => d.role === 'chimney'));
  assert.ok(before.decorations.some((d) => d.role === 'window-box'));
  assert.equal(before.primitive.decorations, undefined);
  await page.locator('[data-shape-field="craft"]').uncheck();
  await settle(page);
  const plain = await read();
  assert.equal(plain.primitive.craft, false);
  assert.equal(plain.decorations.length, 0);
  for (const name of ['walls', 'ivy']) assert.deepEqual(plain.buffers[name], before.buffers[name]);
  for (const name of ['roof', 'facade']) assert.notDeepEqual(plain.buffers[name], before.buffers[name]);
  report.assertions.push('Craft dressing toggles locally without rebuilding masonry or ivy.');
  const saved = await page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop;
    ui.bake();
    return ui.manager.store.toDocument().at(-1).recipe.composition.primitives[0];
  });
  assert.equal(saved.craft, false);
  assert.equal(saved.decorations, undefined);
  report.assertions.push('Bake saves the craft preference and keeps generated dressing out of authoring state.');
  await page.locator('[data-shape-action="undo"]').click();
  await settle(page);
  assert.deepEqual((await read()).decorations, before.decorations);
  await page.locator('[data-shape-action="redo"]').click();
  await settle(page);
  assert.equal((await read()).decorations.length, 0);
  report.assertions.push('Undo and redo deterministically restore and remove the crafted details.');

  await page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop;
    ui.materialController.setDocument({ ...ui.materialController.toDocument(), materialAreaOverrides: {} });
    ui.materialController.setActive(false);
    ui.schedulePreview(0);
  });
  await settle(page);

  report.details = [];
  for (const shot of [
    { id: 'timber-facade-detail', label: 'Timber, carved stone, door hardware and planted window boxes', preset: 'timber-cottage', target: [0, 2.1, 0], direction: [8, 3.2, 10], distance: 12 },
    { id: 'slate-roof-detail', label: 'Overlapping slate, ridge caps and an open chimney flue', preset: 'rounded-cottage', target: [0, 5.2, 0], direction: [8, 7, 10], distance: 14 },
    { id: 'joined-buildings-detail', label: 'Cottage and turret with shared contact masks', preset: 'cottage-turret' },
  ]) {
    await preset(page, shot.preset);
    const clip = await page.evaluate((shot) => {
      const ui = window.__editor.proceduralWorkshop, T = window.__THREE_QA__;
      ui.shapeBridge.preview.handles.root.visible = false;
      if (shot.target) {
        ui.controls.target.set(...shot.target);
        ui.camera.position.copy(ui.controls.target).addScaledVector(new T.Vector3(...shot.direction).normalize(), shot.distance);
        ui.controls.update();
      }
      const rect = ui.renderer.domElement.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, shot);
    await settle(page);
    await page.screenshot({ path: path.join(output, `${shot.id}.png`), clip });
    report.details.push({ id: shot.id, label: shot.label });
    await page.evaluate(() => {
      const ui = window.__editor.proceduralWorkshop;
      ui.shapeBridge.preview.handles.root.visible = true;
      ui.framePreview();
    });
  }
  await preset(page, 'timber-cottage');
}
