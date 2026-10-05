import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, PerspectiveCamera, Vector4, WebGPUCoordinateSystem, WebGLCoordinateSystem } from 'three/webgpu';
import { PlanarReprojection } from '../src/render/reflections/PlanarReprojection.js';
import { preparePlanarCamera } from '../src/render/reflections/PlanarCamera.js';

test('direction projection is invariant under a shared floating-origin shift', () => {
  const source = new PerspectiveCamera(60, 1.8, 0.1, 200);
  source.position.set(8, 6, 13); source.lookAt(0, 0, 0); source.updateMatrixWorld();
  const reprojection = new PlanarReprojection();
  const ray = new Vector4(-8, 6, -13, 0);
  reprojection.record(preparePlanarCamera(source, 0));
  const before = ray.clone().applyMatrix4(reprojection.viewProjection.value);
  source.position.x -= 4096; source.position.z += 8192; source.updateMatrixWorld();
  reprojection.record(preparePlanarCamera(source, 0));
  const after = ray.clone().applyMatrix4(reprojection.viewProjection.value);
  assert.ok(before.sub(after).length() < 1e-8);
  assert.equal(reprojection.perspective.value, 1);
  assert.ok(reprojection.uvNode().uv.isNode && reprojection.uvNode().weight.isNode);
});

test('orthographic captures select positional sampling and retain invalidation', () => {
  const source = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  source.position.set(0, 6, 12); source.lookAt(0, 0, 0); source.updateMatrixWorld();
  const reprojection = new PlanarReprojection();
  reprojection.record(preparePlanarCamera(source, 0));
  assert.equal(reprojection.perspective.value, 0);
  reprojection.valid.value = 0;
  assert.ok(reprojection.uvNode().weight.isNode);
});

test('both camera types clip at the water plane on both graphics backends', () => {
  for (const coordinateSystem of [WebGLCoordinateSystem, WebGPUCoordinateSystem]) {
    for (const source of [new OrthographicCamera(-10, 10, 10, -10, 0.1, 100), new PerspectiveCamera(60, 1.8, 0.1, 100)]) {
      source.coordinateSystem = coordinateSystem; source.updateProjectionMatrix();
      source.position.set(0, 6, 12); source.lookAt(0, 0, 0); source.updateMatrixWorld();
      const capture = preparePlanarCamera(source, 0);
      const project = y => new Vector4(0, y, 0, 1).applyMatrix4(capture.matrixWorldInverse).applyMatrix4(capture.projectionMatrix);
      const boundary = coordinateSystem === WebGPUCoordinateSystem ? 0 : -1;
      const onPlane = project(0), above = project(1), below = project(-1);
      assert.ok(Math.abs(onPlane.z / onPlane.w - boundary) < 1e-8);
      assert.ok(above.z / above.w > boundary);
      assert.ok(below.z / below.w < boundary);
    }
  }
});
