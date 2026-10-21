import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, MeshBasicMaterial, Scene } from 'three/webgpu';
import { TownStreamer } from '../../src/editor/towns/TownStreamer.js';
import { TownCollisionSource } from '../../src/editor/collision/providers/TownCollisionSource.js';
import { layoutTown } from '../../src/editor/towns/TownLayout.js';
import { StreamedDrawPreparation } from '../../src/render/preparation/StreamedDrawPreparation.js';
import { SettlementField } from '../../src/editor/world/settlements/SettlementField.js';
import { generateSettlementPlan } from '../../src/editor/world/settlements/SettlementPlanRequest.js';

function fixture() {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const kit = { moduleColliders: {}, prefabs: { Tudor_House_Small: {
    kind: 'building', size: [6, 4], stories: 2,
    parts: [{ m: 'Wall', p: [0, 0, 0], yaw: 0 }],
    colliders: [{ c: [0, 1, 0], s: [6, 2, 4], yaw: 0 }], doors: [], lights: [],
  } } };
  const settlement = { id: 1, cellX: 0, cellZ: 0 };
  const plan = { profile: { rank: 1, radius: 100, reach: 150, style: { key: 'limestone-slate' } },
    buildings: Array.from({ length: 100 }, (_, i) => ({ kind: 'house', variant: 0, x: i * 10, z: 0, yaw: 0, pad: 0 })),
    props: [], fields: [], streets: [] };
  const entry = { settlement, plan, index: {}, skyline: {}, reachCells: 75 };
  const generator = { ensureSettlementField: () => ({ findById: id => id === settlement.id ? entry : null, entriesNear: (x, z, radius) =>
    Math.hypot(x, z) < radius + 75 ? [{ entry, distance: Math.hypot(x, z) }] : [] }), sampleHeight: () => 0 };
  const store = { generator };
  const source = new TownCollisionSource().configure(128), scene = new Scene();
  const streamer = new TownStreamer({ scene, getGenerator: () => generator, getWorldStore: () => store, tileSize: 2,
    floatingOrigin: { getState: () => ({ x: 0, z: 0 }) }, collisionSource: source,
    assets: { ready: true, kit, modules: new Map([['Wall', { opaque: geometry, glass: [] }]]),
      farModules: new Map(), isInterior: () => false },
    palette: { kitMaterial: () => material, glassMaterial: () => material } });
  return { streamer, source, scene, geometry, material, generator, settlement, plan, kit };
}

test('kit town preparation yields and publishes complete geometry and collision together', () => {
  const f = fixture();
  try {
    f.streamer.generator = f.generator;
    f.streamer.refresh(f.generator, { x: 0, z: 0 });
    f.streamer.buildNearest(f.generator, { x: 0, z: 0 }, () => true);
    assert.equal(f.source.owners.size, 0); assert.equal(f.scene.children.length, 0);
    let turns = 0;
    while (f.streamer.buildJob && turns++ < 10000) {
      assert.equal(f.source.owners.size, 0, 'collision stays unpublished between slices');
      assert.equal(f.scene.children.length, 0, 'geometry stays unpublished between slices');
      f.streamer.buildNearest(f.generator, { x: 0, z: 0 }, () => true);
    }
    assert.ok(turns > 100 && turns < 10000);
    assert.equal(f.streamer.towns.size, 1); assert.equal(f.source.owners.size, 1);
    assert.equal(f.scene.children.length, 1);
    assert.deepEqual(f.streamer.towns.get(1).layout, layoutTown({ settlement: f.settlement, plan: f.plan,
      kit: f.kit, tileSize: 2, sampleHeight: () => 0 }));
  } finally { f.streamer.dispose(); f.geometry.dispose(); f.material.dispose(); }
});

