import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMBAT_HOLD_MS,
  HOTBAR_REST_AFTER_MS,
  HudContextMode,
  VITALS_REST_AFTER_MS,
} from '../src/editor/player/hud/HudContextMode.js';
import {
  DEFAULT_HUD_PREFERENCES,
  cycleNavigationMode,
  readHudPreferences,
  stepMinimapZoom,
  writeHudPreferences,
} from '../src/editor/player/hud/HudPreferences.js';
import { HUD_PHASE } from '../src/editor/player/hud/hudState.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
}

test('HudPreferences normalizes invalid values, cycles nav mode, and steps minimap zoom', () => {
  const storage = memoryStorage();
  assert.deepEqual(readHudPreferences(storage), DEFAULT_HUD_PREFERENCES);
  writeHudPreferences({ scale: 99, navigationMode: 'invalid' }, { storage });
  assert.deepEqual(readHudPreferences(storage), DEFAULT_HUD_PREFERENCES);

  const first = cycleNavigationMode({ storage });
  assert.equal(first.navigationMode, 'compass');
  const second = cycleNavigationMode({ storage });
  assert.equal(second.navigationMode, 'immersive');
  const third = cycleNavigationMode({ storage });
  assert.equal(third.navigationMode, 'full');

  const zoomedOut = stepMinimapZoom(1, { storage });
  assert.equal(zoomedOut.minimapZoom, 'wide');
  const zoomedIn = stepMinimapZoom(-2, { storage });
  assert.equal(zoomedIn.minimapZoom, 'close');
});

test('HudContextMode resolves building, scenic-tour, exploration auto-hide, combat, and immersive modes', () => {
  const context = new HudContextMode();
  const fullLevels = { life: 1, mana: 1, stamina: 1, energy: 1 };

  assert.equal(context.resolve({ phase: HUD_PHASE.hidden, preferences: DEFAULT_HUD_PREFERENCES }).mode, 'building');

  context.setScenicTour(true);
  const tour = context.resolve({ phase: HUD_PHASE.walking, preferences: DEFAULT_HUD_PREFERENCES });
  assert.equal(tour.mode, 'scenic-tour');
  assert.equal(tour.showVitals, false);
  assert.equal(tour.showCompass, false);
  assert.equal(tour.showMinimap, false);
  assert.equal(tour.showHotbar, false);
  assert.equal(tour.showReticle, false);
  context.setScenicTour(false);

  // Fresh exploration settles when resources are full and timers expire.
  const idleAt = VITALS_REST_AFTER_MS + HOTBAR_REST_AFTER_MS + 100;
  const idle = context.resolve({
    phase: HUD_PHASE.walking,
    preferences: DEFAULT_HUD_PREFERENCES,
    levels: fullLevels,
    nowMs: idleAt,
  });
  assert.equal(idle.mode, 'exploration');
  assert.equal(idle.showVitals, false);
  assert.equal(idle.showHotbar, false);
  assert.equal(idle.showCompass, true);
  assert.equal(idle.showMinimap, true);
  assert.equal(idle.showReticle, true);

  // Casting wakes combat mode and pins vitals + hotbar.
  context.notifySpellCast(1800, idleAt);
  const combat = context.resolve({
    phase: HUD_PHASE.walking,
    preferences: DEFAULT_HUD_PREFERENCES,
    levels: fullLevels,
    nowMs: idleAt + 500,
  });
  assert.equal(combat.mode, 'combat');
  assert.equal(combat.showVitals, true);
  assert.equal(combat.showHotbar, true);
  assert.equal(combat.isCasting, true);

  // After combat hold expires, exploration returns.
  const afterCombat = context.resolve({
    phase: HUD_PHASE.walking,
    preferences: DEFAULT_HUD_PREFERENCES,
    levels: fullLevels,
    nowMs: idleAt + COMBAT_HOLD_MS + 100,
  });
  assert.equal(afterCombat.mode, 'exploration');

  // Immersive hides compass, minimap, and idle reticle unless interacting.
  const immersiveIdle = context.resolve({
    phase: HUD_PHASE.walking,
    preferences: { ...DEFAULT_HUD_PREFERENCES, navigationMode: 'immersive' },
    levels: fullLevels,
    hasInteraction: false,
    nowMs: idleAt + COMBAT_HOLD_MS + 100,
  });
  assert.equal(immersiveIdle.mode, 'immersive');
  assert.equal(immersiveIdle.showCompass, false);
  assert.equal(immersiveIdle.showMinimap, false);
  assert.equal(immersiveIdle.showReticle, false);

  const immersiveInteract = context.resolve({
    phase: HUD_PHASE.walking,
    preferences: { ...DEFAULT_HUD_PREFERENCES, navigationMode: 'immersive' },
    levels: fullLevels,
    hasInteraction: true,
    nowMs: idleAt + COMBAT_HOLD_MS + 100,
  });
  assert.equal(immersiveInteract.showReticle, true);
});
