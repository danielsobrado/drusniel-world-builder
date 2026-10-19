import { settlementPlanIndexJob } from '../SettlementPlanIndex.js';
import { SETTLEMENT_PLAN_VERSION } from '../SettlementPlanner.js';
import { PerfCounters } from '../../../performance/qa/PerfCounters.js';

/** Worker planning, then bounded index installation. Never plans a city in a view update. */
export class SettlementPlanPreparation {
  constructor(onReady = () => {}) {
    this.onReady = onReady;
    this.requests = new Map();
    this.epoch = 0;
    this.wanted = new Set();
  }

  reset() {
    this.epoch++;
    for (const id of this.requests.keys()) this.store?.chunkWorker?.cancelSettlementPlan?.(id);
    this.requests.clear();
  }

  configure(field, store) {
    if (field === this.field && store === this.store && store.baseTerrainRevision === this.revision) return;
    this.reset();
    this.field = field;
    this.store = store;
    this.revision = store.baseTerrainRevision;
  }

  get(entry, priority = 0) {
    this.wanted.add(entry.settlement.id);
    if (entry.plan !== undefined) return entry.plan;
    const id = entry.settlement.id;
    if (this.requests.has(id)) return null;
    const request = { entry, epoch: this.epoch, job: null, error: null };
    this.requests.set(id, request);
    const worker = this.store?.chunkWorker;
    if (!worker) {
      request.error = new Error('Settlement planning requires the terrain worker.');
      return null;
    }
    PerfCounters.inc('settlementPlansRequested');
    worker.request(0, 0, { settlementPlanId: id, priority }).then(result => {
      if (request.epoch !== this.epoch || this.requests.get(id) !== request) return;
      if (result.settlementId !== id || result.plan?.id !== id || result.plan.version !== SETTLEMENT_PLAN_VERSION) {
        throw new Error(`Settlement ${id} returned a mismatched plan.`);
      }
      request.plan = result.plan;
      request.job = settlementPlanIndexJob(result.plan);
    }).catch(error => {
      if (request.epoch === this.epoch && this.requests.get(id) === request) request.error = error;
    });
    return null;
  }

  begin() { this.wanted.clear(); }
  end() {
    for (const id of this.requests.keys()) if (!this.wanted.has(id)) {
      this.store?.chunkWorker?.cancelSettlementPlan?.(id);
      this.requests.delete(id);
    }
  }

  advance(shouldYield) {
    const started = performance.now();
    try {
      for (const [id, request] of this.requests) {
        if (request.entry.plan !== undefined) { this.requests.delete(id); continue; }
        if (!request.job) continue;
        while (!shouldYield()) {
          let step;
          try { step = request.job.next(); }
          catch (error) { request.error = error; request.job = null; break; }
          if (!step.done) continue;
          request.entry.plan = request.plan;
          request.entry.index = step.value;
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
