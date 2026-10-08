import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { planSettlement } from '../src/editor/world/settlements/SettlementPlanner.js';
import { rect, rectsOverlap } from '../src/editor/world/settlements/SettlementGeometry.js';
import { PAVING_LAYERS, settlementPavingJob, smoothPath } from '../src/editor/world/settlements/paving/SettlementPavingGeometry.js';
import {
  dressingFor,
  SETTLEMENT_DRESSING_KEYS,
  SETTLEMENT_ROLE_FALLBACK,
  SETTLEMENT_SURFACE_ROLES,
  SETTLEMENT_SURFACE_SETS,
  surfaceSetFiles,
  surfaceSetRecipe,
} from '../src/editor/world/settlements/surfaces/SettlementDressing.js';
import { planToWorld, settlementPlacements } from '../src/editor/world/settlements/view/SettlementPlacements.js';

const ground = (x, z) => Math.sin(x * 0.01) * 2 + Math.cos(z * 0.013) * 2;

function plan(settlement, routeBearings = [0.4, 2.3, 3.9, 5.2]) {
  return planSettlement({ settlement, worldSeed: 1234, routeBearings, sampleHeight: ground, isBuildable: () => true });
}

const CITY = { id: 18, name: 'Cyvazin', cellX: 500, cellZ: -300, population: 28, capital: true, walls: true, citadel: true, plaza: true, temple: true };
const HAMLET = { id: 5, name: 'Thorp', cellX: 10, cellZ: 20, population: 0.3 };
const TILE_METRES = { earth: 3, cobble: 2, flagstone: 2.5 };

function drain(job) {
  for (;;) {
    const step = job.next();
    if (step.done) return step.value;
  }
}

test('a settlement plan is deterministic in its inputs', () => {
  assert.deepEqual(plan(CITY), plan(CITY));
});

test('a city is a web of streets: rings and lanes as well as main roads', () => {
  const kinds = new Set(plan(CITY).streets.map(({ kind }) => kind));
  for (const kind of ['main', 'ring', 'lane', 'walk']) assert.ok(kinds.has(kind), `missing ${kind} streets`);
  assert.ok(plan(CITY).streets.filter(({ kind }) => kind === 'ring').length >= 2);
});

test('the market square is walled by house fronts and nothing stands in it', () => {
  const { buildings, squareRadius } = plan(CITY);
  assert.ok(squareRadius > 0);
  const distances = buildings.map((building) => Math.hypot(building.x, building.z) - Math.min(building.width, building.depth) / 2);
  assert.ok(Math.min(...distances) >= squareRadius - 1e-6, 'a building reaches into the square');
  assert.ok(distances.filter((distance) => distance < squareRadius + 4).length >= 6, 'the square is not enclosed');
});

test('no two buildings of a plan overlap', () => {
  const boxes = plan(CITY).buildings
    .filter(({ kind }) => !['wall', 'tower', 'gatehouse'].includes(kind))
    .map((building) => rect(building.x, building.z, building.width, building.depth, building.yaw));
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      assert.equal(rectsOverlap(boxes[left], boxes[right]), false, `buildings ${left} and ${right} overlap`);
    }
  }
});

test('placements turn plan space into canonical world space', () => {
  const cityPlan = plan(CITY);
  const placements = settlementPlacements(CITY, cityPlan, 2, ground);
  assert.equal(placements.length, cityPlan.buildings.length + cityPlan.props.length);
  const building = cityPlan.buildings[0];
  const placed = placements[0];
  assert.deepEqual({ x: placed.x, z: placed.z }, planToWorld(CITY, 2, building.x, building.z));
  assert.equal(placed.z, -(CITY.cellZ * 2 + building.z));
  assert.equal(placed.y, building.pad);
  // The front, (sin yaw, cos yaw) in plan space, is (sin yaw, −cos yaw) in the world.
  assert.ok(Math.abs(Math.sin(placed.rotationY) - Math.sin(building.yaw)) < 1e-12);
  assert.ok(Math.abs(Math.cos(placed.rotationY) + Math.cos(building.yaw)) < 1e-12);
  assert.ok(placements.every(({ seed }) => seed >= 0 && seed < 1));
  assert.ok(placements.some(({ small }) => small) && placements.some(({ small }) => !small));
});

