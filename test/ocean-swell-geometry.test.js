import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CASCADE_CANDIDATES } from '../src/editor/water/fft/OceanFftConstants.js';
import { resolveOffshoreFft } from '../src/editor/water/fft/OceanFftConfig.js';
import { angularFrequency, jonswap, resolveOceanSpectrumParams } from '../src/editor/water/fft/OceanSpectrum.js';
import {
  createOceanSwellModes, OCEAN_SWELL_BAND, oceanSwellAmplitudeBound, oceanSwellAmplitudes,
  oceanSwellSpatialPhase, oceanSwellTimePhase, sampleOceanSwellCpu,
} from '../src/editor/water/OceanSwellModes.js';
import {
  configureOceanSwell, OCEAN_SWELL_MODES, oceanSwellAmplitudesNow, oceanSwellHeadroom, oceanSwellOffset,
  oceanSwellUniforms, oceanSwellWeight, settleOceanSwell, updateOceanSwell,
} from '../src/editor/water/OceanSwellState.js';
import { configureSea, seaSurfaceOffset, updateSeaState } from '../src/editor/water/seaState.js';
import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';
import { resolveFftWind } from '../src/editor/water/fft/OceanFftWeather.js';

// PR I phase I.6: wind-driven long swell as real wave height, identical on CPU and GPU.

const modes = createOceanSwellModes();
const f32 = Math.fround;
const sea = (geometry, enabled = true) => ({
  enabled: true, amplitude: 0.9, stormScale: 2.6, choppiness: 4, shallowDepth: 1.5, depthRatio: 0.42,
  offshoreFft: { enabled, geometry: { enabled: geometry } },
});
const storm = { enabled: true, directionDegrees: 30, intensity: 2.4 };
const exactBandVariance = (u) => {
  const p = resolveOceanSpectrumParams({ windSpeed: u, windDirection: 0, fetchMeters: 50_000 });
  const w0 = angularFrequency(2 * Math.PI / OCEAN_SWELL_BAND.maxWavelength), w1 = angularFrequency(2 * Math.PI / OCEAN_SWELL_BAND.minWavelength);
  let v = 0; const n = 20_000;
  for (let i = 0; i < n; i++) v += jonswap(w0 + (w1 - w0) * (i + 0.5) / n, p) * (w1 - w0) / n;
  return v;
};

test('modes: 16 seeded constants in a band no other wave owns', () => {
  assert.deepEqual(createOceanSwellModes(), modes, 'deterministic');
  assert.equal(modes.length, 16);
  const longestCarrier = Math.max(...SEA_SWELL_COMPONENTS.map((w) => w.wavelength));
  const longestFft = 2 * Math.PI / CASCADE_CANDIDATES[0].kMin;
  for (const mode of modes) {
    assert.ok(mode.wavelength > longestCarrier && mode.wavelength > longestFft && mode.wavelength <= 160);
    assert.ok(Math.abs(Math.hypot(mode.x, mode.z) - 1) < 1e-12);
  }
  for (let bin = 0; bin < 4; bin++) {
    const group = modes.slice(4 * bin, 4 * bin + 4);
    group.forEach((m, d) => assert.ok(Math.abs(m.direction - group[0].direction - d * Math.PI / 2) < 1e-12, '90° apart'));
  }
});

test('amplitudes: the band keeps the spectrum energy; calm is flat; downwind beats upwind; bound holds', () => {
  for (const u of [4.5, 10, 24]) {
    const a = oceanSwellAmplitudes(modes, { windSpeed: u, windDirection: 0.4 });
    const variance = a.reduce((sum, x) => sum + x * x / 2, 0);
    assert.ok(Math.abs(variance - exactBandVariance(u)) <= 0.002 * exactBandVariance(u), `U=${u}`);
  }
  assert.ok(oceanSwellAmplitudes(modes, { windSpeed: 0, windDirection: 0 }).every((x) => x === 0));
  const heading = modes[0].direction;
  const a = oceanSwellAmplitudes(modes, { windSpeed: 24, windDirection: heading });
  assert.ok(a[0] > 4 * a[2], 'the mode along the wind dominates the one against it');
  const bound = oceanSwellAmplitudeBound(modes, 24);
  for (let h = 0; h < 64; h++) {
    const sum = oceanSwellAmplitudes(modes, { windSpeed: 24, windDirection: h * 0.1 }).reduce((s, x) => s + x, 0);
    assert.ok(sum <= bound + 1e-12);
  }
  const rms = (u) => Math.sqrt(oceanSwellAmplitudes(modes, { windSpeed: u, windDirection: 0 }).reduce((s, x) => s + x * x / 2, 0));
  assert.ok(rms(4.5) < 0.02 && rms(10) > 0.1 && rms(10) < 0.13 && rms(24) > 0.6 && rms(24) < 0.7, 'calm ≈ 0, breeze ≈ 0.12 m, gale ≈ 0.66 m RMS');
});

