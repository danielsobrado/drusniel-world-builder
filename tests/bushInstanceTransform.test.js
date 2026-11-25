import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import {
  BUSH_ASPECT_VARIATION,
  BUSH_HUE_SHIFT,
  composeBushMatrix,
  fitBushToGround,
  varyBushBiomeLook,
} from '../src/editor/stylized/bushInstanceTransform.js';

test('fitBushToGround keeps flat ground upright and tilts gently downhill on a slope', () => {
  const flat = fitBushToGround({ x: 10, z: 20, height: 5, scale: 1 }, 0.6, () => 5);
  assert.ok(flat);
  assert.ok(Math.abs(flat.groundFitHeight - 4.98) < 1e-6);
  assert.ok(Math.abs(flat.groundNormal[0]) < 1e-6);
  assert.ok(Math.abs(flat.groundNormal[1] - 1) < 1e-6);
  assert.ok(Math.abs(flat.groundNormal[2]) < 1e-6);

  const sloped = fitBushToGround(
    { x: 10, z: 20, height: 5, scale: 1 },
    0.8,
    (x) => 5 - (x - 10) * 0.5,
  );
  assert.ok(sloped);
  assert.ok(sloped.groundFitHeight < 4.98, 'sinks slightly toward downhill side');
  assert.ok(sloped.groundNormal[0] > 0.05, 'leans gently toward +x downhill');
  assert.ok(sloped.groundNormal[1] > 0.9, 'remains mostly upright');
});

test('composeBushMatrix varies XZ vs Y proportions deterministically and preserves volume', () => {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scaleA = new THREE.Vector3();
  const scaleB = new THREE.Vector3();

  const matA = composeBushMatrix({ x: 12.4, z: -8.1, height: 3, rotationY: 0.7, scale: 1.2, priority: 0.35 });
  const matA2 = composeBushMatrix({ x: 12.4, z: -8.1, height: 3, rotationY: 0.7, scale: 1.2, priority: 0.35 });
  const matB = composeBushMatrix({ x: 41.7, z: 19.3, height: 3, rotationY: 1.9, scale: 1.2, priority: 0.72 });

  assert.deepEqual([...matA.elements], [...matA2.elements]);
  matA.decompose(pos, quat, scaleA);
  matB.decompose(pos, quat, scaleB);

  assert.equal(scaleA.x, scaleA.z);
  assert.notEqual(scaleA.x, scaleB.x);
  assert.ok(Math.abs(scaleA.x / 1.2 - 1) <= BUSH_ASPECT_VARIATION + 1e-6);
  assert.ok(Math.abs(scaleA.y / 1.2 - 1) <= BUSH_ASPECT_VARIATION + 1e-6);
  // Inverse compensation: wider shrubs are slightly lower, narrower ones taller.
  assert.ok((scaleA.x - 1.2) * (scaleA.y - 1.2) <= 1e-9);
});

test('varyBushBiomeLook shifts warmth within bounds and preserves packed saturation/snow w', () => {
  const base = new Float32Array([0.92, 1.0, 0.84, 5.8]);
  const a = varyBushBiomeLook(base, { x: 4.2, z: 9.8, priority: 0.21 });
  const b = varyBushBiomeLook(base, { x: 17.5, z: -3.4, priority: 0.83 });

  assert.equal(a[3], base[3]);
  assert.equal(b[3], base[3]);
  assert.notEqual(a[0], b[0]);
  assert.ok(Math.abs(a[0] / base[0] - 1) <= BUSH_HUE_SHIFT + 1e-6);
  assert.ok(Math.abs(a[2] / base[2] - 1) <= BUSH_HUE_SHIFT + 1e-6);
});
