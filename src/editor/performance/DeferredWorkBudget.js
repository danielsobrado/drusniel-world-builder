import { FrameSlack } from './FrameSlack.js';
import { PerfCounters } from './qa/PerfCounters.js';

/** One shared allowance; collision/physics remain mandatory work. */
export class DeferredWorkBudget {
  constructor(settings) {
    this.settings = settings;
    this.provider = max => this.available(max);
    this.runner = work => this.run(work);
    this.maximumMs = settings.maximumMs ?? 1.2;
    this.shouldYield = () => this.peek(Number.POSITIVE_INFINITY) <= 0;
    this.boundQueues = new WeakSet();
    this.slack = new FrameSlack({ targetMs: 1000 / settings.targetFps,
      reserveMs: settings.reserveMs, maximumMs: this.maximumMs });
  }
  beginFrame() { this.slack.beginFrame(); }
  available(maxMs) {
    return this.settings.enabled
      ? this.slack.available(Math.min(this.settings.minimumMs, maxMs), maxMs)
      : maxMs;
  }
  run(work) { return this.slack.defer(work); }
  tryRun(work, maxMs = Number.POSITIVE_INFINITY) {
    if (!(this.available(maxMs) > 0)) return undefined;
    return this.run(work);
  }
  reserve(maxMs) {
    if (this.settings.enabled) return this.slack.reserve(Math.min(this.settings.minimumMs, maxMs), maxMs);
    return this.unbudgetedReservation();
  }
  reserveStrict(maxMs) {
    if (this.settings.enabled) return this.slack.reserveStrict(maxMs);
    return this.unbudgetedReservation();
  }
  unbudgetedReservation() {
    let active = true;
    return { cancel: () => { active = false; }, run: work => {
      if (!active) return;
      active = false;
      return this.run(work);
    } };
  }
  peek(maxMs) {
    return this.settings.enabled
      ? this.slack.peek(Math.min(this.settings.minimumMs, maxMs), maxMs) : maxMs;
  }
  endFrame() {
    PerfCounters.set('frameFixedCpuMs', this.slack.endFrame());
    PerfCounters.set('frameDeferredCpuMs', this.slack.deferredMs);
    PerfCounters.set('frameDeferredBudgetMs', this.settings.enabled
      ? this.slack.strictAvailable(6)
      : 6);
  }
  bindQueue(queue, shouldYield) {
    if (!queue || this.boundQueues.has(queue)) return;
    this.boundQueues.add(queue);
    const previousGate = queue.shouldYield;
    queue.budgetProvider = this.provider;
    queue.workRunner = this.runner;
    // Preserve the legacy gate only when adaptive scheduling is disabled.
    queue.shouldYield = () => this.settings.enabled
      ? shouldYield()
      : Boolean(previousGate?.call(queue));
  }

  attachSurface(surface) {
    if (!surface) return;
    const shouldYield = this.shouldYield;
    const queues = ['grassBuildQueue', 'flowerBuildQueue', 'treeBuildQueue', 'rockBuildQueue',
      'bushBuildQueue', 'detailBuildQueue', 'aquaticBuildQueue', 'tropicalBuildQueue'];
    for (const name of queues) this.bindQueue(surface[name], shouldYield);

    surface.workBudgetProvider = this.provider;
    surface.runDeferredWork = this.runner;
    surface.reserveDeferredWork = max => this.reserve(max);
    surface.reserveStrictDeferredWork = max => this.reserveStrict(max);
    surface.shouldYieldWork = shouldYield;
    if (surface.meadowGrass) surface.meadowGrass.workRunner = this.runner;
    if (surface.rockView) surface.rockView.shouldYieldWork = shouldYield;
    this.bindQueue(surface.rockView?.manifestStore?.queue, shouldYield);
    this.bindQueue(surface.treeView?.manifestStore?.queue, shouldYield);
  }
}
