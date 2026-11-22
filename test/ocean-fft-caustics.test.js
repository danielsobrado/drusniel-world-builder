import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CAUSTIC_DEEP_TEXEL_METERS, CAUSTIC_FOCUS_CAP, CAUSTIC_REFERENCE_DEPTH, CAUSTIC_TEXEL_METERS, causticDepthLevel, causticTexel, causticExcessCpu, causticCameraWeight, causticLevels, refractionLever,
} from '../src/editor/water/fft/OceanFftCaustics.js';
import { OFFSHORE_FFT_DEFAULTS, resolveOffshoreFft } from '../src/editor/water/fft/OceanFftConfig.js';
import { OCEAN_FFT_PROFILES } from '../src/editor/water/fft/OceanFftQuality.js';
import { mipLevelCount } from '../src/editor/water/fft/OceanFftFiltering.js';

// FFT-derived underwater caustics (PR I [P9] follow-on): the pure pieces. GPU parity of
// the shader against causticExcessCpu is checked by scripts/run-ocean-fft-qa.mjs (fftCaustics).

const flat = { xx: 0, zx: 0, xz: 0, zz: 0 };

test('levels: each cascade lands on the finest texel once clamped, on both shipped tiers', () => {
  for (const tier of ['high', 'ultra']) {
    const { size, cascades } = OCEAN_FFT_PROFILES[tier];
    const tileSizes = cascades.map((cascade) => cascade.tileSizeMeters);
    const levels = causticLevels({ size, tileSizes });
    levels.forEach((level, c) => assert.ok(Math.abs(tileSizes[c] / size * 2 ** level - CAUSTIC_TEXEL_METERS) < 1e-12));
    // The fine cascade resolves the texel; the coarse one is clamped to its base mip until the law reaches it.
    assert.ok(levels[1] >= 0 && levels[1] < mipLevelCount(size) - 1, `cascade 1 level ${levels[1]}`);
  }
});

test('depth level: texel held to the reference, ∝ depth to 12 m, then ∝ √depth; clamped, continuous', () => {
  assert.equal(causticTexel(0), CAUSTIC_TEXEL_METERS);
  assert.equal(causticTexel(CAUSTIC_REFERENCE_DEPTH), CAUSTIC_TEXEL_METERS);
  assert.ok(Math.abs(causticTexel(2 * CAUSTIC_REFERENCE_DEPTH) - 2 * CAUSTIC_TEXEL_METERS) < 1e-12, 'linear on the shelf');
  assert.ok(Math.abs(causticTexel(12) - CAUSTIC_DEEP_TEXEL_METERS * 2) < 1e-12, 'the laws meet at 12 m');
  assert.ok(Math.abs(causticTexel(48) - CAUSTIC_DEEP_TEXEL_METERS * 4) < 1e-12, '√ past it');
  assert.equal(causticDepthLevel(1, 0, 7), 1);
  assert.ok(Math.abs(causticDepthLevel(0, 12, 7) - 2) < 1e-12);
  assert.equal(causticDepthLevel(-0.8, 0, 7), 0, 'never below the base mip');
  assert.equal(causticDepthLevel(6, 1000, 7), 7);
  let previous = causticDepthLevel(0, 0, 7);
  for (let depth = 0; depth < 60; depth += 0.01) {
    const level = causticDepthLevel(0, depth, 7);
    assert.ok(level >= previous && level - previous < 1e-2, `continuous and monotonic at ${depth}`);
    previous = level;
  }
});

test('lever: (1 − 1/η)·D, zero at the surface and above it', () => {
  assert.ok(Math.abs(refractionLever(1.333, 10) - 2.4981) < 1e-3);
  assert.equal(refractionLever(1.333, 0), 0);
  assert.equal(refractionLever(1.333, -3), 0);
});

