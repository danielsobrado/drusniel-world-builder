import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionWorld } from '../src/editor/collision/CollisionWorld.js';
import { getCollisionWorldComposition } from '../src/editor/collision/CollisionWorldMetrics.js';
import { NaturalCollisionProvider } from '../src/editor/collision/providers/NaturalCollisionProvider.js';
import { createPrimitiveCollider, createColliderPrototype, createMeshInstanceCollider } from '../src/editor/collision/colliders/ColliderRecords.js';
import { canonicalAabbsIntersect } from '../src/editor/collision/colliders/ColliderBounds.js';

function box(chunkX, id = `box:${chunkX}`, offset = 4) {
  const minX = chunkX * 128 + offset;
  return createPrimitiveCollider({ sourceId: id, type: 'box', ownerChunkX: chunkX, ownerChunkZ: 0,
    aabb: { minX, maxX: minX + 4, minY: 0, maxY: 3, minZ: -8, maxZ: -4 },
    position: [minX + 2, 1.5, -6], dimensions: [4, 3, 4] });
}

function populatedWorld(count = 64) {
  const world = new CollisionWorld({ chunkWorldSize: 128, binSize: 16 });
  for (let x = -count / 2; x < count / 2; x++) {
    world.replaceOwnerChunk({ chunkX: x, chunkZ: 0, revision: 1, colliders: [box(x)] });
  }
  return world;
}

test('nearby movement queries do not visit distant resident chunks', () => {
  const world = populatedWorld();
  let visits = 0;
  const values = world.chunks.values.bind(world.chunks);
  world.chunks.values = function* () { for (const chunk of values()) { visits++; yield chunk; } };
  const bounds = { minX: 3, maxX: 9, minY: 0, maxY: 2, minZ: -9, maxZ: -3 };
  for (let frame = 0; frame < 100; frame++) {
    assert.deepEqual(world.collectCandidates(bounds).map(c => c.sourceId), ['box:0']);
  }
  assert.ok(visits <= 100, `local queries visited ${visits} resident chunks`);
});

test('indexed queries match a brute-force oracle at seams and across large distances', () => {
  const world = populatedWorld();
  const seam = box(0, 'seam', 124);
  world.replaceOwnerChunk({ chunkX: 0, chunkZ: 0, revision: 2, colliders: [box(0), seam] });
  for (const x of [-4096, -128, -124, -0.001, 0, 4, 8, 124, 128, 132, 4096]) {
    for (const width of [0, 0.01, 4, 128, 1e9]) {
      const bounds = { minX: x, maxX: x + width, minY: 0, maxY: 3, minZ: -8, maxZ: -4 };
      const expected = [...world.registry.values()].map(e => e.collider)
        .filter(c => canonicalAabbsIntersect(c.aabb, bounds)).map(c => c.sourceId).sort();
      assert.deepEqual(world.collectCandidates(bounds).map(c => c.sourceId), expected);
      assert.equal(world.lastQueryChunkCount,
        [...world.chunks.values()].filter(c => canonicalAabbsIntersect(c.bounds, bounds)).length);
    }
  }
});

test('local replacement and unload do not copy unrelated collider registry entries', () => {
  const world = populatedWorld();
  const registry = world.registry;
  let visits = 0;
  const entries = registry[Symbol.iterator].bind(registry);
  registry[Symbol.iterator] = function* () { for (const entry of entries()) { visits++; yield entry; } };
  const changed = box(0, 'changed');
  world.replaceOwnerChunk({ chunkX: 0, chunkZ: 0, revision: 2, colliders: [changed] });
  assert.equal(world.getCollider('box:0'), null);
  assert.equal(world.getCollider('changed'), changed);
  world.unloadOwnerChunk(0, 0);
  assert.equal(world.getCollider('changed'), null);
  assert.equal(world.getCollider('box:1')?.sourceId, 'box:1');
  assert.equal(visits, 0, 'local changes must not enumerate the whole registry');
});

