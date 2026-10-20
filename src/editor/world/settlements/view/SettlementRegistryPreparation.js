import { SettlementRequestRetry } from './SettlementRequestRetry.js';
import { validSettlementRegistry } from '../SettlementRegistry.js';
import { PerfCounters } from '../../../performance/qa/PerfCounters.js';

/** Older documents get a registry in the settlement lane, without a view-time scan. */
export class SettlementRegistryPreparation {
  constructor(onReady = () => {}, retryOptions = {}) {
    this.onReady = onReady;
    this.retry = new SettlementRequestRetry(retryOptions);
    this.epoch = 0;
  }
  reset() {
    this.epoch++;
    this.store?.chunkWorker?.cancelSettlementRegistry?.();
    this.request = null;
    this.generator = null;
  }
  get(generator, store) {
    if (generator !== this.generator || store !== this.store || store.baseTerrainRevision !== this.revision) {
      this.reset();
      Object.assign(this, { generator, store, revision: store.baseTerrainRevision });
    }
    if (generator?.settlementField !== undefined) {
      if (this.request) { this.store.chunkWorker?.cancelSettlementRegistry?.(); this.request = null; }
      return generator.settlementField;
    }
    if (!generator?.installSettlementRegistry) return generator?.ensureSettlementField?.() ?? null;
    const cached = generator.source.settlementRegistry;
    if (!generator.source.settlements?.length || (!generator.adoptPreparedSettlementRegistry
      && validSettlementRegistry(cached, generator.settlementRegistryKey))) {
      return generator.ensureSettlementField();
    }
    if (!this.request) this.request = { attempts: 0 };
    if (this.request.attempts === 0 || this.retry.due(this.request)) this.start(this.request);
    return null;
  }
  start(request) {
    const epoch = this.epoch;
    request.attempts++; request.error = null;
    if (!this.store.chunkWorker) {
      this.retry.fail(request, new Error('Settlement registry requires its worker.')); return;
    }
    PerfCounters.inc('settlementRegistryRequests');
    this.store.chunkWorker.request(0, 0, { settlementRegistry: true, priority: -1e9 }).then(result => {
      if (epoch !== this.epoch || this.request !== request) return;
      if (this.generator.adoptPreparedSettlementRegistry) this.generator.adoptPreparedSettlementRegistry(result.registry);
      else this.generator.installSettlementRegistry(result.registry);
      this.request = null;
      this.onReady();
    }).catch(error => {
      if (epoch === this.epoch && this.request === request) this.retry.fail(request, error);
    });
  }
  get pending() { return Number(Boolean(this.request)); }
  get errors() { return this.request?.error ? [this.request.error.message] : []; }
}
