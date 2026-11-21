import assert from 'node:assert/strict';
import test from 'node:test';

import { CASCADE_CANDIDATES } from '../src/editor/water/fft/OceanFftConstants.js';
import { cascadeUv, cascadeUvOrigin, positiveMod, writeCascadeUvOrigins } from '../src/editor/water/fft/OceanFftCoordinates.js';

// PR I phase I.3: canonical-world FFT coordinates (pure, double precision).
// The GPU side is verified headed by scripts/run-ocean-fft-qa.mjs (orientation, seams, rebase).

const TILES = CASCADE_CANDIDATES.map((c) => c.tileSizeMeters);
const ALL_TILES = [...TILES, 48, 12]; // the shipped tiles and I.2's provisional ones
const CHUNK = 128;
const f32 = Math.fround;
// Spec points: origin, small signed, chunk multiples, the I.0 far coast, its mirror and ±10 Mm.
const POINTS = [[0, 0], [1, 1], [-1, -1], [128, 128], [-128, -128],
  [-4_226_432, 278_528], [4_226_432, -278_528], [10_000_000, -10_000_000]];
/** Shader: f32 origin + f32(local / L), wrapped by the repeat sampler. */
const shaderUv = (origin, local, tile) => { const u = f32(f32(origin) + f32(local / tile)); return u - Math.floor(u); };
const wrapDistance = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
const exactUv = (world, tile) => positiveMod(world, tile) / tile;
/** Centres of every chunk whose closed square [c−64, c+64]² contains `world` (1, 2 or 4). */
const owningCentres = (x, z) => {
  const axis = (v) => { const k = v / CHUNK; return Number.isInteger(k) ? [(k - 0.5) * CHUNK, (k + 0.5) * CHUNK] : [(Math.floor(k) + 0.5) * CHUNK]; };
  return axis(x).flatMap((cx) => axis(z).map((cz) => [cx, cz]));
};
// f32 ulp of a UV below 8 is 2⁻²¹ ≈ 4.8e-7; a few micrometres on a 57 m tile.
const F32_TOLERANCE = 1e-6;

test('positiveMod: [0, period) for signed, huge and boundary values; rejects bad input', () => {
  assert.equal(positiveMod(5, 3), 2);
  assert.equal(positiveMod(-1, 3), 2);
  assert.ok(Object.is(positiveMod(-3, 3), 0), '−0 becomes 0');
  assert.equal(positiveMod(57.3, 57.3), 0);
  for (const value of [-1e-17, -Number.MIN_VALUE, -4_234_567.891, 4_234_567.891, 1e12, -1e12]) {
    for (const period of ALL_TILES) {
      const r = positiveMod(value, period);
      assert.ok(r >= 0 && r < period, `${value} mod ${period} = ${r}`);
    }
  }
  // Just either side of a tile boundary, far from the origin.
  const boundary = -73_771 * 57.3;
  assert.ok(positiveMod(boundary - 1e-6, 57.3) > 57.3 - 2e-6);
  assert.ok(positiveMod(boundary + 1e-6, 57.3) < 2e-6);
  for (const [value, period] of [[Number.NaN, 1], [Infinity, 1], [1, 0], [1, -2], [1, Infinity]]) {
    assert.throws(() => positiveMod(value, period), RangeError);
  }
});

test('origin UVs at the spec points: [0, 1), deterministic, equal to the exact world phase', () => {
  for (const tile of ALL_TILES) {
    for (const [x, z] of POINTS) {
      const [u, v] = cascadeUvOrigin(x, z, tile);
      assert.ok(u >= 0 && u < 1 && v >= 0 && v < 1);
      assert.deepEqual(cascadeUvOrigin(x, z, tile), [u, v], 'same input, same origin (unload/reload)');
      assert.ok(Math.abs(u - exactUv(x, tile)) < 1e-12 && Math.abs(v - exactUv(z, tile)) < 1e-12);
    }
  }
});

