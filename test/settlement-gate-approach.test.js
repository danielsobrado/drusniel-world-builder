import assert from 'node:assert/strict';
import test from 'node:test';

import { segmentDistance } from '../src/editor/world/settlements/SettlementGeometry.js';
import { indexPlan } from '../src/editor/world/settlements/SettlementPlanIndex.js';
import { planSettlement } from '../src/editor/world/settlements/SettlementPlanner.js';

const walled = () => planSettlement({
  settlement: { id: 930, name: 'Gate Test', cellX: 80, cellZ: 80, population: 28, plaza: true, walls: true, group: 'town' },
  worldSeed: 4242,
  routeBearings: [0.4, 2.6, 4.4],
});
const gatehouses = (plan) => plan.buildings.filter(({ kind }) => kind === 'gatehouse');
const GATE_KINDS = new Set(['gateBanner', 'spearRack', 'hitchPost']);

test('every gate of a walled town gets open ground, its colours and its watch', () => {
  const plan = walled();
  const gates = gatehouses(plan);
  assert.ok(gates.length > 0, 'the test town should be walled');
  assert.equal(plan.approaches.length, gates.length);
  assert.equal(plan.props.filter(({ kind }) => kind === 'gateBanner').length, gates.length * 2);
  const banners = new Set(plan.props.filter(({ kind }) => kind === 'gateBanner').map(({ variant }) => variant));
  assert.equal(banners.size, 1, 'a town flies one banner');
  for (const [index, { points }] of plan.approaches.entries()) {
    assert.deepEqual(points[0], [gates[index].x, gates[index].z]);
    assert.ok(Math.hypot(...points.at(-1)) > Math.hypot(...points[0]) + 30, 'the approach runs away from the town');
  }
});

test('the approach is clear ground the field treats as road', () => {
  const plan = walled();
  const index = indexPlan(plan);
  for (const { points } of plan.approaches) {
    const [x, z] = points[3];
    const hit = index.grid.near(x, z, 0).some((item) => item.street && item.distance(x, z) <= item.halfWidth);
    assert.ok(hit, 'a station of the approach must be covered');
  }
});

test('nothing at a gate stands in the road', () => {
  const plan = walled();
  const props = plan.props.filter(({ kind }) => GATE_KINDS.has(kind) && kind !== 'gateBanner');
  assert.ok(props.length > 0);
  const roads = plan.streets.filter(({ kind }) => kind === 'main');
  for (const prop of props) {
    for (const road of roads) {
      for (let index = 1; index < road.points.length; index += 1) {
        const distance = segmentDistance(prop.x, prop.z, ...road.points[index - 1], ...road.points[index]);
        assert.ok(distance > road.width / 2, `${prop.kind} stands in the road`);
      }
    }
  }
});

test('gate dressing is deterministic, and an open village has none', () => {
  const pick = (plan) => plan.props.filter(({ kind }) => GATE_KINDS.has(kind));
  assert.deepEqual(pick(walled()), pick(walled()));
  const village = planSettlement({ settlement: { id: 931, name: 'Open', cellX: 80, cellZ: 80, population: 1 }, worldSeed: 4242 });
  assert.equal(village.approaches.length, 0);
  assert.equal(pick(village).length, 0);
});
