import assert from 'node:assert/strict';
import test from 'node:test';
import { Color } from 'three/webgpu';
import { createMeadowGroundPalette } from '../src/editor/stylized/meadow/meadowGroundPalette.js';
import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { createTerrainMaterialFarStyle, encodeTerrainMaterialFarColor } from '../src/editor/materials/TerrainMaterialBakeFarColor.js';

const config = {
  grass: { system: 'meadow', meadow: {
    palette: { base: '#50852b', tip: '#a6bf65', brightness: 1.2,
      byTileId: { 3: { base: '#6a7a2c', tip: '#c9bd6a' }, 254: { base: '#34563a', tip: '#8fa77a' } } },
    appearance: { groundTipMix: 0.08 },
  } },
};

test('terrain roots match blade pigment in linear light for standard and custom biome IDs', () => {
  const palette = createMeadowGroundPalette(config);
  for (const id of [0, 3, 4, 12, 32, 254]) {
    const colors = config.grass.meadow.palette.byTileId[id] ?? config.grass.meadow.palette;
    const expected = new Color(colors.base).lerp(new Color(colors.tip), 0.08).multiplyScalar(1.2);
    const actual = palette.roots.subarray(id * 3, id * 3 + 3);
    expected.toArray().forEach((channel, index) => assert.ok(Math.abs(channel - actual[index]) < 1e-7));
  }
  assert.notDeepEqual(palette.roots.subarray(9, 12), palette.roots.subarray(12, 15));
  assert.equal(palette.roots.byteLength + palette.tips.byteLength, 6144);
});

test('non-meadow and shared-tuning configurations retain their terrain style', () => {
  assert.equal(createMeadowGroundPalette({}), null);
  assert.equal(createMeadowGroundPalette({ grass: { ...config.grass, system: 'clump' } }), null);
  assert.equal(createMeadowGroundPalette({ grass: { system: 'meadow', meadow: {} } }), null);
  assert.equal(createMeadowGroundPalette({ grass: { system: 'meadow', meadow: { ...config.grass.meadow, enabled: false } } }), null);
});

test('far color uses source biome alpha and preserves rock, snow and dirt weights', () => {
  const palette = createMeadowGroundPalette(config);
  const style = createTerrainMaterialFarStyle({
    grassBottomColor: '#ffffff', grassBrightness: 4, meadowGroundColors: palette.roots,
    dirtColor: '#806040', forestColor: '#273c25',
  }, {
    rockColor: '#808080', snowColor: '#ffffff', shorelineColor: '#806040',
    grassTintStrength: 0, wetDarkening: 0, shorelineStrength: 0, canopyStrength: 0,
  });
  const encode = (id, weights) => {
    const result = new Uint8Array(4);
    encodeTerrainMaterialFarColor(result, 0, new Uint8Array([255, 0, 255, id]), 0, style,
      ...weights, 1, 1, 1, 0, 0, 0, 1);
    return result;
  };
  for (const id of [3, 4, 254]) {
    const expected = new Color().fromArray(palette.roots, id * 3).getHexString();
    assert.deepEqual([...encode(id, [1, 0, 0, 0]).slice(0, 3)],
      [0, 2, 4].map(offset => Number.parseInt(expected.slice(offset, offset + 2), 16)));
  }
  assert.deepEqual(encode(3, [0, 0, 1, 0]), encode(4, [0, 0, 1, 0]));
  assert.deepEqual(encode(3, [0, 1, 0, 0]), new Uint8Array([128, 96, 64, 255]));
  assert.deepEqual(encode(3, [0, 0, 0, 1]), new Uint8Array([255, 255, 255, 255]));
});

test('dry-patch settings reject invalid colors, reversed thresholds and unbounded strength', () => {
  for (const appearance of [{ dryColor: 'green' }, { dryStart: 0.9 }, { dryStrength: 1.1 }, { dryPatchScale: -1 }]) {
    assert.throws(() => resolveMeadowGrassConfig({ appearance }), /Invalid editor configuration/);
  }
  assert.equal(resolveMeadowGrassConfig({ appearance: { dryStrength: 0 } }).appearance.dryStrength, 0);
});
