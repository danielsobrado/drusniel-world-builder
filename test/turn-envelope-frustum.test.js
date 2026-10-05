import test from 'node:test';
import assert from 'node:assert/strict';
import { Frustum, Matrix4, OrthographicCamera, PerspectiveCamera, Vector3, WebGPUCoordinateSystem } from 'three/webgpu';
import { TurnEnvelopeFrustum } from '../src/render/visibility/TurnEnvelopeFrustum.js';

for (const aspect of [16 / 9, 32 / 9, 9 / 16]) {
  test(`angular envelope retains an 11.5 degree turn at aspect ${aspect}`, () => {
    const camera = new PerspectiveCamera(60, aspect, 0.1, 500);
    camera.coordinateSystem = WebGPUCoordinateSystem; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const angle = Math.atan(1 / camera.projectionMatrix.elements[0]) + 11.5 * Math.PI / 180;
    const point = new Vector3(Math.sin(angle) * 100, 0, -Math.cos(angle) * 100);
    const exact = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
    assert.equal(exact.containsPoint(point), false);
    assert.equal(new TurnEnvelopeFrustum().update(camera, 12).containsPoint(point), true);
  });
}

test('asymmetric projections retain both turn margins without mutating the source', () => {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 500);
  camera.setViewOffset(1920, 1080, 240, 0, 1680, 1080); camera.updateMatrixWorld();
  const original = camera.projectionMatrix.clone(), e = original.elements;
  const envelope = new TurnEnvelopeFrustum().update(camera, 12);
  for (const [slope, sign] of [[(-1 + e[8]) / e[0], -1], [(1 + e[8]) / e[0], 1]]) {
    const angle = Math.atan(slope) + sign * 11.5 * Math.PI / 180;
    assert.equal(envelope.containsPoint(new Vector3(Math.sin(angle) * 100, 0, -Math.cos(angle) * 100)), true);
  }
  assert.ok(camera.projectionMatrix.equals(original));
});

test('orbit envelope preserves offset framing and rebased camera coordinates', () => {
  const camera = new OrthographicCamera(-10, 30, 10, -10, 0.1, 100);
  camera.position.set(-4096, 0, 0); camera.updateMatrixWorld();
  const original = camera.projectionMatrix.clone();
  const frustum = new TurnEnvelopeFrustum().update(camera, 12);
  assert.equal(frustum.containsPoint(new Vector3(-4096 + 33, 0, -10)), true);
  assert.equal(frustum.containsPoint(new Vector3(-4096 - 33, 0, -10)), false);
  assert.ok(camera.projectionMatrix.equals(original));
});
