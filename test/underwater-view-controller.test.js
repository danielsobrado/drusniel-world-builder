import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { UnderwaterViewController } from '../src/editor/water/UnderwaterViewController.js';

const underwaterConfig = Object.freeze({
  backgroundColor: '#123456',
  fogColor: '#234567',
  fogDensity: 0.05,
  lightScale: 0.4,
  transitionSeconds: 0.01,
  nearPlane: 0.15,
});

function createHarness({ fog = null } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a100c');
  scene.fog = fog;
  const sky = new THREE.Mesh();
  sky.name = 'stylized-sky-dome';
  scene.add(sky, new THREE.DirectionalLight('#ffffff', 2));
  const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 1000);
  const playerController = {
    camera,
    getStatus: () => ({
      enabled: true,
      headSubmerged: playerController.headSubmerged,
    }),
    headSubmerged: false,
  };
  const terrainView = {
    scene,
    godRays: null,
  };
  const controller = new UnderwaterViewController({
    terrainView,
    playerController,
    config: underwaterConfig,
  });
  return { controller, scene, playerController, sky };
}

test('optical underwater rendering preserves the sky and light for Snell’s window without double absorption', () => {
  const { controller, scene, sky } = createHarness({ fog: new THREE.FogExp2('#9ab4c0', 0.012) });
  const originalBackground = scene.background.clone();
  controller.causticsPostProcess = { opticsState: {}, update() {}, dispose() {} };
  controller.blend = 1;
  controller.applyEnvironment();
  assert.equal(sky.visible, true);
  assert.equal(controller.directional.intensity, 2);
  assert.equal(scene.fog.density, 0);
  assert.deepEqual(scene.background, originalBackground);
  controller.restoreSurfaceEnvironment();
  assert.equal(scene.fog.density, 0.012);
  assert.equal(sky.visible, true);
  controller.dispose();
});

test('underwater draws keep the main-camera hooks and dry draws call them once', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const calls = [];
  const terrainView = { scene, beforeMainRender: () => calls.push('before'), afterMainRender: () => calls.push('after'),
    render(camera) { this.beforeMainRender(camera); calls.push('surface'); this.afterMainRender(camera); },
    stylizedConfig: { water: { qualityTier: 'high', projectedCaustics: {
      enabled: true, color: '#b9f4e5', intensity: 0.16, scale: 0.42, speed: 0.55,
      contrast: 2.6, depthFadeStart: 0.15, depthFadeEnd: 6, maxDistance: 45,
    } } } };
  const controller = new UnderwaterViewController({ terrainView,
    playerController: { camera, getStatus: () => ({ enabled: true, headSubmerged: false }) }, config: underwaterConfig });
  controller.causticsPostProcess.render = () => { calls.push('underwater'); return true; };
  controller.causticsPostProcess.blend.value = 1;
  terrainView.render(camera);
  assert.deepEqual(calls, ['before', 'underwater', 'after']);
  calls.length = 0; controller.causticsPostProcess.blend.value = 0;
  terrainView.render(camera);
  assert.deepEqual(calls, ['before', 'surface', 'after']);
  controller.dispose();
});

test('fog-less worlds restore null fog after a dive cycle', () => {
  const { controller, scene, playerController } = createHarness({ fog: null });
  assert.equal(controller.originalFogExists, false);

  playerController.headSubmerged = true;
  for (let i = 0; i < 8; i += 1) {
    controller.update(i * 16);
  }
  assert.ok(scene.fog?.isFogExp2, 'diving installs temporary underwater fog');

  playerController.headSubmerged = false;
  for (let i = 0; i < 8; i += 1) {
    controller.update(1000 + i * 16);
  }
  assert.equal(controller.blend, 0);
  assert.ok(scene.fog?.isFogExp2, 'blend path may still hold a temporary fog object');

  controller.restoreSurfaceEnvironment();
  assert.equal(scene.fog, null);
  controller.dispose();
});

test('worlds that started with fog restore their surface fog', () => {
  const fog = new THREE.FogExp2('#9ab4c0', 0.012);
  const { controller, scene, playerController } = createHarness({ fog });
  assert.equal(controller.originalFogExists, true);

  playerController.headSubmerged = true;
  controller.update(0);
  playerController.headSubmerged = false;
  for (let i = 0; i < 8; i += 1) {
    controller.update(1000 + i * 16);
  }
  controller.restoreSurfaceEnvironment();
  assert.ok(scene.fog?.isFogExp2);
  assert.equal(scene.fog.density, 0.012);
  controller.dispose();
});
