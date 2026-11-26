import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { decorationPointsChanged, planTownDecorations, townDecorationMetadata } from '../src/editor/towns/TownDecorationAdmission.js';
import { TownModuleInstances } from '../src/editor/towns/TownModuleInstances.js';
import { TownMesh } from '../src/editor/towns/TownMesh.js';
import { TOWN_LOD_DEFAULTS, TOWN_LOD_NEAR, TOWN_LOD_FAR, TOWN_LOD_SPLIT } from '../src/editor/towns/TownLod.js';
import { WAIT_FOR_TOWN_PUBLICATION } from '../src/editor/towns/TownInstancePublication.js';

const settings = { ...resolveRenderEnhancements().townDecorationBudget, triangleBudget: 1500, drawBudget: 24 };
const points = [{ x: 0, z: 0 }];
const kit = { moduleColliders: { Barrel: [{}], Crate: [{}], Basket_Cluster: [{}] }, prefabs: {} };
const geometry = triangles => ({ geometry: { index: { count: triangles * 3 } } });
function moduleOf(name, positions, near = 1000, far = 200, metadata = kit, interior = false) {
  const result = { values: new Float32Array(positions.flatMap(x => [x, 0, 0, 0])), count: positions.length,
    nearMeshes: [geometry(near)], farMeshes: far === null ? [] : [geometry(far)], farReach: 320, interior };
  result.decoration = townDecorationMetadata(name, result, metadata);
  return result;
}
function drain(iterator) {
  let step;
  do { step = iterator.next(); } while (!step.done);
  return step.value;
}
const plan = (modules, overrides = {}, locations = points, lod = TOWN_LOD_NEAR, pressure = false) =>
  drain(planTownDecorations(modules, locations, lod, TOWN_LOD_DEFAULTS, { ...settings, ...overrides }, pressure));

test('only explicit secondary modules qualify; collidable props can simplify but cannot disappear', () => {
  for (const name of ['Barrel', 'Crate', 'Basket_Cluster']) {
    const meta = moduleOf(name, [200]).decoration;
    assert.equal(meta.cheaperFar, true);
    assert.equal(meta.canOmit, false);
  }
  for (const name of ['Door_Leaf', 'Roof_Hip_S6_L8', 'Well', 'Lamp_Post', 'Fence_Wood', 'Statue_Plinth', 'Street_Arch_Stone']) {
    assert.equal(moduleOf(name, [200]).decoration, null);
  }
  assert.equal(moduleOf('Barrel', [200], 1000, 200, kit, true).decoration, null);
  assert.equal(moduleOf('Barrel', [200], 1000, null).decoration, null);
  assert.equal(moduleOf('Barrel', [200], 1000, 0).decoration, null);
});

test('omission requires explicit classification and verified non-collider, non-prefab metadata', () => {
  assert.equal(moduleOf('Street_Bunting', [200], 1000, null).decoration.canOmit, true);
  assert.equal(moduleOf('Street_Bunting', [200], 1000, null, {}).decoration, null);
  assert.equal(moduleOf('Street_Bunting', [200], 1000, null, { ...kit, moduleColliders: { Street_Bunting: [{}] } }).decoration, null);
  assert.equal(moduleOf('Street_Bunting', [200], 1000, null, { ...kit, prefabs: { a: { parts: [{ m: 'Street_Bunting' }] } } }).decoration, null);
});

test('triangle pressure simplifies distant props and reserves the near kit', () => {
  const barrel = moduleOf('Barrel', [20, 200]);
  const result = plan([barrel]);
  assert.deepEqual([...result.plans[0].tiers], [1, 2]);
  assert.equal(result.requested.triangles, 2000);
  assert.equal(result.selected.triangles, 1200);
  assert.equal(result.simplified, 1);
  assert.equal(result.omitted, 0);
  assert.equal(result.overflow, false);
});

test('near protection includes actual camera, walker and refresh margin', () => {
  const barrel = moduleOf('Barrel', [105, 200, 400, 600]);
  const result = plan([barrel], {}, [...points, { x: 200, z: 0 }, { x: 400, z: 0 }]);
  assert.deepEqual([...result.plans[0].tiers], [1, 1, 1, 2]);
  assert.equal(result.protectedInstances, 3);
  assert.equal(result.overflow, true);
});

test('draw-group target prevents extra near/far splits under tight draw pressure', () => {
  const result = plan([moduleOf('Barrel', [20, 200])], { drawBudget: 1 });
  assert.deepEqual([...result.plans[0].tiers], [1, 1]);
  assert.equal(result.selected.draws, 1);
  assert.equal(result.overflow, true);
  const distant = plan([moduleOf('Barrel', [200, 220])], { drawBudget: 1 });
  assert.deepEqual([...distant.plans[0].tiers], [2, 2]);
  assert.equal(distant.selected.draws, 1);
});

test('non-collidable distant bunting can be omitted; collidable modules are not omitted', () => {
  const result = plan([moduleOf('Street_Bunting', [20, 200], 1000, null),
    moduleOf('Barrel', [220])], { triangleBudget: 100 });
  assert.deepEqual([...result.plans[0].tiers], [1, 0]);
  assert.deepEqual([...result.plans[1].tiers], [2]);
  assert.equal(result.omitted, 1);
  assert.equal(result.overflow, true);
});

