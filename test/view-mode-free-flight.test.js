import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, PerspectiveCamera } from 'three';
import { ViewModeController } from '../src/editor/player/ViewModeController.js';

function harness(t) {
  const saved = ['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
  const canvas = new EventTarget();
  const editorCamera = { camera: new OrthographicCamera(), controls: { enabled: true }, updates: 0,
    setEnabled(value) { this.controls.enabled = value; }, update() { this.updates++; },
    getFocusWorld() { return this.camera.position; },
    shiftWorld(x, z) { this.camera.position.x -= x; this.camera.position.z -= z; } };
  editorCamera.camera.position.set(12, 20, 30);
  const player = { camera: new PerspectiveCamera(), enabled: false, paused: false, updates: 0, spawns: 0,
    subscribe: () => () => {}, getStatus: () => ({}), dispose() {},
    setEnabled(value, spawn) { this.enabled = value; if (spawn) this.spawns++; },
    setPaused(value) { this.paused = value; }, update() { this.updates++; },
    getFocusWorld() { return this.camera.position; },
    shiftWorld(x, z) { this.camera.position.x -= x; this.camera.position.z -= z; } };
  player.camera.position.set(7, 3, 9);
  const terrainView = { renderer: { domElement: canvas }, worldStore: { generator: {} } };
  const controller = new ViewModeController({ editorCamera, playerController: player, terrainView });
  t.after(() => {
    controller.dispose();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return { controller, player, editorCamera, terrainView };
}

test('flight settles the editing gesture, moves its own camera, and restores orbit input', t => {
  const { controller, player, editorCamera } = harness(t);
  let modeAtGesture;
  controller.onBeforeFreeFly = () => { modeAtGesture = controller.mode; };
  assert.equal(controller.startFreeFly(), true); assert.equal(modeAtGesture, 'edit');
  assert.equal(editorCamera.controls.enabled, false); assert.equal(player.enabled, false);
  controller.freeFly.handleKey({ code: 'KeyW', preventDefault() {} });
  controller.update(100); controller.update(150);
  assert.ok(controller.camera.position.distanceTo(editorCamera.camera.position) > 0);
  assert.equal(editorCamera.updates, 0); assert.equal(player.updates, 0);
  assert.deepEqual(editorCamera.camera.position.toArray(), [12, 20, 30]);
  assert.equal(controller.stopFreeFly(), true); assert.equal(controller.mode, 'edit');
  assert.equal(editorCamera.controls.enabled, true);
});

test('flight returns to paused and active walking without respawning', t => {
  const { controller, player } = harness(t);
  controller.setMode('player', { spawn: { x: 7, z: 9 } });
  const pose = player.camera.position.toArray();
  for (const paused of [false, true]) {
    if (paused) controller.pause();
    assert.equal(controller.startFreeFly(), true);
    assert.equal(player.enabled, false);
    controller.stopFreeFly();
    assert.equal(controller.mode, 'player'); assert.equal(controller.paused, paused);
    assert.equal(player.enabled, true); assert.equal(player.paused, paused);
    assert.deepEqual(player.camera.position.toArray(), pose); assert.equal(player.spawns, 1);
  }
});

test('flight refuses blocked views and safely exits on a new world or invalid recovered pose', t => {
  const { controller, player, terrainView } = harness(t);
  player.uiBlocked = true; assert.equal(controller.startFreeFly(), false); player.uiBlocked = false;
  player.harnessActive = true; assert.equal(controller.startFreeFly(), false); player.harnessActive = false;
  assert.equal(controller.restoreFlightState({ position: [NaN, 0, 0], quaternion: [0, 0, 0, 1] }), false);
  assert.equal(controller.mode, 'edit'); assert.equal(controller.freeFly.active, false);
  controller.startFreeFly(); controller.shiftWorld(4096, -8192);
  assert.deepEqual(controller.camera.position.toArray(), [-4084, 20, 8222]);
  terrainView.worldStore.generator = {}; controller.update(200);
  assert.equal(controller.mode, 'edit'); assert.equal(controller.freeFly.active, false);
});
