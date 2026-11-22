import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { positionWorld } from 'three/tsl';
import { buildShader, shaderTestRenderer } from '../test/helpers/buildShader.js';
import { SnowCover } from '../src/editor/weather/storm/SnowCover.js';
import { stormSnowCoverUniform } from '../src/editor/weather/storm/stormGroundUniforms.js';
import {
  DEFAULT_SNOW_FIELD, registerSnowFieldConfig, resolveSnowFieldConfig,
} from '../src/editor/weather/storm/snowField/snowFieldConfig.js';
import {
  snapWindowCenter, stormSnowCoverAt, stormSnowCoverAtCanonical,
} from '../src/editor/weather/storm/snowField/snowFieldState.js';
import {
  DRIFT_STEP_METRES, driftPatternOrigin, SnowFieldPass, steppedDriftOffset,
} from '../src/editor/weather/storm/snowField/SnowFieldPass.js';
import { createAlpineRockMaterial } from '../src/editor/stylized/alpine/AlpineRockMaterial.js';

const shipped = yaml.load(readFileSync(new URL('../config/weather-effects.yaml', import.meta.url), 'utf8')).snowField;
const off = resolveSnowFieldConfig({ enabled: false });
const on = resolveSnowFieldConfig({ enabled: true });

test('shipped snow field config resolves; bad values and unknown keys are refused', () => {
  assert.deepEqual({ ...resolveSnowFieldConfig(shipped) }, { ...DEFAULT_SNOW_FIELD, ...shipped });
  assert.throws(() => resolveSnowFieldConfig({ leeGain: -1 }), /leeGain/);
  assert.throws(() => resolveSnowFieldConfig({ resolution: 64.5 }), /resolution/);
  assert.throws(() => resolveSnowFieldConfig({ enabled: 'yes' }), /enabled/);
  assert.throws(() => resolveSnowFieldConfig({ typo: 1 }), /typo/);
  assert.equal(resolveSnowFieldConfig({ enabled: true }, '?snowField=0').enabled, false);
  assert.equal(resolveSnowFieldConfig({ enabled: false }, '?snowField=1').enabled, true);
});

test('off, every coverage reader gets the global cover uniform itself', () => {
  registerSnowFieldConfig(off);
  try {
    assert.equal(stormSnowCoverAt(positionWorld.xz), stormSnowCoverUniform);
    assert.equal(stormSnowCoverAtCanonical(positionWorld.xz), stormSnowCoverUniform);
    const wgsl = buildShader(new THREE.Mesh(new THREE.BoxGeometry(), createAlpineRockMaterial())).fragmentShader;
    assert.doesNotMatch(wgsl, /storm-snow-field|stormSnowField/);
  } finally {
    registerSnowFieldConfig(resolveSnowFieldConfig());
  }
});

test('on, readers and the field pass compile for WebGPU and WebGL', () => {
  registerSnowFieldConfig(on);
  try {
    assert.notEqual(stormSnowCoverAt(positionWorld.xz), stormSnowCoverUniform);
    for (const forceWebGL of [false, true]) {
      const renderer = shaderTestRenderer({ forceWebGL });
      buildShader(new THREE.Mesh(new THREE.BoxGeometry(), createAlpineRockMaterial()), renderer);
      const pass = new SnowFieldPass({ config: on, getHeight: () => 0 });
      buildShader(new THREE.Mesh(new THREE.PlaneGeometry(), pass.material), renderer);
      pass.dispose();
    }
  } finally {
    registerSnowFieldConfig(resolveSnowFieldConfig());
  }
});

test('the window snaps to whole texels in canonical metres at any distance', () => {
  const texel = 4;
  for (const [x, z] of [[0, 0], [1.9, -2.1], [4_000_001.3, -3_999_998.7]]) {
    const c = snapWindowCenter(x, z, texel);
    assert.ok(c.x % texel === 0 && c.z % texel === 0);
    assert.ok(Math.abs(c.x - x) <= texel / 2 && Math.abs(c.z - z) <= texel / 2);
  }
});