test('sparse demand keeps baseline quality; previous pressure uses a recovery margin', () => {
  const crate = moduleOf('Crate', [200], 1400, 200);
  assert.deepEqual([...plan([crate]).plans[0].tiers], [1]);
  assert.deepEqual([...plan([crate], {}, points, TOWN_LOD_NEAR, true).plans[0].tiers], [2]);
  assert.deepEqual([...plan([crate], { triangleBudget: 2000 }, points, TOWN_LOD_NEAR, true).plans[0].tiers], [1]);
});

test('legacy split reach and baseline hysteresis are independent of pressure tiers', () => {
  const barrel = moduleOf('Barrel', [140, 250, 400]);
  barrel.decorationBaselineTiers = new Uint8Array([1, 2, 0]);
  barrel.decorationTiers = new Uint8Array([2, 2, 0]);
  const result = plan([barrel], { triangleBudget: 10000 }, points, TOWN_LOD_SPLIT);
  assert.deepEqual([...result.plans[0].tiers], [1, 2, 0]);
  assert.deepEqual([...plan([barrel], { triangleBudget: 10000 }, points, TOWN_LOD_FAR).plans[0].tiers], [2, 2, 2]);
});

function attribute(size, count) {
  return { itemSize: size, array: new Float32Array(size * count), updateRanges: [],
    addUpdateRange(start, count) { this.updateRanges.push({ start, count }); },
    clearUpdateRanges() { this.updateRanges.length = 0; } };
}
function liveModule() {
  const count = 3, matrices = new Float32Array(count * 16), colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) matrices[i * 16 + 12] = i + 1;
  const mesh = visible => ({ visible, count, instanceMatrix: attribute(16, count), instanceColor: attribute(3, count) });
  const near = mesh(true), far = mesh(false);
  for (const item of [near, far]) item.instanceMatrix.array.set(matrices);
  return Object.assign(Object.create(TownModuleInstances.prototype), {
    count, matrices, colours, nearMeshes: [near], farMeshes: [far], shown: new Map(), interior: false,
  });
}
const visiblePositions = meshes => meshes.flatMap(mesh => mesh.visible ? Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 12]) : []);

test('both tier counts and dirty rows publish atomically after the shared budget admits them', () => {
  const module = liveModule();
  let allowed = false;
  const gate = { canPublish: () => allowed };
  const job = module.decorationJob(new Uint8Array([1, 2, 2]), gate);
  assert.equal(job.next().value, WAIT_FOR_TOWN_PUBLICATION);
  assert.deepEqual(visiblePositions(module.nearMeshes), [1, 2, 3]);
  assert.deepEqual(visiblePositions(module.farMeshes), []);
  allowed = true;
  assert.equal(drain(job), true);
  assert.deepEqual(visiblePositions(module.nearMeshes), [1]);
  assert.deepEqual(visiblePositions(module.farMeshes), [2, 3]);
  let estimated;
  drain(module.decorationJob(new Uint8Array([1, 2, 2]), { canPublish(bytes) { estimated = bytes; return true; } }));
  assert.equal(estimated, 0);
});

test('cancelled selection cannot alter visible tiers, counts or slot records', () => {
  const module = liveModule();
  let current = true;
  const job = module.decorationJob(new Uint8Array([1, 2, 2]), { canPublish: () => false }, () => current);
  assert.equal(job.next().value, WAIT_FOR_TOWN_PUBLICATION);
  current = false;
  assert.equal(drain(job), false);
  assert.equal(module.shown.size, 0);
  assert.deepEqual(visiblePositions(module.nearMeshes), [1, 2, 3]);
  assert.deepEqual(visiblePositions(module.farMeshes), []);
});

test('whole-town LOD changes cannot overwrite independently published decoration tiers', () => {
  const module = liveModule();
  module.decoration = {};
  drain(module.decorationJob(new Uint8Array([1, 2, 2])));
  const other = { setLod(lod) { this.lod = lod; } };
  const town = Object.assign(Object.create(TownMesh.prototype), { modules: [module, other] });
  town.setLod(TOWN_LOD_FAR);
  assert.equal(other.lod, TOWN_LOD_FAR);
  assert.deepEqual(visiblePositions(module.nearMeshes), [1]);
  assert.deepEqual(visiblePositions(module.farMeshes), [2, 3]);
});

test('movement invalidates stale plans and the flag is independent and validated', () => {
  assert.equal(decorationPointsChanged(points, [{ x: 5, z: 0 }], 6), false);
  assert.equal(decorationPointsChanged(points, [{ x: 6, z: 0 }], 6), true);
  assert.equal(decorationPointsChanged(points, [...points, { x: 1, z: 0 }], 6), true);
  assert.equal(resolveRenderEnhancements().townDecorationAdmission, false);
  assert.equal(resolveRenderEnhancements({}, '?townDecorationAdmission=1').townDecorationAdmission, true);
  assert.throws(() => resolveRenderEnhancements({ townDecorationBudget: { protectMeters: 200, omitDistanceMeters: 180 } }), RangeError);
});
