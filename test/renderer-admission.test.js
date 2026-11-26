import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { iterateRendererAdmission, finalizeRendererAdmission, rendererPublicationState } from '../src/editor/performance/RendererAdmission.js';
import { RegionalRenderCostModel, emptyRenderCost } from '../src/editor/performance/RegionalRenderCost.js';
import { collectRegionalSceneryDemand } from '../src/editor/performance/RegionalSceneryDemand.js';
import { RegionalSceneryBudget } from '../src/editor/performance/RegionalSceneryBudget.js';

const settings = { ...resolveRenderEnhancements().regionalBudget, spatialTriangleBudget: 1000,
  spatialDrawBudget: 100, rendererAdmissionTriangleBudget: 1000, rendererAdmissionDrawBudget: 100,
  rendererAdmissionTransitionReserve: 0.1, rendererAdmissionMaxChanges: 8 };
const focus = { chunkX: 0, chunkZ: 0 };
const cost = (triangles, draws = 1) => ({ ...emptyRenderCost(), triangles, draws });
const fixed = (triangles, draws = 1) => {
  const value = cost(triangles, draws);
  return { requested: value, selected: value, current: value, active: value };
};
function layer(full, low, current = 1, fullDraws = 1, lowDraws = fullDraws) {
  const requested = cost(full, fullDraws), reduced = cost(low, lowDraws);
  const selected = current === 1 ? requested : reduced;
  const both = cost(full + low, fullDraws + lowDraws);
  return { requested, selected, current: selected, active: selected, options: [
    { factor: 1, cost: requested, transitionCost: current === 1 ? requested : both },
    { factor: 0.5, cost: reduced, transitionCost: current === 1 ? both : reduced },
  ] };
}
const cell = layers => ({ renderCost: { layers } });
function drain(iterator) {
  let step;
  do { step = iterator.next(); } while (!step.done);
  return step.value;
}
const plan = (cells, overrides = {}, previous = new Map()) =>
  drain(iterateRendererAdmission(cells, { ...settings, ...overrides }, previous, focus, focus));

test('shared quota demotes low priority and distant cells even when each cell fits locally', () => {
  const cells = new Map([['0:0', cell({ town: fixed(200) })],
    ['2:0', cell({ tree: layer(300, 100), card: layer(200, 50) })],
    ['5:0', cell({ tree: layer(300, 100), card: layer(200, 50) })]]);
  const result = plan(cells);
  assert.equal(result.localSteady.triangles, 1200);
  assert.equal(result.steady.triangles, 900);
  assert.deepEqual(result.records.filter(row => row.desired.factor < 1).map(row => [row.key, row.kind]),
    [['5:0', 'card'], ['2:0', 'card']]);
  assert.equal(result.fixed.triangles, 200);
});

test('global draw budget independently constrains quality', () => {
  const cells = new Map([['2:0', cell({ tree: layer(100, 50, 1, 60, 20) })],
    ['4:0', cell({ rock: layer(100, 50, 1, 60, 20) })]]);
  const result = plan(cells);
  assert.equal(result.steady.draws, 80);
  assert.equal(result.records.find(row => row.kind === 'rock').desired.factor, 0.5);
});

test('existing overlap is charged and overlapping changes are deferred', () => {
  const tree = layer(600, 300);
  tree.active = cost(900, 2);
  const cells = new Map([['2:0', cell({ tree, card: layer(500, 100) })]]);
  const result = finalizeRendererAdmission(plan(cells), settings);
  assert.equal(result.stats.overlapTriangles, 300);
  assert.equal(result.stats.changes, 0);
  assert.ok(result.stats.overlapDeferred > 0);
});

test('one emergency demotion progresses when the existing view is already over budget', () => {
  const cells = new Map([['2:0', cell({ card: layer(700, 100) })],
    ['5:0', cell({ card: layer(700, 100) })]]);
  const result = finalizeRendererAdmission(plan(cells), settings);
  assert.equal(result.stats.changes, 1);
  assert.equal(result.stats.emergencyDemotions, 1);
  assert.equal(result.stats.transientOverflow, 1);
  assert.deepEqual([...result.decisions], [['5:0', { card: 0.5 }]]);
});