test('CPU twin: slope is the height gradient; f32 shader phases match at ±4.2 Mm', () => {
  const amplitudes = oceanSwellAmplitudes(modes, { windSpeed: 24, windDirection: 0.7 });
  const h = (x, z) => sampleOceanSwellCpu(modes, amplitudes, x, z, 1234.5)[0];
  for (const [x, z] of [[10, 20], [-4_226_432.25, 278_528.5]]) {
    const [, sx, sz] = sampleOceanSwellCpu(modes, amplitudes, x, z, 1234.5);
    const e = 1e-3;
    assert.ok(Math.abs((h(x + e, z) - h(x - e, z)) / (2 * e) - sx) < 1e-5);
    assert.ok(Math.abs((h(x, z + e) - h(x, z - e)) / (2 * e) - sz) < 1e-5);
  }
  // The shader: f32(origin at chunk centre) + f32(k·local·d) − f32(timePhase), summed in f32.
  let worst = 0;
  for (const [cx, cz] of [[-4_226_432, 278_528], [4_226_496, -278_464], [64, 64]]) {
    for (const [lx, lz] of [[-64, -64], [0, 0], [37.5, -12.25], [64, 64]]) {
      let shader = 0;
      for (let i = 0; i < modes.length; i++) {
        const m = modes[i];
        const phase = f32(f32(f32(oceanSwellSpatialPhase(m, cx, cz)) + f32(lx * m.x * m.waveNumber) + f32(lz * m.z * m.waveNumber))
          - f32(oceanSwellTimePhase(m, 98_765.4321)));
        shader = f32(shader + f32(amplitudes[i] * Math.sin(phase)));
      }
      worst = Math.max(worst, Math.abs(shader - sampleOceanSwellCpu(modes, amplitudes, cx + lx, cz + lz, 98_765.4321)[0]));
    }
  }
  assert.ok(worst < 1e-4, `CPU vs f32 shader ${worst} m`);
});

test('state: off by default, no headroom; on: first weather snaps, then eases continuously, settle is exact', () => {
  configureOceanSwell(sea(false));
  assert.equal(oceanSwellHeadroom(), 0);
  updateOceanSwell({ waterTimeSeconds: 10, realSeconds: 1, weather: storm });
  assert.equal(oceanSwellOffset(0, 0, 22, 48, 1), 0);
  configureOceanSwell(sea(true, false));
  assert.equal(oceanSwellHeadroom(), 0, 'offshoreFft.enabled: false turns the swell off too');
  updateOceanSwell({ waterTimeSeconds: 10, realSeconds: 1, weather: storm });
  assert.equal(oceanSwellOffset(0, 0, 22, 48, 1), 0);
  configureOceanSwell(sea(true));
  assert.ok(oceanSwellHeadroom() > 3 && oceanSwellHeadroom() < 3.5, 'storm-ceiling bound ≈ 3.3 m');
  updateOceanSwell({ waterTimeSeconds: 10, realSeconds: 1, weather: storm });
  const stormAmplitudes = oceanSwellAmplitudesNow();
  assert.deepEqual([...stormAmplitudes], [...oceanSwellAmplitudes(OCEAN_SWELL_MODES, resolveFftWind(storm, { referenceWindSpeed: 10 }))], 'snapped');
  const calm = { enabled: true, directionDegrees: 30, intensity: 0.45 };
  let previous = stormAmplitudes, largest = 0;
  for (let i = 1; i <= 240; i++) {
    updateOceanSwell({ waterTimeSeconds: 10 + i / 60, realSeconds: 1 + i / 60, weather: calm });
    const now = oceanSwellAmplitudesNow();
    largest = Math.max(largest, ...now.map((x, j) => Math.abs(x - previous[j])));
    previous = now;
  }
  assert.ok(largest < 0.03, `per-frame amplitude step ${largest} m`);
  settleOceanSwell();
  assert.deepEqual([...oceanSwellAmplitudesNow()], [...oceanSwellAmplitudes(OCEAN_SWELL_MODES, resolveFftWind(calm, { referenceWindSpeed: 10 }))]);
  // Uniforms carry exactly what the CPU uses.
  const amplitudes = oceanSwellAmplitudesNow();
  assert.ok(Math.abs(oceanSwellUniforms.amplitude[1].value.y - amplitudes[5]) < 1e-12);
  assert.ok(Math.abs(oceanSwellUniforms.timePhase[2].value.z - oceanSwellTimePhase(OCEAN_SWELL_MODES[10], 14)) < 1e-12);
});

