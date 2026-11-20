import assert from 'node:assert/strict';
import test from 'node:test';
import { float, uniform, vec2 } from 'three/tsl';
import { CoastalSwashInputs } from '../src/editor/water/CoastalSwashInputs.js';
import { coastalFoamStep } from '../src/editor/water/CoastalSwashMath.js';
import { resolveCoastalSwashConfig } from '../src/editor/water/CoastalSwashConfig.js';
import { halfToFloat } from '../src/editor/water/WaterField.js';
import { resolveSeaDiffraction } from '../src/editor/water/SeaDiffraction.js';
import { coastSwashForcingNodes } from '../src/editor/stylized/CoastSwashForcingNodes.js';
import { createCoastPatternOrigins, DEFAULT_COAST_SWASH } from '../src/editor/stylized/CoastSwashShading.js';

function coastWorld() {
  let headland = true;
  const at = (cellX, cellZ) => {
    const x = cellX * 2, z = -cellZ * 2;
    return x >= 0 && !(headland && x >= 8 && x <= 16 && Math.abs(z) <= 12);
  };
  const sampleWater = (x, z) => {
    const ocean = at(x, z);
    return {
      kind: ocean ? 1 : 0,
      coverage: ocean ? 1 : 0,
      bedHeight: ocean ? -0.5 : 0.3,
      surfaceHeight: ocean ? 0 : 0.3,
      shoreDistance: ocean ? Math.max(0, x * 2) : 0,
    };
  };
  const world = {
    tileSize: 2, revision: 1, baseTerrainRevision: 1,
    tileOverrides: new Map(), heightOverrides: new Map(),
    getTile: (x, z) => at(x, z) ? 0 : 2,
    sampleHeight: (x, z) => at(x, z) ? -0.5 : 0.3,
    generator: {
      seaLevel: 0,
      sampleWater,
      sampleWaterSurface: (x, z) => at(x, z)
        ? { kind: 1, coverage: 1, surfaceHeight: 0 } : null,
    },
  };
  return { world, clearHeadland() { headland = false; world.revision++; } };
}

test('persistent shoreline input stores shelter in its spare alpha channel', () => {
  const { world, clearHeadland } = coastWorld();
  const diffraction = resolveSeaDiffraction({ enabled: true });
  const input = new CoastalSwashInputs(world, 64, 1, 4, diffraction);
  try {
    assert.equal(input.update(-32, -32), true);
    const index = (32 * 64 + 34) * 4;
    const sheltered = halfToFloat(input.texture.image.data[index + 3]);
    assert.equal(halfToFloat(input.texture.image.data[index + 2]), 1);
    assert.ok(sheltered >= diffraction.minimumTransmission && sheltered < 0.8, sheltered);
    assert.equal(input.update(-32, -32), false);

    clearHeadland();
    assert.equal(input.update(-32, -32), true, 'terrain edits must refresh incoming wave energy');
    const exposed = halfToFloat(input.texture.image.data[index + 3]);
    assert.ok(exposed > sheltered);
    assert.equal(exposed, 1);
  } finally {
    input.dispose();
  }
});

test('disabled diffraction preserves the existing persistent state input', () => {
  const { world } = coastWorld();
  const input = new CoastalSwashInputs(world, 64, 1, 4);
  try {
    input.update(-32, -32);
    for (let i = 3; i < input.texture.image.data.length; i += 4) {
      assert.equal(halfToFloat(input.texture.image.data[i]), 1);
    }
  } finally {
    input.dispose();
  }
});

test('sheltered waves inject less mobile foam, leaving normal decay in place', () => {
  const config = resolveCoastalSwashConfig();
  const base = {
    wetness: 0, film: 0, mobileFoam: 0, strandedFoam: 0,
    coverageNow: 1, coveragePrevious: 0, breaking: 1, foamPattern: 1,
  };
  const exposed = coastalFoamStep(base, 1 / 30, config);
  const sheltered = coastalFoamStep({ ...base, shelter: 0.22 }, 1 / 30, config);
  assert.ok(sheltered.mobileFoam < exposed.mobileFoam);
  assert.ok(Math.abs(sheltered.mobileFoam / exposed.mobileFoam - 0.22) < 1e-8);
  const decayed = coastalFoamStep({ ...base, mobileFoam: 1,
    coverageNow: 0, coveragePrevious: 0, shelter: 0.22 }, 1 / 30, config);
  assert.ok(decayed.mobileFoam > 0 && decayed.mobileFoam < 1);
});

test('TSL forcing supports per-coast run-up range and a matching phase delay', () => {
  const patterns = createCoastPatternOrigins();
  patterns.update(-4226432, 278528);
  for (const scale of [1, 0.5, 0.22]) {
    const forcing = coastSwashForcingNodes({
      localXZ: vec2(2, 3),
      patternOrigins: patterns,
      clock: uniform(12.5), height: float(0.2),
      config: DEFAULT_COAST_SWASH,
      runupScale: float(scale), phaseLag: float(-0.1),
    });
    assert.equal(typeof forcing.front.mul, 'function');
    assert.equal(typeof forcing.frontVelocity.mul, 'function');
    assert.equal(typeof forcing.coverageAt(forcing.phase).mul, 'function');
  }
});
