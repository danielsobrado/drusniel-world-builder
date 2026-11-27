import { HudCompass } from './HudCompass.js';
import { HudContextMode } from './HudContextMode.js';
import { hudInteractionBus } from './HudInteractionBus.js';
import { HudInteractionPrompt } from './HudInteractionPrompt.js';
import { HudKeyHints } from './HudKeyHints.js';
import { HudMetrics } from './HudMetrics.js';
import { HudMinimap } from './HudMinimap.js';
import { HudNotifications } from './HudNotifications.js';
import {
  HUD_PREFERENCES_EVENT,
  applyHudScaleVariable,
  cycleNavigationMode,
  readHudPreferences,
  stepMinimapZoom,
} from './HudPreferences.js';
import { HudReticle } from './HudReticle.js';
import { HudStatus } from './HudStatus.js';
import { HudVitals } from './HudVitals.js';
import { LocationDiscoveryTracker } from './LocationDiscoveryTracker.js';
import { HUD_PHASE, isPlayerEngaged, resolveHudPhase } from './hudState.js';

const CONTEXT_REFRESH_MS = 200;

/**
 * Orchestrates Drusniel's contextual walking HUD:
 *   - Top-left: restrained vitals cluster (Health, Mana, Stamina, Boost, XP, Effects)
 *   - Top-center: horizon compass + transient status chip + cinematic notifications
 *   - Top-right: desaturated cartographic relief minimap
 *   - Center: dynamic context reticle + shared interaction prompt
 *   - Bottom-left/right: transient control hints & opt-in perf readout
 */
export class PlayerHud {
  constructor({
    viewport,
    canToggleCamera = false,
    canBoost = false,
    minimap = null,
    vitals = null,
    getRenderer = () => null,
    discovery = null,
  }) {
    this.element = document.createElement('div');
    this.element.className = 'player-hud';
    this.element.hidden = true;
    this.phase = HUD_PHASE.hidden;
    this.lastState = null;
    this.nextContextAt = 0;

    this.preferences = readHudPreferences();
    applyHudScaleVariable(this.preferences.scale);
    this.contextMode = new HudContextMode();

    this.status = new HudStatus();
    this.reticle = new HudReticle();
    this.notifications = new HudNotifications();
    this.interactionPrompt = new HudInteractionPrompt();
    this.compass = new HudCompass(minimap ?? {});
    this.vitals = new HudVitals();
    this.minimap = minimap ? new HudMinimap(minimap) : null;
    this.hints = new HudKeyHints({ canToggleCamera, canBoost });
    this.metrics = new HudMetrics({ getRenderer });
    this.spellMenu = null;
    this.hasInteraction = false;
    this.lastLevels = vitals?.levels ?? null;

    this.discovery = discovery
      ? new LocationDiscoveryTracker({
        ...discovery,
        onNotify: (payload) => this.notify(payload),
      })
      : null;

    this.unsubscribeVitals = vitals?.subscribe((levels, meta) => {
      this.lastLevels = levels;
      this.vitals.show(levels, meta);
      this.contextMode.observeVitals(levels);
      this.applyContext(performance.now());
    });
    this.unsubscribeXp = vitals?.subscribeExperience?.((xp) => {
      this.vitals.showExperience(xp);
    });
    this.unsubscribeInteraction = hudInteractionBus.subscribe((entry) => {
      this.hasInteraction = Boolean(entry);
      this.interactionPrompt.show(entry);
      this.applyContext(performance.now());
    });

    this.onPreferences = (event) => {
      if (!event?.detail) return;
      this.preferences = event.detail;
      this.syncPreferences();
    };
    globalThis.addEventListener?.(HUD_PREFERENCES_EVENT, this.onPreferences);

    this.element.append(
      this.compass.element,
      this.status.element,
      this.notifications.element,
      this.reticle.element,
      this.interactionPrompt.element,
      this.vitals.element,
      ...(this.minimap ? [this.minimap.element] : []),
      this.metrics.element,
      this.hints.element,
    );
    viewport.append(this.element);
    this.syncPreferences();
  }

  attachSpellMenu(spellMenu) {
    this.spellMenu = spellMenu ?? null;
    this.applyContext(performance.now());
  }

  notifySpellCast(durationMs, _spellId = null) {
    this.contextMode.notifySpellCast(durationMs);
    this.applyContext(performance.now());
  }

  notifyHotbarActivity() {
    this.contextMode.notifyHotbarActivity();
    this.applyContext(performance.now());
  }

  setScenicTour(active) {
    this.contextMode.setScenicTour(active);
    if (active) {
      this.notifications.notify({
        kind: 'system',
        title: 'Scenic Tour',
        subtitle: 'Press Esc to return',
        durationMs: 2600,
      });
    }
    this.applyContext(performance.now());
  }

