import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { resolveWaterlineBlend } from '../src/editor/water/UnderwaterTransition.js';
import { UnderwaterCausticsPostProcess } from '../src/editor/water/UnderwaterCausticsPostProcess.js';

function effectHarness(optics = { enabled: true }) {
  const effect = new UnderwaterCausticsPostProcess({ scene: new THREE.Scene(), renderer: {}, optics,
    waterlineRange: 0.75, config: { enabled: true, color: '#b9f4e5', intensity: .16,
      scale: .42, speed: .55, contrast: 2.6, depthFadeStart: .15, depthFadeEnd: 6, maxDistance: 45 } });
  const camera = new THREE.PerspectiveCamera(68, 1, .1, 200);
  return { effect, camera };
}

test('waterline coverage follows the eye relative to the local body, including raised lakes', () => {
  for (const level of [0, 6, -14]) {
    const sample = eyeY => resolveWaterlineBlend({ enabled: true, surfaceHeight: level, eyeY, range: .75 });
    assert.equal(sample(level - .04), 1);
    assert.ok(sample(level + .04) > .9);
    assert.equal(sample(level + .75), 0);
  }
  for (const overrides of [{ enabled: false }, { surfaceHeight: null }, { eyeY: NaN }, { range: 0 }]) {
    assert.equal(resolveWaterlineBlend({ enabled: true, surfaceHeight: 0, eyeY: -.04, range: .75, ...overrides }), 0);
  }
});

test('split water view activates before head immersion and uses the actual render camera', () => {
  const { effect, camera } = effectHarness();
  effect.update({ blend: 0, surfaceHeight: 6, waterKind: 2, waterlineEnabled: true });
  camera.position.y = 6.04;
  assert.equal(effect.isActiveForCamera(camera), true);
  assert.equal(effect.blend.value, 0, 'partial water coverage must not change the global dive/streaming blend');
  assert.ok(effect.getStatus().waterlineBlend > .9);
  camera.position.y = 9;
  assert.equal(effect.isActiveForCamera(camera), false, 'a high third-person camera retains the surface render path');
  camera.position.y = 5.96;
  assert.equal(effect.isActiveForCamera(camera), true, 'head-state hysteresis cannot leave wet pixels dry');
  effect.update({ blend: 0 });
  assert.equal(effect.surfaceHeight.value, 6, 'the last body height remains available for dive fade-out');
  assert.equal(effect.isActiveForCamera(camera), false, 'leaving the body disables waterline coverage immediately');
  effect.dispose();
});

test('waterline coverage does not enable optical processing on the caustics-only fallback', () => {
  const { effect, camera } = effectHarness({ enabled: false });
  effect.update({ blend: 0, surfaceHeight: 0, waterlineEnabled: true });
  camera.position.y = -.04;
  assert.equal(effect.isActiveForCamera(camera), false);
  effect.dispose();
});