test('transition headroom and per-sample change cap retain previous decisions', () => {
  const config = { ...settings, rendererAdmissionTriangleBudget: 2000,
    rendererAdmissionTransitionReserve: 0.5, rendererAdmissionMaxChanges: 1 };
  const cells = new Map([['2:0', cell({ card: layer(700, 200) })],
    ['5:0', cell({ card: layer(700, 200) })]]);
  const result = finalizeRendererAdmission(plan(cells, config), config);
  assert.equal(result.stats.changes, 1);
  assert.equal(result.stats.transientTriangles, 1600);
  assert.deepEqual([...result.decisions], [['5:0', { card: 0.5 }]]);
});

test('live upload pressure and staged rebuilds prevent optional promotions', () => {
  const cells = new Map([['2:0', cell({ tree: layer(300, 100, 0.5) })]]);
  const previous = new Map([['2:0', { tree: 0.5 }]]);
  const pending = plan(cells, {}, previous);
  assert.equal(pending.records[0].desired.factor, 1);
  for (const state of [{ contended: true, remainingBytes: 50 }, { busy: true }]) {
    const result = finalizeRendererAdmission(pending, settings, state);
    assert.deepEqual([...result.decisions], [...previous]);
    assert.equal(result.stats.uploadDeferred, 1);
  }
  const recovered = finalizeRendererAdmission(pending, settings);
  assert.equal(recovered.decisions.size, 0);
  assert.equal(recovered.stats.transientTriangles, 400);
});

test('mandatory and protected reserves remain even when the target is infeasible', () => {
  const cells = new Map([['0:0', cell({ tree: layer(1200, 100) })],
    ['3:0', cell({ water: fixed(400), card: layer(400, 100) })]]);
  const result = finalizeRendererAdmission(plan(cells), settings);
  assert.equal(result.stats.fixedTriangles, 1600);
  assert.equal(result.stats.targetOverflow, 1);
  assert.equal(result.decisions.has('0:0'), false);
});

test('unknown active geometry prevents an uncosted transition', () => {
  const candidate = layer(1200, 100);
  candidate.active = { ...cost(1200), unknown: 1 };
  const result = finalizeRendererAdmission(plan(new Map([['3:0', cell({ tree: candidate })]])), settings);
  assert.equal(result.stats.changes, 0);
  assert.equal(result.stats.overlapDeferred, 1);
});

test('geometry costs union outgoing, incoming and candidate bands, including zero-fade target', () => {
  const model = new RegionalRenderCostModel({ config: {}, waterSlots: [] });
  const view = { prototypes: [{ geometry: { index: { count: 300 } } }],
    proxyPrototypes: [[{ geometry: { index: { count: 60 } } }]],
    previousPlan: { entries: [{ chunkX: 2, chunkZ: 0, baselineBand: 'near', band: 'proxy',
      representations: [{ band: 'near', fade: 1 }, { band: 'proxy', fade: 0 }],
      admissionOptions: [{ factor: 1, band: 'near' }, { factor: 0.5, band: 'proxy' }] }] } };
  const result = drain(model.manifest(view, 'rock', '2:0', [{ prototypeIndex: 0 }], true));
  assert.equal(result.selected.triangles, 100);
  assert.equal(result.current.triangles, 20);
  assert.equal(result.active.triangles, 120);
  assert.equal(result.options[0].transitionCost.triangles, 120);
  assert.equal(result.options[1].transitionCost.triangles, 120);
});

test('renderer collection reserves resident external chunks without extending adaptive radius', () => {
  const surface = { config: {}, waterSlots: [],
    terrainView: { focusChunk: focus, chunkWorldSize: 128 },
    meadowGrass: { cards: { tileSize: 16, templates: { cards: { index: { count: 12 }, instanceCount: 100 } },
      tiles: new Map([['outside', { centerX: 1600, centerZ: -64, band: 'cards', output: { count: 100 } }]]) } } };
  const cells = drain(collectRegionalSceneryDemand(surface, focus, 128, settings, new WeakMap(),
    new RegionalRenderCostModel(surface), { cameraChunk: focus, handoffEnd: 100, rendererAdmission: true }));
  const outside = cells.get('12:0').renderCost.layers.card;
  assert.equal(outside.requested.triangles, 400);
  assert.equal(outside.options, undefined);
});

