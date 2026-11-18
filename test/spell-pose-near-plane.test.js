import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { resolveSpellPose } from '../src/editor/spells/spell_vfx_controller.js';

const hand = { handForwardM: 0.5, handRightM: 0.35, handUpM: -0.35 };

function depthOfBase(near) {
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, near, 1000);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -10);
  camera.updateMatrixWorld(true);
  const { base } = resolveSpellPose(camera, hand);
  return base.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()));
}

test('a spell hand sits in front of the near plane', () => {
  // A 0.5 m near plane once swallowed the jet's root and hid fire, water and air.
  assert.ok(depthOfBase(0.5) > 0.5 + 0.2);
});

test('a close near plane keeps the authored hand distance', () => {
  assert.equal(+depthOfBase(0.1).toFixed(6), 0.5);
});
