import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { float, vec3 } from 'three/tsl';
import { createSeaOpticsNodes } from '../src/editor/stylized/SeaOpticsShading.js';

const material = await readFile(new URL('../src/editor/stylized/StylizedWaterMaterial.js', import.meta.url), 'utf8');
const underwater = await readFile(new URL('../src/editor/water/UnderwaterOpticsNodes.js', import.meta.url), 'utf8');

test('TSL optical path exposes Snell refraction and stable RGB transport', () => {
  const optics = createSeaOpticsNodes(float(2), {}, 'high');
  assert.equal(optics.mode, 'singleScatter');
  assert.equal(typeof optics.pathLength(float(0.4), float(2)).mul, 'function');
  const sample = optics.sample(float(2), float(2), vec3(0, 1, 0), vec3(0, 1, 0));
  assert.equal(typeof sample.transmission.mul, 'function');
  assert.equal(typeof sample.scattered.mul, 'function');
  assert.equal(typeof sample.visibility.mul, 'function');
  assert.equal(createSeaOpticsNodes(float(2), {}, 'ultra').mode, 'directionalSingleScatter');
});

test('refracted ocean scene colour is transported once and alpha retains coverage', () => {
  assert.match(material, /seaOptics\.pathLength\(airCosine, verticalDistance\)/);
  assert.match(material, /sceneColor\.mul\(seaResponse\.transmission\)/);
  assert.match(material, /\.add\(seaResponse\.scattered\)/);
  assert.match(material, /alpha = waterCoverage\.mul\(waterlineFade\)/);
  assert.match(material, /seaResponse\.visibility\.mul\(seaResponse\.sunTransmission\.g\)/);
});

test('underwater ocean shares extinction while inland keeps its own medium', () => {
  assert.match(underwater, /seaTransmission = exp\(state\.seaExtinction\.mul\(\s*waterDistance\.min\(state\.seaSettings\.opticalDistance\.maximumMeters\)\.negate\(\)\)\)/);
  assert.match(underwater, /const inWater = mix\(inlandWater, oceanWater, state\.oceanWeight\)/);
});
