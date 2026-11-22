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

test('surface and optical warmups use distinct node frames so shadow variants are prepared', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const frame = { frameId: 10, time: 7, deltaTime: .016 }, observed = [];
  const terrainView = { scene, renderer: { isRenderer: true, _nodes: { nodeFrame: frame } },
    prewarmPostProcessing() { observed.push(['surface', frame.frameId]); return true; },
    stylizedConfig: { water: { qualityTier: 'high', projectedCaustics: {
      enabled: true, color: '#b9f4e5', intensity: .16, scale: .42, speed: .55,
      contrast: 2.6, depthFadeStart: .15, depthFadeEnd: 6, maxDistance: 45,
    } } } };
  const controller = new UnderwaterViewController({ terrainView,
    playerController: { camera, getStatus: () => ({ enabled: true, headSubmerged: false }) }, config: underwaterConfig });
  controller.causticsPostProcess.prewarm = () => { observed.push(['underwater', frame.frameId]); return true; };
  assert.equal(terrainView.prewarmPostProcessing(camera), true);
  assert.deepEqual(observed, [['surface', 10], ['underwater', 11], ['underwater', 13]]);
  assert.equal(frame.frameId, 14);
  assert.equal(frame.time, 7, 'preparation must not advance animation time');
  assert.equal(frame.deltaTime, .016);
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

test('swimming near the waterline tightens camera.near and restores surfaceNearPlane when leaving water', () => {
  const { controller, playerController } = createHarness();
  let waterDepth = 1.5;
  let waterSurfaceHeight = 4;
  playerController.camera.position.y = 4.35;
  playerController.getStatus = () => ({
    enabled: true,
    headSubmerged: false,
    waterDepth,
    waterSurfaceHeight,
    waterKind: 2,
  });

  controller.update(0);
  controller.update(16);
  assert.ok(playerController.camera.near <= 0.15, 'tightens near plane while swimming at surface');
  assert.equal(controller.surfaceNearPlane, 0.5, 'preserves original surface near plane across waterline frames');

  waterDepth = 0;
  waterSurfaceHeight = null;
  playerController.camera.position.y = 6;
  controller.update(32);
  assert.equal(playerController.camera.near, 0.5, 'restores surface near plane after leaving water');
  controller.dispose();
});
