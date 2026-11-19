import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { resolveMeadowGrowth } from '../src/editor/stylized/meadow/meadowGrowthProfiles.js';
import { MEADOW_GRASS_SHAPES, MEADOW_SHAPE_COUNT, meadowShapeId } from '../src/editor/stylized/meadow/meadowGrassShapes.js';
import { meadowPageGrowthKey, reconcileMeadowGrowth } from '../src/editor/stylized/meadow/MeadowGrowthUpdates.js';
import { encodeLookTable } from '../src/editor/stylized/meadow/meadowPalettes.js';
import { createMeadowUniforms } from '../src/editor/stylized/meadow/meadowUniforms.js';

const at = (growth, id) => growth.profiles[growth.table[id]];
const lookShape = (settings, id) => settings.shapeTable[id] % MEADOW_SHAPE_COUNT;

test('legacy per-biome shape overrides change real geometry and wind profiles', () => {
  const settings = resolveMeadowGrassConfig({ shapes: { byTileId: { 10: 'reed' } } });
  assert.equal(at(settings.growth, 10).shape, 'reed');
  assert.equal(lookShape(settings, 10), meadowShapeId('reed'));
  assert.equal(at(settings.growth, 4).shape, 'slender');
  const uniforms = createMeadowUniforms(settings);
  const motion = uniforms.growth.density.array[settings.growth.table[10]].toArray();
  assert.equal(motion[1], MEADOW_GRASS_SHAPES.reed.wind);
  assert.equal(motion[2], MEADOW_GRASS_SHAPES.reed.rest);
  assert.equal(motion[3], MEADOW_GRASS_SHAPES.reed.curve);
});

test('explicit growth shape wins against legacy shape override', () => {
  const settings = resolveMeadowGrassConfig({
    shapes: { byTileId: { 10: 'reed' } },
    growth: { byTileId: { 10: { shape: 'broadleaf' } } },
  });
  assert.equal(at(settings.growth, 10).shape, 'broadleaf');
  assert.equal(lookShape(settings, 10), meadowShapeId('broadleaf'));
});

test('legacy default shape applies only to unlisted fallback biomes', () => {
  const settings = resolveMeadowGrassConfig({ shapes: { default: 'broadleaf' } });
  assert.equal(at(settings.growth, 254).shape, 'broadleaf');
  assert.equal(at(settings.growth, 4).shape, 'slender');
  assert.equal(at(settings.growth, 12).shape, 'reed');
  assert.equal(lookShape(settings, 254), meadowShapeId('broadleaf'));
  assert.equal(lookShape(settings, 4), meadowShapeId('slender'));
});

test('live growth changes preserve shapes-only overrides and unaffected page revisions', () => {
  const shapes = { default: 'slender', byTileId: { 10: 'reed' } };
  const previous = resolveMeadowGrowth({}, undefined, shapes);
  const updated = resolveMeadowGrowth({ byTileId: { 10: { density: 0.36 } } }, undefined, shapes);
  const remapped = reconcileMeadowGrowth(previous, updated);
  const looks = growth => encodeLookTable(growth.shapes, null, growth.table);
  assert.equal(at(remapped, 10).shape, 'reed');
  assert.equal(at(remapped, 10).density, 0.36);
  assert.notEqual(
    meadowPageGrowthKey(Uint8Array.of(10), previous, looks(previous)),
    meadowPageGrowthKey(Uint8Array.of(10), remapped, looks(remapped)),
  );
  for (const id of [3, 4, 5, 7, 9, 12, 254]) {
    assert.equal(at(previous, id).shape, at(remapped, id).shape);
    assert.equal(
      meadowPageGrowthKey(Uint8Array.of(id), previous, looks(previous)),
      meadowPageGrowthKey(Uint8Array.of(id), remapped, looks(remapped)),
    );
  }
});

test('invalid legacy shape records fail instead of falling back silently', () => {
  for (const shapes of [null, false, [], 'slender', { byTileId: [] }, { byTileId: null },
    { default: 'constructor' }, { byTileId: { 10: 'valueOf' } }, { undeclared: 1 }]) {
    assert.throws(() => resolveMeadowGrassConfig({ shapes }), /meadow\.shapes|unknown shape/);
  }
});

test('live meadow updates pass the same legacy shape source to the resolver', () => {
  const source = readFileSync(new URL('../src/editor/stylized/meadow/MeadowGrassField.js', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../src/editor/stylized/meadow/meadowGrassConfig.js', import.meta.url), 'utf8');
  assert.match(source, /this\.shapeOverrides = config\.grass\?\.meadow\?\.shapes/);
  assert.match(source, /resolveMeadowGrowth\(source,undefined,this\.shapeOverrides\)/);
  assert.match(config, /resolveMeadowGrowth\(source\.growth, undefined, source\.shapes == null \? null : shapes\)/);
});
