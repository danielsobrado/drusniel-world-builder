import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { FloatingOrigin } from '../src/editor/world/FloatingOrigin.js';
import { ConstructionStore } from '../src/editor/construction/ConstructionStore.js';
import { normalizeConstructionRecord } from '../src/editor/construction/ConstructionSchema.js';
import { createCubicBezierPathFromStroke, sampleCubicBezierPath } from '../src/editor/construction/curve/CubicBezierPath.js';
import { createCurveArcTable } from '../src/editor/construction/masonry/CurveArcTable.js';
import { planConstruction } from '../src/editor/construction/planning/ConstructionPlanner.js';
import { ConstructionView } from '../src/editor/construction/render/ConstructionView.js';
import { ConstructionModuleBuilder } from '../src/editor/construction/render/ConstructionModuleBuilder.js';
import { ConstructionGeometryWorkerClient } from '../src/editor/construction/compile/ConstructionGeometryWorkerClient.js';
import { buildConstructionGeometry } from '../src/editor/construction/compile/buildConstructionGeometry.js';
import { buildModuleMasonry } from '../src/editor/construction/compile/ConstructionMasonryBuilder.js';
import { createConstructionMaterials, disposeConstructionMaterials } from '../src/editor/construction/render/ConstructionMaterials.js';
import { constructionGeometryBuffers } from '../src/editor/construction/compile/ConstructionGeometryCodec.js';

function wall(id, x, length = 16) {
  return normalizeConstructionRecord({ version: 1, id, revision: 1, seed: 3141, kind: 'wall',
    style: { key: 'glade-sandstone', version: 1 }, dimensions: { height: 3.5, thickness: 0.8 },
    path: createCubicBezierPathFromStroke([[x, 0], [x + length, 0]], { simplifyTolerance: 0.01 }), features: [] });
}
function terrain() {
  return { scene: new THREE.Scene(), floatingOrigin: new FloatingOrigin({ threshold: 1024, snapSize: 128 }),
    worldStore: { tileSize: 2 }, getCanonicalHeight: (x, z) => 0.01 * x * z + 0.03 * x,
    renderer: { domElement: { getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }) } } };
}
test.afterEach(() => disposeConstructionMaterials());

test('camera queries materialize nearby records, evict distant render entries and preserve selected records', () => {
  const records = [wall('near', 0)];
  for (let i = 1; i <= 1024; i++) records.push(wall(`far-${i}`, 10000 + i * 256));
  const store = new ConstructionStore(records);
  const view = new ConstructionView({ terrainView: terrain(), store, residencyRadius: 128 });
  assert.deepEqual([...view.entries.keys()], ['near']);
  store.list = () => { throw new Error('Global construction scan on camera motion'); };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  camera.position.set(10256, 4, 0); view.lodDirty = true; view.updateLod(camera, 600);
  assert.equal(view.entries.has('near'), false);
  assert.ok(view.entries.has('far-1'));
  assert.ok(view.entries.size <= 3);
  view.setSelection('near');
  assert.ok(view.entries.has('near'));
  view.lodDirty = true; view.updateLod(camera, 600);
  assert.ok(view.entries.has('near'));
  view.dispose();
});

test('a long wall keeps only local modules and retrieves new modules as the camera moves', () => {
  const store = new ConstructionStore(); const view = new ConstructionView({ terrainView: terrain(), store, residencyRadius: 64 });
  const record = wall('long', 0, 2048); store.add(record);
  const plan = planConstruction(record); view.applyPlan(record, plan);
  const entry = view.entries.get(record.id);
  assert.ok(plan.modules.length > 100);
  assert.ok(entry.modules.size < 20);
  const before = new Set(entry.modules.keys());
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  camera.position.set(1800, 4, 0); view.lodDirty = true; view.updateLod(camera, 600);
  assert.equal(view.entries.get(record.id), entry);
  assert.ok(entry.modules.size < 30);
  assert.ok([...entry.modules.keys()].every(id => !before.has(id)));
  view.dispose();
});

test('worker module geometry matches the deterministic builder while publication reuses transferred arrays', async () => {
  const record = wall('geometry', -8); const module = planConstruction(record).modules[0];
  const terrainView = terrain(); const materials = createConstructionMaterials(record);
  const listeners = new Map();
  let messages = 0;
  const worker = { addEventListener(type, fn) { listeners.set(type, fn); }, terminate() {},
    postMessage(message, transfer) {
      messages += 1;
      const cloned = structuredClone(message, { transfer });
      setImmediate(() => {
        const product = buildConstructionGeometry(cloned.request);
        const transported = structuredClone({ id: cloned.id, product }, { transfer: constructionGeometryBuffers(product) });
        listeners.get('message')({ data: transported });
      });
    } };
  const client = new ConstructionGeometryWorkerClient({ workerFactory: () => worker });
  const builder = new ConstructionModuleBuilder({ terrainView, geometryWorker: client });
  const arcTable = createCurveArcTable(sampleCubicBezierPath(record.path));
  const options = { record, materials, arcTable, moduleOrigin: { x: 0, z: 0 },
    pathInterval: module.pathInterval, lodBand: 'near', groundHeightAt: terrainView.getCanonicalHeight };
  const expected = buildModuleMasonry(module.placements, options);
  const state = builder.createState({ ...options, key: 'geometry', placements: module.placements,
    terrainRevision: 0, bounds: module.bounds });
  let result;
  for (let i = 0; i < 200; i++) {
    result = builder.advance(state); if (result.done) break;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(messages, 1); assert.equal(result.done, true);
  assert.equal(state.batches.length, 0);
  assert.deepEqual(result.built.meshes.map(mesh => mesh.userData), expected.meshes.map(mesh => mesh.userData));
  for (let i = 0; i < expected.meshes.length; i++) {
    const actual = result.built.meshes[i].geometry;
    const reference = expected.meshes[i].geometry;
    assert.deepEqual(actual.index.array, reference.index.array);
    for (const name of Object.keys(reference.attributes)) {
      const a = actual.attributes[name].array; const b = reference.attributes[name].array;
      assert.equal(a.length, b.length);
      for (let j = 0; j < a.length; j++) assert.ok(Math.abs(a[j] - b[j]) < 1e-5, `${name}[${j}]`);
    }
    assert.deepEqual(actual.boundingBox, reference.boundingBox);
    actual.dispose(); reference.dispose();
  }
  builder.shutdown();
});
