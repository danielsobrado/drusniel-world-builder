import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { GeologyLodBatches } from '../src/editor/stylized/lod/GeologyLodBatches.js';
import { buildDecorationBatches, LocationDecorationAdmission, selectLocationDecorations } from '../src/editor/locations/LocationDecorationAdmission.js';

const config = resolveRenderEnhancements();
const geology = { ...config.geologyAdmissionBudget, triangleBudget: 1000, recoveryRatio: 0.85 };
const decoration = { ...config.locationDecorationBudget, triangleBudget: 1000, drawBudget: 2 };
const item = (x, scale = 2, kind = 0, stretch = 1) => ({ x, z: 0, scale, kind, stretch });
const mesh = triangles => ({ geometry: { index: { count: triangles * 3 } } });
function batches(settings = geology) {
  const lod = new GeologyLodBatches({ kinds: 1, cellMeters: 16, admission: settings });
  lod.updateFocus({ x: 0, z: 0 });
  return { lod, meshes: [mesh(1000), ...Array.from({ length: 4 }, () => mesh(100))] };
}

test('adaptive geology demotes only cheaper distant representations, never removes placements', () => {
  const { lod, meshes } = batches();
  const items = [item(20), item(90), item(100)];
  lod.plan(items, meshes, 10);
  assert.equal(lod.index(items[0]), 0);
  assert.ok(lod.isFarBatch(lod.index(items[1])));
  assert.ok(lod.isFarBatch(lod.index(items[2])));
  assert.equal(lod.stats.requested, 3000);
  assert.equal(lod.stats.selected, 1200);
  assert.equal(lod.stats.simplified, 2);
  assert.equal(lod.stats.overflow, 200);
});

test('protection includes scale, stretch and movement refresh margin', () => {
  const { lod, meshes } = batches();
  const items = [item(67), item(100, 4, 0, 2), item(90)];
  lod.plan(items, meshes, 10);
  assert.equal(lod.index(items[0]), 0);
  assert.equal(lod.index(items[1]), 0);
  assert.ok(lod.isFarBatch(lod.index(items[2])));
});

test('unknown, empty or more expensive far geometry is not selected', () => {
  for (const cost of [0, 1000, 2000, null]) {
    const { lod, meshes } = batches();
    const rock = item(90);
    meshes[lod.farIndex(rock)] = cost === null ? {} : mesh(cost);
    lod.plan([rock, item(20)], meshes, 10);
    assert.equal(lod.index(rock), 0);
    assert.equal(lod.stats.simplified, 0);
  }
});

test('baseline capacity and extra draw limit are respected', () => {
  const { lod, meshes } = batches({ ...geology, maxExtraDraws: 0 });
  const items = [item(20), item(90), item(100)];
  lod.plan(items, meshes, 2);
  assert.equal(lod.admitted.size, 2);
  assert.equal(lod.stats.requested, 2000);
  assert.equal(lod.index(items[1]), 0);
  assert.equal(lod.stats.selectedDraws, 1);
});

test('recovery hysteresis keeps pressure separate from authored LOD', () => {
  const { lod, meshes } = batches({ ...geology, triangleBudget: 2200 });
  const items = [item(20), item(90), item(100)];
  lod.plan(items, meshes, 10);
  assert.equal(lod.stats.pressured, true);
  lod.plan(items.slice(0, 2), meshes, 10);
  assert.equal(lod.stats.pressured, true);
  assert.ok(lod.isFarBatch(lod.index(items[1])));
  lod.plan([items[1]], meshes, 10);
  assert.equal(lod.stats.pressured, false);
  assert.equal(lod.index(items[1]), 0);
});

test('legacy geology batching is unaffected when the new policy is absent', () => {
  const lod = new GeologyLodBatches({ kinds: 1, cellMeters: 16 });
  lod.updateFocus({ x: 0, z: 0 });
  lod.plan([item(200)], [], 10);
  assert.equal(lod.count, 1);
  assert.equal(lod.index(item(200)), 0);
});

