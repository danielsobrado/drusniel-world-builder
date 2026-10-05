import assert from 'node:assert/strict';
import test from 'node:test';
import { ExplorationSpeedMode } from '../src/editor/player/ExplorationSpeedMode.js';
import { resolveExplorationConfig } from '../src/editor/exploration/ExplorationConfig.js';
import { stepPlayerPhysics, createPlayerState } from '../src/editor/player/PlayerPhysics.js';

test('double-tap toggles travel without repeats, compounding or modifying source settings', () => {
  let time = 0;
  const original = Object.freeze({ walkSpeed: 5, runMultiplier: 2, gravity: 20, water: Object.freeze({ swimSpeed: 3 }) });
  const mode = new ExplorationSpeedMode(original, {}, () => time);
  const tap = repeat => mode.handleKeyDown({ code: 'ShiftLeft', repeat });
  assert.equal(tap(false), false); time = 100; assert.equal(tap(true), false);
  assert.equal(mode.active, false); assert.equal(tap(false), true);
  assert.equal(mode.config.walkSpeed, 15); assert.equal(original.walkSpeed, 5);
  assert.equal(mode.config.water, original.water, 'swimming and gravity are unchanged');
  time = 150; tap(false); time = 200; tap(false);
  assert.equal(mode.config, original);
  mode.setActive(true); mode.setActive(true); assert.equal(mode.config.walkSpeed, 15);
  mode.resetGesture(); time = 250; assert.equal(tap(false), false);
  time = 1000; assert.equal(tap(false), false, 'expired taps do not toggle');
  const disabled = new ExplorationSpeedMode(original, { enabled: false });
  disabled.setActive(true); assert.equal(disabled.config, original);
});

test('fast travel still goes through collision resolution and respects a not-ready destination', () => {
  const original = { walkSpeed: 5, runMultiplier: 2, gravity: 20, eyeHeight: 1.8,
    groundSnapDistance: 0.3, stepHeight: 0.5, jumpSpeed: 7 };
  const mode = new ExplorationSpeedMode(original); mode.setActive(true);
  const state = createPlayerState({ x: 0, z: 0, groundHeight: 0, eyeHeight: original.eyeHeight });
  let requested;
  const next = stepPlayerPhysics({ state, input: { forward: 1, right: 0, running: true },
    deltaSeconds: 0.05, config: mode.config, forward: { x: 0, z: -1 }, right: { x: 1, z: 0 },
    getGroundHeight: () => 0, resolveHorizontalMotion: request => {
      requested = request; return { position: request.start, ready: false, blocked: true,
        supportHeight: 0, supportNormal: { x: 0, y: 1, z: 0 }, supportSourceId: 'terrain', contacts: [] };
    } });
  assert.ok(requested); assert.equal(next.x, state.x); assert.equal(next.z, state.z);
  assert.equal(next.collisionReady, false);
});

test('travel configuration rejects unbounded speeds and ambiguous tap windows', () => {
  assert.throws(() => resolveExplorationConfig({ speedBoost: { speedMultiplier: 10 } }), /speedBoost/);
  assert.throws(() => resolveExplorationConfig({ speedBoost: { doubleTapWindowMs: 0 } }), /speedBoost/);
});
