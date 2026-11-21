import * as THREE from 'three/webgpu';
import {
  Fn, cos, float, instanceIndex, ivec2, screenCoordinate, select, sin, storage, uint, uniform,
  uniformArray, vec2, vec4,
} from 'three/tsl';
import { TAU } from './OceanFftConstants.js';
import { OCEAN_FFT_TIME_TICKS } from './OceanFftGpuLayout.js';

/**
 * TSL kernels of the GPU FFT (PR I phase I.2), built once per topology. A new
 * spectrum, time or field only changes buffers and uniforms: no recompilation.
 *
 * Conventions are Phase I.1's (OceanFourierReference.js), not Ponlai's:
 *   h(k,t) = h0(k)·e^{−iφ} + conj(h0(−k))·e^{+iφ},  φ = 2π·((cycles·tick) mod 2²²)/2²²
 *   slope   C(k) = i·kx·h − kz·h   →  IFFT = ∂H/∂x + i·∂H/∂z
 *   IFFT    Σ_k C(k)·e^{+ik·x}, unnormalised (no 1/N²), rows (x) then columns (z).
 *
 * The inverse FFT is a radix-2 Stockham autosort, one thread per output element
 * per stage (the scheme of Ponlai OceanFFT.ts, MIT, pinned cca90564), with the
 * twiddle angle reduced to i mod sub so f32 sin/cos stay in [0, 2π).
 * Every stage is its own dispatch: WebGPU makes a dispatch's storage writes
 * visible to the next one, so there are no workgroup barriers to get wrong.
 * 2·log2(N) stages (even) leave the result in `ping`.
 */

export const OCEAN_FFT_WORKGROUP_SIZE = 64;
/** Which field the evolution kernel feeds the IFFT. HEIGHT is for QA only. */
export const OCEAN_FFT_FIELD = Object.freeze({ SLOPE: 0, HEIGHT: 1 });

const cmul = (a, b) => vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));

export function createOceanFftKernels(resources) {
  const { size: N, modes: M, total, log2Size, deltaK, tileSizes } = resources.topology;
  const tick = uniform(0, 'uint').setName('oceanFftTick');
  const fieldMode = uniform(OCEAN_FFT_FIELD.SLOPE).setName('oceanFftField');
  const deltaKs = uniformArray([...deltaK], 'float').setName('oceanFftDeltaK');
  const read = (attribute, type) => storage(attribute, type, total).toReadOnly();
  const write = (attribute, type) => storage(attribute, type, total);
  const compute = (fn, name) => fn().compute(total, [OCEAN_FFT_WORKGROUP_SIZE]).setName(name);

  const h0 = read(resources.h0, 'vec4');
  const cycles = read(resources.cycles, 'float');
  const evolved = write(resources.ping, 'vec2');
  const evolve = compute(Fn(() => {
    const g = instanceIndex;
    const local = g.mod(M);
    const signed = (index) => float(index.add(N / 2).mod(N)).sub(N / 2);
    const dk = deltaKs.element(g.div(M));
    const kx = signed(local.mod(N)).mul(dk).toVar();
    const kz = signed(local.div(N)).mul(dk).toVar();
    const mode = h0.element(g).toVar();
    // Exact: u32 multiply wraps mod 2³², and 2²² divides 2³² (OceanFftGpuLayout.OCEAN_FFT_TIME_TICKS).
    const turns = uint(cycles.element(g)).mul(tick).bitAnd(OCEAN_FFT_TIME_TICKS - 1);
    const phase = float(turns).mul(TAU / OCEAN_FFT_TIME_TICKS);
    const c = cos(phase).toVar(), s = sin(phase).toVar();
    // h0·(c − is) + conjMirror·(c + is); conjMirror is already conjugated on upload.
    const re = mode.x.mul(c).add(mode.y.mul(s)).add(mode.z.mul(c)).sub(mode.w.mul(s)).toVar();
    const im = mode.y.mul(c).sub(mode.x.mul(s)).add(mode.w.mul(c)).add(mode.z.mul(s)).toVar();
    const slope = vec2(kx.mul(im).add(kz.mul(re)).negate(), kx.mul(re).sub(kz.mul(im)));
    evolved.element(g).assign(select(fieldMode.greaterThan(0.5), vec2(re, im), slope));
  }), 'ocean-fft-evolve');

  const buffers = [resources.ping, resources.pong];
  const stage = (horizontal, s, from, to) => {
    const sub = 1 << s, half = sub >> 1;
    const source = read(buffers[from], 'vec2'), target = write(buffers[to], 'vec2');
    return compute(Fn(() => {
      const g = instanceIndex;
      const local = g.mod(M), base = g.sub(local);
      const x = local.mod(N), z = local.div(N);
      const i = horizontal ? x : z;
      const even = i.div(sub).mul(half).add(i.mod(half));
      const pe = horizontal ? base.add(z.mul(N)).add(even) : base.add(even.mul(N)).add(x);
      const po = pe.add(horizontal ? N / 2 : M / 2);
      const angle = float(i.mod(sub)).mul(TAU / sub);
      target.element(g).assign(source.element(pe).add(cmul(source.element(po), vec2(cos(angle), sin(angle)))));
    }), `ocean-fft-${horizontal ? 'row' : 'column'}-${s}`);
  };
  const rows = [], columns = [];
  let from = 0;
  for (const [horizontal, list] of [[true, rows], [false, columns]]) {
    for (let s = 1; s <= log2Size; s++) {
      list.push(stage(horizontal, s, from, 1 - from));
      from = 1 - from;
    }
  }

  // One full-screen quad per cascade layer copies the f32 result into the RG16F target.
  const result = read(resources.ping, 'vec2');
  const outputQuads = tileSizes.map((_, cascade) => {
    const material = new THREE.NodeMaterial();
    const pixel = ivec2(screenCoordinate.xy);
    material.fragmentNode = vec4(result.element(uint(pixel.y.mul(N).add(pixel.x)).add(cascade * M)), 0, 1);
    material.name = `ocean-fft-output-${cascade}`;
    return new THREE.QuadMesh(material);
  });

  const transform = [evolve, ...rows, ...columns];
  return {
    tick, fieldMode, evolve, rows, columns, transform, outputQuads,
    dispatchCount: transform.length,
    dispose() {
      for (const kernel of transform) kernel.dispose();
      for (const quad of outputQuads) quad.material.dispose(); // QuadMesh geometry is shared.
    },
  };
}
