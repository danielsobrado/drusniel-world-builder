import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForInitialInstanceDraws } from '../src/editor/stylized/lod/InstanceLodHandoff.js';
import { InstancePublicationPlan } from '../src/editor/stylized/lod/InstancePublicationPlan.js';
import { ITERATOR_PENDING } from '../src/editor/stylized/ResumableIterator.js';
import { bindInitialInstancePreparation, trackInitialInstanceMesh } from '../src/render/preparation/InitialInstancePreparation.js';

function fixture() {
  const state = { now: 0, ready: false, acquired: [], released: [] };
  const acquire = mesh => {
    state.acquired.push(mesh);
    return { timeoutMs: 10, ready: () => state.ready, release: () => state.released.push(mesh) };
  };
  return { state, acquire, now: () => state.now };
}

test('handoff waits for every replacement without more than one outstanding lease', () => {
  const { state, acquire, now } = fixture();
  const task = waitForInitialInstanceDraws(['trunk', 'crown'], acquire, now);
  assert.equal(task.next().value, ITERATOR_PENDING);
  assert.deepEqual(state.acquired, ['trunk']);
  state.ready = true;
  assert.equal(task.next().done, true);
  assert.deepEqual(state.released, ['trunk', 'crown']);
});

test('cancellation releases the active lease without acquiring the next one', () => {
  const { state, acquire, now } = fixture();
  const task = waitForInitialInstanceDraws(['near', 'proxy'], acquire, now);
  task.next();
  task.return();
  assert.deepEqual(state.acquired, ['near']);
  assert.deepEqual(state.released, ['near']);
});

test('one timeout covers the entire publication instead of resetting for each draw', () => {
  const { state, acquire, now } = fixture();
  const task = waitForInitialInstanceDraws(['near', 'proxy', 'third'], mesh => {
    const lease = acquire(mesh);
    return { ...lease, ready: () => mesh === 'near' ? state.ready : false };
  }, now);
  task.next();
  state.ready = true;
  state.now = 9;
  assert.equal(task.next().value, ITERATOR_PENDING);
  state.now = 10;
  assert.equal(task.next().done, true);
  assert.deepEqual(state.acquired, ['near', 'proxy']);
  assert.deepEqual(state.released, ['near', 'proxy']);
});

test('publication does not run admission or finalizers until replacement preparation is ready', () => {
  const renderer = {};
  const mesh = { isInstancedMesh: true, instanceMatrix: { isStorageInstancedBufferAttribute: true } };
  const { state, acquire } = fixture();
  const release = bindInitialInstancePreparation(renderer, { acquireInitialInstanceHandoff: target => ({
    ...acquire(target), timeoutMs: 30000,
  }) });
  trackInitialInstanceMesh(mesh, renderer);
  try {
    const plan = new InstancePublicationPlan();
    plan.replacementDraws.add(mesh);
    let budgetReads = 0, old = true, replacement = false;
    plan.finalizers.push(() => { old = false; replacement = true; });
    const task = plan.publish(() => { budgetReads++; return null; });
    assert.equal(task.next().value, ITERATOR_PENDING);
    assert.equal(budgetReads, 0);
    assert.equal(old, true);
    assert.equal(replacement, false);
    state.ready = true;
    assert.equal(task.next().done, true);
    assert.equal(old, false);
    assert.equal(replacement, true);
    assert.equal(plan.replacementDraws.size, 0);
  } finally { release(); }
});
