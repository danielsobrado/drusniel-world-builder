import { FrameSlack } from './FrameSlack.js';
import { PerfCounters } from './qa/PerfCounters.js';

/** One shared allowance; collision/physics remain mandatory work. */
export class DeferredWorkBudget {
  constructor(settings) {
    this.settings = settings;
    this.provider = max => this.available(max);
    this.runner = work => this.run(work);
    this.slack = new FrameSlack({ targetMs: 1000 / settings.targetFps,
      reserveMs: settings.reserveMs, maximumMs: settings.maximumMs ?? 1.2 });
  }
  beginFrame() { this.slack.beginFrame(); }
  available(maxMs) {
    return this.settings.enabled
      ? this.slack.available(Math.min(this.settings.minimumMs, maxMs), maxMs)
      : maxMs;
  }
  run(work) { return this.slack.defer(work); }
  peek(maxMs) {
    return this.settings.enabled
      ? this.slack.peek(Math.min(this.settings.minimumMs, maxMs), maxMs) : maxMs;
  }
  endFrame() {
    PerfCounters.set('frameFixedCpuMs', this.slack.endFrame());
    PerfCounters.set('frameDeferredCpuMs', this.slack.deferredMs);
    PerfCounters.set('frameDeferredBudgetMs', this.available(6));
  }
  attachSurface(surface) {
    const provider = this.provider;
    const shouldYield = () => this.peek(6) <= 0;
    const queues = ['grassBuildQueue', 'flowerBuildQueue', 'treeBuildQueue', 'rockBuildQueue',
      'bushBuildQueue', 'detailBuildQueue', 'aquaticBuildQueue', 'tropicalBuildQueue'];
    for (const name of queues) {
      if (surface[name]) {
        surface[name].budgetProvider = provider;
        surface[name].workRunner = this.runner;
        const previousGate = surface[name].shouldYield;
        // The legacy wall-clock gate includes mandatory scenery updates and
        // can reject the shared scheduler's late progress floor indefinitely.
        surface[name].shouldYield = () => this.settings.enabled
          ? shouldYield() : Boolean(previousGate?.());
      }
    }
    surface.workBudgetProvider = provider;
    surface.runDeferredWork = this.runner;
    surface.shouldYieldWork = shouldYield;
    if (surface.meadowGrass) surface.meadowGrass.workRunner = this.runner;
    if (surface.rockView) surface.rockView.shouldYieldWork = surface.shouldYieldWork;
    if (surface.rockView?.manifestStore?.queue) {
      surface.rockView.manifestStore.queue.budgetProvider = provider;
      surface.rockView.manifestStore.queue.workRunner = this.runner;
      surface.rockView.manifestStore.queue.shouldYield = shouldYield;
    }
    if (surface.treeView?.manifestStore?.queue) {
      surface.treeView.manifestStore.queue.budgetProvider = provider;
      surface.treeView.manifestStore.queue.workRunner = this.runner;
      surface.treeView.manifestStore.queue.shouldYield = shouldYield;
    }
  }
}
