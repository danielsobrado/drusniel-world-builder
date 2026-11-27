import {
  HUD_MINIMAP_ZOOMS,
  HUD_NAVIGATION_MODES,
  HUD_SCALE_OPTIONS,
} from '../../../ui/design-system/tokens.js';

export const HUD_PREFERENCES_STORAGE_KEY = 'drusniel.hud.preferences.v1';
export const HUD_PREFERENCES_EVENT = 'world:hud-preferences';

export const DEFAULT_HUD_PREFERENCES = Object.freeze({
  scale: 1,
  navigationMode: 'full',
  minimapZoom: 'standard',
  showResourceNumbers: false,
  autoHideResources: true,
});

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function normalizeHudPreferences(raw = {}) {
  const candidate = raw && typeof raw === 'object' ? raw : {};
  const scale = HUD_SCALE_OPTIONS.includes(Number(candidate.scale))
    ? Number(candidate.scale)
    : DEFAULT_HUD_PREFERENCES.scale;
  const navigationMode = HUD_NAVIGATION_MODES.includes(candidate.navigationMode)
    ? candidate.navigationMode
    : DEFAULT_HUD_PREFERENCES.navigationMode;
  const minimapZoom = HUD_MINIMAP_ZOOMS.includes(candidate.minimapZoom)
    ? candidate.minimapZoom
    : DEFAULT_HUD_PREFERENCES.minimapZoom;
  const showResourceNumbers = typeof candidate.showResourceNumbers === 'boolean'
    ? candidate.showResourceNumbers
    : DEFAULT_HUD_PREFERENCES.showResourceNumbers;
  const autoHideResources = typeof candidate.autoHideResources === 'boolean'
    ? candidate.autoHideResources
    : DEFAULT_HUD_PREFERENCES.autoHideResources;
  return Object.freeze({
    scale,
    navigationMode,
    minimapZoom,
    showResourceNumbers,
    autoHideResources,
  });
}

export function readHudPreferences(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(HUD_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_HUD_PREFERENCES;
    return normalizeHudPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_HUD_PREFERENCES;
  }
}

export function writeHudPreferences(partial, {
  storage = defaultStorage(),
  target = globalThis,
} = {}) {
  const current = readHudPreferences(storage);
  const next = normalizeHudPreferences({ ...current, ...partial });
  try {
    storage?.setItem?.(HUD_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private windows keep preferences for the current session.
  }
  applyHudScaleVariable(next.scale);
  target?.dispatchEvent?.(new CustomEvent(HUD_PREFERENCES_EVENT, { detail: next }));
  return next;
}

export function applyHudScaleVariable(scale, doc = globalThis.document) {
  const numeric = HUD_SCALE_OPTIONS.includes(Number(scale)) ? Number(scale) : 1;
  doc?.documentElement?.style?.setProperty?.('--ds-hud-scale', String(numeric));
}

export function cycleNavigationMode(options = {}) {
  const current = readHudPreferences(options.storage);
  const index = HUD_NAVIGATION_MODES.indexOf(current.navigationMode);
  const nextMode = HUD_NAVIGATION_MODES[(index + 1) % HUD_NAVIGATION_MODES.length];
  return writeHudPreferences({ navigationMode: nextMode }, options);
}

export function stepMinimapZoom(delta, options = {}) {
  const current = readHudPreferences(options.storage);
  const index = HUD_MINIMAP_ZOOMS.indexOf(current.minimapZoom);
  const nextIndex = Math.max(0, Math.min(HUD_MINIMAP_ZOOMS.length - 1, index + delta));
  return writeHudPreferences({ minimapZoom: HUD_MINIMAP_ZOOMS[nextIndex] }, options);
}
