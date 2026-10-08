import assert from 'node:assert/strict';
import test from 'node:test';

import { familyForStyle, prefabNameFor, propClusterFor } from '../../src/editor/towns/TownPrefabCatalog.js';
import { interiorContains, layoutTown } from '../../src/editor/towns/TownLayout.js';
import { TownCollisionSource } from '../../src/editor/collision/providers/TownCollisionSource.js';
import { TownCollisionProvider, townBoxAabb } from '../../src/editor/collision/providers/TownCollisionProvider.js';

const close = (actual, expected, epsilon = 1e-6) => assert.ok(
  Math.abs(actual - expected) < epsilon,
  `${actual} != ${expected}`,
);

const KIT = Object.freeze({
  moduleColliders: { Barrel: [{ c: [0, 0.45, 0], s: [0.62, 0.9, 0.62] }] },
  prefabs: {
    Tudor_House_Small: {
      kind: 'building',
      size: [6, 4],
      stories: 2,
      parts: [{ m: 'Wall_Stone_Door', p: [-1, 0, 2], yaw: 0 }],
      colliders: [{ c: [0, 1.5, 2], s: [6, 3, 0.3], yaw: 0 }],
      doors: [{ p: [-0.42, 0.02, 2], yaw: 0, size: [0.84, 2.08, 0.1], openYaw: 1.745 }],
      lights: [{ p: [0, 2.3, 0], energy: 90 }],
    },
  },
});

function plan(building, extra = {}) {
  return {
    name: 'Testby',
    profile: { rank: 1, style: { key: 'limestone-slate', finishes: ['limewash'] } },
    buildings: [building],
    props: [],
    fields: [],
    ...extra,
  };
}

test('burg culture styles map to regional families', () => {
  assert.equal(familyForStyle('granite-slate'), 'Nordic');
  assert.equal(familyForStyle('sandstone-terracotta'), 'Med');
  assert.equal(familyForStyle('limestone-slate'), 'Tudor');
  assert.equal(familyForStyle('unknown'), 'Tudor');
});

test('building kinds resolve to family prefabs with a Tudor fallback', () => {
  const prefabs = { Nordic_House_Small: {}, Tudor_Tavern: {}, Med_Villa: {}, CityWall: {} };
  assert.equal(prefabNameFor('house', 0, 'Nordic', prefabs), 'Nordic_House_Small');
  assert.equal(prefabNameFor('tavern', 0, 'Nordic', prefabs), 'Tudor_Tavern');
  assert.equal(prefabNameFor('hall', 0, 'Med', prefabs), 'Med_Villa');
  assert.equal(prefabNameFor('wall', 0, 'Med', prefabs), 'CityWall');
  assert.equal(prefabNameFor('bollards', 0, 'Med', prefabs), null);
  assert.deepEqual(propClusterFor('signpost', 0), []);
});

test('a building facing plan +z faces canonical -z, at its pad, with its door in front', () => {
  // yaw 0: the front looks along plan +z, which is canonical -z.
  const layout = layoutTown({
    settlement: { id: 7, cellX: 100, cellZ: 50 },
    plan: plan({ kind: 'house', variant: 0, x: 10, z: 20, yaw: 0, pad: 12 }),
    tileSize: 2,
    kit: KIT,
    sampleHeight: () => 0,
  });
  assert.deepEqual(layout.anchor, { x: 200, z: -100 });
  const wall = layout.parts.get('Wall_Stone_Door');
  // Prefab +Z (front, z=2) must land 2 m further along canonical -z than the centre.
  close(wall[0], 10 + 1);
  close(wall[1], 12);
  close(wall[2], -20 - 2);
  const [door] = layout.doors;
  close(door.box.z, -100 - 20 - 2);
  close(door.box.y, 12 + 0.02 + 1.04);
  const [box] = layout.boxes;
  close(box.x, 200 + 10);
  close(box.z, -100 - 20 - 2);
  assert.equal(box.id, 'town:7:b0:c0');
});

