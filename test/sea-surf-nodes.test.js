import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { float, uniform, vec2 } from 'three/tsl';
import { createSeaSurfaceNodes } from '../src/editor/stylized/SeaSurfaceShading.js';
import { PatternOrigins } from '../src/editor/stylized/PatternOrigins.js';
import { resolveSeaSurf, seaSurfPatternFrames } from '../src/editor/water/SeaSurf.js';

const surf = resolveSeaSurf({ enabled: true, model: 'directionalBreakers' });
const sea = {
  amplitude: 0.9, stormScale: 1.65, choppiness: 4, shallowDepth: 1.5,
  depthRatio: 0.42, slopeShading: 0.55, crestLift: 0.12,
  whitecapThreshold: 0.8, stormWhitecapThreshold: 0.45,
  crestTransmission: 0.5, surf,
};

test('directional breakers construct the TSL displacement and foam graph', () => {
  const patterns = new PatternOrigins(seaSurfPatternFrames(surf));
  patterns.update(-4226432, 278528);
  const surface = createSeaSurfaceNodes({
    terrainUv: vec2(0.5, 0.5), chunkWorldSize: 128,
    surfaceWorldHeight: float(-1.5), waterDepth: float(1.5),
    shoreDistance: float(8), waterCoverage: float(1),
    currentStrength: float(0), exposure: float(0.9),
    time: uniform(6), patterns,
    phaseOrigin: Array.from({ length: 5 }, () => uniform(0)),
    sunDirection: uniform(new THREE.Vector3(0, 0.6, -1)),
    config: sea,
  });
  assert.ok(surface.displacement);
  assert.equal(typeof surface.displacement.mul, 'function');
  assert.ok(surface.surfFoam);
  assert.equal(typeof surface.surfFoam.mul, 'function');
  assert.ok(surface.normal);
  assert.equal(typeof surface.whitecap, 'function');
});
