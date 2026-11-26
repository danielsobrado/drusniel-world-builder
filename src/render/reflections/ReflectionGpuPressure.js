import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

/** Nonblocking queue-completion backpressure, not a GPU pass timer. */
export class ReflectionGpuPressure {
  constructor(renderer, now = () => performance.now()) {
    this.queue = renderer?.backend?.isWebGPUBackend ? renderer.backend.device?.queue : null;
    this.now = now;
    this.pending = null;
    this.latencyMs = 0;
    this.disposed = false;
  }

  get busy() { return this.pending !== null; }

  submitted() {
    if (this.disposed || this.pending || !this.queue?.onSubmittedWorkDone) return;
    const started = this.now();
    this.pending = Promise.resolve(this.queue.onSubmittedWorkDone()).then(() => {
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
