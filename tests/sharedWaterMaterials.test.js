import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { DataTexture, Vector2 } from 'three/webgpu';
import { uniform, uv } from 'three/tsl';
import { SharedWaterMaterials, WATER_SLOT_OPTIONS } from '../src/editor/stylized/SharedWaterMaterials.js';
import { createWaterPatternOrigins } from '../src/editor/stylized/WaterPatternOrigins.js';
import { applyWaterVisualConfig } from '../src/editor/water/WaterVisualConfig.js';

test('shared water graphs select each chunk texture, origin and wave phase at draw time', () => {
  const config = yaml.load(fs.readFileSync('editor.config.yaml', 'utf8'));
  applyWaterVisualConfig(config, yaml.load(fs.readFileSync('config/water-visual.yaml', 'utf8')));
  const water = config.stylizedSurface.water;
  const make = n => ({
    surfaceMaskTexture: new DataTexture(new Uint8Array(4), 1, 1),
    waterFieldTexture: new DataTexture(new Uint8Array(4), 1, 1),
    waterFlowTexture: new DataTexture(new Uint8Array(4), 1, 1),
    waterFieldSize: 2, chunkWorldSize: 128, config: { water },
    waterSurfaceOrigin: uniform(n), time: uniform(n), chunkCenter: uniform(new Vector2(n, -n)),
    rippleOrigin: uniform(new Vector2(n, n)), patternOrigin: uniform(new Vector2(-n, n)),
    seaPhaseOrigin: [uniform(n), uniform(n + 1), uniform(n + 2)],
    surfacePatterns: createWaterPatternOrigins(water),
  });
  const first = make(1), second = make(200);
  second.surfacePatterns.update(1000, -2000);
  const pool = new SharedWaterMaterials();
  const plain = pool.get(first, false);
  assert.strictEqual(pool.get(second, false), plain);
  const refractive = pool.get(second, true);
  assert.notStrictEqual(refractive, plain);
  assert.equal(pool.materials.size, 2);
  const textureNodes = ['surfaceMaskTexture', 'waterFieldTexture', 'waterFlowTexture']
    .map(name => [name, pool.bindings.sampleTexture(name, first[name], uv())]);
  for (const options of [first, second, first]) {
    const frame = { object: { userData: { [WATER_SLOT_OPTIONS]: options } } };
    for (const name of ['waterSurfaceOrigin', 'time', 'chunkCenter', 'rippleOrigin', 'patternOrigin']) {
      pool.bindings[name].update(frame);
      assert.deepEqual(pool.bindings[name].value, options[name].value);
    }
    for (const [name, node] of textureNodes) {
      node.update(frame);
      assert.strictEqual(node.value, options[name]);
    }
    for (let i = 0; i < options.seaPhaseOrigin.length; i++) {
      pool.bindings.seaPhaseOrigin[i].update(frame);
      assert.equal(pool.bindings.seaPhaseOrigin[i].value, options.seaPhaseOrigin[i].value);
    }
    for (const [name, node] of Object.entries(pool.bindings.surfacePatterns.uniforms)) {
      node.update(frame);
      assert.deepEqual(node.value, options.surfacePatterns.uniforms[name].value);
    }
  }
  let disposals = 0;
  plain.addEventListener('dispose', () => disposals++);
  refractive.addEventListener('dispose', () => disposals++);
  pool.dispose(); pool.dispose();
  assert.equal(disposals, 2);
  for (const options of [first, second]) {
    options.surfaceMaskTexture.dispose(); options.waterFieldTexture.dispose(); options.waterFlowTexture.dispose();
  }
});
