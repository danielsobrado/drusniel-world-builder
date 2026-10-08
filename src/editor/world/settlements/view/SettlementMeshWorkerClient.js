/**
 * Generates settlement meshes off the main thread.
 *
 * One worker, asked for one variant at a time by the pool. If workers are
 * unavailable, or this one dies, `available` goes false and the pool generates
 * synchronously instead: slower frames, same town.
 */
export class SettlementMeshWorkerClient {
  constructor({ workerFactory = null } = {}) {
    this.pending = new Map();
    this.nextId = 1;
    this.worker = null;
    if (!workerFactory && typeof Worker === 'undefined') return;
    try {
      this.worker = workerFactory
        ? workerFactory()
        : new Worker(new URL('./settlementMesh.worker.js', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', ({ data }) => this.receive(data));
      this.worker.addEventListener('error', (event) => this.fail(event.message ?? 'Settlement mesh worker failed.'));
      this.worker.addEventListener('messageerror', () => this.fail('Settlement mesh worker response could not be read.'));
    } catch (error) {
      console.warn('Settlement mesh worker is unavailable; meshes will be generated on the main thread.', error);
      this.worker = null;
    }
  }

  get available() {
    return this.worker !== null;
  }

  get inFlight() {
    return this.pending.size;
  }

  /** Resolves to the mesh data of one pooled variant (see SettlementMeshData). */
  build(style, kind, variant) {
    if (!this.worker) return Promise.reject(new Error('Settlement mesh worker is unavailable.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // A style is frozen plain data; structured clone carries it as is.
      this.worker.postMessage({ id, style, kind, variant });
    });
  }

  receive({ id, data, error }) {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    if (error) request.reject(new Error(error));
    else request.resolve(data);
  }

  /** The worker is gone: fail what it owed and stop offering it. */
  fail(message) {
    console.warn(`${message} Settlement meshes will be generated on the main thread.`);
    this.worker?.terminate?.();
    this.worker = null;
    for (const request of this.pending.values()) request.reject(new Error(message));
    this.pending.clear();
  }

  dispose() {
    this.worker?.terminate?.();
    this.worker = null;
    for (const request of this.pending.values()) request.reject(new Error('Settlement mesh worker was disposed.'));
    this.pending.clear();
  }
}
