import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { float, uniform, vec2 } from 'three/tsl';
import { resolveSeaSurf, seaSurfPatternFrames } from '../src/editor/water/SeaSurf.js';
import { createSeaDiffractionPhaseNode, createSeaShelterNode } from '../src/editor/stylized/SeaDiffractionNodes.js';
import { createSeaSurfaceNodes } from '../src/editor/stylized/SeaSurfaceShading.js';
import { PatternOrigins } from '../src/editor/stylized/PatternOrigins.js';
import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';

const settings = resolveSeaSurf({ enabled: true, model: 'directionalBreakers',
  diffraction: { enabled: true } });

test('sheltering builds its TSL graph and a refracted directional-water surface', () => {
  const exposure = float(0.2), distance = float(12);
  assert.equal(typeof createSeaShelterNode(exposure, distance).mul, 'function');
  assert.equal(typeof createSeaDiffractionPhaseNode({
    exposure, shoreDistance: distance, wave: SEA_SWELL_COMPONENTS[0],
    settings: settings.diffraction,
  }).mul, 'function');
  const patterns = new PatternOrigins(seaSurfPatternFrames(settings));
  patterns.update(-4226432, 278528);
  const sea = createSeaSurfaceNodes({
    terrainUv: vec2(0.5, 0.5), chunkWorldSize: 128,
    surfaceWorldHeight: float(0), waterDepth: float(1.5),
    shoreDistance: distance, waterCoverage: float(1), currentStrength: float(0),
    time: uniform(2), exposure, patterns,
    phaseOrigin: SEA_SWELL_COMPONENTS.map(() => uniform(0)),
    sunDirection: uniform(new THREE.Vector3(0, 0.6, -1)),
    config: {
      amplitude: 0.9, stormScale: 1.65, choppiness: 4,
      shallowDepth: 1.5, depthRatio: 0.42, slopeShading: 0.55,
      crestLift: 0.12, whitecapThreshold: 0.8, stormWhitecapThreshold: 0.45,
      surf: settings,
    },
  });
  assert.equal(typeof sea.displacement.mul, 'function');
  assert.equal(typeof sea.shelter.mul, 'function');
  assert.equal(typeof sea.surfFoam.mul, 'function');
});

test('coastal foam and waterline effects share shelter, without extra material samplers', async () => {
  const [surf, water, appearance] = await Promise.all([
    '../src/editor/stylized/SeaSurfNodes.js', '../src/editor/stylized/StylizedWaterMaterial.js',
    '../src/editor/stylized/WaterAppearanceNodes.js',
  ].map(async path => readFile(new URL(path, import.meta.url), 'utf8')));
  assert.match(surf, /createSeaDiffractionPhaseNode\(/);
  assert.match(surf, /seaCoastalSurfPhase/);
  assert.match(water, /\.mul\(sea\.shelter\)/);
  assert.match(appearance, /exposure: filtered.a.clamp\(0, 1\)/);
});
