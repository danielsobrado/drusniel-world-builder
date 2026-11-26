import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateAttributeSubrangeBytes, markAttributeSubrangeUpdated } from '../src/editor/stylized/attributeUpload.js';
import { InstancePublicationPlan, admitSceneryPublication } from '../src/editor/stylized/lod/InstancePublicationPlan.js';
import { iterateInstanceWrites, writeInstances } from '../src/editor/stylized/lod/StylizedLodRuntime.js';
import { ScatterInstanceRows } from '../src/editor/stylized/lod/ScatterInstanceRows.js';
import { InstanceAnchor } from '../src/editor/stylized/lod/InstanceAnchor.js';
import { GpuTreeImpostorBatch } from '../src/editor/stylized/impostor/GpuTreeImpostorBatch.js';
import { TreeImpostorBatch } from '../src/editor/stylized/impostor/TreeImpostorBatch.js';
import { ITERATOR_PENDING, completeIterator } from '../src/editor/stylized/ResumableIterator.js';
import { stepViewRebuild } from '../src/editor/stylized/StagedViewRebuild.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

const attribute = (size, capacity = 192) => ({
  itemSize: size, count: capacity, array: new Float32Array(size * capacity), updateRanges: [],
  version: 0, set needsUpdate(value) { if (value) this.version++; },
  addUpdateRange(start, count) { this.updateRanges.push({ start, count }); },
  clearUpdateRanges() { this.updateRanges.length = 0; },
});
function mesh(capacity = 192, rich = false) {
  const attributes = { instanceDither: attribute(3, capacity) };
  if (rich) for (const [key, size] of Object.entries({ instanceLeafTint: 4, instanceMorphology: 3,
    instanceRootPlane: 3, instanceSurface: 3, instancePlantRoot: 3, instanceBiomeLook: 4 })) attributes[key] = attribute(size, capacity);
  return {
    count: 0, visible: false, instanceMatrix: attribute(16, capacity),
    geometry: { getAttribute: key => attributes[key], attributes }, userData: {}, material: { userData: {} },
    boundsCalls: 0, computeBoundingSphere() { this.boundsCalls++; this.boundingSphere = null; },
  };
}
const matrix = (x, z = 0) => ({ elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1] });
const instance = x => ({ matrix: matrix(x + 0.125, -x), fade: 0.75, seed: x / 100,
  colorVariation: 0.9, morphology: [0.7, 1.1, 1.2], leafSnow: 0.4, leafTint: [0.8, 0.9, 1],
  surfaceData: [0.3, 0.2, 0.1], biomeLook: [0.9, 0.9, 1.1, 0.7],
  rootFit: { slopeX: 0.1, slopeZ: 0.2, conformHeight: 0.3 } });
const snapshot = target => ({
  count: target.count, visible: target.visible, boundsCalls: target.boundsCalls, userData: { ...target.userData },
  buffers: [target.instanceMatrix, ...Object.values(target.geometry.attributes)].map(a => ({
    array: [...a.array], ranges: a.updateRanges.map(r => ({ ...r })), version: a.version })),
});
const near = [{ band: 'near', fade: 1, ditherDirection: 1 }];
const proxy = [{ band: 'proxy', fade: 1, ditherDirection: 1 }];
const positions = target => Array.from({ length: target.count }, (_, i) => target.instanceMatrix.array[i * 16 + 12]).sort((a,b) => a-b);

test('preview matches the actual incremental dirty-range coalescing, including collapsed spans', () => {
  const a = attribute(4);
  for (let i = 0; i < 8; i++) markAttributeSubrangeUpdated(a, i * 4, i * 4);
  const old = a.updateRanges.map(r => ({ ...r }));
  const predicted = estimateAttributeSubrangeBytes(a, 40, 40);
  assert.deepEqual(a.updateRanges, old);
  assert.equal(markAttributeSubrangeUpdated(a, 40, 40), predicted);
  assert.deepEqual(a.updateRanges, [{ start: 0, count: 164 }]);
  assert.equal(estimateAttributeSubrangeBytes(a, 5, 10), 0);
});

