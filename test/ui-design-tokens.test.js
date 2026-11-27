import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import yaml from 'js-yaml';
import {
  DRUSNIEL_TOKENS,
  HUD_CONTEXT_MODES,
  HUD_MINIMAP_ZOOMS,
  HUD_NAVIGATION_MODES,
  HUD_SCALE_OPTIONS,
} from '../src/ui/design-system/tokens.js';

const yamlSource = await readFile(new URL('../config/ui-tokens.yaml', import.meta.url), 'utf8');
const parsedYaml = yaml.load(yamlSource);
const tokensCss = await readFile(new URL('../src/ui/design-system/tokens.css', import.meta.url), 'utf8');
const typographyCss = await readFile(new URL('../src/ui/design-system/typography.css', import.meta.url), 'utf8');
const playerHudCss = await readFile(new URL('../src/editor/player/hud/playerHud.css', import.meta.url), 'utf8');
const worldMapCss = await readFile(new URL('../src/editor/map/worldMap.css', import.meta.url), 'utf8');

test('config/ui-tokens.yaml and tokens.js define identical palette, spacing, radii, and HUD enums', () => {
  assert.deepEqual(parsedYaml.palette, DRUSNIEL_TOKENS.palette);
  assert.deepEqual(parsedYaml.spacing, DRUSNIEL_TOKENS.spacing);
  assert.deepEqual(parsedYaml.radii, DRUSNIEL_TOKENS.radii);
  assert.deepEqual(parsedYaml.motion, DRUSNIEL_TOKENS.motion);
  assert.deepEqual(parsedYaml.hud.scales, HUD_SCALE_OPTIONS);
  assert.deepEqual(parsedYaml.hud.navigationModes, HUD_NAVIGATION_MODES);
  assert.deepEqual(parsedYaml.hud.minimapZooms, HUD_MINIMAP_ZOOMS);
  assert.deepEqual(parsedYaml.hud.contextModes, HUD_CONTEXT_MODES);
});

test('tokens.css mirrors every Drusniel palette hex color', () => {
  for (const hex of Object.values(DRUSNIEL_TOKENS.palette)) {
    assert.ok(
      tokensCss.toLowerCase().includes(hex.toLowerCase()),
      `tokens.css missing palette hex ${hex}`,
    );
  }
});

test('typography.css only references font files that exist in public/assets/fonts', async () => {
  const matches = [...typographyCss.matchAll(/url\("\/assets\/fonts\/([^"]+)"\)/g)];
  assert.ok(matches.length >= 4);
  for (const [, fileName] of matches) {
    const content = await readFile(new URL(`../public/assets/fonts/${fileName}`, import.meta.url));
    assert.ok(content.byteLength > 1024, `${fileName} should be non-empty`);
  }
});

test('gameplay HUD and world map overlays avoid expensive backdrop-filter blur', () => {
  assert.doesNotMatch(playerHudCss, /backdrop-filter\s*:\s*blur/i);
  assert.doesNotMatch(worldMapCss, /backdrop-filter\s*:\s*blur/i);
});
