import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { EnvironmentalParticleBudget, allocateEnvironmentalParticles, particlePrefix } from '../src/editor/performance/EnvironmentalParticleBudget.js';
import { interleaveLayers, precipitationDensity, scalePrecipitationDensity } from '../src/editor/weather/storm/precipitationLayers.js';

const settings = { ...resolveRenderEnhancements().environmentalParticleBudget, particleBudget: 1000, pressureFactor: 0.5 };
const demand = { precipitation: { count: 800 }, ambient: { count: 600, protected: 100 },
  waterfall: { count: 200, protected: 150 } };

test('sparse demand preserves authored counts', () => {
  const result = allocateEnvironmentalParticles({ precipitation: { count: 300 }, ambient: { count: 100 } }, settings, false);
  assert.equal(result.admitted, 400);
  assert.equal(result.factors.precipitation, 1);
  assert.equal(result.factors.ambient, 1);
});
test('reserved shares and nearby effects are protected before optional priorities', () => {
  const result = allocateEnvironmentalParticles(demand, settings, false);
  assert.equal(result.reserved, 730);
  assert.equal(result.admitted, 1000);
  assert.equal(result.factors.precipitation, 750 / 800);
  assert.equal(result.factors.ambient, 0);
  assert.equal(result.factors.waterfall, 0);
});
test('infeasible reserves are reported and never forcibly removed', () => {
  const result = allocateEnvironmentalParticles(demand, settings, true);
  assert.equal(result.limit, 500);
  assert.equal(result.overflow, 230);
  assert.equal(result.admitted, 730);
  assert.equal(result.factors.precipitation, 0.6);
});
test('prefix count is bounded, deterministic and preserves explicit minimum', () => {
  assert.equal(particlePrefix(101, 0.5), 50);
  assert.equal(particlePrefix(101, 0, 40), 40);
  assert.equal(particlePrefix(4, 0, 40), 4);
  assert.equal(particlePrefix(101, 1), 101);
  assert.equal(particlePrefix(0, 1), 0);
});
test('sampling reads original completed frame demand and pressure has a recovery delay', () => {
  const controller = new EnvironmentalParticleBudget({ ...settings, sampleMs: 100, recoveryMs: 300 });
  controller.beginFrame(0, false);
  assert.equal(controller.request('precipitation', 800), 1);
  controller.request('ambient', 600, 100);
  controller.request('waterfall', 200, 150);
  controller.beginFrame(100, true);
  assert.equal(controller.request('precipitation', 800), 0.6);
  controller.request('ambient', 600, 100);
  controller.request('waterfall', 200, 150);
  controller.beginFrame(200, false);
  assert.equal(controller.pressured, true);
  controller.request('precipitation', 800);
  controller.request('ambient', 600, 100);
  controller.request('waterfall', 200, 150);
  controller.beginFrame(400, false);
  assert.equal(controller.pressured, false);
  assert.equal(controller.request('precipitation', 800), 750 / 800);
  controller.beginFrame(0, false);
  assert.equal(controller.pressured, false);
});
test('inactive effects do not retain phantom demand', () => {
  const controller = new EnvironmentalParticleBudget({ ...settings, sampleMs: 100 });
  controller.beginFrame(0, false);
  controller.request('dust', 8000);
  controller.beginFrame(100, false);
  assert.ok(controller.factors.dust < 1);
  controller.beginFrame(200, false);
  assert.equal(controller.factors.dust, 1);
});
test('interleaved precipitation scales each population without changing authored opacity', () => {
  const { slots } = interleaveLayers([100, 40, 20]);
  const layers = [{ counts: [0, 25, 50, 75, 100] }, { counts: [0, 10, 20, 30, 40] }, { counts: [0, 5, 10, 15, 20] }];
  const full = precipitationDensity(layers, 1, slots);
  assert.equal(full.instanceCount, 160);
  const reduced = scalePrecipitationDensity(full, slots, 0.5);
  assert.deepEqual(reduced.live, [50, 20, 10]);
  assert.deepEqual(reduced.density, [0.5, 0.5, 0.5]);
  assert.equal(reduced.fade, full.fade);
  assert.ok(reduced.instanceCount < full.instanceCount);
  assert.equal(scalePrecipitationDensity(full, slots, 0).instanceCount, 0);
  assert.equal(scalePrecipitationDensity(full, slots, 1), full);
});
test('configuration is opt-in and rejects invalid limits and shares', () => {
  assert.equal(resolveRenderEnhancements().environmentalParticleAdmission, false);
  assert.equal(resolveRenderEnhancements({}, '?environmentalParticleAdmission=1').environmentalParticleAdmission, true);
  assert.throws(() => resolveRenderEnhancements({ environmentalParticleBudget: { pressureFactor: 2 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ environmentalParticleBudget: { minimumShares: { ambient: -1 } } }), RangeError);
  assert.equal(resolveRenderEnhancements({ environmentalParticleBudget: { minimumShares: { ambient: 0.3 } } }).environmentalParticleBudget.minimumShares.precipitation, 0.6);
});
