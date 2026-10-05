import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { FreeFlyController } from '../src/editor/player/FreeFlyController.js';

function setup() {
  const canvas = new EventTarget(), target = new EventTarget(), doc = new EventTarget();
  const source = new PerspectiveCamera(); source.position.set(10, 20, 30);
  let blocked = false;
  const flight = new FreeFlyController({ canvas, eventTarget: target, documentTarget: doc,
    settings: { moveSpeed: 20, fastMultiplier: 4, lookSensitivity: 0.003 }, isBlocked: () => blocked });
  const press = code => flight.handleKey({ code, preventDefault() {} });
  flight.start(source);
  return { flight, press, source, doc, canvas, target, block: () => { blocked = true; } };
}

test('flight normalizes diagonal movement, caps stalls, and supports rise and boost', () => {
  const { flight, press, source } = setup();
  press('KeyW'); press('KeyD'); flight.update(0.05);
  assert.ok(Math.abs(flight.camera.position.distanceTo(source.position) - 1) < 1e-8);
  flight.keys.clear(); press('Space'); press('ShiftLeft'); flight.update(10);
  assert.equal(flight.camera.position.y, 24);
  assert.deepEqual(source.position.toArray(), [10, 20, 30]);
  flight.dispose();
});

test('flight ignores typing and modifiers, freezes under overlays, and releases held input', () => {
  const { flight, press, block, target } = setup();
  assert.equal(flight.handleKey({ code: 'KeyW', target: { matches: () => true } }), false);
  assert.equal(flight.handleKey({ code: 'KeyW', metaKey: true }), false);
  assert.equal(flight.handleKey({ code: 'ControlLeft', ctrlKey: true, preventDefault() {} }), true);
  flight.keys.clear();
  press('KeyW'); target.dispatchEvent(new Event('blur')); assert.equal(flight.keys.size, 0);
  press('KeyW'); const before = flight.camera.position.clone(); block(); flight.update(0.05);
  assert.ok(flight.camera.position.equals(before)); assert.equal(flight.keys.size, 0);
  flight.dispose();
});

test('flight rebases and restores its pose without moving the original camera', () => {
  const { flight, source, doc, canvas } = setup();
  flight.shiftWorld(4096, -8192);
  const captured = flight.captureState(); flight.camera.position.set(0, 0, 0);
  assert.equal(flight.restoreState(captured), true);
  assert.deepEqual(flight.camera.position.toArray(), [-4086, 20, 8222]);
  assert.equal(flight.restoreState({ position: [NaN, 0, 0], quaternion: [0, 0, 0, 1] }), false);
  assert.deepEqual(source.position.toArray(), [10, 20, 30]);
  let exits = 0; doc.pointerLockElement = canvas; doc.exitPointerLock = () => { exits++; };
  flight.stop(); assert.equal(exits, 1); assert.equal(flight.active, false);
  flight.dispose();
});
