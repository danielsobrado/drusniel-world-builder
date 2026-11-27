import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { markTransientRenderObject, excludesReflection, skipsOcclusionCollection } from '../src/render/visibility/RenderPassParticipation.js';
import { withAuxiliaryScene } from '../src/render/reflections/ReflectionScene.js';

test('unknown render objects and opaque world geometry remain eligible', () => {
  const building = { userData: {}, geometry: { drawRange: { count: 100 } }, castShadow: true };
  assert.equal(excludesReflection(building, 'cube'), false);
  assert.equal(excludesReflection(building, 'planar'), false);
  assert.equal(skipsOcclusionCollection(building), false);
  assert.equal(building.castShadow, true);
});

test('camera-local particles are excluded without changing main visibility or shadow flags', () => {
  const mesh = { userData: {}, visible: true, castShadow: false };
  assert.equal(markTransientRenderObject(mesh), mesh);
  assert.equal(excludesReflection(mesh, 'cube'), true);
  assert.equal(excludesReflection(mesh, 'planar'), true);
  assert.equal(skipsOcclusionCollection(mesh), true);
  assert.equal(mesh.visible, true);
  assert.equal(mesh.castShadow, false);
});

test('cube-only detail remains available to planar and main views', () => {
  const blades = { userData: { excludeFromCubeReflection: true } };
  assert.equal(excludesReflection(blades, 'cube'), true);
  assert.equal(excludesReflection(blades, 'planar'), false);
  assert.equal(skipsOcclusionCollection(blades), false);
});

test('empty and externally indirect objects skip Hi-Z collection without affecting their draw', () => {
  for (const object of [
    { isInstancedMesh: true, count: 0 },
    { geometry: { isInstancedBufferGeometry: true, instanceCount: 0 } },
    { geometry: { indirect: {} } },
    { geometry: { drawRange: { count: 0 } } },
    { isBatchedMesh: true },
  ]) assert.equal(skipsOcclusionCollection(object), true);
  assert.equal(skipsOcclusionCollection({ isInstancedMesh: true, count: 100 }), false);
});

test('hidden detail branches skip reflection selection while visible branches and impostors remain active', () => {
  const calls = [];
  const layer = root => ({ root, visibility: { withAuxiliaryCamera(_camera, next) { calls.push('detail'); return next(); } } });
  const surface = { detailViews: [layer({ visible: true, parent: { visible: false } }), layer({ visible: true })],
    treeView: { impostorBatches: [{ withCamera(_c, _o, _t, next) { calls.push('impostor'); return next(); } }] } };
  const draw = () => { calls.push('draw'); return 7; };
  assert.equal(withAuxiliaryScene(surface, {}, {}, 0, draw, true), 7);
  assert.deepEqual(calls, ['impostor', 'detail', 'draw']);
  calls.length = 0;
  withAuxiliaryScene(surface, {}, {}, 0, draw, false);
  assert.deepEqual(calls, ['impostor', 'detail', 'detail', 'draw']);
});

test('render-layer isolation is opt-in and validates the YAML boolean', () => {
  assert.equal(resolveRenderEnhancements().renderLayerIsolation, false);
  assert.equal(resolveRenderEnhancements({}, '?renderLayerIsolation=1').renderLayerIsolation, true);
  assert.throws(() => resolveRenderEnhancements({ renderLayerIsolation: 'true' }), TypeError);
});
