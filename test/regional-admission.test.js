import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { allocateRegionalCell, allocateRegionalWindow, regionalCardEligible } from '../src/editor/performance/RegionalAdmission.js';
import { emptyRenderCost, RegionalRenderCostModel } from '../src/editor/performance/RegionalRenderCost.js';
import { collectRegionalSceneryDemand } from '../src/editor/performance/RegionalSceneryDemand.js';
import { RegionalSceneryBudget } from '../src/editor/performance/RegionalSceneryBudget.js';

const settings = { ...resolveRenderEnhancements().regionalBudget, spatialTriangleBudget: 1000, spatialDrawBudget: 10 };
const cost = (triangles, draws = 1, unknown = 0) => ({ ...emptyRenderCost(), triangles, draws, unknown });
const fixed = (triangles, draws = 1) => ({ requested: cost(triangles, draws), selected: cost(triangles, draws) });
function layer(full, reduced, draws = 1, reducedDraws = draws) {
  return { ...fixed(full, draws), options: [
    { factor: 1, cost: cost(full, draws) }, { factor: 0.5, cost: cost(reduced, reducedDraws) },
  ] };
}
const drain = iterator => {
  let step;
  do { step = iterator.next(); } while (!step.done);
  return step.value;
};
const focus = { chunkX: 0, chunkZ: 0 };

test('fixed reserves and shared budget prefer higher-priority scenery', () => {
  const layers = { town: fixed(300), tree: layer(400, 200), rock: layer(300, 100), card: layer(400, 100) };
  const result = allocateRegionalCell(layers, settings);
  assert.deepEqual(result.factors, { rock: 0.5, card: 0.5 });
  assert.deepEqual(result.reserved, { triangles: 700, draws: 4 });
  assert.equal(result.admitted.triangles, 900);
  assert.equal(result.overflow, false);
  const reversed = allocateRegionalCell(layers, { ...settings,
    admissionPriorities: { tree: 1, rock: 2, bush: 3, card: 4 } });
  assert.deepEqual(reversed.factors, { tree: 0.5, rock: 0.5 });
  assert.equal(reversed.admitted.triangles, 1000);
});

test('both triangle and draw budgets must fit; dominated options are rejected', () => {
  const result = allocateRegionalCell({ town: fixed(100, 6), tree: layer(100, 50, 5, 2),
    bush: { ...fixed(50, 2), options: [{ factor: 1, cost: cost(50, 2) }, { factor: 0.5, cost: cost(20, 3) }] } }, settings);
  assert.deepEqual(result.factors, { tree: 0.5 });
  assert.equal(result.admitted.draws, 10);
  assert.equal(result.overflow, false);
});

test('minimum visible representations can exceed the limit without forced removal', () => {
  const result = allocateRegionalCell({ town: fixed(1100), water: fixed(100), tree: layer(300, 100) }, settings);
  assert.deepEqual(result.factors, { tree: 0.5 });
  assert.equal(result.admitted.triangles, 1300);
  assert.equal(result.overflow, true);
});

test('unknown requested geometry fails open rather than claiming an enforceable quota', () => {
  const result = allocateRegionalCell({ tree: layer(1000, 100),
    detail: { requested: cost(0, 0, 50), selected: cost(0, 0, 50) } }, settings);
  assert.deepEqual(result.factors, {});
  assert.equal(result.unknown, true);
  assert.equal(result.admitted.triangles, 1000);
});

test('quality recovery uses the lower hysteresis threshold; sparse cells stay unchanged', () => {
  assert.deepEqual(allocateRegionalCell({ tree: layer(900, 200) }, settings).factors, {});
  assert.deepEqual(allocateRegionalCell({ tree: layer(900, 200) }, settings, { tree: 0.5 }).factors, { tree: 0.5 });
  assert.deepEqual(allocateRegionalCell({ tree: layer(750, 200) }, settings, { tree: 0.5 }).factors, {});
});

test('published town cost is reserved in preference to full near kit', () => {
  const town = { requested: cost(3000), selected: cost(100) };
  const result = allocateRegionalCell({ town, tree: layer(700, 300) }, settings);
  assert.deepEqual(result.factors, {});
  assert.equal(result.admitted.triangles, 800);
});

test('focus and camera rings prevent reductions, even when budgets overflow', () => {
  const layers = { tree: layer(1200, 600) };
  const cells = new Map(['1:0', '3:0', '6:0'].map(key => [key, { renderCost: { layers } }]));
  const allocation = allocateRegionalWindow(cells, settings, new Map(), focus, { chunkX: 3, chunkZ: 0 });
  assert.deepEqual([...allocation.decisions], [['6:0', { tree: 0.5 }]]);
  assert.equal(allocation.stats.protectedChunks, 2);
  assert.equal(allocation.stats.overflowChunks, 2);
  assert.equal(allocation.stats.treeReduced, 1);
  assert.equal(allocateRegionalWindow(cells, settings, new Map(), focus, null).decisions.size, 0);
});