test('typed staging pages preserve old data and publish contiguous and sparse changed rows', () => {
  const a = attribute(3);
  const stage = new InstancePublicationPlan();
  for (let i = 0; i < 90; i++) stage.record(a, i, [i, i + 1, i + 2]);
  stage.record(a, 150, [9, 8, 7]);
  stage.span(a, { min: 0, max: 150 });
  assert.equal(a.array[150 * 3], 0);
  assert.equal(a.updateRanges.length, 0);
  const expected = stage.bytes();
  assert.equal(expected, 151 * 3 * 4);
  assert.equal(stage.commit(), expected);
  assert.deepEqual([...a.array.subarray(150 * 3, 150 * 3 + 3)], [9, 8, 7]);
  assert.deepEqual([...a.array.subarray(65 * 3, 65 * 3 + 3)], [65, 66, 67]);
  assert.equal(a.array[100 * 3], 0);
  assert.equal(stage.bytes(), 0);
});

test('resumable staged geometry writes equal the legacy writer for every instance attribute', () => {
  const a = mesh(192, true), b = mesh(192, true), values = Array.from({ length: 130 }, (_, i) => instance(i));
  const anchor = { x: 32, z: -64 };
  const original = snapshot(b);
  const stage = new InstancePublicationPlan();
  const iterator = iterateInstanceWrites([[b]], [values], anchor, null, stage);
  assert.equal(iterator.next().done, false);
  assert.deepEqual(snapshot(b), original);
  assert.equal(completeIterator(iterator), 130);
  assert.deepEqual(snapshot(b), original);
  assert.ok(stage.bytes() > 0);
  writeInstances([[a]], [values], anchor);
  const bytes = stage.bytes();
  assert.equal(stage.commit(), bytes);
  assert.deepEqual(snapshot(a), snapshot(b));
  for (const buffer of [b.instanceMatrix, ...Object.values(b.geometry.attributes)]) buffer.clearUpdateRanges();
  const repeat = new InstancePublicationPlan();
  completeIterator(iterateInstanceWrites([[b]], [values], anchor, null, repeat));
  assert.equal(repeat.bytes(), 0);
});

test('upload admission rechecks pending ranges while waiting and never writes live buffers', () => {
  const a = attribute(4);
  markAttributeSubrangeUpdated(a, 1, 2);
  const stage = new InstancePublicationPlan();
  stage.record(a, 2, [1, 2, 3, 4]);
  stage.record(a, 3, [5, 6, 7, 8]);
  stage.span(a, { min: 2, max: 3 });
  let remaining = 0;
  const budget = { maxUploadBytes: 128, canPublish: bytes => bytes <= remaining };
  const gate = admitSceneryPublication(() => budget, () => stage.bytes());
  assert.equal(gate.next().value, ITERATOR_PENDING);
  a.clearUpdateRanges();
  remaining = 16;
  assert.equal(gate.next().value, ITERATOR_PENDING);
  remaining = 32;
  assert.equal(gate.next().value, 32);
  assert.equal(a.array[8], 0);
  assert.equal(stage.commit(), 32);
});

test('scatter storage and both LOD tiers remain unchanged when a staged plan is abandoned', () => {
  const rows = new ScatterInstanceRows('fixture', p => matrix(p.x), p => ({ seed: p.x / 100 }));
  const a = mesh(), b = mesh(), anchor = { x: 0, z: 0 };
  const manifest = [1, 2, 3].map(x => ({ x, prototypeIndex: 0 }));
  const first = rows.begin();
  completeIterator(rows.stageChunk(first, '0:0', manifest, near));
  rows.commit(first, [[a]], [[b]], anchor);
  const oldStorage = rows.storage, oldChunks = rows.chunks;
  const oldA = snapshot(a), oldB = snapshot(b);
  const second = rows.begin();
  completeIterator(rows.stageChunk(second, '0:0', manifest, proxy));
  const abandoned = completeIterator(rows.prepareCommit(second, [[a]], [[b]], anchor));
  assert.ok(abandoned.bytes() > 0);
  assert.equal(rows.storage, oldStorage);
  assert.equal(rows.chunks, oldChunks);
  assert.deepEqual(snapshot(a), oldA);
  assert.deepEqual(snapshot(b), oldB);
  const third = rows.begin();
  completeIterator(rows.stageChunk(third, '0:0', manifest, [
    { band: 'near', fade: 0.5, ditherDirection: 1 }, { band: 'proxy', fade: 0.5, ditherDirection: -1 },
  ]));
  const published = completeIterator(rows.prepareCommit(third, [[a]], [[b]], { x: 1, z: 0 }));
  assert.deepEqual(published.commit(), { near: 3, proxy: 3, manifestsChanged: false });
  assert.deepEqual(positions(a), [0, 1, 2]);
  assert.deepEqual(positions(b), [0, 1, 2]);
});