test('jacobian: flat sea adds nothing, crests focus, troughs spread, focus is capped', () => {
  assert.equal(causticExcessCpu(flat, 3), 0);
  // Under a crest the slope decreases along x: converging, brighter.
  const crest = causticExcessCpu({ ...flat, xx: -0.2 }, 2.5);
  assert.ok(Math.abs(crest - (1 / 0.5 - 1)) < 1e-12);
  // Under a trough the light spreads: no excess.
  assert.equal(causticExcessCpu({ ...flat, xx: 0.2 }, 2.5), 0);
  // Past the focal line det < 0; |det| keeps the fold bright, not black.
  assert.ok(causticExcessCpu({ ...flat, xx: -0.6 }, 2.5) > 0);
  // Exactly at focus: the cap, never Infinity.
  assert.equal(causticExcessCpu({ ...flat, xx: -0.4 }, 2.5), CAUSTIC_FOCUS_CAP - 1);
  // Shear: det = 1 − a²·xz·zx.
  assert.ok(Math.abs(causticExcessCpu({ ...flat, xz: 0.2, zx: 0.2 }, 2) - (1 / 0.84 - 1)) < 1e-12);
  // Grows with depth for the same surface, until it focuses.
  assert.ok(causticExcessCpu({ ...flat, xx: -0.1 }, 1) < causticExcessCpu({ ...flat, xx: -0.1 }, 3));
});

test('camera weight: ocean water only, no shore-distance factor', () => {
  const open = { shoreDistance: 48, oceanMask: 1, waterCoverage: 1, available: 1 };
  assert.equal(causticCameraWeight(open), 1);
  // The shelf next to the beach keeps the full share: the depth band does the fading.
  assert.equal(causticCameraWeight({ ...open, shoreDistance: 4 }), 1);
  assert.equal(causticCameraWeight({ ...open, available: 0 }), 0);
  assert.equal(causticCameraWeight({ ...open, oceanMask: 0 }), 0);
  assert.equal(causticCameraWeight({ ...open, waterCoverage: 0.25 }), 0.25);
  assert.equal(causticCameraWeight({ ...open, waterCoverage: 2 }), 1);
});

test('config: caustics group validated, unknown keys rejected', async () => {
  const resolved = resolveOffshoreFft();
  assert.equal(typeof resolved.caustics.enabled, 'boolean');
  assert.ok(resolved.caustics.strength > 0);
  assert.equal(resolveOffshoreFft({ caustics: { enabled: false } }).caustics.enabled, false);
  assert.equal(resolveOffshoreFft({ caustics: { enabled: true } }).caustics.enabled, true);
  assert.throws(() => resolveOffshoreFft({ caustics: { enabled: 'yes' } }), /caustics\.enabled/);
  assert.throws(() => resolveOffshoreFft({ caustics: { strength: -1 } }), /caustics\.strength/);
  assert.throws(() => resolveOffshoreFft({ caustics: { strength: 9 } }), /caustics\.strength/);
  assert.throws(() => resolveOffshoreFft({ caustics: { colour: 1 } }), /caustics\.colour is not a setting/);
  const { depthStartMeters, depthEndMeters } = OFFSHORE_FFT_DEFAULTS.caustics;
  // The band sits on the shelf, shallower than the I.4 blend that sends offshore beds out of caustic reach.
  assert.ok(depthEndMeters <= OFFSHORE_FFT_DEFAULTS.blend.depthStartMeters);
  assert.throws(() => resolveOffshoreFft({ caustics: { depthStartMeters: -1 } }), /caustics\.depthStartMeters/);
  assert.throws(() => resolveOffshoreFft({ caustics: { depthStartMeters: 5, depthEndMeters: 5 } }), /caustics\.depthEndMeters/);
  assert.equal(resolveOffshoreFft({ caustics: { depthStartMeters, depthEndMeters } }).caustics.depthEndMeters, depthEndMeters);
  const yaml = await readFile(new URL('../config/water-visual.yaml', import.meta.url), 'utf8');
  assert.match(yaml, /offshoreFft:[\s\S]*?caustics:\s*\n\s*enabled: (?:true|false)\s*\n\s*strength: [\d.]+\s*\n\s*depthStartMeters: [\d.]+\s*\n\s*depthEndMeters: [\d.]+/);
});

test('wiring: the underwater post builds FFT caustics only with a live FFT and the switch on', async () => {
  const post = await readFile(new URL('../src/editor/water/UnderwaterCausticsPostProcess.js', import.meta.url), 'utf8');
  const nodes = await readFile(new URL('../src/editor/water/UnderwaterOpticsNodes.js', import.meta.url), 'utf8');
  assert.match(post, /caustics\.enabled/);
  // Off: the original lattice expression, untouched, so the WGSL is byte-identical.
  assert.match(nodes, /fftCaustics \?/);
  assert.doesNotMatch(nodes, /viewport\w*Texture/);
});
