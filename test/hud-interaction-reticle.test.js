import assert from 'node:assert/strict';
import test from 'node:test';
import { InteractionBus, parseLegacyPromptText } from '../src/editor/player/hud/HudInteractionBus.js';
import { resolveReticleState } from '../src/editor/player/hud/HudReticle.js';

test('parseLegacyPromptText normalizes door and portal prompt strings', () => {
  assert.deepEqual(parseLegacyPromptText('Open door', 'door'), {
    target: 'Wooden door',
    action: 'Open',
    key: 'E',
    kind: 'door',
  });
  assert.deepEqual(parseLegacyPromptText('Close door', 'door'), {
    target: 'Wooden door',
    action: 'Close',
    key: 'E',
    kind: 'door',
  });
  assert.deepEqual(parseLegacyPromptText('Enter Frostgard Cavern', 'portal'), {
    target: 'Frostgard Cavern',
    action: 'Enter',
    key: 'E',
    kind: 'portal',
  });
});

test('InteractionBus resolves highest-priority active source and falls back cleanly on clear', () => {
  const bus = new InteractionBus();
  const snapshots = [];
  const unsubscribe = bus.subscribe((entry) => snapshots.push(entry));

  bus.publish('npc-1', { kind: 'npc', target: 'Aldric Vance', subtitle: 'Blacksmith' });
  assert.equal(bus.current()?.target, 'Aldric Vance');

  bus.publish('door-1', { kind: 'door', target: 'Oak door', action: 'Open', key: 'E' });
  assert.equal(bus.current()?.target, 'Oak door');

  bus.publish('portal-1', { kind: 'portal', target: 'Mountain cavern', action: 'Enter', key: 'E' });
  assert.equal(bus.current()?.target, 'Mountain cavern');

  bus.clear('portal-1');
  assert.equal(bus.current()?.target, 'Oak door');
  bus.clear('door-1');
  assert.equal(bus.current()?.target, 'Aldric Vance');
  bus.clear('npc-1');
  assert.equal(bus.current(), null);

  unsubscribe();
  assert.ok(snapshots.length >= 6);
});

test('resolveReticleState prioritizes cast > target > interact > explore', () => {
  assert.equal(resolveReticleState(), 'explore');
  assert.equal(resolveReticleState({ interacting: true }), 'interact');
  assert.equal(resolveReticleState({ interacting: true, targeting: true }), 'target');
  assert.equal(resolveReticleState({ interacting: true, targeting: true, casting: true }), 'cast');
});
