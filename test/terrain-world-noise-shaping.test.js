import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, int, positionWorld, texture, vec3, vec4 } from 'three/tsl';
import { createTerrainMaterialBakeConfig } from '../src/editor/materials/TerrainMaterialBakeConfig.js';
import { applyTerrainWorldNoiseColor, createTerrainWorldNoiseShaping } from '../src/editor/materials/TerrainMaterialWorldNoiseNodes.js';
import { buildShader } from './helpers/buildShader.js';

const config = createTerrainMaterialBakeConfig(yaml.load(fs.readFileSync(
  new URL('../config/terrain-material-bake.yaml', import.meta.url), 'utf8',
))).families.worldNoise;

test('world-noise shaping taps each layer once however many bands read it', () => {
  const atlas = new THREE.DataArrayTexture(new Uint8Array(4 * 4 * 4 * 3), 4, 4, 3);
  const tap = (layer) => texture(atlas, positionWorld.xz).depth(int(layer)).rgb;
  const shaping = createTerrainWorldNoiseShaping({
    noise: { macro: tap(0), meso: tap(1), micro: tap(2) },
    weights: vec4(0.4, 0.2, 0.3, 0.1),
    cameraDistance: positionWorld.y,
    config,
  });
  const near = applyTerrainWorldNoiseColor(vec3(0.3), shaping);
  const mid = applyTerrainWorldNoiseColor(vec3(0.5), shaping);
  const far = applyTerrainWorldNoiseColor(vec3(0.7), shaping);
  const material = new THREE.MeshStandardNodeMaterial();
  material.colorNode = near.add(mid).add(far).mul(float(1 / 3));
  material.roughnessNode = float(0.8).add(shaping.roughnessOffset);
  const { fragmentShader } = buildShader(new THREE.Mesh(new THREE.PlaneGeometry(), material));
  // An unfiltered test texture is read with textureLoad: one per layer, not one per reader.
  assert.equal(fragmentShader.match(/textureLoad\( nodeUniform0\b/g)?.length, 3);
});

test('world-noise shaping is absent when disabled or without the atlas', () => {
  assert.equal(createTerrainWorldNoiseShaping({ noise: null, config }), null);
  assert.equal(createTerrainWorldNoiseShaping({ noise: {}, config: { ...config, enabled: false } }), null);
});
