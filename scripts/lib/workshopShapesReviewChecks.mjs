import assert from 'node:assert/strict';

export async function checkWorkshopShapeReview({ page, report, preset, settle, field }) {
  const read = () => page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.editor.primitive);
  await preset(page, 'curved-courtyard');
  await field(page, 'height', 0.5);
  assert.equal((await read()).height, 0.5);
  await field(page, 'height', 16);
  assert.equal((await read()).height, 16);
  report.assertions.push('Wall sliders support the complete legal height range.');

  await preset(page, 'bell-turret');
  await field(page, 'height', 1);
  const short = await read();
  assert.ok(short.openings.every((o) => o.bottom + o.height <= short.height));
  await page.locator('[data-shape-action="undo"]').click();
  await settle(page);
  assert.ok((await read()).height > 1);
  report.assertions.push('Lowering a turret adapts elevated windows and undo restores both.');

  await preset(page, 'garden-bridge');
  await field(page, 'elevation', 4);
  await field(page, 'rise', -2);
  assert.equal((await read()).rise, -2);
  assert.equal(await page.locator('[data-shape-field="rise"]').inputValue(), '-2');
  assert.equal(await page.locator('[data-shape-field="rise"]').getAttribute('min'), '-4');
  report.assertions.push('Descending traversal retains its negative rise in the visible controls.');

  await preset(page, 'rounded-cottage');
  await page.evaluate(() => {
    const editor = window.__editor.proceduralWorkshop.shapeBridge.editor;
    const path = editor.resolvedPlans.get(editor.selectedId).curve.path;
    editor.session.update(editor.selectedId, { footprint: { family: 'custom', path } });
    editor.changed();
  });
  await settle(page);
  const outline = (await read()).footprint.path;
  assert.equal(await page.locator('[data-shape-field="footprint"]').inputValue(), 'custom');
  for (const name of ['width', 'depth'])
    assert.equal(await page.locator(`[data-shape-field="${name}"]`).isDisabled(), true);
  await field(page, 'height', 5);
  await field(page, 'x', 2);
  assert.deepEqual((await read()).footprint.path, outline);
  const customHandles = await page.evaluate(() =>
    window.__editor.proceduralWorkshop.shapeBridge.preview.handles.handles
      .filter((h) => h.visible).map((h) => h.userData.field));
  assert.ok(!customHandles.includes('width') && !customHandles.includes('depth'));
  report.assertions.push('Custom outlines remain visible and editable without ineffective resize controls.');

  await preset(page, 'curved-courtyard');
  await page.evaluate(() => {
    const editor = window.__editor.proceduralWorkshop.shapeBridge.editor;
    editor.session.update(editor.selectedId, { path: editor.resolvedPlans.get(editor.selectedId).curve.path });
    editor.changed();
  });
  await settle(page);
  for (const name of ['length', 'bend'])
    assert.equal(await page.locator(`[data-shape-field="${name}"]`).isDisabled(), true);
  report.assertions.push('Custom wall paths disable length and bend controls that cannot reshape the path.');

  await preset(page, 'rounded-cottage');
  await field(page, 'height', 5);
  const recovery = await page.evaluate(async () => {
    const ui = window.__editor.proceduralWorkshop, editor = ui.shapeBridge.editor;
    editor.session.begin('Unfinished edit');
    editor.session.update(editor.selectedId, { height: 7 });
    const snapshot = ui.captureRuntimeState();
    const savedHeight = snapshot.input.recipe.composition.primitives[0].height;
    ui.releaseRendererState();
    await ui.restoreRuntimeState(snapshot);
    const restored = editor.primitive.height;
    editor.session.undo();
    const undone = editor.primitive.height;
    editor.session.redo();
    const redone = editor.primitive.height;
    editor.changed();
    return { savedHeight, restored, undone, redone };
  });
  await settle(page);
  assert.deepEqual(recovery, { savedHeight: 5, restored: 5, undone: 3.5, redone: 5 });
  report.assertions.push('Recovery cancels an unfinished edit and restores consistent committed history.');

  const bake = await page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop, editor = ui.shapeBridge.editor;
    const depth = editor.session.history.undoDepth;
    editor.session.begin('Pending slider edit');
    editor.session.update(editor.selectedId, { height: 6 });
    ui.bake();
    return {
      height: ui.manager.store.toDocument().at(-1).recipe.composition.primitives[0].height,
      historyDelta: editor.session.history.undoDepth - depth,
      pending: Boolean(editor.session.transaction),
    };
  });
  assert.deepEqual(bake, { height: 6, historyDelta: 1, pending: false });
  report.assertions.push('Baking completes a pending gesture once and saves the committed construction.');
  await preset(page, 'timber-cottage');
}
