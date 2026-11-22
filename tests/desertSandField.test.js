import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, vec4 } from 'three/tsl';
import { buildShader, shaderTestRenderer } from '../test/helpers/buildShader.js';
import { SandCover } from '../src/editor/weather/storm/SandCover.js';
import { stormTargetForSettings } from '../src/editor/weather/storm/StormState.js';
import {
  DEFAULT_SAND_FIELD, registerSandFieldConfig, resolveSandFieldConfig,
} from '../src/editor/weather/storm/snowField/sandFieldConfig.js';
import { resolveSnowFieldConfig } from '../src/editor/weather/storm/snowField/snowFieldConfig.js';
import { SnowFieldPass } from '../src/editor/weather/storm/snowField/SnowFieldPass.js';
import { stormSandDrift, stormSandFieldSample, withFreshSandColor, withStormSand } from '../src/editor/materials/TerrainStormSandNodes.js';
import { withStormSnow } from '../src/editor/materials/TerrainStormSnowNodes.js';
import { createSandstormNodeMaterial } from '../src/editor/weather/rainNodeMaterial.js';
import { sandstormGust } from '../src/editor/weather/sandstorm_system.js';
import { resolveBiomeLooks } from '../src/editor/biomes/BiomeLooks.js';

const shipped = yaml.load(readFileSync(new URL('../config/weather-effects.yaml', import.meta.url), 'utf8')).sandField;
const biomeLooks = yaml.load(readFileSync(new URL('../config/biome-looks.yaml', import.meta.url), 'utf8')).biomeLooks;
const off = resolveSandFieldConfig({ enabled: false });
const on = resolveSandFieldConfig({ enabled: true });
const snow = resolveSnowFieldConfig({ enabled: true });
const withSand = (config, run) => {
  registerSandFieldConfig(config);
  try { return run(); } finally { registerSandFieldConfig(resolveSandFieldConfig()); }
};
const wgsl = (material, renderer) => buildShader(new THREE.Mesh(new THREE.PlaneGeometry(), material), renderer);

test('shipped sand field config resolves; bad values and unknown keys are refused', () => {
  assert.deepEqual({ ...resolveSandFieldConfig(shipped) }, { ...DEFAULT_SAND_FIELD, ...shipped });
  assert.throws(() => resolveSandFieldConfig({ leeGain: -1 }), /leeGain/);
  assert.throws(() => resolveSandFieldConfig({ fadeSeconds: 0 }), /fadeSeconds/);
  assert.throws(() => resolveSandFieldConfig({ enabled: 1 }), /enabled/);
  assert.throws(() => resolveSandFieldConfig({ typo: 1 }), /typo/);
  assert.equal(resolveSandFieldConfig({ enabled: true }, '?sandField=0').enabled, false);
  assert.equal(resolveSandFieldConfig({ enabled: false }, '?sandField=1').enabled, true);
});

test('desert is the biome-looks arid sand rows, not code', () => {
  const { arid } = resolveBiomeLooks(biomeLooks);
  assert.ok(arid.sand.includes(1), 'hot desert lies on sand');
  assert.ok(!arid.sand.includes(2), 'cold desert is mineral ground');
});

test('off, the field pass, the dust and the terrain weights compile as before', () => {
  withSand(off, () => {
    const renderer = shaderTestRenderer();
    const before = new SnowFieldPass({ config: snow, getHeight: () => 0 });
    const after = new SnowFieldPass({ config: snow, sand: off, getHeight: () => 0 });
    assert.equal(wgsl(after.material, renderer).fragmentShader, wgsl(before.material, renderer).fragmentShader);
    before.dispose();
    after.dispose();
    assert.equal(stormSandFieldSample({ sand: [1] }), null);
    const weights = vec4(0.25);
    assert.equal(withStormSand(weights, null), weights);
    const color = weights.rgb;
    assert.equal(withFreshSandColor(color, null), color);
    assert.doesNotMatch(wgsl(createSandstormNodeMaterial().material, renderer).vertexShader, /texture/i);
  });
});

test('on, the pass, the dust fetch and the terrain weights compile for WebGPU and WebGL', () => {
  withSand(on, () => {
    for (const forceWebGL of [false, true]) {
      const renderer = shaderTestRenderer({ forceWebGL });
      const pass = new SnowFieldPass({ config: snow, sand: on, getHeight: () => 0 });
      wgsl(pass.material, renderer);
      pass.dispose();
      const dust = wgsl(createSandstormNodeMaterial().material, renderer);
      if (!forceWebGL) assert.match(dust.vertexShader, /textureSampleLevel/);
      const field = stormSandFieldSample({ sand: [1, 32] });
      assert.ok(field);
      const samples = { terrainShape: vec4(0.2, 0, 0, 0), canopyWater: vec4(0), macroTint: vec4(0.5) };
      // Sand first, then storm snow over it, sharing the one field fetch (as the terrain does).
      const drift = stormSandDrift(samples, float(1), { sand: [1, 32] }, field);
      const weights = withStormSnow(withStormSand(vec4(0.4, 0.2, 0.3, 0.1), drift), samples, field);
      const material = new THREE.MeshBasicNodeMaterial();
      material.colorNode = withFreshSandColor(weights.rgb, drift);
      wgsl(material, renderer);
    }
  });
});

test('SandCover builds under a sandstorm, blows away slowly, and QA can hold it', () => {
  const cover = new SandCover({ buildSeconds: 10, fadeSeconds: 100 });
  for (let i = 0; i < 20; i++) cover.update(1, 1);
  assert.equal(cover.value, 1);
  cover.update(10, 0);
  assert.ok(Math.abs(cover.value - 0.9) < 1e-12, 'fades at 1/fadeSeconds');
  cover.update(1, 1.6);
  assert.ok(cover.value <= 1, 'QA gains above 1 clamp');
  assert.equal(cover.snap(0.4), 0.4);
  cover.frozen = { value: 0.7 };
  assert.equal(cover.update(1, 0), 0.7);
  assert.equal(cover.snap(1), 0.7);
});

test('a sandstorm is a gale for the world wind; its dust rides the gust over the mean', () => {
  assert.equal(stormTargetForSettings({ weatherMode: 'sandstorm', weatherIntensity: 0.8 }).wind, 0.8);
  const uniforms = { prevailingStrength: { value: 0.36 }, referenceStrength: { value: 0.18 } };
  assert.equal(sandstormGust({ envelope: 2 }, uniforms), 1, 'the mean wind keeps the authored speed');
  assert.equal(sandstormGust({ envelope: 3 }, uniforms), 1.5);
  assert.equal(sandstormGust({ envelope: 100 }, uniforms), 2.5);
  assert.equal(sandstormGust({ envelope: Number.NaN }, uniforms), 1);
});
