import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkWorkshopShapeExpansion({ page, report, preset, settle, field, output, handlePoint }) {
  const read = () => page.evaluate(() => {
    const ui = window.__editor.proceduralWorkshop, e = ui.shapeBridge.editor;
    return { primitive: e.primitive, resolved: e.resolvedPlans.get(e.selectedId), history: e.session.history.undoDepth,
      buffers: Object.fromEntries([...ui.shapeBridge.preview.cache.entries.get(e.selectedId).domains].map(([name, d]) => [name, d.parts.map((p) => p.geometry.uuid)])) };
  });
  await preset(page, 'rounded-cottage');
  const before = await read();
  await field(page, 'age', 0.8);
  const aged = await read();
  assert.deepEqual(aged.buffers.roof, before.buffers.roof); assert.deepEqual(aged.buffers.ivy, before.buffers.ivy);
  assert.notDeepEqual(aged.buffers.walls, before.buffers.walls);
  report.assertions.push('Weathering changes reuse roof and ivy buffers.');

  await preset(page, 'rounded-cottage');
  await page.locator('[data-shape-action="opening"]').selectOption('window-front');
  let start = await read(), point = await handlePoint(page, 'opening');
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x - 24, point.y - 26, { steps: 6 }); await page.mouse.up(); await settle(page);
  let moved = await read();
  assert.equal(moved.history, start.history + 1);
  assert.notDeepEqual(moved.primitive.openings, start.primitive.openings);
  await page.locator('[data-shape-action="undo"]').click(); await settle(page);
  assert.deepEqual((await read()).primitive.openings, start.primitive.openings);
  await page.locator('[data-shape-action="redo"]').click(); await settle(page);
  assert.deepEqual((await read()).primitive.openings, moved.primitive.openings);
  point = await handlePoint(page, 'opening');
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y - 15, { steps: 3 }); await page.keyboard.press('Escape'); await page.mouse.up(); await settle(page);
  assert.deepEqual((await read()).primitive.openings, moved.primitive.openings);
  report.assertions.push('Real window pointer drags commit once; undo, redo and Escape restore semantic cuts.');

  await preset(page, 'curved-courtyard');
  await page.locator('[data-shape-action="curve-edit"]').check();
  start = await read(); point = await handlePoint(page, 'curve-control:edge-main');
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 22, point.y + 10, { steps: 5 }); await page.mouse.up(); await settle(page);
  moved = await read(); assert.ok(moved.primitive.path);
  assert.notDeepEqual(moved.primitive.path, start.primitive.path);
  await page.locator('[data-shape-action="undo"]').click(); await settle(page);
  assert.deepEqual((await read()).primitive, start.primitive);
  await page.locator('[data-shape-action="redo"]').click(); await settle(page);
  assert.deepEqual((await read()).primitive.path, moved.primitive.path);
  await page.locator('[data-shape-action="curve-edit"]').uncheck();
  report.assertions.push('Curve handles author stable control points through real pointer events and replay.');

  await preset(page, 'rounded-cottage');
  await page.locator('[data-shape-action="detail-select"]').selectOption('detail:cottage:chimney');
  start = await read(); point = await handlePoint(page, 'detail');
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 18, point.y + 5, { steps: 4 }); await page.mouse.up(); await settle(page);
  moved = await read(); assert.equal(moved.primitive.detailOverrides.length, 1);
  assert.equal(moved.resolved.decorations.find((d) => d.role === 'chimney').provenance.source, 'promoted');
  assert.deepEqual(moved.buffers.walls, start.buffers.walls); assert.deepEqual(moved.buffers.facade, start.buffers.facade);
  await page.locator('[data-shape-action="detail-suppress"]').click(); await settle(page);
  assert.ok(!(await read()).resolved.decorations.some((d) => d.role === 'chimney'));
  await page.locator('[data-shape-action="undo"]').click(); await settle(page);
  assert.deepEqual((await read()).primitive.detailOverrides, moved.primitive.detailOverrides);
  const recovery = await page.evaluate(async () => {
    const ui = window.__editor.proceduralWorkshop, state = ui.captureRuntimeState();
    const expected = JSON.stringify(ui.readInput().recipe.composition);
    ui.bake(); const stored = JSON.stringify(ui.manager.store.toDocument().at(-1).recipe.composition);
    ui.releaseRendererState(); await ui.restoreRuntimeState(state);
    return { expected, stored, restored: JSON.stringify(ui.readInput().recipe.composition) };
  });
  await settle(page); assert.equal(recovery.stored, recovery.expected); assert.equal(recovery.restored, recovery.expected);
  report.assertions.push('Moving and hiding an individual chimney preserves other buffers and survives bake and renderer recovery.');

  for (const kind of ['dormer', 'bay', 'jetty', 'porch', 'buttress']) {
    await preset(page, 'timber-cottage');
    await page.locator(`[data-shape-action="feature-add-${kind}"]`).click(); await settle(page);
    const state = await read(); assert.equal(state.primitive.features.length, 1); assert.equal(state.resolved.features[0].intent.kind, kind);
    await field(page, 'rotation', 27); await field(page, 'width', 8.1);
    assert.ok((await read()).resolved.features.length > 0);
    await page.locator('[data-shape-action="feature-remove"]').click(); await settle(page);
    assert.equal((await read()).resolved.features.length, 0);
    await page.locator('[data-shape-action="undo"]').click(); await settle(page);
    assert.equal((await read()).resolved.features.length, 1);
  }
  report.assertions.push('All five architectural features can be added, resized with their host, removed and restored through authoring controls.');

  await preset(page, 'timber-pavilion');
  await page.locator('[data-shape-action="select"]').selectOption('ramp');
  assert.equal((await read()).resolved.resolvedStyle.values.floor, 'timber');
  await page.locator('[data-shape-field="style-railing"]').selectOption('stone'); await settle(page);
  const styled = await read(); assert.equal(styled.resolved.resolvedStyle.values.railing, 'stone'); assert.equal(styled.resolved.resolvedStyle.values.floor, 'timber');
  report.assertions.push('A connected ramp inherits timber while a railing override preserves floor inheritance.');

  const shots = [
    { id: 'dormer-detail', label: 'Host-aware roof dormers', preset: 'dormer-cottage', target: [0, 4.6, 0], direction: [8, 4.2, 10], distance: 13 },
    { id: 'bay-porch-detail', label: 'Curved bay and braced timber porch', preset: 'bay-porch-cottage', target: [0, 2.1, 0], direction: [8, 2.8, 11], distance: 13 },
    { id: 'jetty-detail', label: 'Projecting upper storey with timber corbels', preset: 'jettied-townhouse', target: [0, 3.4, 0], direction: [8, 3.5, 10], distance: 13 },
    { id: 'buttress-detail', label: 'Grounded stone buttresses', preset: 'buttressed-chapel', target: [0, 3.4, 0], direction: [8, 3.5, 10], distance: 16 },
    { id: 'weathering-ground-detail', label: 'Controlled wear, foundations, moss and entrance paving', preset: 'rounded-cottage', age: 0.8, target: [0, 1.4, 0], direction: [8, 1.3, 11], distance: 11 },
    { id: 'connected-style-detail', label: 'Inherited timber walkway and railings', preset: 'timber-pavilion', target: [0, 1.5, 2], direction: [8, 4, 11], distance: 15 },
    { id: 'roof-valley-detail', label: 'Continuous crossed-gable valleys and flashing', crossed: true, target: [0, 4.2, 0], direction: [8, 9, 11], distance: 16 },
  ];
  for (const shot of shots) {
    if (shot.crossed) {
      await preset(page, 'rounded-cottage');
      await page.evaluate(() => {
        const ui = window.__editor.proceduralWorkshop, e = ui.shapeBridge.editor, p = e.primitive;
        e.session.replace({ primitives: [{ ...p, id: 'cottage', craft: false }, { ...p, id: 'wing', rotation: 90, craft: false }] }); e.changed({ frame: true });
      }); await settle(page);
    } else await preset(page, shot.preset);
    if (shot.age !== undefined) await field(page, 'age', shot.age);
    const clip = await page.evaluate((s) => {
      const ui = window.__editor.proceduralWorkshop, T = window.__THREE_QA__;
      ui.shapeBridge.preview.handles.root.visible = false;
      ui.controls.target.set(...s.target); ui.camera.position.copy(ui.controls.target).addScaledVector(new T.Vector3(...s.direction).normalize(), s.distance); ui.controls.update();
      const rect = ui.renderer.domElement.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, shot);
    await settle(page); await page.screenshot({ path: path.join(output, `${shot.id}.png`), clip });
    report.details.push({ id: shot.id, label: shot.label });
    report.expansion ??= [];
    report.expansion.push(await page.evaluate((shot) => {
      const ui = window.__editor.proceduralWorkshop;
      return { id: shot.id, stats: ui.previewParts.stats,
        bufferBytes: ui.previewParts.reduce((sum, part) => sum + Object.values(part.geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (part.geometry.index?.array.byteLength ?? 0), 0),
        groundMasks: [...ui.shapeBridge.editor.resolvedPlans.values()].reduce((n, p) => n + p.ground.masks.length, 0) };
    }, shot));
    await page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.preview.handles.sync());
  }
}
