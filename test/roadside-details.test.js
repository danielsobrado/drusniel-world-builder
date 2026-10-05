import assert from 'node:assert/strict';
import test from 'node:test';
import { RoadsideDetailsStore } from '../src/editor/roadside/RoadsideDetailsStore.js';
import { RoadsideLanternGenerator } from '../src/editor/roadside/RoadsideLanternGenerator.js';
import { normalizeRoadsidePlacement } from '../src/editor/roadside/RoadsidePlacement.js';
import { TerrainAwareEditorController } from '../src/editor/TerrainAwareEditorController.js';
import { ObjectMap } from '../src/editor/ObjectMap.js';
import { ObjectPlacementResolver } from '../src/editor/placement/ObjectPlacementResolver.js';
import { changeRoadsideDetail } from '../src/editor/roadside/RoadsideDetailsCommands.js';
import { RoadsideDetailsView } from '../src/editor/roadside/RoadsideDetailsView.js';
import { Scene } from 'three/webgpu';

const key = 'lantern-v1:aa12:2:L';
test('sparse generated choices load transactionally and omit automatic instances', () => {
  const store = new RoadsideDetailsStore(); store.suppress(key); const before = store.toDocument();
  assert.throws(() => store.replaceDocument({ version: 1, suppressed: ['bad'] }));
  assert.deepEqual(store.toDocument(), before);
  const copy = new RoadsideDetailsStore(); copy.replaceDocument(JSON.parse(JSON.stringify(before)));
  assert.ok(copy.has(key)); assert.equal(copy.toDocument().instances, undefined);
});

function generator(order = false) {
  const sources = [{ id: 3, group: 'roads', points: [[0, 0], [200, 0]] }, { id: 4, group: 'roads', points: [[0, 40], [200, 40]] }];
  if (order) sources.reverse();
  const routes = sources.map((source, index) => ({ index, length: 400, halfWidth: 3, z: source.points[0][1] }));
  return new RoadsideLanternGenerator({ source: { routes: sources }, ensureSettlementField: () => ({ entriesAt: () =>
    [{ settlement: { cellX: 100, cellZ: 20 }, reachCells: 200 }] }), ensureTrailGrading: () => ({
      grading: { shoulderMeters: 3 }, nearbyRoutes: x => routes.map(route => ({ route, along: x * 2 })),
      nearbyRoutesInBounds: x => routes.map(route => ({ route, along: x * 2 })),
      pointAt: (route, along) => ({ x: along / 2, z: route.z }),
    }) });
}

test('route reorder, residency revisit and duplicate route IDs preserve stable pair identities', () => {
  const a = [...generator().candidates(100, 0, 100, 2)];
  const b = [...generator(true).candidates(100, 0, 100, 2)];
  assert.ok(a.length > 0);
  assert.deepEqual(a.map(row => row.key).sort(), b.map(row => row.key).sort());
  assert.equal(new Set(a.map(row => row.key)).size, a.length);
  assert.deepEqual([...generator().candidates(100, 0, 100, 2)], a);
  const left = a.find(row => row.side === 'L'), right = a.find(row => row.station === left.station && row.routeId === left.routeId && row.side === 'R');
  assert.ok(left && right); assert.equal(left.cellX, right.cellX); assert.notEqual(left.cellZ, right.cellZ);
});

test('roadside residency uses canonical world tile size and clears derived records when disabled', () => {
  const provider = generator().generator;
  const choices = new RoadsideDetailsStore();
  const terrainView = { scene: new Scene(), floatingOrigin: { getState: () => ({ x: 4096, z: -4096 }) },
    focusChunk: { chunkX: 0, chunkZ: 0 }, chunkWorldSize: 400, slots: [{ descriptor: { chunkX: 0, chunkZ: 0 }, page: {}, pageRevision: 1 }],
    worldStore: { tileSize: 2, generator: provider, sampleHeight: () => 4 }, getCanonicalWater: () => ({ kind: 0, coverage: 0, shoreDistance: 10 }) };
  const controller = { roadsideDetails: choices, objectMap: { signatureForBounds(bounds) {
    assert.ok(Object.values(bounds).every(Number.isFinite)); return 'clear'; }, queryBounds: () => [] } };
  const view = new RoadsideDetailsView({ terrainView, controller, assets: { getCache: () => ({ release() {} }) }, surface: {}, enabled: true });
  view.parts = [];
  view.update({});
  assert.ok(view.records.length > 0); assert.ok(view.records.every(record => record.height === 4 && record.z <= 0));
  const first = view.records[0].key; choices.suppress(first); view.update({});
  assert.ok(view.records.every(record => record.key !== first));
  terrainView.slots = []; view.update({}); assert.equal(view.records.length, 0);
  choices.enabled = false; view.synchronizeEnabled(); assert.equal(view.parts, null); assert.equal(view.root.visible, false);
  view.dispose(); assert.equal(terrainView.scene.children.length, 0);
});

test('promotion preserves the full pose through undo/redo, save/load, and floating-origin changes', () => {
  const tileMap = { tileSize: 2, chunkSize: 8, inBounds: () => true, get: () => 4, indexOf: (x, z) => `${x}:${z}` };
  const definition = { key: 'lantern', footprint: { width: 1, depth: 1 }, allowedTileIds: [4],
    foundation: { mode: 'terrace', maxSlopeDegrees: 30, maxDepth: 4, alignToNormal: false } };
  const objectMap = new ObjectMap({ tileMap, objectCatalog: [definition] });
  const controller = Object.create(TerrainAwareEditorController.prototype);
  Object.assign(controller, { objectMap, tileMap, undoStack: [], redoStack: [], refreshObjects() {}, emitMap() {}, emitState() {}, setSelectedObject() {},
    validateObjectPlacement: () => ({ valid: true, surface: { baseHeight: 5 } }) });
  const detail = { key, definitionKey: 'lantern', cellX: 2.2, cellZ: 3.4, x: 4.4, z: -6.8, height: 5.2, rotationY: 0.37 };
  const object = changeRoadsideDetail(controller, detail, { promote: true });
  const entry = controller.undoStack.at(-1);
  assert.ok(controller.roadsideDetails.has(key)); assert.equal(objectMap.list().length, 1);
  controller.applyHistory(entry, 'undo'); assert.equal(objectMap.list().length, 0); assert.equal(controller.roadsideDetails.has(key), false);
  controller.applyHistory(entry, 'redo'); assert.equal(objectMap.list().length, 1);
  const saved = JSON.parse(JSON.stringify(objectMap.toDocument())); objectMap.replaceAll(saved);
  const resolver = new ObjectPlacementResolver({ objectMap, definitionByKey: objectMap.definitionByKey,
    heightField: { getVertex: () => 5, sample: () => 5 }, tileSize: 2, floatingOrigin: { toRenderLocal: (x, z) => ({ x: x - 1000, z: z + 2000 }), getState: () => ({ x: 1000, z: -2000 }) } });
  const matrix = resolver.createCanonicalObjectMatrix(objectMap.getById(object.id));
  assert.ok(Math.abs(matrix.elements[12] - detail.x) < 1e-9);
  assert.ok(Math.abs(matrix.elements[14] - detail.z) < 1e-9);
  assert.ok(Math.abs(matrix.elements[13] - detail.height) < 1e-9);
  assert.throws(() => normalizeRoadsidePlacement({ sourceKey: key, offsetX: Infinity, offsetZ: 0, yaw: 0 }));
});
