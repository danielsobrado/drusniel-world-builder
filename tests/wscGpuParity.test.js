import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { int, screenCoordinate, uniformArray, vec4 } from 'three/tsl';
import { buildShader } from '../test/helpers/buildShader.js';
import { wscParityPoints } from '../src/editor/performance/qa/WscGpuParity.js';
import { sampleWorldSurfaceContextAt, wscUniforms } from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContextState.js';

test('the parity probe covers the window, its fade and beyond, off texel centres', () => {
  const points = wscParityPoints();
  assert.equal(points.length, 64);
  const span = 1 / wscUniforms.inverseSpan.value;
  const origin = wscUniforms.renderOrigin.value;
  const us = points.map(([x]) => (x - origin.x) / span);
  assert.ok(Math.min(...us) < 0 && Math.max(...us) > 1, 'past both edges');
  assert.deepEqual(wscParityPoints(), points, 'deterministic');
});

test('the parity probe renders the production sampler per pixel (no sampler, raw fragment output)', () => {
  const coords = uniformArray([new THREE.Vector4(1, 2, 0, 0)], 'vec4');
  const s = sampleWorldSurfaceContextAt(coords.element(int(screenCoordinate.x)).xy);
  const material = new THREE.MeshBasicNodeMaterial();
  material.fragmentNode = vec4(s.height, s.validity, s.canopy, s.contact);
  const { fragmentShader } = buildShader(new THREE.Mesh(new THREE.PlaneGeometry(), material));
  assert.match(fragmentShader, /textureLoad/);
  assert.doesNotMatch(fragmentShader, /textureSample/, 'the same sampler-free reads as production');
});
