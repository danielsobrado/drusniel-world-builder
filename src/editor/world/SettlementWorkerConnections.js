/** Establish direct channels from each terrain worker to the settlement lane. */
export class SettlementWorkerConnections {
  constructor(owner) { this.owner = owner; this.connected = new Map(); }

  configure() {
    this.connected.clear();
    if (!this.owner.baseTerrain?.settlements?.length || !this.owner.workerCount) return;
    const pool = this.owner.settlementPool();
    pool.onWorkersChanged = () => {
      for (const worker of this.owner.workers) worker?.postMessage({ type: 'settlement-authority-unavailable' });
      this.connected.clear();
      this.connectAll();
    };
    this.connectAll();
  }

  connectAll() { this.owner.workers.forEach((_, index) => this.connect(index)); }

  connect(index) {
    if (!this.owner.baseTerrain?.settlements?.length) return;
    const terrain = this.owner.workers[index], pool = this.owner.settlementPool(), authority = pool.workers[0];
    if (!terrain || !authority || this.connected.get(index) === terrain) return;
    const channel = new MessageChannel();
    // Fake-worker Node tests must not retain a live event-loop handle.
    channel.port1.unref?.(); channel.port2.unref?.();
    try {
      authority.postMessage({ type: 'connect-settlement-plan-authority', port: channel.port2,
        revision: pool.configurationRevision }, [channel.port2]);
      terrain.postMessage({ type: 'connect-settlement-plans', port: channel.port1,
        revision: pool.configurationRevision }, [channel.port1]);
      this.connected.set(index, terrain);
    } catch (error) {
      channel.port1.close(); channel.port2.close();
      throw error;
    }
  }
}
