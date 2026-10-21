import assert from 'node:assert/strict';
import test from 'node:test';
import { ScenicTour } from '../src/editor/exploration/ScenicTour.js';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { generateSettlementPlan } from '../src/editor/world/settlements/SettlementPlanRequest.js';

function fixture(t) {
  const field = height => new SettlementField({ settlements: [{ id: 1, cellX: 0, cellZ: 0, population: .3 }],
    tileSize: 2, worldSeed: 9, sampleGround: height, isBuildable: () => true });
  const main = field(() => assert.fail('main planning')), canonical = field(() => 20);
  let deliver, activated = 0;
  const frames = [], previous = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  t.after(() => { if (previous) globalThis.requestAnimationFrame = previous; else delete globalThis.requestAnimationFrame; });
  const tour = Object.assign(Object.create(ScenicTour.prototype), {
    settings: { enabled: true, radiusMeters: 100 }, active: false, preparationGeneration: 0,
    button: { textContent: 'Scenic tour' },
    terrainView: { worldStore: { tileSize: 2, generator: { settlementField: main },
      chunkWorker: { request: () => new Promise(resolve => { deliver = resolve; }), cancelSettlementPlan() {} } },
    floatingOrigin: { toCanonical: (x, z) => ({ x, z }) } },
    viewModeController: { getFocusWorld: () => ({ x: 0, z: 0 }) },
    localRoute: () => { assert.ok(main.entries[0].plan); return [{ x: 0, y: 20, z: 0 }]; },
    activate() { activated++; this.active = true; return true; },
  });
  return { tour, frames, activated: () => activated,
    deliver: () => deliver(generateSettlementPlan({ ensureSettlementField: () => canonical }, 1)) };
}

test('scenic tours wait for canonical plans before constructing their route', async t => {
  const f = fixture(t), result = f.tour.start();
  assert.equal(f.activated(), 0); assert.equal(f.tour.preparing, true);
  f.deliver(); await Promise.resolve();
  for (let turn = 0; f.frames.length && !f.tour.active; turn++) {
    assert.ok(turn < 1000); f.frames.shift()(); await Promise.resolve();
  }
  assert.equal(await result, true); assert.equal(f.activated(), 1);
  f.tour.sampling.dispose();
});

test('cancelling a preparing tour cannot activate its stale route', async t => {
  const f = fixture(t), result = f.tour.start();
  f.tour.stop(); f.frames.shift()();
  assert.equal(await result, false); assert.equal(f.activated(), 0);
  f.deliver(); await Promise.resolve();
  assert.equal(f.tour.button.textContent, 'Scenic tour');
});