  setTargetingHostile(targeting) {
    this.contextMode.setTargetingHostile(targeting);
    this.applyContext(performance.now());
  }

  syncWaterState(waterState) {
    this.vitals.syncBuiltinEffects({
      exhausted: this.vitals.builtinEffects?.some((e) => e.id === 'exhausted'),
      boostLow: this.vitals.builtinEffects?.some((e) => e.id === 'stride'),
      waterState,
    });
  }

  /** Shows a cinematic notification banner. */
  notify(payload) {
    this.notifications.notify(payload);
  }

  /** Compatibility alias for passing system events such as respawn. */
  announce(text) {
    this.notifications.notify({ kind: 'system', title: text, durationMs: 2800 });
  }

  syncPreferences() {
    applyHudScaleVariable(this.preferences.scale);
    this.vitals.setShowNumbers(this.preferences.showResourceNumbers);
    this.minimap?.setZoomPreset(this.preferences.minimapZoom);
    this.applyContext(performance.now());
    if (this.lastState) this.render(this.lastState);
  }

  /** Capture-phase walk-mode HUD shortcuts (`N`, `H`, `=`, `-`). */
  handleKeyDown(event) {
    if (this.phase !== HUD_PHASE.walking || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    if (event.code === 'KeyN') {
      const next = cycleNavigationMode();
      const labels = { full: 'Compass & Minimap', compass: 'Compass Only', immersive: 'Immersive' };
      this.announce(`Navigation: ${labels[next.navigationMode] ?? next.navigationMode}`);
      return true;
    }
    if (event.code === 'KeyH') {
      const pinned = this.contextMode.togglePinOrPeek();
      this.applyContext(performance.now());
      this.announce(pinned ? 'Abilities Pinned' : 'Contextual Auto-Hide');
      return true;
    }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      const next = stepMinimapZoom(-1);
      this.announce(`Map Zoom: ${next.minimapZoom}`);
      return true;
    }
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      const next = stepMinimapZoom(1);
      this.announce(`Map Zoom: ${next.minimapZoom}`);
      return true;
    }
    return false;
  }

  applyContext(nowMs = performance.now()) {
    const resolved = this.contextMode.resolve({
      phase: this.phase,
      preferences: this.preferences,
      levels: this.lastLevels,
      hasActiveEffects: this.vitals.hasActiveEffects(),
      hasInteraction: this.hasInteraction,
      nowMs,
    });

    this.element.dataset.hudContext = resolved.mode;
    this.vitals.setResting(!resolved.showVitals);
    this.compass.setEnabled(resolved.showCompass);
    this.compass.render(this.phase);
    this.minimap?.setEnabled(resolved.showMinimap);
    this.minimap?.render(this.phase);
    this.spellMenu?.setResting(!resolved.showHotbar);
    this.hints.setAllowed(resolved.showHints);
    this.interactionPrompt.setAllowed(this.phase === HUD_PHASE.walking && resolved.mode !== 'scenic-tour');
    this.reticle.setVisible(resolved.showReticle);
    this.reticle.setContext({
      casting: resolved.isCasting,
      targeting: this.contextMode.targetingHostile,
      interacting: this.hasInteraction,
    });
  }

  render(state) {
    this.lastState = state;
    const phase = resolveHudPhase(state);
    this.phase = phase;
    this.element.hidden = phase === HUD_PHASE.hidden && !this.contextMode.scenicTourActive;
    this.element.dataset.hudPhase = phase;
    this.status.render(state);
    this.vitals.render(phase);
    this.hints.render(phase, { engaged: isPlayerEngaged(state) });
    this.metrics.setVisible(phase === HUD_PHASE.walking && !this.contextMode.scenicTourActive);
    this.applyContext(performance.now());
  }

  update(heading, nowMs = performance.now()) {
    if (this.phase !== HUD_PHASE.walking) return;
    this.compass.update(heading, nowMs);
    this.minimap?.update(heading, nowMs);
    this.metrics.update(nowMs);
    this.discovery?.update(nowMs);
    if (nowMs >= this.nextContextAt) {
      this.nextContextAt = nowMs + CONTEXT_REFRESH_MS;
      this.applyContext(nowMs);
    }
  }

  dispose() {
    globalThis.removeEventListener?.(HUD_PREFERENCES_EVENT, this.onPreferences);
    this.unsubscribeVitals?.();
    this.unsubscribeXp?.();
    this.unsubscribeInteraction?.();
    this.compass.dispose();
    this.vitals.dispose();
    this.minimap?.dispose();
    this.hints.dispose();
    this.metrics.dispose();
    this.status.dispose();
    this.notifications.dispose();
    this.interactionPrompt.dispose();
    this.reticle.dispose();
    this.element.remove();
  }
}
