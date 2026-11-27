import assert from 'node:assert/strict';
import test from 'node:test';
import { InstancedBufferGeometry, InstancedBufferAttribute, BufferAttribute, Mesh, MeshBasicMaterial, Scene } from 'three/webgpu';
import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { LocationSurfaceResidency } from '../src/editor/locations/LocationSurfaceResidency.js';
import { collectLocationMeadowAttributes } from '../src/editor/locations/LocationMeadowResidency.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

const names = ['instancePosition', 'instanceRotation', 'instanceData', 'instanceTile'];

function fixture(t, overrides = {}, pause = async () => {}) {
  const resident = new Set(), restored = [], scene = new Scene(), material = new MeshBasicMaterial();
  const template = new BufferAttribute(new Float32Array(9), 3);
  const page = x => {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', template);
    geometry.instanceCount = 2;
    for (const name of names) {
      const width = name === 'instanceRotation' ? 2 : 4;
      const attribute = new InstancedBufferAttribute(new Float32Array(width * 2).fill(3), width);
      geometry.setAttribute(name, attribute);
      resident.add(attribute);
    }
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);
    return { mesh, geometry, pending: false, order: [{ centerX: x, centerZ: 0 }] };
  };
  resident.add(template);
  const near = page(20), far = page(100), cards = page(200), pending = page(300);
  pending.pending = true;
  const bladePages = [near, far, pending], cardPages = [cards];
  const layer = pages => ({ tileSize: 16, batches: { surfaceResidencyPages: () => pages.values() } });
  const surface = { terrainView: { slots: [], drawPreparation: { pending: new Set() } }, waterSlots: [],
    meadowGrass: { blades: layer(bladePages), cards: layer(cardPages) } };
  const renderer = { backend: { isWebGPUBackend: true, getBufferAttribute: value => value },
    _textures: new Set(), initTexture() {}, _attributes: {
      has: value => resident.has(value), delete: value => resident.delete(value),
      update(value, type) { assert.equal(type, AttributeType.VERTEX); restored.push(value); resident.add(value); },
    } };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, surfaceMeadowReclamationEnabled: true,
    surfaceMeadowProtectMeters: 32, surfaceIdleMs: 10, surfaceSampleMs: 10, surfaceEvictionsPerSample: 4,
    surfaceMaxEvictedBytes: 224, surfaceRestoreBytesPerFrame: 48, surfaceRestoresPerFrame: 2, ...overrides };
  const controller = new LocationSurfaceResidency(surface, renderer, settings, pause);
  t.after(() => { controller.dispose(); scene.traverse(o => o.geometry?.dispose()); material.dispose(); });
  return { controller, renderer, surface, settings, resident, restored, template, near, far, cards, pending, cardPages };
}

test('only distant CPU page instance attributes are reclaimed', t => {
  const { controller, resident, template, near, far, cards, pending } = fixture(t);
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.equal(controller.evictedBytes, 112);
  for (const name of names) {
    assert.equal(resident.has(cards.geometry.getAttribute(name)), false);
    for (const page of [near, far, pending]) assert.equal(resident.has(page.geometry.getAttribute(name)), true);
    assert.ok(cards.geometry.getAttribute(name).array.every(v => v === 3));
  }
  assert.equal(resident.has(template), true);
  assert.equal(cards.geometry.instanceCount, 2);
  controller.update(20);
  assert.equal(controller.evictedBytes, 224);
});

test('restore uses current CPU arrays and bounded batches nearest first', async t => {
  let pauses = 0;
  const { controller, resident, restored, far, cards } = fixture(t, {}, async () => { pauses++; });
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  controller.update(20);
  const attribute = far.geometry.getAttribute('instancePosition');
  attribute.array[0] = 7;
  attribute.addUpdateRange(0, 1);
  attribute.needsUpdate = true;
  await controller.restore();
  assert.ok(pauses >= 4);
  assert.ok(names.some(name => far.geometry.getAttribute(name) === restored[0]));
  assert.equal(attribute.array[0], 7);
  assert.equal(attribute.updateRanges.length, 0);
  for (const page of [far, cards]) for (const name of names) assert.ok(resident.has(page.geometry.getAttribute(name)));
});

test('pending, unsupported and removed pages are excluded from warmup', async t => {
  const { controller, renderer, surface, settings, cards, far, cardPages, restored } = fixture(t);
  surface.terrainView.drawPreparation.pending.add(far.mesh);
  const unsupported = cards.geometry.getAttribute('instanceData');
  renderer.backend.getBufferAttribute = value => value === unsupported ? {} : value;
  const candidates = collectLocationMeadowAttributes(surface, renderer, { x: 0, z: 0 }, settings);
  assert.ok(!candidates.some(e => e.resource === unsupported || names.some(name => far.geometry.getAttribute(name) === e.resource)));
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.equal(controller.evicted.size, 3);
  cardPages.length = 0;
  cards.mesh.removeFromParent();
  await controller.restore();
  assert.equal(restored.length, 0);
});

test('shared return-anchor ownership takes precedence over distant candidate', t => {
  const { controller, resident, near, cards } = fixture(t);
  const shared = near.geometry.getAttribute('instancePosition');
  cards.geometry.setAttribute('instancePosition', shared);
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.ok(resident.has(shared));
});

test('meadow subfeature is off by default and validates protection radius', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceMeadowReclamationEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceMeadowReclamation=1').locationStructureBudget.surfaceMeadowReclamationEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceMeadowProtectMeters: -1 } }), RangeError);
});