test('grass candidate costs include protected tiles at full density', () => {
  const surface = { config: {}, waterSlots: [], terrainView: { focusChunk: focus, chunkWorldSize: 128 },
    meadowGrass: { cards: { tileSize: 16, templates: { cards: { index: { count: 12 }, instanceCount: 100 } },
      tiles: new Map([['interior', { centerX: 320, centerZ: -64, band: 'cards', output: { count: 100 } }],
        ['edge', { centerX: 257, centerZ: -64, band: 'cards', output: { count: 100 } }]]) } } };
  const model = new RegionalRenderCostModel(surface);
  const cells = drain(collectRegionalSceneryDemand(surface, focus, 128, settings, new WeakMap(), model,
    { cameraChunk: focus, handoffEnd: 100 }));
  const card = cells.get('2:0').renderCost.layers.card;
  assert.equal(card.requested.triangles, 800);
  assert.equal(card.options.find(option => option.factor === 0.5).cost.triangles, 600);
  assert.equal(card.options.find(option => option.factor === 0.5).cost.draws, 2);
  assert.equal(regionalCardEligible(320, -64, 8, focus, focus, 128, 200, 1), false);
});

test('controller publishes layer-specific choices and invalidates revisions on changed factors', () => {
  const budget = new RegionalSceneryBudget(settings, { admission: true });
  const keys = new Set(['2:0']);
  budget.publish(keys, new Map([['2:0', { tree: 0.5, card: 0.7 }]]));
  const revision = budget.revision;
  assert.equal(budget.geometryCosts, true);
  assert.equal(budget.factorForKey('2:0', 'tree'), 0.5);
  assert.equal(budget.factorForKey('2:0', 'rock'), 1);
  assert.equal(budget.cardFactor(320, -64, 8, focus, focus, 128, 100), 0.7);
  budget.publish(keys, new Map([['2:0', { tree: 0.5, card: 0.7 }]]));
  assert.equal(budget.revision, revision);
  budget.publish(keys, new Map([['2:0', { tree: 0.7 }]]));
  assert.equal(budget.revision, revision + 1);
  budget.dispose();
  assert.equal(budget.factorForKey('2:0', 'tree'), 1);
});

test('candidate manifest tiers use actual prototype geometry and no additional assets', () => {
  const model = new RegionalRenderCostModel({ config: {}, waterSlots: [] });
  const view = { prototypes: [{ geometry: { index: { count: 300 } } }],
    proxyPrototypes: [[{ geometry: { index: { count: 60 } } }]],
    previousPlan: { entries: [{ chunkX: 2, chunkZ: 0, band: 'near', baselineBand: 'near',
      admissionOptions: [{ factor: 1, band: 'near' }, { factor: 0.5, band: 'proxy' }] }] } };
  const result = drain(model.manifest(view, 'rock', '2:0', [{ prototypeIndex: 0 }, { prototypeIndex: 0 }]));
  assert.equal(result.options[0].cost.triangles, 200);
  assert.equal(result.options[1].cost.triangles, 40);
  assert.equal(result.options[1].cost.shadowTriangles, 0);
});

test('admission configuration is opt-in and factors and priorities are validated', () => {
  assert.equal(resolveRenderEnhancements().regionalAdmissionBudget, false);
  assert.equal(resolveRenderEnhancements({}, '?regionalAdmissionBudget=1').regionalAdmissionBudget, true);
  assert.throws(() => resolveRenderEnhancements({ regionalBudget: { admissionFactors: [1, 0.5, 0.7] } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ regionalBudget: { admissionPriorities: { tree: -1 } } }), RangeError);
});

test('sampling and allocation are both resumable; camera teleport clears decisions', () => {
  const view = { prototypes: [{ geometry: { index: { count: 3000 } } }],
    proxyPrototypes: [[{ geometry: { index: { count: 300 } } }]],
    manifestStore: { cache: new Map([['2:0', { placements: [{ prototypeIndex: 0 }] }]]) },
    previousPlan: { entries: [{ chunkX: 2, chunkZ: 0, band: 'near', baselineBand: 'near',
      admissionOptions: [{ factor: 1, band: 'near' }, { factor: 0.5, band: 'proxy' }] }] } };
  const surface = { config: { enhancements: { shadowCascades: 1 } }, waterSlots: [], rockView: view,
    terrainView: { focusChunk: focus, chunkWorldSize: 128, floatingOrigin: { getState: () => ({ x: 0, z: 0 }) } } };
  const budget = new RegionalSceneryBudget({ ...settings, spatialWorkItems: 1 }, { admission: true });
  const camera = { position: { x: 64, z: -64 } };
  budget.update(surface, 0, () => false, camera);
  assert.equal(budget.revision, 0);
  let allocationStarted = false;
  for (let i = 1; i < 50 && !budget.decisions.size; i++) {
    budget.update(surface, i, () => false, camera);
    if (budget.job?.cells) {
      allocationStarted = true;
      assert.equal(budget.decisions.size, 0);
    }
  }
  assert.equal(allocationStarted, true);
  assert.equal(budget.factorForKey('2:0', 'rock'), 0.5);
  camera.position.x = 12800;
  budget.update(surface, 100, () => true, camera);
  assert.equal(budget.decisions.size, 0);
});
