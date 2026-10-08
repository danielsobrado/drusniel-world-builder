import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementCollisionProvider } from '../src/editor/collision/providers/SettlementCollisionProvider.js';
import { isColliderRecordDescriptor } from '../src/editor/collision/colliders/ColliderRecords.js';
import { COLLISION_LAYERS } from '../src/editor/collision/CollisionLayers.js';
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
    assert.ok(distance - pier.dimensions[0] / 2 > 1.5, 'a pier closes the gate passage');
    assert.ok(pier.aabb.minY <= gate.pad && pier.aabb.maxY > gate.pad + 6);
    assert.equal(pier.layers, COLLISION_LAYERS.solid);
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

test('wall tops can be stood on; house roofs only block', () => {
  const { provider, plan } = fixture();
  const colliders = chunksOf(provider, centre);
  const of = (kind) => {
    const index = plan.buildings.findIndex((building) => building.kind === kind);
    return colliders.find(({ sourceId }) => sourceId.includes(`:b${index}.`));
  };
  const wall = of('wall');
  assert.equal(wall.layers, COLLISION_LAYERS.solid);
  // The wall-walk is the wall's own height above its pad, not clear of the roofline.
  assert.ok(Math.abs(wall.aabb.maxY - wall.aabb.minY - 6) < 1e-9);
  assert.equal(of('house').layers, COLLISION_LAYERS.blocking);
});

function inside(collider, x, z) {
  // Undo the box's turn and test against its half extents.
  const dx = x - collider.position[0];
  const dz = z - collider.position[2];
  const cos = Math.cos(collider.rotationY);
  const sin = Math.sin(collider.rotationY);
  return Math.abs(dx * cos - dz * sin) <= collider.dimensions[0] / 2 && Math.abs(dx * sin + dz * cos) <= collider.dimensions[2] / 2;
}

test('a house is four walls with a doorway where the plan put its door', () => {
  const { provider, plan } = fixture();
  const index = plan.buildings.findIndex((building) => building.kind === 'house' && building.front);
  const house = plan.buildings[index];
  const walls = chunksOf(provider, centre).filter(({ sourceId }) => sourceId.includes(`:b${index}.`));
  assert.equal(walls.length, 5);
  const front = [Math.sin(house.yaw), Math.cos(house.yaw)];
  const across = [Math.cos(house.yaw), -Math.sin(house.yaw)];
  // A point in the footprint's frame (x along the frontage, z toward the front), as canonical metres.
  const at = (x, z) => [CITY.cellX * TILE + house.x + across[0] * x + front[0] * z, -(CITY.cellZ * TILE + house.z + across[1] * x + front[1] * z)];
  const blocked = (x, z) => walls.some((wall) => inside(wall, ...at(x, z)));
  const { door } = house;
  // Through the doorway where the mesh has its door, and across the floor inside...
  for (const z of [door.z + 0.5, door.z - 0.2, door.z - 1.5]) assert.ok(!blocked(door.x, z), `the way in is blocked at z ${z}`);
  // ...but not through the front wall beside the door, nor out of the back.
  const beside = door.x > 0 ? door.x - 1.6 : door.x + 1.6;
  assert.ok(blocked(beside, door.z - 0.2), 'the front wall is open beside the door');
  assert.ok(blocked(0, -(house.depth - 0.5) / 2 + 0.2), 'the back wall is open');
});

test('a solid-house provider leaves no doorway', () => {
  const { provider, plan } = fixture();
  provider.enterable = false;
  const index = plan.buildings.findIndex((building) => building.kind === 'house' && building.front);
  assert.equal(chunksOf(provider, centre).filter(({ sourceId }) => sourceId.includes(`:b${index}.`)).length, 1);
});

test('a wall stair is a flight of walkable steps up to the wall-walk', () => {
  const { provider, plan } = fixture();
  const index = plan.props.findIndex(({ kind }) => kind === 'wallStair');
  assert.ok(index >= 0);
  const steps = chunksOf(provider, centre).filter(({ sourceId }) => sourceId.includes(`:p${index}.`));
  assert.equal(steps.length, 10);
  // Wide enough for the character motor to stand on: it refuses a box narrower than the capsule.
  assert.ok(steps.every(({ dimensions }) => dimensions[0] >= 0.8 && dimensions[2] >= 0.8));
  const tops = steps.map(({ aabb }) => aabb.maxY - aabb.minY).sort((left, right) => left - right);
  tops.forEach((top, step) => assert.ok(Math.abs(top - 0.6 * (step + 1)) < 1e-9));
  assert.ok(Math.abs(tops.at(-1) - 6) < 1e-9);
  assert.ok(steps.every(({ layers }) => layers === COLLISION_LAYERS.solid));
});

test('a box collider spans the footprint it stands for, not half of it', () => {
  const { provider, plan } = fixture();
  const index = plan.buildings.findIndex(({ kind }) => kind === 'tower');
  const tower = chunksOf(provider, centre).find(({ sourceId }) => sourceId.includes(`:b${index}.`));
  assert.deepEqual(tower.dimensions.map((value) => +value.toFixed(3)), [6.6, 9, 6.6]);
  assert.ok(Math.abs(tower.aabb.maxY - tower.aabb.minY - tower.dimensions[1]) < 1e-9);
});
