import { HUD_PHASE } from './hudState.js';

export const COMBAT_HOLD_MS = 8000;
export const VITALS_REST_AFTER_MS = 3500;
export const HOTBAR_REST_AFTER_MS = 6000;
export const PEEK_DURATION_MS = 6000;

/**
 * Resolves the active RPG HUD context mode and component visibility matrix:
 *   - building:     Edit mode or paused walk mode (all RPG HUD hidden)
 *   - scenic-tour:  Clean cinematic camera tour (all persistent HUD hidden)
 *   - combat:       Recent cast, damage, or hostile target (vitals + hotbar pinned)
 *   - immersive:    navigationMode === 'immersive' (compass/minimap off; vitals & hotbar wake on demand)
 *   - exploration:  Default play mode (compass/minimap follow prefs; full vitals & idle hotbar auto-rest)
 */
export class HudContextMode {
  constructor() {
    this.combatUntilMs = 0;
    this.lastActivityMs = 0;
    this.lastHotbarMs = 0;
    this.peekUntilMs = 0;
    this.hotbarPinned = false;
    this.castingUntilMs = 0;
    this.scenicTourActive = false;
    this.targetingHostile = false;
    this.lastLife = 1;
  }

  enterCombat(nowMs = performance.now(), durationMs = COMBAT_HOLD_MS) {
    this.combatUntilMs = Math.max(this.combatUntilMs, nowMs + durationMs);
    this.lastActivityMs = Math.max(this.lastActivityMs, nowMs);
    this.lastHotbarMs = Math.max(this.lastHotbarMs, nowMs);
  }

  notifySpellCast(durationMs = 1500, nowMs = performance.now()) {
    this.castingUntilMs = Math.max(this.castingUntilMs, nowMs + Math.max(400, durationMs));
    this.enterCombat(nowMs, COMBAT_HOLD_MS);
  }

  notifyHotbarActivity(nowMs = performance.now()) {
    this.lastHotbarMs = Math.max(this.lastHotbarMs, nowMs);
    this.lastActivityMs = Math.max(this.lastActivityMs, nowMs);
  }

  togglePinOrPeek(nowMs = performance.now()) {
    this.hotbarPinned = !this.hotbarPinned;
    this.peekUntilMs = this.hotbarPinned ? nowMs + PEEK_DURATION_MS : 0;
    this.lastActivityMs = Math.max(this.lastActivityMs, nowMs);
    this.lastHotbarMs = Math.max(this.lastHotbarMs, nowMs);
    return this.hotbarPinned;
  }

  setScenicTour(active) {
    this.scenicTourActive = Boolean(active);
  }

  setTargetingHostile(targeting, nowMs = performance.now()) {
    this.targetingHostile = Boolean(targeting);
    if (this.targetingHostile) this.enterCombat(nowMs, 4000);
  }

  observeVitals(levels, nowMs = performance.now()) {
    if (!levels) return;
    if (levels.life < this.lastLife - 0.005) {
      this.enterCombat(nowMs, COMBAT_HOLD_MS);
    }
    this.lastLife = levels.life;
    const depleted = levels.life < 0.995
      || levels.mana < 0.995
      || levels.stamina < 0.995
      || levels.energy < 0.995;
    if (depleted) {
      this.lastActivityMs = Math.max(this.lastActivityMs, nowMs);
    }
  }

  resolve({
    phase,
    preferences,
    levels = null,
    hasActiveEffects = false,
    hasInteraction = false,
    nowMs = performance.now(),
  }) {
    if (this.scenicTourActive) {
      return Object.freeze({
        mode: 'scenic-tour',
        showVitals: false,
        showCompass: false,
        showMinimap: false,
        showHotbar: false,
        showReticle: false,
        showHints: false,
        showEnemyIndicators: false,
        isCasting: false,
      });
    }

    if (phase !== HUD_PHASE.walking) {
      return Object.freeze({
        mode: 'building',
        showVitals: false,
        showCompass: false,
        showMinimap: false,
        showHotbar: false,
        showReticle: false,
        showHints: false,
        showEnemyIndicators: false,
        isCasting: false,
      });
    }

    const isCasting = nowMs < this.castingUntilMs;
    const inCombat = this.targetingHostile || isCasting || nowMs < this.combatUntilMs;
    const navMode = preferences?.navigationMode ?? 'full';
    const mode = inCombat
      ? 'combat'
      : navMode === 'immersive'
        ? 'immersive'
        : 'exploration';

    const fullResources = !levels || (
      levels.life >= 0.995
      && levels.mana >= 0.995
      && levels.stamina >= 0.995
      && levels.energy >= 0.995
    );
    const vitalsPinned = this.hotbarPinned || nowMs < this.peekUntilMs;
    const autoHide = preferences?.autoHideResources !== false;
    const vitalsRecent = (nowMs - this.lastActivityMs) < VITALS_REST_AFTER_MS;
    const showVitals = inCombat
      || vitalsPinned
      || hasActiveEffects
      || !fullResources
      || vitalsRecent
      || (!autoHide && mode !== 'immersive');

    const hotbarRecent = (nowMs - this.lastHotbarMs) < HOTBAR_REST_AFTER_MS;
    const showHotbar = inCombat || vitalsPinned || isCasting || hotbarRecent;

    const showCompass = navMode === 'full' || navMode === 'compass';
    const showMinimap = navMode === 'full';
    const showReticle = mode !== 'immersive' || hasInteraction || isCasting || this.targetingHostile;

    return Object.freeze({
      mode,
      showVitals,
      showCompass,
      showMinimap,
      showHotbar,
      showReticle,
      showHints: mode !== 'immersive',
      showEnemyIndicators: inCombat,
      isCasting,
    });
  }
}
