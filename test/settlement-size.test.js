import assert from 'node:assert/strict';
import test from 'node:test';

import { planSettlement } from '../src/editor/world/settlements/SettlementPlanner.js';
import { MAX_BUILDINGS, settlementProfile, townSize } from '../src/editor/world/settlements/SettlementProfile.js';

const ground = (x, z) => 20 + Math.sin(x * 0.013) * 2 + Math.cos(z * 0.011) * 2;
const plan = (population, extra = {}) => planSettlement({
  settlement: { id: 41, cellX: 0, cellZ: 0, population, plaza: true, walls: population > 3, ...extra },
  worldSeed: 9,
  sampleHeight: ground,
});

test('a town grows with its Azgaar population, capped for the largest cities', () => {
  const sizes = [0.4, 1.8, 5, 16, 38.5].map((population) => townSize(population));
  for (let index = 1; index < sizes.length; index += 1) {
    assert.ok(sizes[index].buildings >= sizes[index - 1].buildings);
    assert.ok(sizes[index].radius >= sizes[index - 1].radius);
  }
  assert.equal(townSize(38.5).buildings, MAX_BUILDINGS);
  assert.equal(townSize(500).buildings, MAX_BUILDINGS);
  assert.ok(townSize(0.4).buildings < 80, 'hamlets stay small');
  assert.ok(settlementProfile({ id: 1, population: 5 }).buildings >= 700, 'a 5k town is hundreds of buildings');
});

test('the planned town reaches its population-based size, its streets growing with it', () => {
  const town = plan(5);
  const city = plan(38.5, { capital: true });
  assert.ok(town.buildings.length >= 500, `5k town planned ${town.buildings.length}`);
  assert.ok(city.buildings.length >= 0.85 * MAX_BUILDINGS, `capped city planned ${city.buildings.length}`);
  const rings = (p) => p.streets.filter((street) => street.kind === 'ring').length;
  assert.ok(rings(city) > rings(town), 'a bigger town has more ring streets');
  assert.ok(city.profile.radius > town.profile.radius * 1.3);
});

test('every planned building stands within the town and plans are deterministic', () => {
  const city = plan(16, { capital: true });
  const again = plan(16, { capital: true });
  assert.equal(JSON.stringify(city.buildings), JSON.stringify(again.buildings));
  const limit = city.profile.reach + 20;
  for (const building of city.buildings) assert.ok(Math.hypot(building.x, building.z) <= limit);
});

test('hamlets and villages without rings still house their people', () => {
  const homes = (p) => p.buildings.filter(({ kind }) => !['farmhouse', 'barn', 'wall', 'gatehouse', 'tower'].includes(kind)).length;
  for (const population of [0.3, 0.9, 2.2]) {
    const fills = [];
    for (let id = 1; fills.length < 12; id += 1) {
      const village = planSettlement({ settlement: { id, cellX: 0, cellZ: 0, population }, worldSeed: 9, routeBearings: [1.2], sampleHeight: ground });
      // A grid village has block streets of its own; this is about the radial and street villages.
      if (village.signature.grammar === 'grid') continue;
      assert.equal(village.streets.filter(({ kind }) => kind === 'ring').length, 0);
      fills.push(homes(village) / village.profile.buildings);
    }
    const fill = fills.reduce((sum, share) => sum + share, 0) / fills.length;
    // One road and no rings once housed a quarter to a third; lanes grown to the population house most.
    assert.ok(fill >= 0.65, `${population}k villages housed ${(fill * 100).toFixed(0)}% of their buildings`);
  }
});