test('leaving during town preparation cancels staged resources without publication', () => {
  const f = fixture();
  try {
    f.streamer.generator = f.generator;
    f.streamer.refresh(f.generator, { x: 0, z: 0 });
    f.streamer.buildNearest(f.generator, { x: 0, z: 0 }, () => true);
    f.streamer.refresh(f.generator, { x: 10000, z: 0 });
    assert.equal(f.streamer.buildJob, null);
    assert.equal(f.streamer.pending.size, 0);
    assert.equal(f.scene.children.length, 0); assert.equal(f.source.owners.size, 0);
  } finally { f.streamer.dispose(); f.geometry.dispose(); f.material.dispose(); }
});

test('kit town waits for draw preparation before publishing collision and follows an intervening rebase', () => {
  const f = fixture();
  const preparation = new StreamedDrawPreparation({ scene: f.scene, renderer: {},
    settings: { enabled: true, meshesPerFrame: 1 }, render: () => {} });
  f.streamer.getDrawPreparation = () => preparation;
  let origin = { x: 0, z: 0 };
  f.streamer.floatingOrigin.getState = () => origin;
  try {
    f.streamer.generator = f.generator;
    f.streamer.refresh(f.generator, { x: 0, z: 0 });
    f.streamer.buildNearest(f.generator, { x: 0, z: 0 });
    assert.equal(f.streamer.towns.size, 0);
    assert.equal(f.source.owners.size, 0);
    assert.equal(f.scene.children[0].visible, false);
    origin = { x: 1024, z: -1024 };
    while (preparation.pending.size) preparation.flush({});
    f.streamer.buildNearest(f.generator, { x: 0, z: 0 });
    assert.equal(f.streamer.towns.size, 1);
    assert.equal(f.source.owners.size, 1);
    assert.equal(f.scene.children.length, 1);
    assert.equal(f.scene.children[0].position.x, -1024);
    assert.equal(f.scene.children[0].position.z, 1024);
  } finally { f.streamer.dispose(); preparation.dispose(); f.geometry.dispose(); f.material.dispose(); }
});

test('a door update while a town owner stages cannot be lost at publication', () => {
  const source = new TownCollisionSource().configure(128);
  const door = { id: 'door', x: 0, y: 1, z: 0, sx: 1, sy: 2, sz: 1, yaw: 0 };
  source.setOwner('existing', [door]);
  const job = source.setOwnerJob('new', Array.from({ length: 100 }, (_, i) => ({ ...door, id: `new${i}` })));
  assert.equal(job.next().done, false);
  source.setBoxEnabled('existing', door, false);
  while (!job.next().done) { /* drain after the concurrent door edit */ }
  assert.equal(source.list(0, 0).some(box => box.id === 'door'), false);
  assert.equal(source.list(0, 0).length, 100);
});

test('playable town approach, arrival and revisit never synchronously plan a settlement', async () => {
  const f = fixture();
  const createField = sampleGround => new SettlementField({ settlements: [{ ...f.settlement, population: 1 }],
    tileSize: 2, worldSeed: 7, sampleGround, isBuildable: () => true });
  const field = createField(() => assert.fail('main-thread planSettlement sampled ground'));
  f.generator.ensureSettlementField = () => field;
  f.generator.settlementsNear = () => assert.fail('TownStreamer used the synchronous planning query');
  let requests = 0;
  const store = { generator: f.generator, chunkWorker: { request: async () => {
    requests++;
    return structuredClone(generateSettlementPlan({ ensureSettlementField: () => createField(() => 0) }, 1));
  } } };
  f.streamer.getWorldStore = () => store;
  try {
    let now = 0;
    for (const x of [400, 0, 10000, 0]) {
      for (let frame = 0; frame < 4; frame++) {
        f.streamer.update(now += 1000, { x, z: 0 });
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    assert.equal(requests, 1, 'revisit reuses the canonical installed plan');
    assert.equal(f.streamer.towns.size, 1);
    assert.ok(field.findById(1).index);
  } finally { f.streamer.dispose(); f.geometry.dispose(); f.material.dispose(); }
});
