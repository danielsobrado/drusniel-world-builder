import { createGaussianModes, createInitialSpectrum } from '../../src/editor/water/fft/OceanGaussianModes.js';
import {
  createModePowerTable, createWaveFrequencies, resolveOceanSpectrumParams,
} from '../../src/editor/water/fft/OceanSpectrum.js';

export const WINDY = resolveOceanSpectrumParams({ windSpeed: 10, windDirection: 0, fetchMeters: 50_000 });
export const CALM = resolveOceanSpectrumParams({ windSpeed: 0, windDirection: 0, fetchMeters: 1000 });
export const FULL_BAND = Object.freeze({ kMin: 0, kMax: Infinity });
/** 6 m tile: at N=8/16 every non-DC mode sits in the high-pass band, so the grid is dense with energy. */
export const SMALL = Object.freeze({ seed: 7, size: 16, tileSizeMeters: 6, band: FULL_BAND, params: WINDY, cascadeIndex: 0 });

/** One cascade's power, Gaussians, h0 and quantised frequencies, built the way the runtime will. */
export function buildCascade(options = SMALL) {
  const { seed, size, tileSizeMeters, band, params, cascadeIndex = 0, highPass } = { ...SMALL, ...options };
  const table = createModePowerTable({ size, tileSizeMeters, band, params, highPass });
  const gaussians = createGaussianModes({ seed, size, cascadeIndex });
  return {
    ...table, gaussians,
    h0: createInitialSpectrum(gaussians, table),
    frequencies: createWaveFrequencies(size, tileSizeMeters, { depthMeters: params.depthMeters }),
  };
}

export const realPart = (complex) => complex.filter((_, i) => i % 2 === 0);
export const imagPart = (complex) => complex.filter((_, i) => i % 2 === 1);
export const maxAbs = (array) => array.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
export const sumSquares = (array) => array.reduce((sum, value) => sum + value * value, 0);

/** Renderer stand-in for FFT runtime lifecycle tests (no GPU). */
export function fakeRenderer({ webgpu = true, scopeError = null } = {}) {
  let loseDevice;
  const device = {
    lost: new Promise((resolve) => { loseDevice = resolve; }),
    pushErrorScope() {},
    popErrorScope: async () => scopeError,
  };
  const renderer = {
    backend: { isWebGPUBackend: webgpu, device: webgpu ? device : null },
    computes: 0, renders: 0, target: null,
    compute() { this.computes++; },
    getRenderTarget() { return this.target; },
    setRenderTarget(target) { this.target = target; },
  };
  return { renderer, device, loseDevice: (info) => loseDevice(info) };
}

/** Resource factory stand-in: tracks live resources and kernels. */
export function fakeGpu() {
  const live = new Set();
  return {
    live,
    createResources(topology) {
      const resources = {
        topology, bytes: { total: 1 }, uploads: 0, output: { texture: { name: 'out' } },
        upload() { this.uploads++; }, dispose() { live.delete(this); },
      };
      live.add(resources);
      return resources;
    },
    createKernels(resources) {
      const kernels = {
        tick: { value: 0 }, fieldMode: { value: 0 }, transform: [], dispatchCount: 4,
        outputQuads: resources.topology.tileSizes.map(() => ({ render: (r) => { r.renders++; } })),
        dispose() { live.delete(this); },
      };
      live.add(kernels);
      return kernels;
    },
  };
}
