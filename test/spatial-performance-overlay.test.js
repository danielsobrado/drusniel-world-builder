import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';
import { RegionalSceneryBudget } from '../src/editor/performance/RegionalSceneryBudget.js';
import { emptyRenderCost } from '../src/editor/performance/RegionalRenderCost.js';
import { spatialCell, spatialMetric, spatialMetricLimit, spatialWindow, spatialExport } from '../src/editor/performance/qa/SpatialPerformanceModel.js';

const settings = resolveRenderEnhancements().regionalBudget;
const cost = (triangles, draws, unknown = 0) => ({ ...emptyRenderCost(), triangles, draws, unknown });
function sample() {
  return { timestamp: 10, size: 128, focus: { chunkX: -2, chunkZ: 4 }, cameraChunk: { chunkX: -3, chunkZ: 4 },
    geometryCosts: true, admission: true, rendererAdmission: true, observeOnly: false, settings,
    localPressure: new Set(['-2:4']), pressured: new Set(['0:4']), decisions: new Map([['0:4', { tree: 0.7 }]]),
    allocationStats: { deferred: 2 },
    cells: new Map([
      ['-2:4', { town: 100, renderCost: { requested: cost(300000, 50), selected: cost(150000, 30), layers: { town: { requested: cost(300000, 50), selected: cost(150000, 30) } } } }],
      ['0:4', { tree: 20, rock: 10, renderCost: { requested: cost(2000, 5), selected: cost(1000, 3),
        layers: { tree: { requested: cost(1800, 4), selected: cost(800, 2) }, rock: { requested: cost(200, 1), selected: cost(200, 1) } } } }],
      ['-4:6', { blade: 200, renderCost: { requested: cost(0, 0, 200), selected: cost(0, 0, 200), layers: {} } }],
    ]) };
}

test('heatmap exposes requested and selected geometry separately', () => {
  const s = sample(), cell = spatialCell(s, '-2:4');
  assert.equal(spatialMetric(cell, 'requestedTriangles', settings), 300000);
  assert.equal(spatialMetric(cell, 'selectedTriangles', settings), 150000);
  assert.equal(spatialMetric(cell, 'pressure', settings), 1.5);
  assert.equal(cell.protected, true);
  assert.equal(cell.localPressure, true);
  assert.equal(cell.reduced, false);
});

test('layer filtering preserves counts and reports only the relevant admission factor', () => {
  const s = sample(), tree = spatialCell(s, '0:4', 'tree'), rock = spatialCell(s, '0:4', 'rock');
  assert.equal(tree.requested.triangles, 1800);
  assert.equal(tree.selected.triangles, 800);
  assert.equal(tree.reduced, true);
  assert.equal(rock.reduced, false);
  assert.equal(tree.units, 20 * settings.spatialWeights.tree);
  assert.equal(tree.factors.tree, 0.7);
});

test('unsampled and unknown costs are distinguishable from zero demand', () => {
  const s = sample();
  assert.equal(spatialCell(s, '40:40'), null);
  assert.equal(spatialMetric(null, 'requestedTriangles', settings), null);
  const cell = spatialCell(s, '-4:6');
  assert.equal(cell.requested.unknown, 200);
  assert.ok(cell.reasons.includes('Incomplete geometry estimate'));
  assert.equal(spatialCell(s, '-4:6', 'blade').requested, null);
});

test('missing camera protects admission and observation never claims active reductions', () => {
  const s = sample();
  s.cameraChunk = null;
  assert.equal(spatialCell(s, '0:4').protected, true);
  s.admission = false;
  s.observeOnly = true;
  assert.equal(spatialCell(s, '0:4').reduced, false);
  assert.ok(spatialCell(s, '0:4').reasons.includes('Observe only; no quality reductions applied'));
});

test('window handles negative canonical chunks and bounded radius', () => {
  const rows = spatialWindow(sample(), 2, 'all', 'requestedDraws');
  assert.equal(rows.length, 25);
  assert.equal(rows[0].x, -4);
  assert.equal(rows[0].z, 2);
  assert.equal(rows.find(row => row.x === 0 && row.z === 4).value, 5);
  assert.equal(rows.filter(row => row.cell).length, 3);
  assert.equal(spatialMetricLimit('selectedDraws', settings), settings.spatialDrawBudget);
});

