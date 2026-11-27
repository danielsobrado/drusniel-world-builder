import { createOceanFftKernels, OCEAN_FFT_FIELD } from './OceanFftGpuKernels.js';
import { packCascadeSpectra, resolveFftTopology, tickTimeSeconds, waterTimeTick } from './OceanFftGpuLayout.js';
import { OceanFftGpuResources } from './OceanFftGpuResources.js';

/**
 * The one GPU FFT of a renderer (PR I phase I.2). Not wired into the scene yet:
 * I.3/I.4 bind `output.texture`; until then only the QA fixture drives it.
 *
 * States: disabled → (configure) initializing → ready → (first clean dispatch) active;
 * unsupported without a WebGPU device; failed on any GPU error, device loss or
 * renderer change; disposed. `output` is non-null only while active, and always
 * names a completed transform of the spectrum revision and time it reports.
 */

export const OCEAN_FFT_STATE = Object.freeze({
  DISABLED: 'disabled', UNSUPPORTED: 'unsupported', INITIALIZING: 'initializing', READY: 'ready',
  ACTIVE: 'active', SUSPENDED: 'suspended', FAILED: 'failed', DISPOSED: 'disposed',
});
const S = OCEAN_FFT_STATE;
const LOG_PREFIX = '[ocean-fft]';
const DEFAULT_GPU = Object.freeze({
  createResources: (topology) => new OceanFftGpuResources(topology),
  createKernels: createOceanFftKernels,
});
const owners = new WeakMap();

/** Why a renderer cannot run the FFT, or null. The WebGL fallback has no compute. */
export function oceanFftUnsupportedReason(renderer) {
  const backend = renderer?.backend;
  if (!backend?.isWebGPUBackend) return 'requires the WebGPU backend';
  if (!backend.device) return 'renderer is not initialised';
  if (typeof renderer.compute !== 'function') return 'renderer has no compute';
  return null;
}

export class OceanFftRuntime {
  constructor(renderer, { enabled = true, gpu = DEFAULT_GPU, log = console } = {}) {
    const owner = owners.get(renderer);
    if (owner && owner.state !== S.DISPOSED) throw new Error(`${LOG_PREFIX} this renderer already owns an FFT runtime.`);
    owners.set(renderer, this);
    this.renderer = renderer;
    this.gpu = gpu;
    this.log = log;
    const unsupported = enabled ? oceanFftUnsupportedReason(renderer) : null;
    this.state = !enabled ? S.DISABLED : unsupported ? S.UNSUPPORTED : S.INITIALIZING;
    this.reason = !enabled ? 'disabled' : unsupported;
    this.resources = null;
    this.kernels = null;
    this.device = null;
    this.published = null;
    this.configGeneration = 0;
    this.observedDevices = new WeakSet();
    this.spectrumRevision = 0;
    this.field = OCEAN_FFT_FIELD.SLOPE;
    this.applied = null; // { tick, spectrumRevision, field } of the last dispatched transform
    this.warming = null;
    this.counters = { transforms: 0, skipped: 0, outputs: 0 };
  }

  /**
   * Build buffers and kernels for { size, tileSizes } and upload `spectra`
   * (OceanFftGpuLayout.buildCascadeSpectra or synthetic tables). Reconfiguring
   * (new size or cascade count) releases the previous allocation first.
   */
  configure({ size, tileSizes, spectra }) {
    if (![S.INITIALIZING, S.READY, S.ACTIVE, S.SUSPENDED, S.FAILED].includes(this.state)) return false;
    this.releaseGpu();
    const unsupported = oceanFftUnsupportedReason(this.renderer);
    if (unsupported) {
      this.state = S.UNSUPPORTED;
      this.reason = unsupported;
      return false;
    }
    this.state = S.INITIALIZING;
    this.reason = null;
    try {
      const topology = resolveFftTopology({ size, tileSizes });
      const upload = packCascadeSpectra(spectra, topology);
      this.resources = this.gpu.createResources(topology);
      this.resources.upload(upload);
      this.kernels = this.gpu.createKernels(this.resources);
      this.kernels.fieldMode.value = this.field;
      this.device = this.renderer.backend.device;
      const device = this.device;
      if (!this.observedDevices.has(device)) {
        this.observedDevices.add(device);
        device.lost?.then(info => { if (this.device === device) this.handleDeviceLost(info); });
      }
      this.configGeneration++;
      this.spectrumRevision++;
      this.state = S.READY;
      return true;
    } catch (error) {
      this.fail(`configure failed: ${error.message}`, error);
      return false;
    }
  }

  /** Upload a new spectrum without recompiling. Invalid tables throw and leave the old one live. */
  setSpectrum(spectra) {
    if (!this.resources) throw new Error(`${LOG_PREFIX} setSpectrum before configure.`);
    this.resources.upload(packCascadeSpectra(spectra, this.resources.topology));
    this.spectrumRevision++;
  }

