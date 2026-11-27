import assert from 'node:assert/strict';
import test from 'node:test';
import { StaticDrawUsage } from 'three/webgpu';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';
import { ITERATOR_PENDING, createIteratorBuilder } from '../src/editor/stylized/ResumableIterator.js';
import { InstancePublicationPlan } from '../src/editor/stylized/lod/InstancePublicationPlan.js';
import { SlicedInstanceUploads, residentInstanceTarget, prepareInstanceCopyPlan } from '../src/editor/stylized/lod/SlicedInstanceUploads.js';
import { stepViewRebuild } from '../src/editor/stylized/StagedViewRebuild.js';

const settings = { sliceBytes: 32, maxStagingBytes: 4096, maxCopyRanges: 128, maxWritesPerSlice: 64 };
function buffer(size, usage) {
  return { size, usage, mapState: 'unmapped', values: new Float32Array(size / 4), destroyed: false,
    destroy() { this.destroyed = true; } };
}
function fixture(overrides = {}) {
  const data = new Map(), attributes = new Map(), scratch = [], writes = [], submissions = [];
  const device = {
    limits: { maxBufferSize: 8192 },
    createBuffer({ size, usage }) { const result = buffer(size, usage); scratch.push(result); return result; },
    queue: {
      writeBuffer(target, offset, values, start, count) {
        assert.equal(target.destroyed, false);
        target.values.set(values.subarray(start, start + count), offset / 4);
        writes.push({ frame: budget.slack.frameId, bytes: count * 4 });
      },
      submit(commands) {
        submissions.push(commands);
        for (const command of commands.flat()) command.destination.values.set(command.source.values.subarray(command.start / 4, (command.start + command.size) / 4), command.offset / 4);
      },
    },
    createCommandEncoder() {
      const copies = [];
      return {
        copyBufferToBuffer(source, start, destination, offset, size) { copies.push({ source, start, destination, offset, size }); },
        finish() { return copies; },
      };
    },
  };
  const backend = { isWebGPUBackend: true, device, has: key => data.has(key), get: key => data.get(key), getBufferAttribute: key => key };
  const renderer = { backend, _attributes: attributes };
  const adapter = new SlicedInstanceUploads(renderer, { ...settings, ...overrides });
  const budget = { settings: { enabled: true }, slack: { frameId: 1 }, maxUploadBytes: 32,
    remainingUploadBytes: () => Math.max(0, 32 - writes.filter(w => w.frame === budget.slack.frameId).reduce((n, w) => n + w.bytes, 0)),
    canPublish: () => true, slicedInstanceUploads: adapter };
  function attribute(itemSize = 4, count = 32) {
    const a = { itemSize, array: new Float32Array(count * itemSize), version: 0, usage: StaticDrawUsage, updateRanges: [],
      addUpdateRange(start, count) { this.updateRanges.push({ start, count }); },
      set needsUpdate(value) { if (value) this.version++; } };
    const gpu = buffer(a.array.byteLength, 8);
    data.set(a, { buffer: gpu });
    attributes.set(a, { version: 0 });
    return { a, gpu };
  }
  return { renderer, adapter, budget, attribute, data, attributes, scratch, writes, submissions };
}
function publication(a, rows = [0, 1, 4, 5, 7]) {
  const plan = new InstancePublicationPlan();
  for (const row of rows) plan.record(a, row, new Float32Array(a.itemSize).fill(row + 1));
  plan.span(a, { min: Math.min(...rows), max: Math.max(...rows) });
  return plan;
}
function drain(iterator, budget, onPending = () => {}) {
  for (let i = 0; i < 1000; i++) {
    const next = iterator.next();
    if (next.done) return next.value;
    if (next.value === ITERATOR_PENDING) { onPending(); budget.slack.frameId++; }
  }
  throw Error('Iterator did not finish');
}

test('exact packed rows are uploaded in bounded slices before atomic GPU and CPU publication', () => {
  const f = fixture(), { a, gpu } = f.attribute(), plan = publication(a);
  let finalized = 0;
  plan.finalizers.push(() => finalized++);
  const before = PerfCounters.get('publicationCustomAttributeBytes');
  drain(plan.publish(() => f.budget), f.budget, () => {
    assert.ok(a.array.every(v => v === 0));
    assert.ok(gpu.values.every(v => v === 0));
    assert.equal(finalized, 0);
  });
  assert.equal(f.writes.reduce((sum, w) => sum + w.bytes, 0), 80);
  assert.equal(PerfCounters.get('publicationCustomAttributeBytes') - before, 80);
  for (const frame of new Set(f.writes.map(w => w.frame))) assert.ok(f.writes.filter(w => w.frame === frame).reduce((sum, w) => sum + w.bytes, 0) <= 32);
  assert.deepEqual([...a.array], [...gpu.values]);
  assert.equal(a.array[4 * 4], 5);
  assert.equal(a.array[2 * 4], 0);
  assert.equal(a.version, 0);
  assert.equal(a.updateRanges.length, 0);
  assert.equal(finalized, 1);
  assert.equal(f.submissions.length, 1);
  assert.equal(f.scratch[0].destroyed, true);
});

