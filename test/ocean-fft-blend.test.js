import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { OFFSHORE_FFT_DEFAULTS, resolveOffshoreFft } from '../src/editor/water/fft/OceanFftConfig.js';
import { offshoreFftWeightCpu } from '../src/editor/water/fft/OceanFftBlendNodes.js';
import { seaDetailLayers, resolveSeaDetail } from '../src/editor/water/SeaDetailPolicy.js';
import { validateSeaConfig } from '../src/editor/water/SeaConfig.js';

// PR I phase I.4: the offshore FFT's coastal blend, its configuration and the
// medium/fine split it swaps into. GPU parity is checked by scripts/run-ocean-fft-qa.mjs.

const blend = OFFSHORE_FFT_DEFAULTS.blend;
const open = { waterDepth: 22, shoreDistance: 48, exposure: 1, oceanMask: 1, waterCoverage: 1, available: 1, blend };
const weight = (overrides) => offshoreFftWeightCpu({ ...open, ...overrides });
const yaml = await readFile(new URL('../config/water-visual.yaml', import.meta.url), 'utf8');

test('config: default off, documented thresholds, validated bounds, no unknown keys', () => {
  const resolved = resolveOffshoreFft();
  assert.equal(resolved.enabled, false);
  assert.deepEqual({ ...resolved.blend }, { depthStartMeters: 7, depthEndMeters: 14, shoreStartMeters: 24, shoreEndMeters: 40 });
  assert.equal(resolveOffshoreFft({ enabled: true, slopeStrength: 0.8 }).slopeStrength, 0.8);
  for (const bad of [[], 'on', { enabled: 'yes' }, { slopeStrength: -1 }, { slopeStrength: 3 },
    { blend: { shoreEndMeters: 200 } }, { blend: { depthStartMeters: 14, depthEndMeters: 7 } },
    { blend: { shoreStartMeters: 40, shoreEndMeters: 40 } }, { gain: 2 }, { blend: { far: 1 } }]) {
    assert.throws(() => resolveOffshoreFft(bad), /offshoreFft/, JSON.stringify(bad));
  }
  // The code default stays off; the shipped config turns it on (high/ultra WebGPU only, OceanFftQuality).
  assert.match(yaml, /offshoreFft:\r?\n\s+enabled: true\r?\n/, 'shipped on in water-visual.yaml');
});

test('config: the sea validator rejects a malformed offshoreFft', () => {
  const sea = { enabled: true, amplitude: 1, stormScale: 2, choppiness: 2, shallowDepth: 1, depthRatio: 0.4, slopeShading: 0.5,
    crestLift: 0.1, whitecapThreshold: 0.8, stormWhitecapThreshold: 0.4, crestTransmission: 0.5, crestColor: '#8fd0a8' };
  assert.doesNotThrow(() => validateSeaConfig(sea));
  assert.throws(() => validateSeaConfig({ ...sea, offshoreFft: { blend: { shoreEndMeters: 90 } } }), /shoreEndMeters/);
});

test('weight: the I.0 boundary values', () => {
  assert.equal(weight({}), 1, 'open deep exposed sea is fully FFT');
  for (const waterDepth of [0, 7]) assert.equal(weight({ waterDepth }), 0, `depth ${waterDepth}`);
  assert.equal(weight({ waterDepth: 14 }), 1);
  assert.ok(Math.abs(weight({ waterDepth: 10.5 }) - 0.5) < 1e-12, 'depth midpoint');
  for (const shoreDistance of [0, 24]) assert.equal(weight({ shoreDistance }), 0, `shore ${shoreDistance}`);
  assert.ok(Math.abs(weight({ shoreDistance: 32 }) - 0.5) < 1e-12);
  for (const shoreDistance of [40, 48]) assert.equal(weight({ shoreDistance }), 1, 'reachable inside the 48 m cap');
  assert.equal(weight({ exposure: 0 }), 0);
  assert.equal(weight({ exposure: 0.5 }), 0.5, 'shelter scales once');
  assert.equal(weight({ exposure: 1.7 }), 1, 'clamped');
  assert.equal(weight({ oceanMask: 0 }), 0, 'lakes and rivers never receive it');
  assert.equal(weight({ waterCoverage: 0.25 }), 0.25);
  assert.equal(weight({ available: 0 }), 0, 'authored detail until the FFT publishes');
});

test('weight: continuous across every threshold, no step at 7, 14, 17, 24 or 40 m', () => {
  for (const key of ['waterDepth', 'shoreDistance']) {
    let previous = weight({ [key]: 0 }), worst = 0;
    for (let x = 0.01; x <= 50; x += 0.01) {
      const value = weight({ [key]: x });
      worst = Math.max(worst, Math.abs(value - previous));
      previous = value;
    }
    // A C¹ smoothstep over ≥ 7 m changes at most 1.5/7 per metre: 0.0022 per centimetre.
    assert.ok(worst < 0.0025, `${key} step ${worst}`);
  }
});

test('the medium band the FFT replaces is ripple groups 0 and 1; group 2 stays fine', () => {
  const layers = seaDetailLayers(resolveSeaDetail({ enabled: true }));
  const wavelength = (layer) => 1 / Math.hypot(...layer.basis[0]) / 4;
  const medium = layers.filter((layer) => layer.index !== 2), fine = layers.filter((layer) => layer.index === 2);
  assert.deepEqual(medium.map((layer) => layer.index), [0, 0, 1, 1]);
  assert.equal(fine.length, 2);
  // Medium ≈ 2.0 / 1.77 m and 0.95 / 0.84 m lie in the FFT's 7.5–0.5 m band; fine ≈ 0.35 / 0.31 m.
  for (const layer of medium) assert.ok(wavelength(layer) > 0.5 && wavelength(layer) < 7.5);
  for (const layer of fine) assert.ok(wavelength(layer) < 0.5);
});

test('shader composition contract: replace the medium band, keep fine, storm gain on authored bands only', async () => {
  const blendSource = await readFile(new URL('../src/editor/water/fft/OceanFftBlendNodes.js', import.meta.url), 'utf8');
  const ripple = await readFile(new URL('../src/editor/stylized/SeaRippleShading.js', import.meta.url), 'utf8');
  const sea = await readFile(new URL('../src/editor/stylized/SeaSurfaceShading.js', import.meta.url), 'utf8');
  assert.match(blendSource, /detail\.fineSlope\.mul\(stormGain\)\.add\(mix\(detail\.mediumSlope\.mul\(stormGain\), sampled\.slope\.mul\(k\), weight\)\)/);
  assert.match(blendSource, /detail\.fineVariance\.add\(mix\(detail\.mediumVariance, sampled\.unresolved\.mul\(k\.mul\(k\)\), weight\)\)/);
  assert.match(ripple, /bands\[layer\.index === 2 \? 'fine' : 'medium'\]/);
  // The FFT-off path keeps the original expressions, so its WGSL is unchanged.
  assert.match(sea, /: detail \? slope\.add\(detail\.slope\.mul\(stormGain\)\) : slope;/);
  assert.match(sea, /sqrt\(offshoreDetail\?\.variance \?\? detail\?\.variance \?\? float\(0\)\)\.mul\(0\.16\)/);
  assert.match(sea, /detail && oceanFft && oceanMask \?/, 'never on the sea-level heuristic');
  assert.doesNotMatch(sea.slice(sea.indexOf('displacement:')), /oceanFft|offshoreDetail/, 'never in the displacement');
});
