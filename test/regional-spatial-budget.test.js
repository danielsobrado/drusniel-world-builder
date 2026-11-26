import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { townSceneryCells, collectRegionalSceneryDemand } from '../src/editor/performance/RegionalSceneryDemand.js';
import { RegionalSceneryBudget, evaluateSceneryDemand } from '../src/editor/performance/RegionalSceneryBudget.js';
import { meadowRequestedStems, meadowPageUpdatePlan } from '../src/editor/stylized/meadow/MeadowPageUpdatePlan.js';

const settings = resolveRenderEnhancements().regionalBudget;
function drain(iterator) {
  let step;
  do { step = iterator.next(); } while (!step.done);
  return step.value;
}

test('town module demand follows canonical placement coordinates', () => {
  const layout = { anchor: { x: 96, z: -96 }, parts: new Map([
    ['wall', new Float32Array([0, 0, 0, 0, 64, 0, -64, 0, -160, 0, 160, 0])],
  ]) };
  const cells = drain(townSceneryCells(layout, 128));
  assert.deepEqual([...cells], [['0:0', 1], ['1:1', 1], ['-1:-1', 1]]);
});

test('local pressure and hysteresis do not reduce sparse neighbouring chunks', () => {
  const cells = new Map([['2:0', { town: 1000, tree: 30 }], ['3:0', { tree: 20 }]]);
  let result = evaluateSceneryDemand(cells, new Set(), settings);
  assert.deepEqual([...result.pressured], ['2:0']);
  assert.equal(result.totals.tree, 50);
  result = evaluateSceneryDemand(new Map([['2:0', { town: 1000 }]]), result.pressured, settings);
  assert.equal(result.pressured.has('2:0'), true);
  result = evaluateSceneryDemand(new Map([['2:0', { town: 800 }]]), result.pressured, settings);
  assert.equal(result.pressured.size, 0);
});

test('card reduction protects both rings, tile boundaries and handoff', () => {
  const budget = new RegionalSceneryBudget(settings);
  budget.publish(new Set(['0:0', '1:0', '2:0', '3:0']));
  const focus = { chunkX: 0, chunkZ: 0 };
  assert.equal(budget.cardFactor(320, -64, 8, focus, focus, 128, 100), 0.8);
  assert.equal(budget.cardFactor(320, -64, 8, focus, focus, 128, 200), 1);
  assert.equal(budget.cardFactor(129, -64, 8, focus, focus, 128, 0), 1);
  assert.equal(budget.cardFactor(192, -64, 8, focus, focus, 128, 0), 1);
  assert.equal(budget.cardFactor(448, -64, 8, focus, { chunkX: 3, chunkZ: 0 }, 128, 0), 1);
});

function surfaceFixture() {
  return {
    terrainView: { focusChunk: { chunkX: 0, chunkZ: 0 }, chunkWorldSize: 128 },
    treeView: { manifestStore: { cache: new Map([
      ['2:0', { placements: { length: 200 } }], ['3:0', { placements: { length: 2 } }],
    ]) } },
    meadowGrass: { cards: { tiles: new Map([
      ['card', { centerX: 320, centerZ: -64, band: 'cards', output: { count: 100 }, regionalCountFactor: 0.5 }],
    ]) } },
  };
}

test('sample is bounded, ignores reduced publication count and clears after teleport', () => {
  const budget = new RegionalSceneryBudget({ ...settings, spatialWorkItems: 1 });
  const surface = surfaceFixture();
  budget.update(surface, 0);
  assert.equal(budget.revision, 0);
  for (let i = 1; i < 10; i++) budget.update(surface, i);
  assert.equal(budget.factorForKey('2:0'), 0.75);
  assert.equal(budget.factorForKey('3:0'), 1);
  const cells = drain(collectRegionalSceneryDemand(surface, surface.terrainView.focusChunk, 128, settings, new WeakMap()));
  assert.equal(cells.get('2:0').card, 100);
  surface.terrainView.focusChunk = { chunkX: 100, chunkZ: 100 };
  budget.update(surface, 20, () => true);
  assert.equal(budget.factorForKey('2:0'), 1);
  budget.dispose();
});

test('grass prefix keeps at least one card and does not modify raw output', () => {
  const tile = { output: { count: 100 }, regionalCountFactor: 0.8 };
  assert.equal(meadowRequestedStems(tile, 100), 80);
  assert.equal(tile.output.count, 100);
  assert.equal(meadowRequestedStems({ output: { count: 1 }, regionalCountFactor: 0.5 }, 100), 1);
  assert.equal(meadowRequestedStems({ output: { count: 0 }, regionalCountFactor: 0.5 }, 100), 0);
  assert.equal(meadowRequestedStems({ output: { count: 200 } }, 100), 100);
});

test('grass page can shrink and restore the same source prefix', () => {
  const tile = { output: { count: 100 }, buildId: 1, renderX: 0, renderZ: 0 };
  const page = { stride: 100, geometry: { instanceCount: 0 }, slots: new Map(), present: new Set(), order: [] };
  const apply = plan => {
    page.geometry.instanceCount = plan.count;
    page.present = plan.present;
    page.order = plan.order;
    for (const write of plan.writes) page.slots.set(write.tile, { ...write, renderX: 0, renderZ: 0 });
  };
  apply(meadowPageUpdatePlan(page, [tile]));
  tile.regionalCountFactor = 0.8;
  const reduced = meadowPageUpdatePlan(page, [tile]);
  assert.equal(reduced.count, 80);
  apply(reduced);
  tile.regionalCountFactor = 1;
  const restored = meadowPageUpdatePlan(page, [tile]);
  assert.equal(restored.count, 100);
  assert.deepEqual(restored.writes[0].sourceRanges.map(r => [r.offset, r.count]), [[0, 100]]);
});

test('spatial flag is independent and weight overrides are validated', () => {
  assert.equal(resolveRenderEnhancements().regionalSpatialBudget, false);
  const config = resolveRenderEnhancements({ regionalBudget: { spatialWeights: { tree: 2 } } }, '?regionalSpatialBudget=1');
  assert.equal(config.regionalSpatialBudget, true);
  assert.equal(config.regionalDensityBudget, false);
  assert.equal(config.regionalBudget.spatialWeights.tree, 2);
  assert.equal(config.regionalBudget.spatialWeights.town, 1);
  assert.throws(() => resolveRenderEnhancements({ regionalBudget: { spatialWeights: { tree: -1 } } }), RangeError);
});