test('copy plan merges consecutive runs but preserves holes and repeated rows', () => {
  const f = fixture(), { a } = f.attribute(), plan = publication(a, [0, 1, 4, 4, 5]);
  const copy = drain(prepareInstanceCopyPlan(f.renderer, plan, settings), f.budget);
  assert.equal(copy.bytes, 80);
  assert.deepEqual(copy.copies.map(c => [c.source, c.destination, c.size]), [[0, 0, 32], [32, 64, 16], [48, 64, 32]]);
});

test('resident eligibility fails closed for uninitialized, dynamic, pending and padded attributes', () => {
  const f = fixture(), { a } = f.attribute();
  assert.ok(residentInstanceTarget(f.renderer, a));
  a.updateRanges.push({ start: 0, count: 4 });
  assert.equal(residentInstanceTarget(f.renderer, a), null);
  a.updateRanges.length = 0;
  a.usage = -1;
  assert.equal(residentInstanceTarget(f.renderer, a), null);
  a.usage = StaticDrawUsage;
  f.data.get(a)._paddedItemSize = 4;
  assert.equal(residentInstanceTarget(f.renderer, a), null);
  delete f.data.get(a)._paddedItemSize;
  f.attributes.delete(a);
  assert.equal(residentInstanceTarget(f.renderer, a), null);
});

test('cancellation destroys staging and never publishes CPU or GPU rows', () => {
  const f = fixture(), { a, gpu } = f.attribute(), plan = publication(a);
  const iterator = plan.publish(() => f.budget);
  while (iterator.next().value !== ITERATOR_PENDING) {}
  iterator.return();
  assert.equal(f.scratch[0].destroyed, true);
  assert.equal(f.adapter.owner, null);
  assert.equal(f.submissions.length, 0);
  assert.ok(a.array.every(v => v === 0));
  assert.ok(gpu.values.every(v => v === 0));
});

test('changed destination version invalidates staging before copy and uses normal publication', () => {
  const f = fixture(), { a, gpu } = f.attribute(), plan = publication(a);
  const iterator = plan.publish(() => f.budget);
  let changed = false;
  drain(iterator, f.budget, () => { if (!changed) { a.version++; changed = true; } });
  assert.equal(f.submissions.length, 0);
  assert.equal(a.array[0], 1);
  assert.equal(gpu.values[0], 0);
  assert.ok(a.updateRanges.length > 0);
  assert.equal(f.scratch[0].destroyed, true);
});

test('staging memory and copy command cap fall back without allocating scratch', () => {
  for (const options of [{ maxStagingBytes: 64 }, { maxCopyRanges: 1 }]) {
    const f = fixture(options), { a } = f.attribute(), plan = publication(a);
    drain(plan.publish(() => f.budget), f.budget);
    assert.equal(f.scratch.length, 0);
    assert.ok(a.updateRanges.length > 0);
  }
});

test('shared ownership serializes staging and enforces the shared frame byte allowance', () => {
  const f = fixture(), first = f.attribute(), second = f.attribute();
  const a = publication(first.a).publish(() => f.budget);
  const b = publication(second.a).publish(() => f.budget);
  while (a.next().value !== ITERATOR_PENDING) {}
  while (b.next().value !== ITERATOR_PENDING) {}
  assert.equal(f.scratch.length, 1);
  a.return();
  drain(b, f.budget);
  assert.equal(f.scratch.length, 2);
  assert.equal(f.submissions.length, 1);
  assert.ok(f.scratch.every(s => s.destroyed));
  for (const frame of new Set(f.writes.map(w => w.frame))) assert.ok(f.writes.filter(w => w.frame === frame).reduce((sum, w) => sum + w.bytes, 0) <= 32);
});

test('focus change cancels staged generator and invokes finally cleanup', () => {
  let cleaned = 0;
  function* job() { try { yield ITERATOR_PENDING; return true; } finally { cleaned++; } }
  const view = { terrainView: { focusChunk: { chunkX: 0, chunkZ: 0 } }, pendingRebuild: { focus: { chunkX: 0, chunkZ: 0 } } };
  stepViewRebuild(view, view.pendingRebuild, () => false, job);
  view.terrainView.focusChunk.chunkX = 1;
  stepViewRebuild(view, view.pendingRebuild, () => false, job);
  assert.equal(cleaned, 1);
  assert.equal(view.stagedRebuild, null);
  const builder = createIteratorBuilder(job);
  builder.step();
  builder.cancel();
  assert.equal(cleaned, 2);
});

test('flag is opt-in and staging limits are validated', () => {
  assert.equal(resolveRenderEnhancements().slicedInstancePublication, false);
  assert.equal(resolveRenderEnhancements({}, '?slicedInstancePublication=1').slicedInstancePublication, true);
  assert.throws(() => resolveRenderEnhancements({ instanceSliceBudget: { sliceBytes: 4097 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ instanceSliceBudget: { maxStagingBytes: 4096 } }), RangeError);
});