test('GPU impostor records and auxiliary selection are deferred until the geometry commit', () => {
  const gpu = Object.assign(Object.create(GpuTreeImpostorBatch.prototype), {
    capacity: 192, recordCount: 0, transformBuffer: attribute(4), parameterBuffer: attribute(4),
    appearanceBuffer: attribute(4), mesh: { visible: false }, countUniform: { value: 0 },
    cullStale: false, indirectNeedsReset: false,
  });
  const auxiliary = { calls: 0, setRecords() { this.calls++; } };
  const batch = Object.assign(Object.create(TreeImpostorBatch.prototype), { batch: gpu, mode: 'gpu', auxiliary, acceptedRecords: 0 });
  const records = Array.from({ length: 70 }, (_, x) => ({ x, y: 2, z: 3, scale: 4, yaw: 0.4, fade: 1, seed: 0.2, radius: 5 }));
  const stage = new InstancePublicationPlan();
  const stats = completeIterator(batch.prepareRecords(records, stage));
  assert.equal(stats.accepted, 70);
  assert.equal(gpu.recordCount, 0);
  assert.equal(gpu.mesh.visible, false);
  assert.equal(batch.acceptedRecords, 0);
  assert.equal(auxiliary.calls, 0);
  assert.equal(stage.bytes(), 70 * 3 * 4 * 4);
  stage.commit();
  assert.equal(gpu.recordCount, 70);
  assert.equal(gpu.countUniform.value, 70);
  assert.equal(gpu.cullStale, true);
  assert.equal(auxiliary.calls, 1);
  assert.equal(batch.acceptedRecords, 70);
  const retire = new InstancePublicationPlan();
  completeIterator(batch.prepareRecords([], retire));
  assert.equal(gpu.recordCount, 70);
  retire.commit();
  assert.equal(gpu.recordCount, 0);
  assert.equal(gpu.indirectNeedsReset, true);
});

test('CPU impostor record replacement waits for atomic publication without claiming camera upload bytes', () => {
  const cpu = { capacity: 1, records: [], setRecords(records) { this.records = records.slice(0, this.capacity); return this.records.length; } };
  const batch = Object.assign(Object.create(TreeImpostorBatch.prototype), { batch: cpu, mode: 'cpu', acceptedRecords: 0 });
  const stage = new InstancePublicationPlan();
  const stats = completeIterator(batch.prepareRecords([{}, {}], stage));
  assert.deepEqual(stats, { mode: 'cpu', requested: 2, accepted: 1, dropped: 1 });
  assert.equal(cpu.records.length, 0);
  assert.equal(stage.bytes(), 0);
  stage.commit();
  assert.equal(cpu.records.length, 1);
  assert.equal(batch.acceptedRecords, 1);
});

test('focus cancellation while blocked leaves the previous mesh data intact', () => {
  const a = attribute(3);
  const job = { focus: { chunkX: 0, chunkZ: 0 }, updateKey: 'first' };
  const view = { pendingRebuild: job, terrainView: { focusChunk: { ...job.focus } } };
  const factory = function* () {
    const stage = new InstancePublicationPlan();
    stage.record(a, 0, [1, 2, 3]);
    stage.span(a, { min: 0, max: 0 });
    yield* admitSceneryPublication(() => ({ canPublish: () => false }), () => stage.bytes());
    stage.commit();
    return true;
  };
  assert.equal(stepViewRebuild(view, job, () => false, factory), false);
  assert.equal(a.array[0], 0);
  view.terrainView.focusChunk.chunkX = 20;
  assert.equal(stepViewRebuild(view, job, () => false, factory), false);
  assert.equal(view.stagedRebuild, null);
  assert.equal(a.array[0], 0);
  assert.equal(a.updateRanges.length, 0);
});

test('anchor proposal is nonmutating and the publication flag is independent', () => {
  const anchor = new InstanceAnchor(100);
  anchor.follow({ x: 0, z: 0 });
  assert.deepEqual(anchor.proposed({ x: 200, z: 0 }), { x: 200, z: 0 });
  assert.equal(anchor.x, 0);
  assert.equal(resolveRenderEnhancements().regionalInstancePublicationBudget, false);
  assert.equal(resolveRenderEnhancements({}, '?regionalInstancePublicationBudget=1').regionalInstancePublicationBudget, true);
});
