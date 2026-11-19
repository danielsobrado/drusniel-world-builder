import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'js-yaml';

import {
  MEADOW_NORMAL_DEFAULTS,
  meadowBentNormalNumber,
  resolveMeadowNormals,
} from '../src/editor/stylized/meadow/meadowBladeNormals.js';
import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { createMeadowUniforms } from '../src/editor/stylized/meadow/meadowUniforms.js';

const surface = load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8')).stylizedSurface;
const up = [0, 1, 0];
const normal = (centerline, ratio = 1, distance = 0, settings = MEADOW_NORMAL_DEFAULTS) =>
  meadowBentNormalNumber(up, centerline, ratio, 1, distance, settings);

test('meadow normal configuration resolves and populates shared uniforms', () => {
  const settings = resolveMeadowGrassConfig(surface.grass.meadow);
  assert.deepEqual(settings.normals, MEADOW_NORMAL_DEFAULTS);
  const uniforms = createMeadowUniforms(settings);
  for (const [key, value] of Object.entries(settings.normals)) {
    assert.equal(uniforms.normals[key].value, value);
  }
});

test('invalid normal controls are rejected with precise paths', () => {
  for (const invalid of [null, false, [], 12, 'off']) {
    assert.throws(() => resolveMeadowNormals(invalid), /meadow.normals/);
  }
  for (const [key, value] of [
    ['strength', -0.01], ['strength', 1.01],
    ['slopeScale', 2.01], ['maxSlope', 0],
    ['fadeStart', -1], ['fadeEnd', 401], ['unknown', 1],
  ]) {
    assert.throws(() => resolveMeadowNormals({ [key]: value }), /meadow.normals/);
  }
  assert.throws(() => resolveMeadowNormals({ fadeStart: 38, fadeEnd: 38 }), /fadeEnd/);
  assert.throws(() => resolveMeadowNormals({ fadeStart: 50, fadeEnd: 30 }), /fadeEnd/);
});

test('straight stems keep their baseline and bent stems shade opposite their curve', () => {
  assert.deepEqual(normal([0, 1, 0]), up);
  const leaningX = normal([0.5, 0.85, 0]);
  const leaningZ = normal([0, 0.85, -0.5]);
  assert.ok(leaningX[0] < -0.1);
  assert.ok(leaningZ[2] > 0.1);
  assert.ok(leaningX[1] > 0 && leaningX[1] < 1);
});

test('disabled, rooted and distant deformation preserves original shading', () => {
  assert.deepEqual(normal([0.8, 0.2, 0], 0), up);
  assert.deepEqual(normal([0.8, 0.2, 0], 1, 100), up);
  assert.deepEqual(normal([0.8, 0.2, 0], 1, 0, { ...MEADOW_NORMAL_DEFAULTS, strength: 0 }), up);
  assert.deepEqual(normal([0.8, 0.2, 0], 1, 0, { ...MEADOW_NORMAL_DEFAULTS, slopeScale: 0 }), up);
});

test('normal orientation is rotationally consistent in the horizontal plane', () => {
  const x = normal([0.35, 0.65, 0.1]);
  const z = normal([-0.1, 0.65, 0.35]);
  assert.ok(Math.abs(x[0] - z[2]) < 1e-10);
  assert.ok(Math.abs(x[2] + z[0]) < 1e-10);
  assert.ok(Math.abs(x[1] - z[1]) < 1e-10);
});

test('strong folds, gusts and tiny stems always produce finite unit normals', () => {
  for (let i = 0; i < 10000; i += 1) {
    const phase = i * 0.019;
    const c = [
      Math.cos(phase) * (0.1 + (i % 17) / 8),
      Math.sin(phase * 0.4) * 0.6,
      Math.sin(phase) * (0.1 + (i % 19) / 9),
    ];
    const ratio = (i % 101) / 100;
    const sample = meadowBentNormalNumber(up, c, ratio, i % 10 === 0 ? 0 : 0.6, i % 50);
    assert.ok(sample.every(Number.isFinite), 'normal components must remain finite');
    assert.ok(Math.abs(Math.hypot(...sample) - 1) < 1e-10, 'normal must have unit length');
  }
});

test('lighting responds to the final normal while silhouette and shadow paths remain unchanged', () => {
  const root = new URL('../src/editor/stylized/meadow/', import.meta.url);
  const material = readFileSync(new URL('meadowBladeMaterial.js', root), 'utf8');
  const shape = readFileSync(new URL('meadowBladeShape.js', root), 'utf8');
  const normals = readFileSync(new URL('meadowBladeNormals.js', root), 'utf8');
  assert.match(material, /varyingProperty\('vec3', 'meadowBentNormal'\)/);
  assert.match(material, /spellLightIrradiance\(positionWorld, worldNormal\)/);
  assert.match(material, /receivedShadowPositionNode = position/);
  assert.match(shape, /centerline: local\.sub\(ribbon\)/);
  assert.match(shape, /foldUnderBody\(blade,local,ribbon,height,r,uniforms,interaction\)/);
  assert.doesNotMatch(normals, /sampleWorldWind|texture\(/, 'no duplicate field sampling');
});
