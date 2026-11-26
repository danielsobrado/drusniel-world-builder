import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { FogStepAdmission } from '../src/editor/stylized/mist/FogStepAdmission.js';
import { compactLiveSpray } from '../src/editor/stylized/CoastalSprayRecords.js';
import { CoastalImpactSpray } from '../src/editor/stylized/CoastalImpactSpray.js';
import { resolveCoastalRockImpactConfig } from '../src/editor/water/CoastalRockImpactConfig.js';

const config = resolveRenderEnhancements().environmentalFragmentBudget;
test('fog steps retain authored quality until pressure and recover after the quiet interval', () => {
  const admission = new FogStepAdmission(6, config);
  assert.equal(admission.update(0, false), 6);
  assert.equal(admission.update(10, true), 3);
  assert.equal(admission.update(809, false), 3);
  assert.equal(admission.update(810, false), 6);
  assert.equal(admission.update(900, true), 3);
  assert.equal(admission.update(1, false), 6);
});

test('fog never exceeds authored steps or drops below the configured minimum', () => {
  assert.equal(new FogStepAdmission(2, config).update(1, true), 2);
  assert.equal(new FogStepAdmission(7, config).update(1, true), 4);
  assert.equal(new FogStepAdmission(12, { ...config, fogStepFactor: 0.25, fogMinimumSteps: 5 }).update(1, true), 5);
});

