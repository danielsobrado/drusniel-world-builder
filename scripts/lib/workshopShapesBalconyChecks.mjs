import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkWorkshopShapeBalconies({ page, report, preset, settle, field, output, handlePoint }) {
  const read = () => page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop, e = ui.shapeBridge.editor;
    return { primitive: e.primitive, history: e.session.history.undoDepth, historyLimit: e.session.history.maxEntries,
      buffers: Object.fromEntries([...ui.shapeBridge.preview.cache.entries.get(e.selectedId).domains]
        .map(([name, d]) => [name, d.parts.map((p) => p.geometry.uuid)])) };
  });
  await preset(page, 'rounded-cottage');
  await page.locator('[data-shape-action="opening"]').selectOption('window-front');
  let before = await read();
  for (const pose of ['closed', 'ajar', 'open', 'auto']) {
    await field(page, 'opening-shutterPose', pose); const after = await read();
    assert.equal(after.primitive.openings.find((o) => o.id === 'window-front').shutterPose, pose);
    for (const domain of ['walls', 'roof', 'ground', 'ivy']) assert.deepEqual(after.buffers[domain], before.buffers[domain]);
    assert.notDeepEqual(after.buffers.facade, before.buffers.facade); before = after;
  }
  await page.locator('[data-shape-action="undo"]').click(); await settle(page);
  assert.equal((await read()).primitive.openings.find((o) => o.id === 'window-front').shutterPose, 'open');
  await page.locator('[data-shape-action="redo"]').click(); await settle(page);
  assert.deepEqual((await read()).primitive, before.primitive);
  report.assertions.push('Four shutter poses edit through the UI, rebuild only the facade and replay correctly.');

  for (const id of ['balcony-tower', 'bay-porch-cottage', 'dormer-cottage']) {
    await preset(page, id);
    await page.evaluate(() => {
      const ui = window.__editor.proceduralWorkshop, T = window.__THREE_QA__;
      const h = ui.shapeBridge.preview.handles.handles.find((h) => h.visible && h.userData.field === 'feature');
      const position = h.getWorldPosition(new T.Vector3()), outward = new T.Vector3(...h.userData.definition.normal).normalize();
      ui.controls.target.copy(position); ui.camera.position.copy(position).addScaledVector(outward, 11).add(new T.Vector3(0, 4, 0)); ui.controls.update();
    }); await settle(page);
    before = await read(); let position = await handlePoint(page, 'feature');
    await page.mouse.move(position.x, position.y); await page.mouse.down();
    await page.mouse.move(position.x + 28, position.y - 10, { steps: 5 }); await page.mouse.up(); await settle(page);
    const after = await read(); assert.notDeepEqual(after.primitive.features, before.primitive.features);
    assert.equal(after.history, Math.min(before.history + 1, before.historyLimit));
    assert.deepEqual(after.primitive.openings, before.primitive.openings);
    await page.locator('[data-shape-action="undo"]').click(); await settle(page); assert.deepEqual((await read()).primitive, before.primitive);
    await page.locator('[data-shape-action="redo"]').click(); await settle(page); assert.deepEqual((await read()).primitive, after.primitive);
    position = await handlePoint(page, 'feature');
    await page.mouse.move(position.x, position.y); await page.mouse.down();
    await page.mouse.move(position.x - 14, position.y + 6, { steps: 3 }); await page.keyboard.press('Escape'); await page.mouse.up(); await settle(page);
    assert.deepEqual((await read()).primitive, after.primitive);
  }
  report.assertions.push('Balconies, bays and dormers move through real pointer drags, with one history command and Escape cancellation.');

  await preset(page, 'timber-cottage');
  await page.locator('[data-shape-action="feature-add-balcony"]').click(); await settle(page);
  assert.equal((await read()).primitive.features[0].kind, 'balcony');
  await page.locator('[data-shape-action="feature-remove"]').click(); await settle(page);
  assert.equal((await read()).primitive.features.length, 0);
  await page.locator('[data-shape-action="undo"]').click(); await settle(page);
  assert.equal((await read()).primitive.features[0].kind, 'balcony');
  report.assertions.push('A curved balcony can be added, removed and restored using authoring controls.');

  await preset(page, 'balcony-manor');
  const recovery = await page.evaluate(async () => {
    const ui = window.__editor.proceduralWorkshop, state = ui.captureRuntimeState();
    const expected = JSON.stringify(ui.readInput().recipe.composition); ui.bake();
    const stored = JSON.stringify(ui.manager.store.toDocument().at(-1).recipe.composition);
    ui.releaseRendererState(); await ui.restoreRuntimeState(state);
    return { expected, stored, restored: JSON.stringify(ui.readInput().recipe.composition) };
  }); await settle(page);
  assert.equal(recovery.expected, recovery.stored); assert.equal(recovery.expected, recovery.restored);
  report.assertions.push('Balcony intent and authored shutter poses survive bake and renderer recovery.');

  const shots = [
    { id: 'balcony-manor-detail', label: 'Turned timber balusters and curved corbels', preset: 'balcony-manor', balcony: true, direction: [8, 2.8, 11], distance: 9.5, coarse: true },
    { id: 'balcony-tower-detail', label: 'A balcony following a tapered round tower', preset: 'balcony-tower', balcony: true, direction: [8, 3, 11], distance: 10, coarse: true },
    { id: 'shutters-open-detail', label: 'Hinged arched shutters with natural variation', preset: 'rounded-cottage', target: [1.4, 1.8, 1.8], direction: [6, 1.4, 11], distance: 10 },
    { id: 'shutters-closed-detail', label: 'Closed shutters preserve the arched opening profile', preset: 'rounded-cottage', pose: 'closed', target: [1.4, 1.8, 1.8], direction: [6, 1.4, 11], distance: 10 },
  ];
  for (const shot of shots) {
    await preset(page, shot.preset);
    if (shot.pose) {
      await page.locator('[data-shape-action="opening"]').selectOption('window-front');
      await field(page, 'opening-shutterPose', shot.pose);
    }
    const clip = await page.evaluate((shot) => {
      const ui = window.__editor.proceduralWorkshop, T = window.__THREE_QA__;
      let target = shot.target;
      if (shot.balcony) {
        const e = ui.shapeBridge.editor, b = e.resolvedPlans.get(e.selectedId).features.find((f) => f.balcony).balcony;
        const i = Math.floor(b.outer.length / 2); target = b.outer[i].map((v, k) => (v + b.inner[i][k]) / 2 + (k === 1 ? 0.35 : 0));
      }
      ui.controls.target.set(...target); ui.camera.position.copy(ui.controls.target).addScaledVector(new T.Vector3(...shot.direction).normalize(), shot.distance); ui.controls.update();
      const rect = ui.renderer.domElement.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, shot); await settle(page);
    await page.evaluate(() => { window.__editor.proceduralWorkshop.shapeBridge.preview.handles.root.visible = false; });
    await page.screenshot({ path: path.join(output, `${shot.id}.png`), clip }); report.details.push({ id: shot.id, label: shot.label });
    if (shot.coarse) {
      const nearVertices = await page.evaluate(() => window.__editor.proceduralWorkshop.previewParts.stats.sourceVertices);
      await page.locator('select[name="detail"]').selectOption('1'); await settle(page);
      const coarseVertices = await page.evaluate(() => window.__editor.proceduralWorkshop.previewParts.stats.sourceVertices);
      assert.ok(coarseVertices < nearVertices);
      await page.evaluate(() => { window.__editor.proceduralWorkshop.shapeBridge.preview.handles.root.visible = false; });
      await page.screenshot({ path: path.join(output, `${shot.id}-coarse.png`), clip });
      report.details.push({ id: `${shot.id}-coarse`, label: `${shot.label} · Coarse detail` });
      await page.locator('select[name="detail"]').selectOption('2'); await settle(page);
    }
    await page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.preview.handles.sync());
  }
  report.assertions.push('Both balcony presets retain their structural silhouette with fewer vertices at coarse detail.');
}
