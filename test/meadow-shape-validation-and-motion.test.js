import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MEADOW_GRASS_SHAPES,
  MEADOW_PLANT_SHAPES,
  meadowGrowthResponse,
  meadowShapeId,
  resolveShapeTable,
} from '../src/editor/stylized/meadow/meadowGrassShapes.js';
import {
  MEADOW_GROWTH_DEFAULTS,
  resolveMeadowGrowth,
} from '../src/editor/stylized/meadow/meadowGrowthProfiles.js';
import { meadowPlantMotion } from '../src/editor/stylized/meadow/meadowPlantMotionNodes.js';

test('invalid and inherited biome shapes cannot silently become slender grass', () => {
  const inherited = ['constructor', 'toString', '__proto__', 'valueOf'];
  for (const name of inherited) {
    assert.equal(meadowShapeId(name), MEADOW_GRASS_SHAPES.slender.id);
    assert.throws(() => resolveShapeTable({}, name), /shapes\.default/);
    assert.throws(() => resolveShapeTable({ 4: name }), /shapes\.byTileId\.4/);
  }
  for (const name of ['fern', '', null, 12]) {
    assert.throws(() => resolveShapeTable({}, name), /shapes\.default/);
  }
  assert.equal(resolveShapeTable({}, undefined)[4], MEADOW_GRASS_SHAPES.slender.id);
  assert.deepEqual(
    Array.from(resolveShapeTable({ 4: 'reed', 7: 'broadleaf' })),
    Array.from({ length: 256 }, (_, id) => id === 4 ? 1 : id === 7 ? 2 : 0),
  );
});

test('accent plant shapes never include inherited object properties', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'valueOf', 'unknown']) {
    assert.throws(
      () => resolveMeadowGrowth({ byTileId: { 4: { accents: [{ shape: name, share: 0.2 }] } } }),
      /byTileId\.4\.accents\.0\.shape/,
    );
    assert.throws(() => meadowPlantMotion(name), /Unknown meadow plant shape/);
  }
  for (const shape of Object.keys(MEADOW_PLANT_SHAPES)) {
    const profile = resolveMeadowGrowth({ byTileId: { 4: { accents: [{ shape, share: 0.2 }] } } })
      .profiles[0];
    assert.equal(profile.accents[0].shape, shape);
    assert.ok(meadowPlantMotion(shape).every(Number.isFinite));
  }
});

test('growth settings reject ignored keys and invalid object types', () => {
  for (const source of [null, false, [], 'grass']) {
    assert.throws(() => resolveMeadowGrowth(source), /grass\.meadow\.growth/);
  }
  for (const source of [
    { byTileId: null }, { byTileId: [] }, { byTileId: 'grass' },
    { byTileId: { 4: null } }, { byTileId: { 4: [] } },
    { byTileId: { 4: 'grass' } }, { byTileId: { 4: { tallHeigth: 0.8 } } },
    { byTileId: { 4: { accent: [] } } },
  ]) {
    assert.throws(() => resolveMeadowGrowth(source), /grass\.meadow\.growth/);
  }
  assert.throws(() => resolveMeadowGrowth({ patches: {} }), /grass\.meadow\.growth\.patches/);
});

test('profile and accent values require finite numbers rather than coerced strings or booleans', () => {
  for (const areaStyle of ['0.5', true, false, Infinity]) {
    assert.throws(
      () => resolveMeadowGrowth({ byTileId: { 4: { areaStyle } } }),
      /byTileId\.4\.areaStyle/,
    );
  }
  for (const [field, value] of [
    ['share', '0.2'], ['share', true], ['share', Number.NaN],
    ['height', '1.5'], ['height', false], ['height', Infinity],
    ['width', '1.3'], ['width', true], ['width', -0.5],
  ]) {
    assert.throws(
      () => resolveMeadowGrowth({
        byTileId: { 4: { accents: [{ shape: 'reed', share: 0.15, [field]: value }] } },
      }),
      new RegExp(`byTileId\\.4\\.accents\\.0\\.${field}`),
    );
  }
  for (const invalid of [null, true, [], 12, { shape: 'reed', share: 0.2, heigth: 1.4 }]) {
    assert.throws(
      () => resolveMeadowGrowth({ byTileId: { 4: { accents: [invalid] } } }),
      /byTileId\.4\.accents\.0/,
    );
  }
});

test('every accent inherits finite shape-specific motion without increasing its envelope', () => {
  for (const name of Object.keys(MEADOW_PLANT_SHAPES)) {
    const [wind, rest, curve] = meadowPlantMotion(name);
    assert.ok([wind, rest, curve].every(value => value > 0 && value <= 1), name);
  }
  assert.deepEqual(meadowPlantMotion('lance'), meadowPlantMotion('broadleaf'));
  assert.deepEqual(meadowPlantMotion('strap'), meadowPlantMotion('reed'));
  for (const name of ['slender', 'reed', 'broadleaf']) {
    assert.deepEqual(meadowPlantMotion(name), meadowGrowthResponse({
      ...MEADOW_GROWTH_DEFAULTS[4], shape: name,
    }).slice(1), name);
  }
});

test('biome base motion remains packed, while actual accent shape changes shader motion', () => {
  const source = new URL('../src/editor/stylized/meadow/', import.meta.url);
  const growth = readFileSync(new URL('meadowGrowthNodes.js', source), 'utf8');
  const shapes = readFileSync(new URL('meadowPlantMotionNodes.js', source), 'utf8');
  assert.match(growth, /plant\.shape\.equal\(instance\.shape\)/);
  assert.match(growth, /\.select\(response\.yzw,meadowPlantMotionNodes\(plant\.shape\)\)/);
  assert.match(growth, /wind:motion\.x\.mul\(micro\.wind\),rest:motion\.y,curve:motion\.z/);
  assert.doesNotMatch(shapes, /texture\(|uniformArray\(/);
});