  /** QA only: transform the height field instead of the packed slopes. */
  setField(field) {
    if (!Object.values(OCEAN_FFT_FIELD).includes(field)) throw new RangeError(`${LOG_PREFIX} unknown field ${field}.`);
    this.field = field;
    if (this.kernels) this.kernels.fieldMode.value = field;
  }

  /**
   * Run the transform for absolute water time `timeSeconds` (any order; seeks are exact).
   * Returns true when GPU work was issued. Unchanged time, spectrum and field issue nothing.
   */
  prepare(timeSeconds) {
    if (this.state !== S.READY && this.state !== S.ACTIVE) return false;
    if (this.warming) return false;
    const tick = waterTimeTick(timeSeconds);
    const key = { tick, spectrumRevision: this.spectrumRevision, field: this.field, timeSeconds };
    const applied = this.applied;
    if (applied && applied.tick === tick && applied.spectrumRevision === key.spectrumRevision && applied.field === key.field) {
      this.counters.skipped++;
      return false;
    }
    if (this.renderer.backend.device !== this.device) {
      this.fail('renderer device changed since configure');
      return false;
    }
    const firstRun = this.state === S.READY;
    try {
      if (firstRun) this.device.pushErrorScope?.('validation');
      this.dispatch(tick);
      this.applied = key;
      if (!firstRun) {
        this.publish(key);
        return true;
      }
      const generation = this.configGeneration;
      this.warming = Promise.resolve(this.device.popErrorScope?.()).then((error) => {
        if (generation !== this.configGeneration || this.state !== S.READY) return;
        this.warming = null;
        if (error) this.fail(`GPU validation error: ${error.message}`);
        else { this.state = S.ACTIVE; this.publish(key); }
      }, (error) => {
        if (generation !== this.configGeneration || this.state !== S.READY) return;
        this.warming = null;
        this.fail(`GPU error scope failed: ${error.message}`, error);
      });
      return true;
    } catch (error) {
      this.fail(`dispatch failed: ${error.message}`, error);
      return false;
    }
  }

  /** Resolves once a pending first-dispatch validation has settled (QA and tests). */
  async settled() {
    await this.warming;
    return this.state;
  }

  dispatch(tick) {
    const { renderer, kernels, resources } = this;
    kernels.tick.value = tick;
    renderer.compute(kernels.transform);
    const target = resources.output;
    const previous = renderer.getRenderTarget();
    const last = kernels.outputQuads.length - 1;
    try {
      kernels.outputQuads.forEach((quad, layer) => {
        // One mip chain per transform, after the last layer; the first render allocates every level.
        target.texture.generateMipmaps = layer === last || this.counters.outputs === 0;
        renderer.setRenderTarget(target, layer);
        quad.render(renderer);
      });
    } finally {
      renderer.setRenderTarget(previous);
    }
    this.counters.transforms++;
    this.counters.outputs++;
  }

  publish({ tick, spectrumRevision, timeSeconds, field }) {
    this.published = Object.freeze({
      texture: this.resources.output.texture, size: this.resources.topology.size,
      tileSizes: this.resources.topology.tileSizes, configGeneration: this.configGeneration,
      spectrumRevision, tick, tickTimeSeconds: tickTimeSeconds(tick), timeSeconds, field, generation: this.counters.transforms,
    });
  }

  /** The last completed output, or null when nothing valid is published. */
  get output() {
    return this.state === S.ACTIVE ? this.published : null;
  }

  handleDeviceLost(info) {
    if (this.state === S.DISPOSED || this.device === null) return;
    this.fail(`device lost: ${info?.reason ?? 'unknown'} ${info?.message ?? ''}`.trim());
  }

  fail(reason, error) {
    if (this.state === S.DISPOSED) return;
    this.state = S.FAILED;
    this.reason = reason;
    this.log.error?.(`${LOG_PREFIX} ${reason}; the authored sea detail stays in use.`, error ?? '');
    this.releaseGpu();
  }

  suspend() {
    if (this.state !== S.ACTIVE || this.warming || !this.resources) return false;
    this.state = S.SUSPENDED;
    this.reason = 'surface suspended';
    this.releaseGpu();
    return true;
  }

  releaseGpu() {
    this.kernels?.dispose();
    this.resources?.dispose();
    this.kernels = null;
    this.resources = null;
    this.device = null;
    this.published = null;
    this.applied = null;
    this.warming = null;
    this.counters.outputs = 0;
  }

  diagnostics() {
    const topology = this.resources?.topology;
    return {
      state: this.state, reason: this.reason, size: topology?.size ?? 0, cascades: topology?.cascades ?? 0,
      bytes: this.resources?.bytes ?? null, dispatchesPerTransform: this.kernels?.dispatchCount ?? 0,
      outputPasses: this.kernels?.outputQuads.length ?? 0, spectrumRevision: this.spectrumRevision,
      configGeneration: this.configGeneration, ...this.counters,
    };
  }

  dispose() {
    if (this.state === S.DISPOSED) return;
    this.releaseGpu();
    this.state = S.DISPOSED;
    this.reason = 'disposed';
    if (owners.get(this.renderer) === this) owners.delete(this.renderer);
  }
}
