import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { buildSnowGrainRnmPixels, normalizeChannel, sphericalGrainOctave } from '../scripts/lib/snow-ice-pack-math.mjs';
import { highMountainSnowBudget } from '../src/editor/stylized/snow/AlpineSnowShellField.js';
import {
  SNOW_DEFORM_TEXEL_METRES,
  GpuSnowDeformSim,
  snapDeformCenter,
} from '../src/editor/stylized/deformation/GpuSnowDeformSim.js';
import {
  setDeformationBrushSink,
  stampDisc,
  stampFootprint,
} from '../src/editor/stylized/deformation/groundDeformationState.js';
import { createGlacierSeracGeometry, GLACIER_SERAC_KINDS } from '../src/editor/stylized/ice/glacierSeracGeometry.js';
import { GlacierSeracView } from '../src/editor/stylized/ice/GlacierSeracView.js';

test('spherical snow grain baker tiles seamlessly and produces valid normals, cavity, and height', () => {
  const [h0, c0] = sphericalGrainOctave(0.125, 0.25, 26);
  const [h1, c1] = sphericalGrainOctave(1.125, 1.25, 26);
  assert.ok(Math.abs(h0 - h1) < 1e-9, 'height tiles across unit boundary');
  assert.ok(Math.abs(c0 - c1) < 1e-9, 'cavity tiles across unit boundary');

  const pixels = buildSnowGrainRnmPixels(32);
  assert.equal(pixels.length, 32 * 32 * 4);
  let minCav = 255;
  let maxCav = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const nx = (pixels[i] / 255) * 2 - 1;
    const ny = (pixels[i + 1] / 255) * 2 - 1;
    assert.ok(nx * nx + ny * ny <= 1.02, 'packed tangent XY stays within unit disc');
    if (pixels[i + 2] < minCav) minCav = pixels[i + 2];
    if (pixels[i + 2] > maxCav) maxCav = pixels[i + 2];
  }
  assert.ok(maxCav > minCav + 10, 'spherical crevices produce non-trivial cavity contrast');

  const norm = normalizeChannel(new Float32Array([2, 4, 6]));
  assert.deepEqual(Array.from(norm), [0, 0.5, 1]);
});

test('high-mountain snow shell budget is strictly zero in meadows and full in snow-only mountains', () => {
  assert.equal(highMountainSnowBudget({ snow: 0, meadow: 1 }), 0);
  assert.equal(highMountainSnowBudget({ snow: 0.45, meadow: 0 }), 0);
  assert.equal(highMountainSnowBudget({ snow: 1, meadow: 1 }), 0);
  assert.equal(highMountainSnowBudget({ snow: 1, meadow: 0 }), 1);
  const partial = highMountainSnowBudget({ snow: 0.675, meadow: 0 });
  assert.ok(partial > 0.4 && partial < 0.6, `smooth ramp in transition band: ${partial}`);
});

test('GPU snow deform snapping and brush sink wiring respect texel grid and non-WebGPU fallback', () => {
  assert.equal(snapDeformCenter(10.02), Math.round(10.02 / SNOW_DEFORM_TEXEL_METRES) * SNOW_DEFORM_TEXEL_METRES);
  const sim = new GpuSnowDeformSim({ renderer: { backend: { isWebGPUBackend: false } } });
  assert.equal(sim.supported, false);
  sim.brush({ x: 1, z: 2 });
  assert.equal(sim.queue.length, 0, 'non-WebGPU renderer queues no compute work');
  sim.dispose();

  const captured = [];
  setDeformationBrushSink((b) => captured.push(b));
  try {
    stampFootprint(4, 6, 0.5, 0.9);
    stampDisc(8, 10, 2.0, 0.8);
  } finally {
    setDeformationBrushSink(null);
  }
  assert.equal(captured.length, 2);
  assert.ok(captured[0].berm > 0 && captured[0].depression > 0, 'footprint stamps raised berm & depression');
  assert.ok(captured[1].ice > 0 && captured[1].radius === 2.0, 'spell disc stamps refrozen ice & crater radius');
});

test('glacier serac geometry and residency activate only on glaciers and high alpine ice', () => {
  for (let kind = 0; kind < GLACIER_SERAC_KINDS; kind += 1) {
    const geom = createGlacierSeracGeometry(kind);
    const pos = geom.getAttribute('position');
    const h01 = geom.getAttribute('seracHeight01');
    assert.ok(pos.count > 10 && h01.count === pos.count);
    for (let i = 0; i < h01.count; i += 1) {
      const v = h01.getX(i);
      assert.ok(v >= 0 && v <= 1, 'seracHeight01 in [0, 1]');
    }
    geom.dispose();
  }

  const makeView = (tile, height) => new GlacierSeracView({
    scene: new THREE.Scene(),
    terrainView: {
      floatingOrigin: {},
      getCanonicalHeight: () => height,
      worldStore: { tileSize: 2, chunkSize: 32, getTile: () => tile },
    },
    glacierByTile: { 11: 0.85 },
    seaLevel: 0,
  });

  assert.equal(makeView(4, 120).sampleGround(0, 0).eligible, false, 'lowland grassland spawns no seracs');
  assert.equal(makeView(11, 200).sampleGround(0, 0).eligible, true, 'glacier biome spawns seracs');
  assert.equal(makeView(10, 950).sampleGround(0, 0).eligible, false, 'mid-elevation tundra snow spawns no seracs');
  assert.equal(makeView(10, 1150).sampleGround(0, 0).eligible, true, 'high alpine ice > 1080 m is eligible for seracs');
});
