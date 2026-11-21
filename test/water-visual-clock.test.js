import assert from 'node:assert/strict';
import test from 'node:test';
import { configureSea, seaSurfaceOffset, updateSeaState } from '../src/editor/water/seaState.js';
import { setWaterTimeOverride, waterVisualClock } from '../src/editor/water/WaterVisualClock.js';

// The one water clock the sheet, swash and CPU swimmer heights share (PR I phase I.0 baseline):
// a QA freeze must hold through live frame updates, and paused, advanced or reset time must
// give the same CPU surface height for the same clock value in any order.
const SEA = Object.freeze({ enabled: true, amplitude: 0.9, stormScale: 2.6, choppiness: 4,
  shallowDepth: 1.5, depthRatio: 0.42 });
const POINT = [-4226432 + 37.5, 278528 - 11.25];

const heightAt = (seconds) => {
  updateSeaState({ timeSeconds: seconds, storm: 0.25, seaLevel: 0 });
  return seaSurfaceOffset(...POINT, 20, 48, 1);
};

test('water time override freezes the shared clock through live frame updates', (t) => {
  t.after(() => { setWaterTimeOverride(null); configureSea(null); });
  configureSea(SEA);
  setWaterTimeOverride(127.3);
  const frozen = heightAt(5);
  assert.equal(waterVisualClock.value, 127.3);
  assert.equal(heightAt(900), frozen, 'a live frame must not move a frozen sea');
  setWaterTimeOverride(null);
  assert.equal(heightAt(127.3), frozen, 'releasing the freeze resumes the live clock at the same height');
});

test('advance, seek back and reset reproduce exact heights in any order', (t) => {
  t.after(() => configureSea(null));
  configureSea(SEA);
  const times = [123.4, 124.6, 126, 127.6];
  const forward = times.map(heightAt);
  const backward = times.slice().reverse().map(heightAt).reverse();
  assert.deepEqual(backward, forward);
  assert.equal(heightAt(0), heightAt(0), 'reset to zero is repeatable');
  assert.ok(new Set(forward).size === forward.length, 'advancing time moves the surface');
  assert.ok(forward.every(Number.isFinite));
});

test('water time override rejects values outside the QA range', (t) => {
  t.after(() => setWaterTimeOverride(null));
  for (const bad of [-1, 86401, Number.NaN, Infinity]) assert.throws(() => setWaterTimeOverride(bad));
});
