import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { float, uniform, vec2, vec3 } from 'three/tsl';
import { erodeFoamLace, sampleCoastalFoamPattern } from '../src/editor/stylized/CoastalFoamPatterns.js';
import { createCoastPatternOrigins, createCoastSwashNodes, DEFAULT_COAST_SWASH } from '../src/editor/stylized/CoastSwashShading.js';
import { createSeaSurfaceNodes } from '../src/editor/stylized/SeaSurfaceShading.js';
import { PatternOrigins } from '../src/editor/stylized/PatternOrigins.js';
import { resolveSeaSurf, seaSurfPatternFrames } from '../src/editor/water/SeaSurf.js';
import { CoastalSwashInputs } from '../src/editor/water/CoastalSwashInputs.js';
import { halfToFloat } from '../src/editor/water/WaterField.js';

test('sampleCoastalFoamPattern supports waterNoise, legacy laceField, and procedural fallback', () => {
  const clock = uniform(12.5);
  const point = vec2(3.5, 7.25);
  const modes = [
    { waterNoise: () => vec3(0.7, 0.5, 0.4) },
    { laceField: () => float(0.6) },
    {},
  ];
  for (const mode of modes) {
    const sample = sampleCoastalFoamPattern({ ...mode, point, clock, cells: 4 });
    for (const key of ['laceHeight', 'frothDetail', 'organicWarp', 'uvFootprint']) {
      assert.equal(typeof sample[key].mul, 'function', key);
    }
    const eroded = erodeFoamLace({
      density: float(0.65),
      laceHeight: sample.laceHeight,
      frothDetail: sample.frothDetail,
      uvFootprint: sample.uvFootprint,
    });
    assert.equal(typeof eroded.coverage.mul, 'function');
    assert.equal(typeof eroded.thickness.mul, 'function');
  }
});

test('coast swash and sea surface wire waterNoise into cellular lace foam without extra samplers', () => {
  const waterNoise = () => vec3(0.75, 0.55, 0.45);
  const coastPatterns = createCoastPatternOrigins();
  coastPatterns.update(-4226432, 278528);
  const swash = createCoastSwashNodes({
    localXZ: vec2(2, 4),
    patternOrigins: coastPatterns,
    groundHeight: float(0.15),
    config: DEFAULT_COAST_SWASH,
    clock: uniform(8),
    waterNoise,
    grassMask: float(0.25),
    persistentEnabled: false,
  });
  assert.equal(typeof swash.foam.mul, 'function');
  assert.equal(typeof swash.foamThickness.mul, 'function');
  const applied = swash.apply(vec3(0.7, 0.6, 0.4), float(0.9));
  assert.equal(typeof applied.color.mul, 'function');
  assert.equal(typeof applied.roughness.mul, 'function');

  const surf = resolveSeaSurf({ enabled: true, model: 'directionalBreakers' });
  const waterPatterns = new PatternOrigins(seaSurfPatternFrames(surf));
  waterPatterns.update(-4226432, 278528);
  const sea = createSeaSurfaceNodes({
    terrainUv: vec2(0.5, 0.5),
    chunkWorldSize: 128,
    surfaceWorldHeight: float(0),
    waterDepth: float(1.1),
    shoreDistance: float(3.5),
    waterCoverage: float(1),
    currentStrength: float(0),
    exposure: float(1),
    time: uniform(8),
    patterns: waterPatterns,
    phaseOrigin: Array.from({ length: 5 }, () => uniform(0)),
    sunDirection: uniform(new THREE.Vector3(0.4, 0.7, -0.6)),
    config: {
      amplitude: 0.9, stormScale: 2.6, choppiness: 4, shallowDepth: 1.5,
      depthRatio: 0.42, slopeShading: 0.55, crestLift: 0.12,
      whitecapThreshold: 0.8, stormWhitecapThreshold: 0.45,
      crestTransmission: 0.5, surf,
    },
    waterNoise,
  });
  assert.ok(sea.foamPattern);
  assert.equal(typeof sea.subsurfaceFoam.mul, 'function');
  assert.equal(typeof sea.shoreLine(float(1.2)).mul, 'function');
  assert.equal(typeof sea.whitecap().mul, 'function');
});

test('CoastalSwashInputs produces a smooth monotonic signed distance across a diagonal beach', () => {
  // Smooth diagonal beach: height = 0.25 * (x + z), so shoreline lies along x + z = 0.
  const world = {
    tileSize: 2,
    revision: 1,
    baseTerrainRevision: 1,
    tileOverrides: new Map(),
    heightOverrides: new Map(),
    getTile: (cx, cz) => (cx * 2 - cz * 2) <= 0 ? 0 : 2,
    sampleHeight: (cx, cz) => 0.25 * (cx * 2 - cz * 2),
    generator: {
      seaLevel: 0,
      sampleWater: (cx, cz) => {
        const h = 0.25 * (cx * 2 - cz * 2);
        const ocean = h <= 0;
        return {
          kind: ocean ? 1 : 0,
          coverage: ocean ? 1 : 0,
          bedHeight: h,
          surfaceHeight: ocean ? 0 : h,
          shoreDistance: ocean ? Math.max(0, -h / 0.25) : 0,
        };
      },
      sampleWaterSurface: (cx, cz) => (0.25 * (cx * 2 - cz * 2)) <= 0
        ? { kind: 1, coverage: 1, surfaceHeight: 0 } : null,
    },
  };
  const input = new CoastalSwashInputs(world, 32, 1, 4);
  try {
    assert.equal(input.update(-16, -16), true);
    const data = input.texture.image.data;
    // Traverse perpendicular to the diagonal shoreline (x = z from -8 to +8).
    let previous = -Infinity;
    for (let i = 8; i <= 24; i++) {
      const distance = halfToFloat(data[(i * 32 + i) * 4 + 1]);
      assert.ok(distance >= previous - 1e-3, `Expected monotonic distance at (${i},${i}): ${distance} < ${previous}`);
      previous = distance;
    }
    assert.ok(halfToFloat(data[(8 * 32 + 8) * 4 + 1]) < -3);
    assert.ok(halfToFloat(data[(24 * 32 + 24) * 4 + 1]) > 3);
  } finally {
    input.dispose();
  }
});
