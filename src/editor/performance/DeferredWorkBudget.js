import { FrameSlack } from './FrameSlack.js';
import { PerfCounters } from './qa/PerfCounters.js';
import { PreparationPressure, hasPreparationBacklog } from './PreparationPressure.js';

const UPLOAD_COUNTERS = [
  'textureBytesUploaded', 'attributeBytesUploaded', 'publicationCustomAttributeBytes', 'terrainMaterialBakeGpuUploadBytes',
  'streamedDrawInitialUploadBytes', 'localGroundUploadBytes',
];

/** One shared allowance; collision/physics remain mandatory work. */
export class DeferredWorkBudget {
  constructor(settings) {
    this.settings = settings;
    this.provider = max => this.available(max);
    this.runner = work => this.run(work);
    this.maximumMs = settings.maximumMs ?? 1.2;
    this.maxUploadBytes = settings.maxUploadBytes ?? 2 * 1024 * 1024;
    this.uploadBaseline = 0;
    this.uploadReserved = 0;
    this.pressure = new PreparationPressure({ minimumMs: settings.minimumMs, maximumMs: this.maximumMs });
    this.shouldYield = () => this.peek(Number.POSITIVE_INFINITY) <= 0;
    this.boundQueues = new WeakSet();
    this.slack = new FrameSlack({ targetMs: 1000 / settings.targetFps,
      reserveMs: settings.reserveMs, maximumMs: this.maximumMs });
  }
  beginFrame() {
    this.pressure.update(this.slack.now(), hasPreparationBacklog(this.preparationSurface));
    this.slack.beginFrame();
    this.uploadBaseline = this.uploadBytes();
    this.uploadReserved = 0;
  }
  uploadBytes() {
    let total = 0;
    for (const counter of UPLOAD_COUNTERS) total += PerfCounters.get(counter);
    return total;
  }
  publishedBytes() { return Math.max(0, this.uploadBytes() - this.uploadBaseline); }
  remainingUploadBytes() {
    return this.settings.enabled
      ? Math.max(0, this.maxUploadBytes - this.publishedBytes() - this.uploadReserved)
      : Number.POSITIVE_INFINITY;
  }
  canPublish(bytes) {
    if (!this.settings.enabled || bytes <= 0) return true;
    return bytes <= this.remainingUploadBytes()
      || (this.publishedBytes() === 0 && this.uploadReserved === 0 && bytes > this.maxUploadBytes);
  }
  reserveUpload(bytes) {
    const frame = this.slack.frameId;
    const amount = this.settings.enabled ? Math.min(bytes, this.remainingUploadBytes()) : 0;
    this.uploadReserved += amount;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (frame === this.slack.frameId) this.uploadReserved -= amount;
    };
  }
  available(maxMs) {
    return this.settings.enabled
      ? this.slack.available(Math.min(this.pressure.floorMs, maxMs), maxMs)
      : maxMs;
  }
  run(work) { return this.slack.defer(work); }
  tryRun(work, maxMs = Number.POSITIVE_INFINITY) {
    if (!(this.available(maxMs) > 0)) return undefined;
    return this.run(work);
  }
  reserve(maxMs) {
    if (this.settings.enabled) return this.slack.reserve(Math.min(this.pressure.floorMs, maxMs), maxMs);
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
      return this.run(() => work(() => false));
    } };
  }
  peek(maxMs) {
    return this.settings.enabled
      ? this.slack.peek(Math.min(this.pressure.floorMs, maxMs), maxMs) : maxMs;
  }
  endFrame() {
    PerfCounters.set('framePublicationUploadBytes', Math.max(0, this.uploadBytes() - this.uploadBaseline));
    PerfCounters.set('framePreparationBacklogAgeMs', this.pressure.ageMs);
    PerfCounters.set('frameDeferredPressureFloorMs', this.pressure.floorMs);
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
    this.preparationSurface = surface;
    const shouldYield = this.shouldYield;
    const queues = ['grassBuildQueue', 'flowerBuildQueue', 'treeBuildQueue', 'rockBuildQueue',
      'bushBuildQueue', 'detailBuildQueue', 'aquaticBuildQueue', 'tropicalBuildQueue'];
    for (const name of queues) this.bindQueue(surface[name], shouldYield);

    surface.workBudgetProvider = this.provider;
    surface.runDeferredWork = this.runner;
    surface.reserveDeferredWork = max => this.reserve(max);
    surface.reserveStrictDeferredWork = max => this.reserveStrict(max);
    surface.shouldYieldWork = shouldYield;
    surface.hasPublicationPressure = () => this.remainingUploadBytes() < this.maxUploadBytes / 2;
    surface.publicationBudget = this;
    if (surface.meadowGrass) {
      surface.meadowGrass.workRunner = this.runner;
      for (const layer of [surface.meadowGrass.blades, surface.meadowGrass.cards]) {
        if (layer?.batchBudget) layer.batchBudget.shared = this;
      }
    }
    if (surface.rockView) surface.rockView.shouldYieldWork = shouldYield;
    this.bindQueue(surface.rockView?.manifestStore?.queue, shouldYield);
    this.bindQueue(surface.treeView?.manifestStore?.queue, shouldYield);
  }
}
