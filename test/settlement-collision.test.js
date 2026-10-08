import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementCollisionProvider } from '../src/editor/collision/providers/SettlementCollisionProvider.js';
import { isColliderRecordDescriptor } from '../src/editor/collision/colliders/ColliderRecords.js';
import { collisionChunkForCanonical } from '../src/editor/collision/colliders/ColliderBounds.js';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';

const TILE = 2;
const CHUNK = 64;
const CITY = { id: 18, name: 'Cyvazin', cellX: 500, cellZ: -300, population: 28, capital: true, walls: true, citadel: true, plaza: true, temple: true };

function fixture() {
  const field = new SettlementField({
    settlements: [CITY],
    tileSize: TILE,
    worldSeed: 1234,
    routes: [],
    sampleGround: () => 10,
    isBuildable: () => true,
  });
  const generator = { ensureSettlementField: () => field };
  const provider = new SettlementCollisionProvider({ terrainView: { worldStore: { generator } }, chunkWorldSize: CHUNK });
  return { field, generator, provider, plan: field.ensurePlan(field.entries[0]).plan };
}

function chunksOf(provider, around) {
  const centre = collisionChunkForCanonical(around.x, around.z, CHUNK);
  const colliders = [];
  for (let dx = -8; dx <= 8; dx += 1) {
    for (let dz = -8; dz <= 8; dz += 1) {
      const data = provider.buildChunkData(centre.chunkX + dx, centre.chunkZ + dz);
      for (const collider of data.colliders) {
        assert.equal(collider.ownerChunkX, centre.chunkX + dx);
        assert.equal(collider.ownerChunkZ, centre.chunkZ + dz);
        colliders.push(collider);
      }
    }
  }
  return colliders;
}

const centre = { x: CITY.cellX * TILE, z: -CITY.cellZ * TILE };

test('every planned building is solid exactly once, in the chunk that owns it', () => {
  const { provider, plan } = fixture();
  const colliders = chunksOf(provider, centre);
  assert.ok(colliders.every(isColliderRecordDescriptor));
  const ids = colliders.map(({ sourceId }) => sourceId);
  assert.equal(new Set(ids).size, ids.length, 'a solid was filed under two chunks');
  const buildings = new Set(ids.filter((id) => id.includes(':b')).map((id) => id.split(':b')[1].split('.')[0]));
  assert.equal(buildings.size, plan.buildings.length);
});

test('a gatehouse is two piers with the road open between them', () => {
  const { provider, plan } = fixture();
  const index = plan.buildings.findIndex(({ kind }) => kind === 'gatehouse');
  assert.ok(index >= 0);
  const gate = plan.buildings[index];
  const piers = chunksOf(provider, centre).filter(({ sourceId }) => sourceId.includes(`:b${index}.`));
  assert.equal(piers.length, 2);
  const gateX = CITY.cellX * TILE + gate.x;
  const gateZ = -(CITY.cellZ * TILE + gate.z);
  for (const pier of piers) {
    const distance = Math.hypot(pier.position[0] - gateX, pier.position[2] - gateZ);
    assert.ok(distance - pier.dimensions[0] > 1.5, 'a pier closes the gate passage');
    assert.ok(pier.aabb.minY <= gate.pad && pier.aabb.maxY > gate.pad + 6);
  }
});

test('the market square itself is clear of building solids', () => {
  const { provider, plan } = fixture();
  for (const collider of chunksOf(provider, centre).filter(({ sourceId }) => sourceId.includes(':b'))) {
    const distance = Math.hypot(collider.position[0] - centre.x, collider.position[2] - centre.z);
    assert.ok(distance + 0.5 > plan.squareRadius, 'a building solid stands in the square');
  }
});

test('the collision epoch follows the world generator', () => {
  const { provider } = fixture();
  const first = provider.getEpoch();
  assert.equal(provider.getEpoch(), first);
  provider.terrainView.worldStore.generator = { ensureSettlementField: () => null };
  assert.notEqual(provider.getEpoch(), first);
  assert.equal(provider.buildChunkData(0, 0).colliders.length, 0);
});
