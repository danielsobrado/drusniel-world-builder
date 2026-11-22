import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { positionWorld } from 'three/tsl';
import { resolveLocationCatalog } from '../src/editor/locations/LocationCatalog.js';
import { SHADE_SIZE } from '../src/editor/locations/gen/LightBake.js';
import { LOCATION_GENERATORS } from '../src/editor/locations/generators/index.js';
import { createGlacierIceMaterial } from '../src/editor/locations/materials/GlacierIceMaterial.js';
import { createStoneMaterial } from '../src/editor/locations/materials/StoneSurface.js';
import { NOISE, lineNoise, locationNoise, planarNoise } from '../src/editor/locations/materials/locationNoise.js';
import { WORLD_NOISE_LAYER_NAMES } from '../src/editor/stylized/worldNoiseLayout.js';
import { buildShader } from '../test/helpers/buildShader.js';

const source = () => yaml.load(fs.readFileSync(new URL('../config/instanced-locations.yaml', import.meta.url), 'utf8'));
const maps = () => ({ color: new THREE.Texture(), normal: new THREE.Texture(), rough: new THREE.Texture() });

test('location noise fields name a real world-noise layer and channel', () => {
  for (const [name, field] of Object.entries(NOISE)) {
    assert.ok(WORLD_NOISE_LAYER_NAMES[field.layer], `${name} layer`);
    assert.ok(['r', 'g', 'b'].includes(field.channel), `${name} channel`);
    assert.ok(field.span > 5, `${name} spans several Perlin cycles a tile`);
  }
  for (const node of [
    locationNoise(NOISE.patch, positionWorld), planarNoise(NOISE.grit, positionWorld.xz), lineNoise(NOISE.broad, positionWorld.y, 1.7),
  ]) assert.equal(typeof node.mul, 'function');
});

test('every catalog location material builds over the world-noise taps', () => {
  const catalog = resolveLocationCatalog(source(), { generatorKeys: Object.keys(LOCATION_GENERATORS) });
  const geometry = new THREE.BoxGeometry();
  const count = geometry.attributes.position.count;
  for (const [name, size] of [['surfMask', 4], ['surfMask2', 4], ['woodMask', 4], ['bakeLight', 3], ['bakeDir', 3], ['bakeShade', SHADE_SIZE], ['tint', 3]]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * size), size));
  }
  let built = 0;
  for (const site of catalog.sites.values()) {
    for (const [key, entry] of Object.entries(site.materials)) {
      let material = null;
      if (entry.kind === 'ice') {
        const set = { ice: maps(), cracks: maps(), snow: maps(), ...(entry.surfaces.rock ? { rock: maps() } : {}) };
        material = createGlacierIceMaterial(key, { profile: entry.profile, maps: set, stoneProfile: entry.bedrock, masked: entry.masked });
      } else if (entry.kind === 'stone') {
        const set = maps();
        if (entry.surfaces.floor) set.floor = maps();
        if (entry.surfaces.alt) set.alt = maps();
        material = createStoneMaterial(key, entry.masked ? entry.profile : { ...entry.profile, vertexTint: true }, set, { masked: entry.masked });
      }
      if (!material) continue;
      const wgsl = buildShader(new THREE.Mesh(geometry, material)).fragmentShader;
      const arrays = wgsl.match(/texture_2d_array/g) ?? [];
      const textures = wgsl.match(/: texture_2d(_array)?</g) ?? [];
      assert.ok(arrays.length <= 1, `${site.id}/${key}: one world-noise binding, got ${arrays.length}`);
      assert.ok(textures.length <= 16, `${site.id}/${key}: ${textures.length} sampled textures`);
      material.dispose();
      built += 1;
    }
  }
  assert.ok(built > 5);
});

test('colour-only location modules read the world noise, not procedural Perlin', () => {
  for (const file of ['StoneWeathering.js', 'SurfaceSeamBlend.js', 'GeologicalSurface.js', 'GlacierIceMaterial.js', 'ice/IceInterior.js', 'ice/IceStrata.js']) {
    const text = fs.readFileSync(new URL(`../src/editor/locations/materials/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /mx_(fractal_)?noise_float/, file);
  }
});
