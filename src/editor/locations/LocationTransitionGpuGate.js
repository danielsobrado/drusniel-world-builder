import { PerfCounters } from '../performance/qa/PerfCounters.js';

/** Limit speculative transition submissions to completed queue batches. */
export class LocationTransitionGpuGate {
  constructor({ renderer, settings, pause, signal, active }) {
    Object.assign(this, { renderer, settings, pause, signal, active });
    this.device = renderer.backend?.device;
    this.queue = this.device?.queue;
    this.closed = false;
  }

  check() {
    this.signal?.throwIfAborted();
    if (this.closed || !this.active() || this.renderer._isDeviceLost
        || this.renderer.backend?.device !== this.device) {
      throw new Error('Transition GPU gate is unavailable.');
    }
  }

  async advance() {
    try { this.check(); }
    catch (error) { this.closed = true; throw error; }
    if (typeof this.queue?.onSubmittedWorkDone !== 'function') {
      this.closed = true;
      PerfCounters.inc('locationSurface.transitionGpuUnsupported');
      throw new Error('Transition GPU completion tracking is unavailable.');
    }
    let status = 'pending';
    try {
      Promise.resolve(this.queue.onSubmittedWorkDone()).then(
        () => { status = 'complete'; },
        () => { status = 'failed'; },
      );
      const started = performance.now();
      for (let frame = 0; frame < this.settings.surfaceTransitionGpuMaxWaitFrames; frame++) {
        await this.pause();
        this.check();
        PerfCounters.inc('locationSurface.transitionGpuWaitFrames');
        const elapsed = performance.now() - started;
        if (elapsed > this.settings.surfaceTransitionGpuMaxWaitMs || status === 'failed') break;
        if (status === 'complete') {
          PerfCounters.inc('locationSurface.transitionGpuCompletedBatches');
          PerfCounters.inc('locationSurface.transitionGpuWaitMs', elapsed);
          return;
        }
      }
      PerfCounters.inc(status === 'failed' ? 'locationSurface.transitionGpuFenceFailures' : 'locationSurface.transitionGpuTimeouts');
    } catch (error) {
      this.closed = true;
      throw error;
    }
    this.closed = true;
    throw new Error('Transition GPU completion budget exhausted; remaining work will use normal rendering.');
  }
}
