import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { PLANT_MOTION_PROFILES, resolvePlantMotion, rotatePlantVector } from '../src/editor/stylized/PlantMotionProfiles.js';
import { applyPlantMotion } from '../src/editor/stylized/PlantMotionNodes.js';
import { createInstancedRenderers, writeInstances } from '../src/editor/stylized/lod/StylizedLodRuntime.js';

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('unannotated leafy plants are stiff; grass remains flexible and invalid profiles fail', () => {
  assert.equal(resolvePlantMotion().id, 'woody-shrub');
  assert.equal(resolvePlantMotion('grass-tuft').rigid, false);
  assert.ok(resolvePlantMotion('broadleaf').maximumAngle < .1);
  assert.throws(() => resolvePlantMotion('leaf-shaped-grass'), /Unknown plant motion/);
});

test('rigid plant motion holds roots and leaf dimensions throughout a strong gust', () => {
  const vertices = [[0, 0, 0], [.4, 1.8, -.2], [-.5, 1.9, .4], [.2, 2.3, .5]];
  for (const profile of Object.values(PLANT_MOTION_PROFILES).filter(p => p.rigid)) {
    for (const direction of [[1, 0], [0, 1], [.6, -.8], [0, 0]]) {
      for (const fraction of [-1, -.5, 0, .5, 1]) {
        const posed = vertices.map(v => rotatePlantVector(v, direction, profile.maximumAngle * fraction));
        assert.deepEqual(posed[0], [0, 0, 0]);
        for (let i = 0; i < vertices.length; i++) for (let j = i + 1; j < vertices.length; j++) {
          assert.ok(Math.abs(distance(posed[i], posed[j]) - distance(vertices[i], vertices[j])) < 1e-12);
        }
      }
    }
  }
  assert.ok(rotatePlantVector([0, 1, 0], [1, 0], .1)[0] > 0, 'tips lean downwind');
});

test('instanced plant roots follow placement and canonical anchor without per-frame uploads', () => {
  const geometry = new THREE.BoxGeometry(.5, 2, .5);
  const material = new THREE.MeshLambertNodeMaterial();
  applyPlantMotion(material, { wind: {}, height: 2, profile: 'broadleaf' });
  const root = new THREE.Group();
  const renderers = createInstancedRenderers({ root, partsByPrototype: [[{ geometry, material }]], capacity: 2, name: 'test-plant' });
  const instances = [[{ matrix: new THREE.Matrix4().makeTranslation(1000002, 3, -2000004), fade: 1, seed: .2 }]];
  writeInstances(renderers, instances, { x: 1000000, z: -2000000 });
  const attribute = renderers[0][0].geometry.getAttribute('instancePlantRoot');
  assert.deepEqual([...attribute.array.slice(0, 3)], [2, 3, -4]);
  const version = attribute.version;
  writeInstances(renderers, instances, { x: 1000000, z: -2000000 });
  assert.equal(attribute.version, version, 'unchanged placement does not upload again');
  writeInstances(renderers, instances, { x: 1000128, z: -2000128 });
  assert.deepEqual([...attribute.array.slice(0, 3)], [-126, 3, 124]);
  root.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
  geometry.dispose(); material.dispose();
});
