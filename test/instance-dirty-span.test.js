import assert from 'node:assert/strict';
import test from 'node:test';
import { InstancedBufferAttribute, Matrix4 } from 'three/webgpu';
import { InstanceDirtySpan, admitInstancePublication } from '../src/editor/stylized/lod/InstanceDirtySpan.js';

test('only changed matrix and scalar spans are published', () => {
  const matrix = new InstancedBufferAttribute(new Float32Array(64), 16);
  const snow = new InstancedBufferAttribute(new Float32Array(4), 1);
  const transform = new Matrix4().makeTranslation(1, 2, 3);
  let span = new InstanceDirtySpan(matrix);
  span.matrix(2, transform);
  assert.equal(span.publish(), 64);
  assert.deepEqual(matrix.updateRanges, [{ start: 32, count: 16 }]);
  matrix.clearUpdateRanges();
  span = new InstanceDirtySpan(matrix);
  span.matrix(2, transform);
  assert.equal(span.publish(), 0);
  assert.equal(matrix.updateRanges.length, 0);
  const scalar = new InstanceDirtySpan(snow);
  scalar.scalar(1, 0.5);
  assert.equal(scalar.publish(), 4);
  assert.deepEqual(snow.updateRanges, [{ start: 1, count: 1 }]);
});

test('geology admission accounts for the worst-case matrix and scalar upload', () => {
  const budget = { canPublish: bytes => bytes <= 100 };
  assert.equal(admitInstancePublication(budget, 1, 1, 17), true);
  assert.equal(admitInstancePublication(budget, 2, 1, 17), false);
  assert.equal(admitInstancePublication(null, 2, 1, 17), true);
});
