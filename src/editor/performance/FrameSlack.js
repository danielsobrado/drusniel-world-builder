// Deferred work (vegetation rebuild jobs, foliage view-cull repacks) used fixed
// budgets of 2 ms and 1.5 ms a frame. At 144 Hz the whole frame is 6.94 ms, so
// whenever that work ran on top of a normal frame the frame missed its slot:
// it was the most common mark in the slowest frames while moving. This tracks
// what the rest of the frame costs and hands deferred work only the time left.
// One global floor advances work under load; later consumers cannot grant it
// again after it has been spent.
export const DEFAULT_FRAME_BUDGET_MS = 1000 / 144;

export class FrameSlack {
  constructor({
    targetMs = DEFAULT_FRAME_BUDGET_MS,
    // Kept free for the browser, GC and timing noise.
    reserveMs = 0.5,
    smoothing = 0.1,
    maximumMs = Infinity,
    now = () => performance.now(),
  } = {}) {
    this.targetMs = targetMs;
    this.reserveMs = reserveMs;
    this.smoothing = smoothing;
    this.maximumMs = maximumMs;
    this.now = now;
    this.fixedMs = null;
    this.frameStart = 0;
    this.deferredMs = 0;
    this.deferredStart = null;
    this.allowanceMs = null;
    this.deadline = null;
  }

  beginFrame() {
    this.frameStart = this.now();
    this.deferredMs = 0;
    this.allowanceMs = null;
    this.deadline = null;
  }

  // Time this frame can still give deferred work: the target minus the usual
  // cost of everything else. The floor is granted only once per frame.
  available(floorMs, maxMs) {
    this.peek(floorMs, maxMs);
    // A readiness probe must not start the deadline before actual work is eligible.
    const inProgressMs = this.deferredStart === null ? 0 : this.now() - this.deferredStart;
    // Mandatory updates between queues are already included in fixedMs. They
    // must not also consume a short wall-clock window opened by an early job.
    // All queues share the frame cutoff; actual deferred time consumes the
    // allowance. If the first eligible job arrives late, grant its one floor.
    this.deadline ??= Math.max(this.frameStart + Math.max(0, this.targetMs - this.reserveMs),
      this.now() + Math.max(0, Math.min(floorMs, this.allowanceMs - this.deferredMs - inProgressMs)));
    return this.peek(floorMs, maxMs);
  }

  peek(floorMs, maxMs) {
    const inProgressMs = this.deferredStart === null ? 0 : this.now() - this.deferredStart;
    if (this.allowanceMs === null) {
      const predicted = this.fixedMs === null ? maxMs
        : this.targetMs - this.reserveMs - this.fixedMs;
      this.allowanceMs = Math.min(this.maximumMs, Math.max(floorMs, predicted));
    }
    const remaining = this.allowanceMs - this.deferredMs - inProgressMs;
    return Math.min(maxMs, Math.max(0, Math.min(remaining,
      this.deadline === null ? Infinity : this.deadline - this.now())));
  }

  // Runs deferred work and books its time, so it is not mistaken for the fixed
  // cost of the frame.
  defer(work) {
    // Nested queues share the outer booking instead of counting it twice.
    if (this.deferredStart !== null) return work();
    const started = this.now();
    this.deferredStart = started;
    try {
      return work();
    } finally {
      this.deferredMs += this.now() - started;
      this.deferredStart = null;
    }
  }

  endFrame() {
    const fixed = Math.max(0, this.now() - this.frameStart - this.deferredMs);
    this.fixedMs = this.fixedMs === null ? fixed : this.fixedMs + (fixed - this.fixedMs) * this.smoothing;
    return this.fixedMs;
  }
}
