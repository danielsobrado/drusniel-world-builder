import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import catalog from '../src/editor/assets/godsEnd/catalog.generated.json' with { type: 'json' };
import golden from './fixtures/gods-end/house-recipes.json' with { type: 'json' };
import { createHouseBuilder } from '../src/editor/assets/godsEnd/village/houseCatalog.js';
import { createGodsEndHouseParts } from '../src/editor/assets/godsEnd/village/houseParts.js';
import { createGodsEndObjectCatalog } from '../src/editor/assets/godsEnd/objectCatalog.js';
import { createGodsEndAssetParts } from '../src/editor/assets/godsEnd/assetParts.js';
import { GodsEndAssetLibrary } from '../src/editor/assets/godsEnd/GodsEndAssetLibrary.js';
import { createObjectColliderDescriptions } from '../src/editor/ObjectColliderLibrary.js';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { TILE_BY_KEY } from '../src/editor/tileCatalog.js';
import { ObjectMap } from '../src/editor/ObjectMap.js';

test('all five house recipes retain the donor’s geometry, UVs, vertex colors and surface batches', () => {
  for (const [id, expected] of Object.entries(golden)) {
    const builder = createHouseBuilder(id);
    const actual = Object.fromEntries([...builder.parts].map(([name, data]) => [name,
      createHash('sha256').update(JSON.stringify(data)).digest('hex')]));
    assert.deepEqual(actual, expected, id);
    const entry = catalog.objects.find((entry) => entry.asset.design === id);
    const parts = createGodsEndHouseParts(entry.asset);
    assert.ok(parts.length <= 10, 'details must remain batched by surface');
    for (const part of parts) {
      assert.ok(part.geometry.getAttribute('color'));
      assert.equal(part.material.vertexColors, true);
      assert.ok(part.material.map && part.material.normalMap);
      assert.ok([...part.geometry.getAttribute('position').array].every(Number.isFinite));
    }
    disposeModelParts(parts);
  }
});

test('imported catalog validates collision and round-trips placements for different tile scales', () => {
  for (const tileSize of [1, 2, 4]) {
    const definitions = createGodsEndObjectCatalog(catalog.objects, TILE_BY_KEY, tileSize);
    for (const definition of definitions) createObjectColliderDescriptions(definition, tileSize);
    const tileMap = { tileSize, inBounds: () => true, indexOf: (x, z) => `${x}:${z}`, get: () => 4 };
    const before = new ObjectMap({ tileMap, objectCatalog: definitions });
    const key = definitions.find((definition) => definition.asset.design === '003').key;
    const placement = before.place({ definitionKey: key, x: 12, z: -8, rotation: 3 });
    const after = new ObjectMap({ tileMap, objectCatalog: definitions });
    after.replaceAll(JSON.parse(JSON.stringify(before.list())));
    assert.deepEqual(after.getById(placement.id), placement);
    assert.deepEqual([...new Set(definitions.flatMap((definition) => definition.allowedTileIds))].filter((id) => id < 13).sort((a, b) => a - b),
      Array.from({ length: 12 }, (_, index) => index + 1));
  }
});

test('imported parts preserve node transforms and UVs, ground the selected prototype and omit colliders', () => {
  const scene = new THREE.Group();
  const prototype = new THREE.Group();
  prototype.name = 'chosen_sanitized';
  prototype.userData.name = 'chosen';
  prototype.position.set(20, 3, -5);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshStandardMaterial());
  mesh.position.y = 2;
  prototype.add(mesh);
  const collider = new THREE.Mesh(new THREE.BoxGeometry(99, 99, 99));
  collider.name = 'COLLIDER_helper';
  prototype.add(collider);
  scene.add(prototype, new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100)));
  const parts = createGodsEndAssetParts(scene, { rootNames: ['chosen'], scale: 0.5, path: 'chosen.glb' });
  assert.equal(parts.length, 1);
  assert.notEqual(parts[0].geometry, mesh.geometry);
  assert.equal(parts[0].material, mesh.material);
  assert.deepEqual(parts[0].geometry.attributes.uv.array, mesh.geometry.attributes.uv.array);
  const bounds = parts[0].geometry.boundingBox.clone().applyMatrix4(parts[0].matrix);
  assert.deepEqual(bounds.min.toArray(), [-0.5, 0, -1.5]);
  assert.deepEqual(bounds.max.toArray(), [0.5, 2, 1.5]);
  let materialDisposals = 0;
  mesh.material.addEventListener('dispose', () => materialDisposals++);
  disposeModelParts(parts);
  assert.equal(materialDisposals, 0, 'the acquired scene owns shared materials');
});

function libraryFixture() {
  const entry = catalog.objects.find((entry) => entry.asset.kind === 'glb');
  const definition = createGodsEndObjectCatalog([entry], TILE_BY_KEY, 2)[0];
  const scene = new THREE.Group();
  const root = new THREE.Group();
  root.name = definition.asset.rootNames[0];
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
  scene.add(root);
  let complete;
  const counters = { acquisitions: 0, releases: 0, installations: 0, clears: 0 };
  const cache = {
    acquire() { counters.acquisitions++; return new Promise((resolve) => { complete = () => resolve(scene); }); },
    release() { counters.releases++; }, dispose() {},
  };
  const state = { tool: 'terrain', selectedObjectKey: definition.key };
  const objects = [];
  let stateListener;
  const controller = {
    subscribe(listener) { stateListener = listener; listener(state); return () => { stateListener = null; }; },
    subscribeMap() { return () => {}; }, updatePreviews() {}, emitNotice() {},
  };
  const owned = new Map();
  const objectView = {
    registerDefinition(definition, parts) { counters.installations++; owned.set(definition.key, parts); },
    clearAssetParts(key) { counters.clears++; disposeModelParts(owned.get(key) ?? []); owned.delete(key); },
  };
  const library = new GodsEndAssetLibrary({ cache, objectView, controller,
    objectMap: { definitionByKey: new Map([[definition.key, definition]]), list: () => objects } });
  return { library, definition, counters, objects, complete: () => complete(),
    select: () => { state.tool = 'object'; stateListener(state); },
    deselect: () => { state.tool = 'terrain'; stateListener(state); } };
}

test('catalog assets load once on demand and release unplaced selections', async () => {
  const f = libraryFixture();
  assert.equal(f.counters.acquisitions, 0);
  f.select();
  const first = f.library.ensure(f.definition.key);
  assert.equal(first, f.library.ensure(f.definition.key));
  f.complete();
  await first;
  assert.equal(f.counters.installations, 1);
  f.deselect();
  assert.equal(f.counters.clears, 1);
  assert.equal(f.counters.releases, 1);
  f.library.dispose();
});

test('saved placements retain their assets when selection changes', async () => {
  const f = libraryFixture();
  f.objects.push({ definitionKey: f.definition.key });
  f.library.restorePlaced();
  const loaded = f.library.ensure(f.definition.key);
  f.complete();
  await loaded;
  f.select();
  f.deselect();
  assert.equal(f.counters.releases, 0);
  f.library.dispose();
  assert.equal(f.counters.releases, 1);
});

test('late load completion after teardown cannot install or leak an asset', async () => {
  const f = libraryFixture();
  f.select();
  const pending = f.library.ensure(f.definition.key);
  f.library.dispose();
  f.complete();
  await pending;
  assert.equal(f.counters.installations, 0);
  assert.equal(f.counters.releases, 1);
});
