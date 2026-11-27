/**
 * Canonical Drusniel dark-fantasy design tokens.
 * Mirrored against config/ui-tokens.yaml in test/ui-design-tokens.test.js.
 */

export const DRUSNIEL_TOKENS = Object.freeze({
  palette: Object.freeze({
    obsidian: '#151B20',
    slate: '#303A40',
    antiqueGold: '#B8A176',
    parchment: '#E5DCC8',
    bloodstone: '#A34D49',
    arcaneBlue: '#729BBC',
    stamina: '#839A67',
    mysticViolet: '#A08ABF',
    mutedSilver: '#A6ADB0',
  }),
  spacing: Object.freeze([4, 8, 12, 16, 24, 32]),
  radii: Object.freeze({ xs: 2, sm: 4, md: 6 }),
  motion: Object.freeze({
    fastMs: 120,
    normalMs: 180,
    slowMs: 240,
    notificationDefaultMs: 4200,
  }),
});

export const HUD_SCALE_OPTIONS = Object.freeze([0.85, 1, 1.15, 1.25]);

export const HUD_NAVIGATION_MODES = Object.freeze(['full', 'compass', 'immersive']);

export const HUD_MINIMAP_ZOOMS = Object.freeze(['close', 'standard', 'wide']);

export const HUD_CONTEXT_MODES = Object.freeze([
  'exploration',
  'combat',
  'immersive',
  'scenic-tour',
  'building',
]);
