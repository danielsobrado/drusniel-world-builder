import assert from 'node:assert/strict';
import test from 'node:test';
import {
  naturalTrailFieldAt,
  naturalTrailGradientAt,
  naturalTrailMaskAt,
  normalizeNaturalTrailConfig,
} from '../src/editor/stylized/naturalTrailMath.js';

const TRAIL = Object.freeze({
  enabled: true,
  scale: 0.018,
  level: 0.08,
  width: 0.038,
  softness: 0.035,
  warp: 0.9,
  clearThreshold: 0.42,
});

test('natural trail field is deterministic in absolute world space', () => {
  const first = naturalTrailFieldAt(137.25, -91.75, TRAIL);
  const second = naturalTrailFieldAt(137.25, -91.75, TRAIL);
  assert.equal(first, second);
  assert.equal(Number.isFinite(first), true);
});

test('natural trail mask stays disabled unless explicitly enabled', () => {
  assert.equal(naturalTrailMaskAt(0, 0, { ...TRAIL, enabled: false }), 0);
  assert.equal(naturalTrailMaskAt(0, 0), 0);
});

test('world-scale contour yields narrow trails separated by dense ground', () => {
  let trailSamples = 0;
  let denseSamples = 0;
  const totalPerAxis = 161;
  for (let zIndex = 0; zIndex < totalPerAxis; zIndex += 1) {
    for (let xIndex = 0; xIndex < totalPerAxis; xIndex += 1) {
      const mask = naturalTrailMaskAt(
        (xIndex - 80) * 4,
        (zIndex - 80) * 4,
        TRAIL,
      );
      if (mask >= TRAIL.clearThreshold) trailSamples += 1;
      if (mask <= 0.01) denseSamples += 1;
    }
  }
  const total = totalPerAxis * totalPerAxis;
  assert.ok(trailSamples / total > 0.04, 'trail should remain visible');
  assert.ok(trailSamples / total < 0.25, 'trail should not become mottled fill');
  assert.ok(denseSamples / total > 0.65, 'most ground should remain densely vegetated');
});

test('normalization clamps clearance threshold without changing valid values', () => {
  assert.equal(normalizeNaturalTrailConfig(TRAIL).clearThreshold, 0.42);
  assert.equal(normalizeNaturalTrailConfig({ clearThreshold: -2 }).clearThreshold, 0);
  assert.equal(normalizeNaturalTrailConfig({ clearThreshold: 4 }).clearThreshold, 1);
});

test('analytic trail gradient agrees with finite differences across large canonical positions', () => {
  const step = .001;
  for (const [x, z] of [[0, 0], [9629, 269], [-15339, -2063], [-7134127, 1081563]]) {
    const actual = naturalTrailGradientAt(x, z, TRAIL);
    const dx = (naturalTrailFieldAt(x + step, z, TRAIL) - naturalTrailFieldAt(x - step, z, TRAIL)) / (2 * step);
    const dz = (naturalTrailFieldAt(x, z + step, TRAIL) - naturalTrailFieldAt(x, z - step, TRAIL)) / (2 * step);
    assert.ok(Math.abs(actual.x - dx) < 1e-8);
    assert.ok(Math.abs(actual.z - dz) < 1e-8);
  }
});

test('trail shoulders have a consistent physical width at different contour gradients', () => {
  let checked = 0;
  for (let z = -600; z < 600; z += 31) for (let x = -600; x < 600; x += 2) {
    if (naturalTrailFieldAt(x, z, TRAIL) < TRAIL.level || naturalTrailFieldAt(x + 2, z, TRAIL) >= TRAIL.level) continue;
    let lo = x, hi = x + 2;
    for (let i = 0; i < 25; i++) {
      const middle = (lo + hi) / 2;
      if (naturalTrailFieldAt(middle, z, TRAIL) >= TRAIL.level) lo = middle; else hi = middle;
    }
    const center = (lo + hi) / 2, gradient = naturalTrailGradientAt(center, z, TRAIL);
    const length = Math.hypot(gradient.x, gradient.z);
    if (length < .003) continue;
    const nx = gradient.x / length, nz = gradient.z / length;
    assert.ok(naturalTrailMaskAt(center + nx, z + nz, TRAIL) > .99);
    assert.ok(naturalTrailMaskAt(center + nx * 5, z + nz * 5, TRAIL) < .01);
    checked++;
  }
  assert.ok(checked > 20);
});
