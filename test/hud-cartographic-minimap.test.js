import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeCartographicHillshade,
  toCartographicTone,
} from '../src/editor/map/regionMapPainter.js';
import { REGION_ZOOM_CELLS } from '../src/editor/player/hud/HudRegionMap.js';

function parseRgb(css) {
  const match = /^rgb\((\d+)\s+(\d+)\s+(\d+)\)$/.exec(css);
  assert.ok(match, `expected rgb(...) string, got ${css}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

test('toCartographicTone desaturates loud biome colors into restrained cartographic tones', () => {
  const vividGreen = parseRgb(toCartographicTone('#00ff00'));
  const vividDesert = parseRgb(toCartographicTone('#ffcc22'));
  assert.ok(vividGreen[1] - vividGreen[0] < 40, 'vivid green should be strongly desaturated');
  assert.ok(vividDesert[0] <= 180 && vividDesert[2] >= 24, 'desert tone stays within cartographic range');
});

test('computeCartographicHillshade brightens NW-facing slopes and keeps water flat', () => {
  const size = 4;
  // Ramp rising toward bottom-right so NW-facing slope gets sunlit.
  const grid = new Float32Array([
    22, 24, 26, 28,
    24, 32, 38, 42,
    26, 38, 48, 54,
    0,  0,  40, 60,
  ]);
  const shade = computeCartographicHillshade(grid, size, 4);
  assert.equal(shade[3 * size + 0], 1, 'water stays flat');
  assert.ok(shade[1 * size + 1] > 0.58 && shade[1 * size + 1] <= 1.22);
});

test('REGION_ZOOM_CELLS defines increasing cell spans for close, standard, and wide presets', () => {
  assert.ok(REGION_ZOOM_CELLS.close < REGION_ZOOM_CELLS.standard);
  assert.ok(REGION_ZOOM_CELLS.standard < REGION_ZOOM_CELLS.wide);
});