test('a smoothed path keeps its ends and steps finely', () => {
  const path = smoothPath([[0, 0], [12, 1], [24, -2], [36, 0]]);
  assert.deepEqual(path[0], [0, 0]);
  assert.deepEqual(path.at(-1), [36, 0]);
  for (let index = 1; index < path.length; index += 1) {
    assert.ok(Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]) < 2.2);
  }
});

test('paving faces up, hugs the ground and frays only at its border', () => {
  const layers = drain(settlementPavingJob(plan(CITY), ground, TILE_METRES));
  assert.deepEqual(layers.map(({ kind }) => kind).sort(), [...PAVING_LAYERS].sort());
  for (const { kind, positions, uvs, edges, colors, indices } of layers) {
    assert.equal(uvs.length / 2, positions.length / 3);
    assert.equal(colors.length, positions.length);
    assert.equal(edges.length, positions.length / 3);
    assert.ok(edges.every((edge) => edge >= 0 && edge <= 1));
    assert.ok(edges.some((edge) => edge === 0) && edges.some((edge) => edge === 1));
    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      // Local z is minus plan z; the lift is a few centimetres.
      const lift = positions[vertex + 1] - ground(positions[vertex], -positions[vertex + 2]);
      assert.ok(lift > 0.03 && lift < 0.1, `${kind} paving lifted ${lift} m`);
    }
    for (let index = 0; index < indices.length; index += 3) {
      const [a, b, c] = [indices[index] * 3, indices[index + 1] * 3, indices[index + 2] * 3];
      const normalY = (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a])
        - (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
      assert.ok(normalY >= -1e-6, `${kind} paving has a triangle facing down`);
    }
  }
});

test('a hamlet is paved in earth alone', () => {
  const layers = drain(settlementPavingJob(plan(HAMLET, [2]), ground, TILE_METRES));
  assert.deepEqual(layers.map(({ kind }) => kind), ['earth']);
});

test('every settlement gets a complete dressing, and towns differ', () => {
  const keys = new Set();
  for (let id = 1; id <= 200; id += 1) {
    for (const topStyle of ['slate', 'terracotta']) {
      const dressing = dressingFor({ id }, { topStyle });
      for (const role of SETTLEMENT_SURFACE_ROLES) {
        assert.ok(SETTLEMENT_SURFACE_SETS[dressing[role]], `settlement ${id} has no ${role} set`);
      }
      assert.equal(dressing.roof, topStyle === 'slate' ? 'roof-slate' : 'roof-clay');
      keys.add(dressing.key);
    }
    assert.deepEqual(dressingFor({ id }, { topStyle: 'slate' }), dressingFor({ id }, { topStyle: 'slate' }));
  }
  assert.deepEqual([...keys].sort(), [...SETTLEMENT_DRESSING_KEYS].sort());
  for (const role of ['cobble', 'flagstone', 'earth']) {
    assert.ok(SETTLEMENT_SURFACE_SETS[dressingFor({ id: 1 }, { topStyle: 'slate' })[role]].tileMetres > 0);
  }
});

test('every surface set ships what it is made from', () => {
  for (const [name, set] of Object.entries(SETTLEMENT_SURFACE_SETS)) {
    assert.notEqual(Boolean(set.source), Boolean(set.ptl), `${name} must be photographed or procedural, not both`);
    if (set.ptl) {
      const recipe = JSON.parse(fs.readFileSync(new URL(`../public/${surfaceSetRecipe(name)}`, import.meta.url), 'utf8'));
      assert.equal(recipe.format, 'ptl-material', `${name} is not a PTL recipe`);
      assert.ok(set.bakeMetres > 0);
    } else {
      for (const file of Object.values(surfaceSetFiles(name))) {
        assert.ok(fs.existsSync(new URL(`../public/assets/textures/settlement/${file}`, import.meta.url)), `${file} is missing`);
      }
    }
  }
});

test('every role falls back to a photographed set', () => {
  for (const role of SETTLEMENT_SURFACE_ROLES) {
    assert.ok(SETTLEMENT_SURFACE_SETS[SETTLEMENT_ROLE_FALLBACK[role]]?.source, `${role} has no photographed fallback`);
  }
});