test('the drift origin is exact at planet scale and seamless as the window steps', () => {
  const [dirX, dirZ] = [Math.cos(0.7), Math.sin(0.7)];
  const along = 70, across = 18;
  const pattern = (x, z) => [((x * dirX + z * dirZ) / along), ((z * dirX - x * dirZ) / across)];
  for (const [cx, cz] of [[0, 0], [4_000_000, -4_000_000]]) {
    const [u0, v0] = driftPatternOrigin(cx, cz, 0, 0, dirX, dirZ, along, across);
    const [u1, v1] = driftPatternOrigin(cx + 4, cz, 0, 0, dirX, dirZ, along, across);
    // One texel east moves the origin by that texel's local pattern offset, modulo the period.
    const [du, dv] = pattern(4, 0);
    assert.ok(Math.abs(((u1 - u0 - du) % 512 + 512 + 256) % 512 - 256) < 1e-6);
    assert.ok(Math.abs(((v1 - v0 - dv) % 512 + 512 + 256) % 512 - 256) < 1e-6);
    assert.ok(u0 >= 0 && u0 < 512 && v0 >= 0 && v0 < 512);
  }
  // Drifting downwind by d shifts the pattern back by d along the wind.
  const [a] = driftPatternOrigin(100, 50, 0, 0, dirX, dirZ, along, across);
  const [b] = driftPatternOrigin(100, 50, dirX * 7, dirZ * 7, dirX, dirZ, along, across);
  assert.ok(Math.abs(a - b - 0.1) < 1e-9);
});

test('SnowCover hands over to the melt pattern only while thawing, and QA can hold a thaw', () => {
  const cover = new SnowCover({ buildSeconds: 10, meltSeconds: 10, holdShare: 0.3, meltPhaseSeconds: 2 });
  for (let i = 0; i < 20; i++) cover.update(1, 1, 0);
  assert.equal(cover.value, 1);
  assert.equal(cover.melting, 0, 'building never melts');
  cover.update(1, 0, 0);
  assert.equal(cover.melting, 0.5);
  cover.update(1, 0, 0);
  assert.equal(cover.melting, 1);
  cover.update(1, 0, 0.5);
  assert.equal(cover.melting, 0.5, 'snow country holds: the phase eases back');
  cover.snap(1);
  assert.equal(cover.melting, 0);
  cover.frozen = { value: 0.4, melting: 1 };
  assert.equal(cover.update(1, 1, 0), 0.4);
  assert.equal(cover.snap(1), 0.4);
  assert.equal(cover.melting, 1);
});

test('clear weather builds no ground patch; the drift and a thaw redraw only a step at a time', () => {
  const pass = new SnowFieldPass({ config: on, getHeight: () => 0 });
  const zero = { x: 0, z: 0 };
  const calm = { cover: 0, melting: 0, snowFall: 0 };
  for (let i = 0; i < 5; i++) pass.update(0.1, zero, zero, calm);
  assert.equal(pass.ground.job, null);
  assert.equal(pass.ground.ready, false, 'no cover: the patch is never started');
  pass.update(0.1, zero, zero, { ...calm, cover: 0.5 });
  assert.ok(pass.ground.job || pass.ground.ready, 'the first cover starts it');
  pass.ground.rebuild(zero, zero);

  assert.equal(steppedDriftOffset(0.12), 0);
  assert.equal(steppedDriftOffset(0.13), DRIFT_STEP_METRES);
  assert.equal(steppedDriftOffset(-0.6), -0.5);
  // Snowing: the key holds until the drift has crept a whole step.
  const snowing = { cover: 1, melting: 0, snowFall: 1 };
  pass.update(0, zero, zero, snowing);
  const keys = new Set();
  for (let i = 0; i < 60; i++) { pass.update(1 / 60, zero, zero, snowing); keys.add(pass.nextKey); }
  const crept = Math.hypot(pass.offset.x, pass.offset.z);
  assert.ok(crept > 0, 'the drift creeps');
  assert.ok(keys.size <= Math.ceil(crept / DRIFT_STEP_METRES) + 2, `${keys.size} redraws for ${crept.toFixed(2)} m`);
  // Thawing: a couple of redraws a second, not one a frame.
  keys.clear();
  for (let i = 0; i < 60; i++) { pass.update(1 / 60, zero, zero, { cover: 0.5, melting: 1, snowFall: 0 }); keys.add(pass.nextKey); }
  assert.ok(keys.size <= 3, `${keys.size} thaw redraws in a second`);
  pass.dispose();
});
