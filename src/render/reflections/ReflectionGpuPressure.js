import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

/** Nonblocking queue-completion backpressure, not a GPU pass timer. */
export class ReflectionGpuPressure {
  constructor(renderer, now = () => performance.now()) {
    this.renderer = renderer;
    this.now = now;
    this.pending = null;
    this.latencyMs = 0;
    this.disposed = false;
  }

  get busy() { return this.pending !== null; }

  submitted() {
    const backend = this.renderer?.backend;
    const queue = backend?.isWebGPUBackend ? backend.device?.queue : null;
    if (this.disposed || this.pending || !queue?.onSubmittedWorkDone) return;
    const started = this.now();
    let submitted;
    try { submitted = queue.onSubmittedWorkDone(); }
    catch { PerfCounters.inc('reflectionGpuQueueErrors'); return; }
    this.pending = Promise.resolve(submitted).then(() => {
      if (this.disposed) return;
      this.latencyMs = Math.max(0, this.now() - started);
      PerfCounters.set('reflectionGpuQueueLatencyMs', this.latencyMs);
    }).catch(() => {
      // Device recovery owns errors from an invalid queue.
      PerfCounters.inc('reflectionGpuQueueErrors');
    }).finally(() => { this.pending = null; });
  }

  dispose() { this.disposed = true; }
}