test('a failure building replacement spatial bins retains all previous state', () => {
  const world = populatedWorld();
  const revision = world.revision;
  const previous = world.getCollider('box:0');
  world.binSize = 0;
  assert.throws(() => world.replaceOwnerChunk({ chunkX: 0, chunkZ: 0, revision: 2,
    colliders: [box(0, 'changed')] }), /binSize/);
  assert.equal(world.revision, revision);
  assert.equal(world.getCollider('box:0'), previous);
  assert.equal(world.getCollider('changed'), null);
  assert.equal(world.ownerStates.get('0:0').revision, 1);
});

test('a failure rebuilding a shared chunk during unload retains both owners', () => {
  const world = populatedWorld();
  const crossing = box(0, 'crossing', 126);
  world.replaceOwnerChunk({ chunkX: 0, chunkZ: 0, revision: 2, colliders: [crossing] });
  const revision = world.revision;
  world.binSize = 0;
  assert.throws(() => world.unloadOwnerChunk(0, 0), /binSize/);
  assert.equal(world.revision, revision);
  assert.equal(world.getCollider('crossing'), crossing);
  assert.equal(world.isOwnerChunkReady(0, 0), true);
  assert.equal(world.isOwnerChunkReady(1, 0), true);
  world.binSize = 16;
  assert.equal(world.unloadOwnerChunk(0, 0), true);
  assert.equal(world.getCollider('crossing'), null);
  assert.equal(world.getCollider('box:1')?.sourceId, 'box:1');
});

test('composition gauges reuse unchanged collider counts but observe edits and BVH disposal', () => {
  const world = populatedWorld();
  let visits = 0;
  const values = world.registry.values.bind(world.registry);
  world.registry.values = function* () { for (const entry of values()) { visits++; yield entry; } };
  for (let frame = 0; frame < 100; frame++) {
    assert.equal(getCollisionWorldComposition(world).primitiveColliders, 64);
  }
  assert.ok(visits <= 64, `unchanged diagnostics recounted ${visits} colliders`);
  const resource = { bvh: {}, disposed: false };
  const bounds = box(0).aabb;
  world.registerPrototype(createColliderPrototype({ id: 'mesh', kind: 'mesh', bounds, resource }));
  world.replaceOwnerChunk({ chunkX: 0, chunkZ: 0, revision: 2, colliders: [createMeshInstanceCollider({
    sourceId: 'mesh:0', ownerChunkX: 0, ownerChunkZ: 0, aabb: bounds, prototypeId: 'mesh',
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  })] });
  assert.deepEqual(getCollisionWorldComposition(world), { primitiveColliders: 63, meshInstances: 1, prototypeBvhs: 1 });
  resource.disposed = true;
  assert.equal(getCollisionWorldComposition(world).prototypeBvhs, 0);
  world.unloadOwnerChunk(0, 0);
  assert.equal(getCollisionWorldComposition(world).meshInstances, 0);
  world.dispose();
  assert.deepEqual(getCollisionWorldComposition(world), { primitiveColliders: 0, meshInstances: 0, prototypeBvhs: 0 });
});

test('natural collision diagnostics aggregate only when committed chunks change', () => {
  const provider = new NaturalCollisionProvider({ components: [{ id: 'test', counterName: 'Test',
    provider: { buildChunkData: x => ({ signature: String(x), colliders: [box(x)] }) } }],
  });
  const commit = x => provider.commitOwnerChunk({ chunkX: x, chunkZ: 0, ...provider.buildOwnerChunk(x, 0) });
  commit(0);
  let visits = 0;
  const values = provider.chunkStates.values.bind(provider.chunkStates);
  provider.chunkStates.values = function* () { for (const state of values()) { visits++; yield state; } };
  for (let frame = 0; frame < 100; frame++) {
    provider.updateCounters();
    assert.equal(provider.getStatus().colliderCount, 1);
  }
  assert.ok(visits <= 1, `unchanged diagnostics visited ${visits} chunks`);
  commit(1);
  assert.equal(provider.getStatus().components.test.colliders, 2);
  provider.unloadOwnerChunk(0, 0);
  assert.equal(provider.getStatus().colliderCount, 1);
  provider.dispose();
  assert.equal(provider.getStatus().colliderCount, 0);
});