test('shared publication state reads actual remaining allowance and pending work', () => {
  const surface = { publicationBudget: { maxUploadBytes: 1024, remainingUploadBytes: () => 256 },
    treeView: { stagedRebuild: {} } };
  assert.deepEqual(rendererPublicationState(surface, settings), { remainingBytes: 256, contended: true, busy: true });
  assert.deepEqual(rendererPublicationState({}, settings), { remainingBytes: -1, contended: false, busy: false });
});

test('renderer admission activates dependencies and remains disabled by default', () => {
  assert.equal(resolveRenderEnhancements().rendererAdmissionBudget, false);
  assert.equal(resolveRenderEnhancements({}, '?rendererAdmissionBudget=1').rendererAdmissionBudget, true);
  assert.throws(() => resolveRenderEnhancements({ regionalBudget: { rendererAdmissionMaxChanges: 1.5 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ regionalBudget: { rendererAdmissionTransitionReserve: 0.6 } }), RangeError);
  const budget = new RegionalSceneryBudget(settings, { rendererAdmission: true });
  assert.equal(budget.admission, true);
  assert.equal(budget.geometryCosts, true);
});

test('unknown external workload defers promotion in a known chunk', () => {
  const cells = new Map([['2:0', cell({ tree: layer(300, 100, 0.5) })],
    ['12:0', cell({ detail: { ...fixed(20), active: { ...cost(20), unknown: 1 } } })]]);
  const previous = new Map([['2:0', { tree: 0.5 }]]);
  const result = finalizeRendererAdmission(plan(cells, {}, previous), settings);
  assert.deepEqual([...result.decisions], [...previous]);
  assert.equal(result.stats.unknownActiveChunks, 1);
  assert.equal(result.stats.unknownDeferred, 1);
});

test('existing overloaded region can demote once despite staged work, without upload contention', () => {
  const cells = new Map([['2:0', cell({ card: layer(700, 100) })],
    ['5:0', cell({ card: layer(700, 100) })]]);
  const result = finalizeRendererAdmission(plan(cells), settings, { busy: true });
  assert.equal(result.stats.changes, 1);
  assert.equal(result.stats.emergencyDemotions, 1);
  assert.equal(finalizeRendererAdmission(plan(cells), settings, { contended: true }).stats.changes, 0);
});

test('renderer budget publishes shared decisions only after completed demand and allocation passes', () => {
  const surface = { config: {}, waterSlots: [],
    terrainView: { focusChunk: focus, chunkWorldSize: 128, floatingOrigin: { getState: () => ({ x: 0, z: 0 }) } },
    meadowGrass: { uniforms: { cardFadeIn: { value: { y: 100 } } },
      cards: { tileSize: 16, templates: { cards: { index: { count: 12 }, instanceCount: 200 } },
        tiles: new Map([['near', { centerX: 320, centerZ: -64, band: 'cards', output: { count: 175 } }],
          ['far', { centerX: 704, centerZ: -64, band: 'cards', output: { count: 175 } }]]) } } };
  const budget = new RegionalSceneryBudget({ ...settings, spatialWorkItems: 1 }, { rendererAdmission: true });
  const camera = { position: { x: 64, z: -64 } };
  let sampling = false;
  for (let i = 0; i < 100 && !budget.decisions.size; i++) {
    budget.update(surface, i, () => false, camera);
    if (budget.job?.cells) {
      sampling = true;
      assert.equal(budget.decisions.size, 0);
    }
  }
  assert.equal(sampling, true);
  assert.equal(budget.factorForKey('5:0', 'card'), 0.5);
  assert.equal(budget.factorForKey('2:0', 'card'), 0.5);
  camera.position.x = 12800;
  budget.update(surface, 100, () => true, camera);
  assert.equal(budget.decisions.size, 0);
});
