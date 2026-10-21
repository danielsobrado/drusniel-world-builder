import { indexPlan } from './SettlementPlanIndex.js';
import { SETTLEMENT_PLAN_VERSION } from './SettlementPlanner.js';

const unavailable = message => Object.assign(new Error(message), { retryable: true });

/** Direct worker-to-worker requests; no main-thread relay or second plan cache. */
export class SettlementPlanPortClient {
  constructor() { this.pending = new Map(); this.sequence = 0; }

  disconnect(message = 'Settlement plan authority changed.') {
    this.port?.close(); this.port = null;
    for (const request of this.pending.values()) request.reject(unavailable(message));
    this.pending.clear();
  }

  connect(port, revision) {
    this.disconnect(); this.port = port; this.revision = revision;
    port.onmessage = ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      if (data.error) request.reject(Object.assign(new Error(data.error.message), { retryable: data.error.retryable }));
      else if (data.revision !== revision) request.reject(unavailable('Stale settlement plan response.'));
      else request.resolve(data);
    };
    port.onmessageerror = () => this.disconnect('Settlement plan response could not be deserialized.');
  }

  async prepare(generator, metadata, id) {
    if (!this.port) throw unavailable('Settlement plan authority is unavailable.');
    const port = this.port, sequence = ++this.sequence;
    const result = await new Promise((resolve, reject) => {
      this.pending.set(sequence, { resolve, reject });
      try { port.postMessage({ id: sequence, revision: this.revision, generator: metadata, settlementId: id }); }
      catch (error) { this.pending.delete(sequence); reject(error); }
    });
    if (this.port !== port) throw unavailable('Settlement plan authority changed.');
    const field = generator.ensureSettlementField();
    const entry = field.findById(id);
    if (!entry || result.settlementId !== id || result.plan?.id !== id
      || result.plan.version !== SETTLEMENT_PLAN_VERSION || result.key !== generator.settlementRegistryKey) {
      throw new Error('Mismatched shared settlement plan.');
    }
    if (entry.plan === undefined) {
      const index = indexPlan(result.plan);
      entry.plan = result.plan; entry.index = index;
      field.planCache.retain(entry);
    }
  }
}

/** The dedicated settlement worker owns canonical generation for every client. */
export class SettlementPlanPortAuthority {
  constructor(getGenerator, onGenerated = () => {}) {
    this.getGenerator = getGenerator; this.onGenerated = onGenerated; this.ports = new Set();
  }
  reset(revision) {
    for (const port of this.ports) port.close();
    this.ports.clear(); this.revision = revision;
  }
  connect(port, revision) {
    if (revision !== this.revision) { port.close(); return; }
    this.ports.add(port);
    port.onmessage = ({ data }) => {
      try {
        if (data.revision !== this.revision) throw unavailable('Stale settlement plan request.');
        const generator = this.getGenerator(data.generator), field = generator.ensureSettlementField();
        const entry = field?.findById(data.settlementId);
        if (!entry) throw new Error(`Settlement ${data.settlementId} is absent from this world.`);
        const missing = entry.plan === undefined;
        const plan = field.ensurePlan(entry).plan;
        if (missing) this.onGenerated();
        port.postMessage({ id: data.id, revision, key: generator.settlementRegistryKey,
          settlementId: data.settlementId, plan });
      } catch (error) {
        port.postMessage({ id: data.id, error: { message: error.message, retryable: error.retryable === true } });
      }
    };
  }
}