test('turned plans stay unmirrored: front follows (sin yaw, -cos yaw)', () => {
  const yaw = Math.PI / 2; // front along plan +x → canonical +x
  const layout = layoutTown({
    settlement: { id: 1, cellX: 0, cellZ: 0 },
    plan: plan({ kind: 'house', variant: 0, x: 0, z: 0, yaw, pad: 0 }),
    tileSize: 1,
    kit: KIT,
    sampleHeight: () => 0,
  });
  const [door] = layout.doors;
  close(door.centre[0], 2, 1e-6);
  const interior = layout.interiors[0];
  assert.ok(interiorContains(interior, layout.anchor, 1.9, 1, 0));
  assert.ok(!interiorContains(interior, layout.anchor, 2.1, 1, 0));
  assert.ok(interiorContains(interior, layout.anchor, 0, 1, 2.9));
  assert.ok(!interiorContains(interior, layout.anchor, 0, 9, 0));
});

test('props stand on the graded ground and carry their module colliders', () => {
  const layout = layoutTown({
    settlement: { id: 3, cellX: 0, cellZ: 0 },
    plan: plan({ kind: 'nothing', variant: 0, x: 0, z: 0, yaw: 0 }, {
      props: [{ kind: 'barrels', variant: 0, x: 5, z: 5, yaw: 0 }],
    }),
    tileSize: 2,
    kit: KIT,
    sampleHeight: (x) => x * 0.1,
  });
  const barrels = layout.parts.get('Barrel');
  assert.equal(barrels.length, 3 * 4);
  close(barrels[1], barrels[0] * 0.1, 1e-5);
  assert.equal(layout.boxes.length, 3);
});

test('town collision source rebuilds only the chunks a door touches', () => {
  const source = new TownCollisionSource().configure(64);
  const wall = { id: 'w', x: 10, y: 1.5, z: -10, sx: 4, sy: 3, sz: 0.3, yaw: 0 };
  const door = { id: 'd', x: 100, y: 1, z: -10, sx: 0.84, sy: 2, sz: 0.1, yaw: 0 };
  source.setOwner('town', [wall, door]);
  const provider = new TownCollisionProvider({ source, chunkWorldSize: 64 });
  provider.buildChunkData(0, 0);
  provider.buildChunkData(1, 0);
  assert.deepEqual(provider.consumeDirtyOwnerChunks(['0:0', '1:0']), []);
  source.setBoxEnabled('town', door, false);
  assert.deepEqual(provider.consumeDirtyOwnerChunks(['0:0', '1:0']), ['1:0']);
  assert.equal(provider.buildChunkData(1, 0).colliders.length, 0);
  source.removeOwner('town');
  assert.equal(source.getBoxCount(), 0);
});

test('a turned box widens its AABB', () => {
  const aabb = townBoxAabb({ x: 0, y: 1, z: 0, sx: 2, sy: 2, sz: 0, yaw: Math.PI / 2 });
  close(aabb.maxZ, 1);
  close(aabb.maxX, 0);
});

test('city skins follow climate, rank and culture', async () => {
  const { skinFor, bannerColourFor } = await import('../../src/editor/towns/TownSkins.js');
  assert.equal(skinFor({ family: 'Med', biome: 4, snow: 0.6 }), 'frost');
  assert.equal(skinFor({ family: 'Tudor', biome: 9 }), 'frost');
  assert.equal(skinFor({ family: 'Tudor', biome: 6, capital: true }), 'imperial');
  assert.equal(skinFor({ family: 'Tudor', biome: 6, citadel: true, rank: 1 }), 'heartland');
  assert.equal(skinFor({ family: 'Tudor', biome: 1 }), 'sun');
  assert.equal(skinFor({ family: 'Tudor', biome: 12 }), 'marsh');
  assert.equal(skinFor({ family: 'Nordic', biome: 6 }), 'plains');
  assert.equal(skinFor({ family: 'Tudor', biome: 6 }), 'heartland');
  assert.deepEqual(bannerColourFor(3, 99), bannerColourFor(3, 7));
});

test('a share of buildings take the one-story-taller sibling when the kit has one', () => {
  const prefabs = { Tudor_House_Small: {}, Tudor_House_Small_Tall: {}, Tudor_House_Large: {} };
  assert.equal(prefabNameFor('house', 0, 'Tudor', prefabs, 0.1), 'Tudor_House_Small_Tall');
  assert.equal(prefabNameFor('house', 0, 'Tudor', prefabs, 0.9), 'Tudor_House_Small');
  assert.equal(prefabNameFor('house', 1, 'Tudor', prefabs, 0.1), 'Tudor_House_Large', 'no sibling, no change');
  assert.equal(prefabNameFor('house', 0, 'Tudor', prefabs), 'Tudor_House_Small', 'no roll keeps the base');
});
