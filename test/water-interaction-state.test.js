import assert from 'node:assert/strict';
import test from 'node:test';
import { WaterInteractionState, WATER_INTERACTION_CAPACITY } from '../src/editor/water/WaterInteractionState.js';
const wet = { waterBodyId: 512, waterKind: 2, waterState: 'swimming', headSubmerged: false };

test('a stationary swimmer emits no wake, movement emits bounded impulses', () => {
  const state = new WaterInteractionState();
  for (let i = 0; i < 120; i++) state.update(i / 60, { x: 9e6, z: -5e6 }, wet);
  assert.equal(state.impulses.length, 0);
  for (let i = 120; i < 600; i++) state.update(i / 60, { x: 9e6 + (i - 120) / 10, z: -5e6 }, wet);
  assert.ok(state.impulses.length > 0); assert.ok(state.impulses.length <= WATER_INTERACTION_CAPACITY);
});
test('entry is one impulse; exit, submersion and camera cuts stop wake generation', () => {
  const state = new WaterInteractionState();
  state.event({ type: 'water-enter', current: wet, timestamp: 1000 }, { x: 0, z: 0 });
  assert.equal(state.impulses.length, 1);
  state.update(1, { x: 0, z: 0 }, wet);
  state.update(1.01, { x: 1000, z: 0 }, wet);
  assert.equal(state.impulses.length, 1);
  for (let i = 2; i < 60; i++) state.update(1 + i / 60, { x: i * 2, z: 0 }, { ...wet, headSubmerged: true });
  assert.equal(state.impulses.length, 1);
  state.update(5, { x: 0, z: 0 }, { ...wet, waterState: 'dry', waterBodyId: 0 });
  assert.equal(state.impulses.length, 0);
});
