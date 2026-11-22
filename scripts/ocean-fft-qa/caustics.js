import * as THREE from 'three/webgpu';
import { float, Fn, instanceIndex, storage, uniform, vec4 } from 'three/tsl';
import { CASCADE_CANDIDATES } from '../../src/editor/water/fft/OceanFftConstants.js';
import { causticExcessCpu, causticLevels, fftCausticExcess, refractionLever } from '../../src/editor/water/fft/OceanFftCaustics.js';
import { writeCascadeUvOrigins } from '../../src/editor/water/fft/OceanFftCoordinates.js';
import { OceanFftBinding } from '../../src/editor/water/fft/OceanFftSampling.js';
import { godsEndCausticLattice } from '../../src/editor/water/GodsEndWaterPatterns.js';
import { realSpectra } from './cases.js';
import { readOutputLayer } from './instrument.js';

/**
 * GPU checks of the FFT caustics (PR I [P9] follow-on): the real fftCausticExcess in a
 * compute probe against causticExcessCpu on the runtime's own output (one cascade at a
 * time, texel centres, so every tap is one exact texel), the zero it must return with
 * no FFT, and the statistics that calibrate its strength against the caustic web.
 */

const N = 128, TILES = CASCADE_CANDIDATES.map((c) => c.tileSizeMeters), ETA = 1.333, TIME = 126;
const CAMERA = [-4_234_496.25, 278_528.75]; // canonical camera near −4.2 Mm: the origin is a double-precision fraction
const silence = (spectra, keep) => spectra.map((s, c) => (c === keep ? s : { ...s, h0: new Float64Array(s.h0.length) }));

async function prepare(ctx, spectra) {
  const { runtime } = ctx;
  runtime.setField(0);
  runtime.configure({ size: N, tileSizes: TILES, spectra });
  runtime.prepare(TIME);
  await runtime.settled();
  if (runtime.state !== 'active') throw new Error(`runtime ${runtime.state}: ${runtime.reason}`);
  const binding = new OceanFftBinding({ size: N, tileSizes: TILES });
  binding.update(runtime.output);
  return binding;
}

/** fftCausticExcess (plus the caustic web) at rows [offsetX, offsetZ, depth] from CAMERA. */
async function probe(ctx, binding, rows, levels, depthScaled = true) {
  const count = rows.length;
  const inputs = new THREE.StorageBufferAttribute(new Float32Array(rows.flatMap((row) => [...row, 0])), 4);
  const outputs = new THREE.StorageBufferAttribute(new Float32Array(4 * count), 4);
  const input = storage(inputs, 'vec4', count).toReadOnly(), output = storage(outputs, 'vec4', count);
  const origin = uniform(new THREE.Vector4(...writeCascadeUvOrigins(CAMERA[0], CAMERA[1], TILES, [0, 0, 0, 0])));
  const kernel = Fn(() => {
    const p = input.element(instanceIndex);
    const excess = fftCausticExcess({ binding, levels, origin, offset: p.xy, depth: p.z, refractiveIndex: ETA, depthScaled });
    // The web as the underwater post draws it (5.5 m tile), at the same canonical point.
    const web = godsEndCausticLattice(p.xy.add(uniform(new THREE.Vector2(CAMERA[0] % 5.5, CAMERA[1] % 5.5))), 5.5, float(TIME));
    output.element(instanceIndex).assign(vec4(excess, web, 0, 0));
  })().compute(count, [64]);
  ctx.renderer.compute(kernel);
  const values = new Float32Array(await ctx.renderer.getArrayBufferAsync(outputs));
  kernel.dispose();
  inputs.dispose();
  outputs.dispose();
  return values;
}

/** Parity: cascade c alone, level 0, at texel centres; CPU forward differences of the read-back layer. */
async function parity(ctx, c) {
  const binding = await prepare(ctx, silence(realSpectra(N), c));
  const layer = await readOutputLayer(ctx.renderer, ctx.runtime, c);
  const tile = TILES[c], texel = tile / N;
  const slope = (i, j) => { const k = 2 * (((j + N) % N) * N + ((i + N) % N)); return [layer[k], layer[k + 1]]; };
  // The camera's position in the tile, in texels: texel (i, j) centre is at offset ((i + 0.5)·texel − frac·tile).
  const frac = writeCascadeUvOrigins(CAMERA[0], CAMERA[1], [tile], [0, 0]);
  const rows = [], expected = [];
  for (let n = 0; n < 512; n++) {
    const i = (n * 37) % N, j = (n * 53 + 11) % N, depth = 2 + (n % 8) * 2.5;
    rows.push([(i + 0.5) * texel - frac[0] * tile, (j + 0.5) * texel - frac[1] * tile, depth]);
    const [s0x, s0z] = slope(i, j), [sxx, sxz] = slope(i + 1, j), [szx, szz] = slope(i, j + 1);
    const gradient = { xx: (sxx - s0x) / texel, zx: (sxz - s0z) / texel, xz: (szx - s0x) / texel, zz: (szz - s0z) / texel };
    expected.push(causticExcessCpu(gradient, refractionLever(ETA, depth)));
  }
  const values = await probe(ctx, binding, rows, [0, 0], false);
  let worst = 0, lit = 0;
  expected.forEach((value, n) => { worst = Math.max(worst, Math.abs(values[4 * n] - value)); if (value > 0) lit++; });
  binding.dispose();
  return { cascade: c, points: rows.length, litPoints: lit, maxError: worst, pass: worst < 2e-3 && lit > 50 };
}

/** Distribution over a 48 m × 48 m patch per depth, at the shipped levels; the web alongside. */
async function statistics(ctx, binding, levels) {
  const depths = [2, 3, 5, 7, 10, 14, 20], side = 96, spacing = 0.5, rows = [];
  for (const depth of depths) for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) rows.push([i * spacing - 24, j * spacing - 24, depth]);
  const values = await probe(ctx, binding, rows, levels);
  const per = side * side;
  return depths.map((depth, d) => {
    const fft = [], web = [];
    for (let n = d * per; n < (d + 1) * per; n++) { fft.push(values[4 * n]); web.push(values[4 * n + 1]); }
    const sorted = [...fft].sort((a, b) => a - b);
    const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
    return { depth, fftMean: mean(fft), fftP50: sorted[per >> 1], fftP99: sorted[Math.floor(per * 0.99)],
      fftLitShare: fft.filter((value) => value > 0.25).length / per, webMean: mean(web), finite: fft.every(Number.isFinite) };
  });
}

export async function causticCase(ctx) {
  const parities = [await parity(ctx, 0), await parity(ctx, 1)];
  const binding = await prepare(ctx, realSpectra(N));
  const levels = causticLevels({ size: N, tileSizes: TILES, levels: binding.levels });
  const stats = await statistics(ctx, binding, levels);
  // No FFT (before the runtime publishes, after it fails): exactly zero, so only the web shows.
  binding.update(null);
  const off = await probe(ctx, binding, [[1, 2, 10], [-7, 3, 14], [0, 0, 5]], levels);
  const disabledZero = [0, 4, 8].every((k) => off[k] === 0);
  binding.dispose();
  return { levels, parities, stats, disabledZero,
    pass: parities.every((row) => row.pass) && disabledZero && stats.every((row) => row.finite && row.fftMean > 0) };
}