const record = (px, py, pz) => ({ px, py, pz });
function build(records) {
  return { records, userData: {}, count: records.length, visible: true, isInstancedMesh: true,
    geometry: { index: { count: 300 } },
    computeBoundingSphere() { this.boundingSphere = { center: { x: records[0].px, y: records[0].py, z: records[0].pz }, radius: 2 }; } };
}

test('location batches partition in three dimensions and preserve records and padded bounds', () => {
  const records = [record(1, 1, 1), record(2, 2, 2), record(1, 25, 1), record(-1, 1, 1)];
  const meshes = buildDecorationBatches(records, decoration, build);
  assert.equal(meshes.length, 3);
  assert.deepEqual(meshes.flatMap(mesh => mesh.records), records);
  assert.ok(meshes.every(mesh => mesh.frustumCulled && mesh.userData.locationDecoration && mesh.boundingSphere.radius === 3));
  assert.equal(buildDecorationBatches(records, null, build).length, 1);
  assert.equal(buildDecorationBatches([record(NaN, 0, 0)], decoration, build)[0].userData.locationDecoration, undefined);
});

const entry = (x, triangles, visible = false, y = 0) => ({ mesh: { visible }, sphere: { center: { x, y, z: 0 }, radius: 2 }, triangles });

test('location admission reserves nearby batches before optional distant geometry', () => {
  const entries = [entry(5, 800), entry(27, 700), entry(50, 200), entry(90, 100)];
  const result = selectLocationDecorations(entries, { x: 0, y: 0, z: 0 }, decoration);
  assert.equal(result.protectedCount, 2);
  assert.equal(result.selected, 1500);
  assert.equal(result.overflow, 500);
  assert.equal(result.admitted.has(entries[2]), false);
});

test('location admission uses 3D distance, separate draw target and visibility hysteresis', () => {
  const entries = [entry(0, 100), entry(50, 200), entry(52, 200, true), entry(0, 50, false, 120)];
  const result = selectLocationDecorations(entries, { x: 0, y: 0, z: 0 }, decoration);
  assert.equal(result.draws, 2);
  assert.equal(result.admitted.has(entries[2]), true);
  assert.equal(result.admitted.has(entries[1]), false);
  assert.equal(result.admitted.has(entries[3]), false);
});

test('controller only changes explicitly tagged meshes and refreshes after movement', () => {
  const [near, far] = buildDecorationBatches([record(1, 0, 0), record(130, 0, 0)], decoration, build);
  const structural = { visible: true, userData: {}, isInstancedMesh: true };
  const controller = new LocationDecorationAdmission({ traverse: visit => [near, far, structural].forEach(visit) }, decoration);
  controller.update({ x: 0, y: 0, z: 0 });
  assert.equal(near.visible, true);
  assert.equal(far.visible, false);
  controller.update({ x: 130, y: 0, z: 0 });
  assert.equal(near.visible, false);
  assert.equal(far.visible, true);
  assert.equal(structural.visible, true);
  controller.dispose();
  assert.equal(controller.entries.length, 0);
});

test('flags are independent and config rejects invalid protection and recovery limits', () => {
  assert.equal(config.regionalGeologyAdmission, false);
  assert.equal(config.locationDecorationAdmission, false);
  const enabled = resolveRenderEnhancements({}, '?regionalGeologyAdmission=1');
  assert.equal(enabled.regionalGeologyAdmission, true);
  assert.equal(enabled.locationDecorationAdmission, false);
  assert.equal(resolveRenderEnhancements({}, '?locationDecorationAdmission=1').locationDecorationAdmission, true);
  assert.throws(() => resolveRenderEnhancements({ geologyAdmissionBudget: { recoveryRatio: 2 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ locationDecorationBudget: { protectMeters: 120 } }), RangeError);
});