test('export includes complete sample and layer data without mutating sampler maps', () => {
  const s = sample();
  const exported = JSON.parse(JSON.stringify(spatialExport(s)));
  assert.equal(exported.cells.length, 3);
  assert.equal(exported.cells.find(cell => cell.key === '0:4').layers.tree.selected.triangles, 800);
  assert.equal(exported.allocationStats.deferred, 2);
  assert.equal(s.decisions.get('0:4').tree, 0.7);
});

function surface() {
  return { terrainView: { focusChunk: { chunkX: 0, chunkZ: 0 }, chunkWorldSize: 128 },
    treeView: { manifestStore: { cache: new Map([['2:0', { placements: { length: 200 } }], ['3:0', { placements: { length: 2 } }]]) } } };
}

test('observe-only sampler publishes complete estimates but never changes admission or global gauges', () => {
  const observer = new RegionalSceneryBudget({ ...settings, spatialWorkItems: 1 }, { geometryCosts: true, observeOnly: true });
  const world = surface();
  const before = PerfCounters.get('regionalSpatialSamples');
  observer.update(world, 0);
  assert.equal(observer.diagnosticSample, null);
  for (let i = 1; i < 20; i++) observer.update(world, i);
  assert.equal(observer.diagnosticSample.cells.get('2:0').tree, 200);
  assert.equal(observer.diagnosticSample.localPressure.has('2:0'), true);
  assert.equal(observer.revision, 0);
  assert.equal(observer.factorForKey('2:0'), 1);
  assert.equal(PerfCounters.get('regionalSpatialSamples'), before);
  world.terrainView.focusChunk = { chunkX: 100, chunkZ: 100 };
  observer.update(world, 30, () => true);
  assert.equal(observer.diagnosticSample, null);
  observer.dispose();
});

test('existing spatial admission can publish a diagnostic snapshot without geometry estimates', () => {
  const controller = new RegionalSceneryBudget(settings, { captureDiagnostics: true });
  controller.update(surface(), 0);
  assert.equal(controller.factorForKey('2:0'), settings.spatialLodFactor);
  assert.equal(controller.diagnosticSample.geometryCosts, false);
  assert.equal(spatialCell(controller.diagnosticSample, '2:0').reduced, true);
  assert.equal(spatialMetric(spatialCell(controller.diagnosticSample, '2:0'), 'requestedTriangles', settings), null);
  controller.dispose();
  assert.equal(controller.diagnosticSample, null);
});

test('collapsing the observer cancels its work, while active admission cannot be paused by diagnostics', () => {
  const observer = new RegionalSceneryBudget({ ...settings, spatialWorkItems: 1 }, { observeOnly: true });
  const world = surface();
  observer.update(world, 0);
  assert.ok(observer.job);
  observer.setDiagnosticPaused(true);
  assert.equal(observer.job, null);
  observer.update(world, 100);
  assert.equal(observer.job, null);
  observer.setDiagnosticPaused(false);
  observer.update(world, 101);
  assert.ok(observer.job);
  const active = new RegionalSceneryBudget(settings, { captureDiagnostics: true });
  active.setDiagnosticPaused(true);
  active.update(world, 0);
  assert.equal(active.factorForKey('2:0'), settings.spatialLodFactor);
  assert.equal(active.diagnosticPaused, false);
});

test('overlay flag is independent and display limits are validated', () => {
  const config = resolveRenderEnhancements({}, '?spatialPerformanceOverlay=1');
  assert.equal(config.spatialPerformanceOverlay, true);
  assert.equal(config.regionalSpatialBudget, false);
  assert.equal(config.rendererAdmissionBudget, false);
  assert.throws(() => resolveRenderEnhancements({ spatialOverlay: { radius: 100 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ spatialOverlay: { refreshMs: 1 } }), RangeError);
});