test('every point near the spec positions reconstructs from each owning chunk, borders and corners included', () => {
  let worstCpu = 0, worstF32 = 0, corners = 0;
  for (const tile of ALL_TILES) {
    for (const [px, pz] of POINTS) {
      const base = [Math.round(px / CHUNK) * CHUNK, Math.round(pz / CHUNK) * CHUNK];
      // A chunk corner, the middle of each of its four edges' neighbours, and interior points.
      const probes = [[0, 0], [0, 37.5], [0, -37.5], [37.5, 0], [-37.5, 0], [12.25, -51.5], [px - base[0], pz - base[1]]];
      for (const [dx, dz] of probes) {
        const x = base[0] + dx, z = base[1] + dz;
        const owners = owningCentres(x, z);
        if (owners.length === 4) corners++;
        for (const [cx, cz] of owners) {
          const origin = cascadeUvOrigin(cx, cz, tile);
          const [u, v] = cascadeUv(origin, x - cx, z - cz, tile);
          worstCpu = Math.max(worstCpu, wrapDistance(u, exactUv(x, tile)), wrapDistance(v, exactUv(z, tile)));
          worstF32 = Math.max(worstF32,
            wrapDistance(shaderUv(origin[0], x - cx, tile), exactUv(x, tile)),
            wrapDistance(shaderUv(origin[1], z - cz, tile), exactUv(z, tile)));
        }
      }
    }
  }
  assert.ok(corners >= ALL_TILES.length * POINTS.length, 'four-chunk corners were covered');
  assert.ok(worstCpu < 1e-9, `double precision ${worstCpu}`);
  assert.ok(worstF32 < F32_TOLERANCE, `f32 upload ${worstF32}`);
});

test('adjacent chunks agree on all four shared edges to f32 rounding at −4.2 million metres', () => {
  let worst = 0;
  for (const tile of TILES) {
    for (let i = 0; i < 400; i++) {
      const centre = [-4_234_496 + i * CHUNK + (i % 7) * 1e-3, 278_592 - i * CHUNK];
      for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
        const neighbour = [...centre];
        neighbour[axis] += sign * CHUNK;
        const a = cascadeUvOrigin(...centre, tile)[axis], b = cascadeUvOrigin(...neighbour, tile)[axis];
        worst = Math.max(worst, wrapDistance(shaderUv(a, sign * CHUNK / 2, tile), shaderUv(b, -sign * CHUNK / 2, tile)));
      }
    }
  }
  assert.ok(worst < F32_TOLERANCE, `seam ${worst}`);
});

test('a float32 world position before the modulo would fail these tolerances (the test can detect it)', () => {
  let worst = 0;
  for (const tile of TILES) {
    for (const [x] of POINTS.slice(5)) {
      const centre = Math.round(x / CHUNK) * CHUNK + 64.37;
      const wrong = positiveMod(f32(centre), tile) / tile;
      worst = Math.max(worst, wrapDistance(shaderUv(wrong, 10, tile), exactUv(centre + 10, tile)));
    }
  }
  assert.ok(worst > 100 * F32_TOLERANCE, `f32-before-modulo error ${worst} must be detectable`);
});

test('shader UVs never see the render origin: rebases and teleports leave the phase unchanged', () => {
  // The shader's only inputs are the chunk's canonical origin and chunk-local metres (|local| ≤ 64).
  let worst = 0;
  for (const tile of TILES) {
    for (let i = 0; i < 2000; i++) {
      const world = -4_234_567.891 + i * 61.37;
      const centre = Math.round(world / CHUNK) * CHUNK;
      const [u] = cascadeUvOrigin(centre, 0, tile);
      worst = Math.max(worst, wrapDistance(shaderUv(u, world - centre, tile), exactUv(world, tile)));
    }
  }
  assert.ok(worst < F32_TOLERANCE, `phase error ${worst}`);
  const out = writeCascadeUvOrigins(-4_200_123.375, 77.5, TILES, [0, 0, 0, 0]);
  assert.deepEqual(out.slice(0, 2), cascadeUvOrigin(-4_200_123.375, 77.5, TILES[0]));
  assert.deepEqual(out.slice(2), cascadeUvOrigin(-4_200_123.375, 77.5, TILES[1]));
  assert.deepEqual(cascadeUv([0.25, 0.5], 57.3, -15.45, 57.3), [1.25, 0.5 - 15.45 / 57.3]);
});

test('cascade tiles: short-wave limits for 128², and no common short period', () => {
  const ratio = TILES[0] / TILES[1];
  for (let q = 1; q <= 8; q++) assert.ok(Math.abs(ratio - Math.round(ratio * q) / q) > 0.005, `${ratio} ≈ p/${q}`);
  CASCADE_CANDIDATES.forEach(({ tileSizeMeters, kMin, kMax }) => {
    assert.ok((2 * Math.PI / kMax) / (tileSizeMeters / 128) >= 4, '≥ 4 texels per shortest wavelength');
    assert.ok(tileSizeMeters / (2 * Math.PI / kMin) >= 7, '≥ 7 periods of the longest wavelength');
  });
});