test('the flags are independent and fragment settings are bounded', () => {
  assert.equal(resolveRenderEnhancements().environmentalFragmentAdmission, false);
  assert.equal(resolveRenderEnhancements().coastalSprayCompaction, false);
  const fragments = resolveRenderEnhancements({}, '?environmentalFragmentAdmission=1');
  assert.equal(fragments.environmentalFragmentAdmission, true);
  assert.equal(fragments.coastalSprayCompaction, false);
  assert.equal(resolveRenderEnhancements({}, '?coastalSprayCompaction=1').coastalSprayCompaction, true);
  assert.throws(() => resolveRenderEnhancements({ environmentalFragmentBudget: { fogMinimumSteps: 2.5 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ environmentalFragmentBudget: { transparentAlphaCutoff: 0.2 } }), RangeError);
});

test('stable compaction removes holes and expired records without altering survivors', () => {
  const a = { birth: 1, life: 3, mist: false }, b = { birth: 2, life: 4, mist: true };
  const records = [{ birth: 0, life: 1 }, a, null, b, { birth: 5, life: 2 }];
  const writes = [];
  assert.deepEqual(compactLiveSpray(records, 3, (index, record) => writes.push([index, record])), { live: 2, mist: 1, written: 2 });
  assert.deepEqual(records, [a, b]);
  assert.deepEqual(writes, [[0, a], [1, b]]);
  assert.equal(compactLiveSpray(records, 3.1, () => assert.fail('unexpected write')).written, 0);
  assert.equal(compactLiveSpray(records, 3.1, () => {}, true).written, 2);
  assert.deepEqual(compactLiveSpray(records, 7, () => {}), { live: 0, mist: 0, written: 0 });
  assert.deepEqual(records, []);
});

function attribute(capacity) {
  return { itemSize: 4, array: new Float32Array(capacity * 4), updateRanges: [], version: 0,
    setXYZW(index, x, y, z, w) { this.array.set([x, y, z, w], index * 4); },
    set needsUpdate(value) { if (value) this.version++; },
    addUpdateRange(start, count) { this.updateRanges.push({ start, count }); },
    clearUpdateRanges() { this.updateRanges.length = 0; } };
}
function fixture(capacity = 32, compact = true) {
  const origin = { x: 0, z: 0 };
  const settings = resolveCoastalRockImpactConfig({ enabled: true }).spray;
  const spray = Object.assign(Object.create(CoastalImpactSpray.prototype), {
    compact, capacity, mistCapacity: 4, settings,
    floatingOrigin: { getState: () => origin, toRender: (x, z) => ({ x: x - origin.x, z: z - origin.z }) },
    records: compact ? [] : Array.from({ length: capacity }, () => null), cursor: 0, live: 0, mistLive: 0,
    lastOriginX: NaN, lastOriginZ: NaN, dirtyMin: Infinity, dirtyMax: -1, preparedTime: null,
    time: { value: 0 }, geometry: { instanceCount: 0 }, mesh: { visible: false },
    spawn: attribute(capacity), velocity: attribute(capacity), style: attribute(capacity),
  });
  return { spray, origin, attributes: [spray.spawn, spray.velocity, spray.style] };
}
const event = { rockId: 'fixture', crestId: 1, directionX: 1, directionZ: 0,
  intensity: 0.9, contactX: 5, contactY: 0, contactZ: 5, radius: 1 };

test('compacted spray reuses expired slots before emission and respects capacity', () => {
  const { spray } = fixture(8);
  assert.equal(spray.emit(event, 1), 8);
  spray.update(1);
  assert.equal(spray.geometry.instanceCount, 8);
  assert.equal(spray.emit(event, 1), 0);
  assert.equal(spray.emit(event, 3), 8);
  spray.update(3);
  assert.equal(spray.records.length, 8);
  assert.ok(spray.records.every(record => record.birth === 3));
  spray.update(10);
  assert.equal(spray.geometry.instanceCount, 0);
  assert.equal(spray.mesh.visible, false);
});

test('only live prefix is submitted and no idle attributes are uploaded', () => {
  const { spray, attributes } = fixture();
  const emitted = spray.emit(event, 1);
  spray.update(1);
  assert.equal(spray.geometry.instanceCount, emitted);
  for (const attr of attributes) {
    assert.deepEqual(attr.updateRanges, [{ start: 0, count: emitted * 4 }]);
    attr.clearUpdateRanges();
  }
  const versions = attributes.map(attr => attr.version);
  spray.update(1.1);
  assert.deepEqual(attributes.map(attr => attr.version), versions);
  spray.update(2.2);
  assert.ok(spray.records.length < emitted);
  assert.equal(spray.geometry.instanceCount, spray.records.length);
  assert.equal(spray.mistLive, spray.records.filter(record => record.mist).length);
  assert.ok(spray.records.every(record => record.mist));
});

test('origin change rewrites all surviving rows without changing their trajectory', () => {
  const { spray, origin, attributes } = fixture();
  spray.emit(event, 1);
  spray.update(1);
  const records = spray.records.slice();
  for (const attr of attributes) attr.clearUpdateRanges();
  origin.x = 128;
  origin.z = -64;
  spray.update(1.1);
  assert.deepEqual(spray.records, records);
  for (let i = 0; i < records.length; i++) {
    assert.equal(spray.spawn.array[i * 4], Math.fround(records[i].x - 128));
    assert.equal(spray.spawn.array[i * 4 + 2], Math.fround(records[i].z + 64));
  }
  for (const attr of attributes) assert.deepEqual(attr.updateRanges, [{ start: 0, count: records.length * 4 }]);
});

test('mist reservation and reset do not leave stale drawn rows', () => {
  const { spray } = fixture(64);
  spray.emit(event, 1);
  spray.emit({ ...event, crestId: 2 }, 1);
  spray.update(1);
  assert.ok(spray.mistLive <= spray.mistCapacity);
  spray.reset();
  assert.equal(spray.records.length, 0);
  assert.equal(spray.mistLive, 0);
  assert.equal(spray.geometry.instanceCount, 0);
  spray.emit(event, 1);
  spray.update(1);
  assert.ok(spray.geometry.instanceCount > 0);
});

test('legacy spray path retains its circular allocation with compaction disabled', () => {
  const { spray } = fixture(32, false);
  const count = spray.emit(event, 1);
  spray.update(1);
  assert.equal(spray.records.length, 32);
  assert.equal(spray.geometry.instanceCount, count);
  spray.update(10);
  assert.equal(spray.live, 0);
  assert.equal(spray.mesh.visible, false);
  assert.equal(spray.geometry.instanceCount, count);
});