test('weight: zero in the surf zone and lee, full offshore, continuous', () => {
  configureOceanSwell(sea(true));
  assert.equal(oceanSwellWeight(7, 48, 1), 0);
  assert.equal(oceanSwellWeight(22, 24, 1), 0);
  assert.equal(oceanSwellWeight(22, 48, 0), 0);
  assert.equal(oceanSwellWeight(22, 48, 1), 1);
  assert.equal(oceanSwellWeight(22, 48, 0.5), 0.5);
  let previous = 0, worst = 0;
  for (let d = 0; d <= 30; d += 0.01) { const w = oceanSwellWeight(d, 48, 1); worst = Math.max(worst, Math.abs(w - previous)); previous = w; }
  assert.ok(worst < 0.0025);
});

test('gameplay query: the swell joins seaSurfaceOffset offshore only, on the absolute water clock', () => {
  configureSea(sea(false));
  updateSeaState({ timeSeconds: 50, storm: 0.3, weather: storm });
  const authored = [seaSurfaceOffset(100, 200, 3, 10, 1), seaSurfaceOffset(100, 200, 22, 48, 1)];
  configureSea(sea(true));
  updateSeaState({ timeSeconds: 50, storm: 0.3, weather: storm });
  assert.equal(seaSurfaceOffset(100, 200, 3, 10, 1), authored[0], 'nearshore unchanged');
  const swell = oceanSwellOffset(100, 200, 22, 48, 1);
  assert.ok(Math.abs(swell) > 1e-3);
  assert.equal(seaSurfaceOffset(100, 200, 22, 48, 1), authored[1] + swell, 'offshore = authored + long swell');
  // Seeking the water clock back reproduces the height exactly.
  updateSeaState({ timeSeconds: 80, weather: storm });
  updateSeaState({ timeSeconds: 50, weather: storm });
  assert.equal(oceanSwellOffset(100, 200, 22, 48, 1), swell);
  configureSea(null);
});

test('config and shader contract: off by default, no new varying, displacement and slope only', async () => {
  assert.equal(resolveOffshoreFft().geometry.enabled, false);
  assert.throws(() => resolveOffshoreFft({ geometry: { enabled: 'yes' } }), /geometry\.enabled/);
  assert.throws(() => resolveOffshoreFft({ geometry: { modes: 32 } }), /geometry\.modes/);
  const source = await readFile(new URL('../src/editor/stylized/SeaSurfaceShading.js', import.meta.url), 'utf8');
  assert.equal((source.match(/toVarying\(/g) ?? []).length, 3, 'still the three existing varyings');
  assert.match(source, /longSwell \? swell\.slope\.mul\(amplitude\)\.add\(longSwell\.slope\) : swell\.slope\.mul\(amplitude\)/);
  assert.match(source, /: surf\?\.displacement \?\? height\.mul\(amplitude\),/, 'off: the original displacement');
  assert.match(source, /available: float\(1\)/, 'never gated on GPU availability');
});
