import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CAUSTIC_FOCUS_CAP, CAUSTIC_REFERENCE_DEPTH, causticDepthLevel, causticExcessCpu, causticLevels, offshoreCausticCameraWeight, refractionLever,
} from '../src/editor/water/fft/OceanFftCaustics.js';
import { OFFSHORE_FFT_DEFAULTS, resolveOffshoreFft } from '../src/editor/water/fft/OceanFftConfig.js';
import { offshoreFftWeightCpu } from '../src/editor/water/fft/OceanFftBlendNodes.js';
import { OCEAN_FFT_PROFILES } from '../src/editor/water/fft/OceanFftQuality.js';
import { mipLevelCount } from '../src/editor/water/fft/OceanFftFiltering.js';

// FFT-derived underwater caustics (PR I [P9] follow-on): the pure pieces. GPU parity of
// the shader against causticExcessCpu is checked by scripts/run-ocean-fft-qa.mjs (fftCaustics).

const flat = { xx: 0, zx: 0, xz: 0, zz: 0 };
const blend = OFFSHORE_FFT_DEFAULTS.blend;

test('levels: bounded resolution near half a metre on both shipped cascades', () => {
  for (const tier of ['high', 'ultra']) {
    const { size, cascades } = OCEAN_FFT_PROFILES[tier];
    const tileSizes = cascades.map((cascade) => cascade.tileSizeMeters);
    const levels = causticLevels({ size, tileSizes, levels: mipLevelCount(size) });
    assert.deepEqual(levels, [0, 2]);
    levels.forEach((level, c) => {
      const texel = tileSizes[c] / size * 2 ** level;
      assert.ok(texel > 0.35 && texel < 0.7, `cascade ${c} texel ${texel}`);
    });
  }
  assert.deepEqual(causticLevels({ size: 512, tileSizes: [8], levels: 3 }), [2], 'clamped to the last mip');
  assert.deepEqual(causticLevels({ size: 4, tileSizes: [1000], levels: 3 }), [0], 'never below the base level');
});

test('depth level: base to the reference depth, then texel ∝ √depth, clamped', () => {
  assert.equal(causticDepthLevel(2, 0, 7), 2);
  assert.equal(causticDepthLevel(2, CAUSTIC_REFERENCE_DEPTH, 7), 2);
  assert.ok(Math.abs(causticDepthLevel(0, 4 * CAUSTIC_REFERENCE_DEPTH, 7) - 1) < 1e-12, 'four times deeper, twice the texel');
  assert.equal(causticDepthLevel(6, 1000, 7), 7);
  let previous = causticDepthLevel(0, 0, 7);
  for (let depth = 0; depth < 40; depth += 0.01) {
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

test('camera weight: I.4 geography without depth, continuous at its thresholds', () => {
  const open = { shoreDistance: 48, exposure: 1, oceanMask: 1, waterCoverage: 1, available: 1, blend };
  assert.equal(offshoreCausticCameraWeight(open), 1);
  assert.equal(offshoreCausticCameraWeight({ ...open, shoreDistance: 10 }), 0);
  assert.equal(offshoreCausticCameraWeight({ ...open, available: 0 }), 0);
  assert.equal(offshoreCausticCameraWeight({ ...open, oceanMask: 0 }), 0);
  // Times the per-pixel depth smoothstep it is exactly the I.4 weight.
  const at = { ...open, shoreDistance: 31, exposure: 0.8 };
  const depthFactor = offshoreFftWeightCpu({ ...at, waterDepth: 10, shoreDistance: 48, exposure: 1 });
  assert.ok(Math.abs(offshoreCausticCameraWeight(at) * depthFactor - offshoreFftWeightCpu({ ...at, waterDepth: 10 })) < 1e-12);
  let previous = offshoreCausticCameraWeight({ ...open, shoreDistance: 20 });
  for (let shore = 20; shore <= 44; shore += 0.01) {
    const value = offshoreCausticCameraWeight({ ...open, shoreDistance: shore });
    assert.ok(Math.abs(value - previous) < 1e-3, `jump at ${shore}`);
    previous = value;
  }
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
  const yaml = await readFile(new URL('../config/water-visual.yaml', import.meta.url), 'utf8');
  assert.match(yaml, /offshoreFft:[\s\S]*?caustics:\s*\n\s*enabled: (?:true|false)\s*\n\s*strength: [\d.]+/);
});

test('wiring: the underwater post builds FFT caustics only with a live FFT and the switch on', async () => {
  const post = await readFile(new URL('../src/editor/water/UnderwaterCausticsPostProcess.js', import.meta.url), 'utf8');
  const nodes = await readFile(new URL('../src/editor/water/UnderwaterOpticsNodes.js', import.meta.url), 'utf8');
  assert.match(post, /caustics\.enabled/);
  // Off: the original lattice expression, untouched, so the WGSL is byte-identical.
  assert.match(nodes, /fftCaustics \?/);
  assert.doesNotMatch(nodes, /viewport\w*Texture/);
});
