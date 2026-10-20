import { settlementPlanIndexJob } from '../SettlementPlanIndex.js';
import { SETTLEMENT_PLAN_VERSION } from '../SettlementPlanner.js';
import { PerfCounters } from '../../../performance/qa/PerfCounters.js';
import { SettlementRequestRetry } from './SettlementRequestRetry.js';

/** Worker planning, then bounded index installation. Never plans a city in a view update. */
export class SettlementPlanPreparation {
  constructor(onReady = () => {}, retryOptions = {}) {
    this.onReady = onReady;
    this.requests = new Map();
    this.epoch = 0;
    this.consumers = new Map();
    this.retry = new SettlementRequestRetry(retryOptions);
  }

  reset() {
    this.epoch++;
    for (const id of this.requests.keys()) this.store?.chunkWorker?.cancelSettlementPlan?.(id);
    this.requests.clear();
    this.consumers.clear();
  }

  configure(field, store) {
    if (field === this.field && store === this.store && store.baseTerrainRevision === this.revision) return;
    this.reset();
    this.field = field;
    this.store = store;
    this.revision = store.baseTerrainRevision;
  }

  get(entry, priority = 0, consumer = this) {
    if (!this.consumers.has(consumer)) this.begin(consumer);
    this.consumers.get(consumer).add(entry.settlement.id);
    if (entry.plan !== undefined && entry.skyline !== undefined) return entry.plan;
    const id = entry.settlement.id;
    const existing = this.requests.get(id);
    if (existing) {
      if (this.retry.due(existing)) this.start(id, existing);
      return entry.plan ?? null;
    }
    const request = { entry, priority, epoch: this.epoch, job: null, error: null, attempts: 0 };
    this.requests.set(id, request);
    this.start(id, request);
    return entry.plan ?? null;
  }

  start(id, request) {
    request.attempts++;
    request.error = null;
    const worker = this.store?.chunkWorker;
    if (!worker) {
      this.retry.fail(request, new Error('Settlement planning requires the terrain worker.'));
      return;
    }
    PerfCounters.inc('settlementPlansRequested');
    worker.request(0, 0, { settlementPlanId: id, priority: request.priority }).then(result => {
      if (request.epoch !== this.epoch || this.requests.get(id) !== request) return;
      if (result.settlementId !== id || result.plan?.id !== id || result.plan.version !== SETTLEMENT_PLAN_VERSION) {
        throw new Error(`Settlement ${id} returned a mismatched plan.`);
      }
      if (!(result.skyline?.positions instanceof Float32Array) || !(result.skyline.normals instanceof Float32Array)
        || !(result.skyline.colors instanceof Float32Array) || !(result.skyline.indices instanceof Uint32Array)
        || !Number.isFinite(result.skyline.sphere?.radius)) throw new Error(`Settlement ${id} returned invalid skyline data.`);
      request.plan = result.plan;
      request.skyline = result.skyline;
      request.job = settlementPlanIndexJob(result.plan);
    }).catch(error => {
      if (request.epoch === this.epoch && this.requests.get(id) === request) this.retry.fail(request, error);
    });
  }

  begin(consumer = this) { this.consumers.set(consumer, new Set()); }
  release(consumer) { this.consumers.delete(consumer); this.end(); }
  end() {
    const wanted = new Set([...this.consumers.values()].flatMap(ids => [...ids]));
    for (const id of this.requests.keys()) if (!wanted.has(id)) {
      this.store?.chunkWorker?.cancelSettlementPlan?.(id);
      this.requests.delete(id);
    }
  }

  advance(shouldYield) {
    const started = performance.now();
    try {
      for (const [id, request] of this.requests) {
        if (request.entry.plan !== undefined && request.entry.skyline !== undefined) { this.requests.delete(id); continue; }
        if (this.retry.due(request) && !shouldYield()) this.start(id, request);
        if (!request.job) continue;
        if (request.entry.plan !== undefined) {
          request.entry.skyline = request.skyline; this.requests.delete(id); this.onReady(); continue;
        }
        while (!shouldYield()) {
          let step;
          try { step = request.job.next(); }
          catch (error) { this.retry.fail(request, error); break; }
          if (!step.done) continue;
          request.entry.plan = request.plan;
          request.entry.index = step.value;
          request.entry.skyline = request.skyline;
          this.requests.delete(id);
          this.onReady();
          break;
        }
        if (shouldYield()) return;
      }
    } finally { PerfCounters.inc('settlementPlanInstallationCpuMs', performance.now() - started); }
  }

  get pending() { return this.requests.size; }
  get errors() { return [...this.requests.values()].flatMap(r => r.error ? [r.error.message] : []); }
}
