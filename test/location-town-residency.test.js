import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferGeometry, BufferAttribute, InstancedBufferAttribute, StorageInstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, Group, Sphere, Vector3 } from 'three/webgpu';
import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { collectLocationTownAttributes } from '../src/editor/locations/LocationTownResidency.js';
import { LocationSurfaceResidency } from '../src/editor/locations/LocationSurfaceResidency.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture(t) {
  const scene = new Group(), material = new MeshBasicMaterial(), resident = new Set(), restored = [];
  const geometry = () => {
    const value = new BufferGeometry();
    value.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    value.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2]), 1));
    value.boundingSphere = new Sphere(new Vector3(), 5);
    for (const attr of [...Object.values(value.attributes), value.index]) resident.add(attr);
    return value;
  };
  const kitGeometry = geometry();
  const instance = (parent, direct = true, procedural = false) => {
    const mesh = new InstancedMesh(procedural ? geometry() : kitGeometry, material, 2);
    if (direct) mesh.instanceMatrix = new StorageInstancedBufferAttribute(mesh.instanceMatrix.array, 16);
    mesh.boundingSphere = new Sphere(new Vector3(), 5);
    resident.add(mesh.instanceMatrix);
    if (procedural) {
      const dither = new InstancedBufferAttribute(new Float32Array(6), 3);
      mesh.geometry.setAttribute('instanceDither', dither);
      resident.add(dither);
    }
    parent.add(mesh);
    return mesh;
  };
  const town = x => {
    const group = new Group(); scene.add(group);
    const mesh = instance(group), wrapped = instance(group, false), door = instance(group);
    const doors = { meshes: [door] };
    return { layout: { anchor: { x, z: 0 } }, mesh: { group, modules: [{ meshes: [mesh, wrapped] }, doors], doors }, direct: mesh, wrapped, door };
  };
  const near = town(20), far = town(400), busy = town(600);
  busy.selectionJob = {};
  const root = new Group(), paving = new Group(), skylineRoot = new Group();
  scene.add(root, paving, skylineRoot);
  const building = instance(root, true, true);
  const tier = { meshes: [building] };
  const rows = { entry: { state: 'ready', near: tier }, published: { near: { tier } },
    tiers: new Map([[tier, { x: 500, z: 0 }]]) };
  const interior = new Mesh(geometry(), material), smoke = new Mesh(geometry(), material);
  paving.add(interior, smoke);
  const skyline = new Mesh(geometry(), material); skylineRoot.add(skyline);
  const site = { paving, pavingReady: true, centre: { x: 700, z: 0 }, surfaceResidencyMeshes: [interior] };
  const view = { root, pool: {}, rows: new Map([['house', rows]]), sites: new Map([[1, site]]),
    skyline: { root: skylineRoot, towns: new Map([[1, { mesh: skyline, centre: { x: 800, z: 0 } }]]) } };
  const surface = { terrainView: { slots: [], townRuntime: { streamer: { towns: new Map([[1, near], [2, far], [3, busy]]) } },
    settlementView: view, drawPreparation: { pending: new Set() } }, waterSlots: [] };
  const renderer = { backend: { isWebGPUBackend: true, getBufferAttribute: a => a }, _textures: new Set(), initTexture() {},
    _attributes: { has: a => resident.has(a), delete: a => resident.delete(a), update(a, type) { restored.push([a, type]); resident.add(a); } } };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, surfaceTownReclamationEnabled: true,
    surfaceIdleMs: 10, surfaceSampleMs: 10, surfaceEvictionsPerSample: 32, surfaceRestoreBytesPerFrame: 256, surfaceMaxEvictedBytes: 4096 };
  const anchor = { x: 0, z: 0 }, controller = new LocationSurfaceResidency(surface, renderer, settings, async () => {});
  t.after(() => { controller.dispose(); scene.traverse(o => o.geometry?.dispose()); material.dispose(); });
  return { near, far, busy, building, tier, interior, smoke, skyline, site, view, surface, renderer, settings, anchor, controller, resident, restored, kitGeometry };
}

test('kit ownership, protected towns, wrapped attributes and doors', t => {
  const { near, far, busy, kitGeometry, surface, renderer, settings, anchor } = fixture(t);
  const entries = collectLocationTownAttributes(surface, renderer, anchor, settings);
  const find = a => entries.find(e => e.resource === a);
  assert.equal(find(near.direct.instanceMatrix).protected, true);
  assert.equal(find(far.direct.instanceMatrix).protected, false);
  assert.equal(find(busy.direct.instanceMatrix).protected, true);
  assert.equal(find(far.door.instanceMatrix).protected, true);
  assert.equal(find(far.wrapped.instanceMatrix), undefined);
  assert.equal(find(kitGeometry.index), undefined);
});

test('published procedural tiers and explicitly owned static geometry restore with matching types', async t => {
  const { controller, anchor, far, building, interior, skyline, smoke, resident, restored } = fixture(t);
  controller.begin(anchor, 0);
  controller.update(10);
  for (const a of [far.direct.instanceMatrix, building.instanceMatrix, interior.geometry.index, skyline.geometry.getAttribute('position')]) assert.equal(resident.has(a), false);
  assert.ok(resident.has(smoke.geometry.index));
  await controller.restore();
  assert.ok(restored.some(([a, type]) => a === building.instanceMatrix && type === AttributeType.STORAGE));
  assert.ok(restored.some(([a, type]) => a === interior.geometry.index && type === AttributeType.INDEX));
  assert.ok(restored.some(([a, type]) => a === skyline.geometry.getAttribute('position') && type === AttributeType.VERTEX));
});

test('staged tiers and pending draw preparation are protected', t => {
  const { tier, building, interior, view, surface, renderer, settings, anchor } = fixture(t);
  const collect = () => collectLocationTownAttributes(surface, renderer, anchor, settings);
  view.pool.compiling = 1;
  assert.equal(collect().find(e => e.resource === building.instanceMatrix).protected, true);
  tier.publication = {};
  assert.ok(!collect().some(e => e.resource === building.instanceMatrix));
  surface.terrainView.drawPreparation.pending.add(interior);
  assert.equal(collect().find(e => e.resource === interior.geometry.index).protected, true);
});

test('removed site is not warmed during restoration', async t => {
  const { controller, anchor, site, view, interior, restored } = fixture(t);
  controller.begin(anchor, 0);
  controller.update(10);
  view.sites.clear();
  site.paving.removeFromParent();
  await controller.restore();
  assert.ok(!restored.some(([a]) => a === interior.geometry.index));
});

test('town reclamation is independently opt-in and validates radius', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceTownReclamationEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceTownReclamation=1').locationStructureBudget.surfaceTownReclamationEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceTownProtectMeters: -1 } }), RangeError);
});
