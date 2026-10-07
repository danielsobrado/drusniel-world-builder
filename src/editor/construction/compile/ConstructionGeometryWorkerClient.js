/** Bounded worker submissions; failure preserves shells instead of compiling on the UI thread. */
export class ConstructionGeometryWorkerClient {
  constructor({ workerFactory = null } = {}) {
    this.pending = new Map();
    this.nextId = 1;
    this.error = null;
    this.worker = null;
    try {
      this.worker = workerFactory ? workerFactory()
        : new Worker(new URL('./constructionGeometry.worker.js', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', ({ data }) => {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id);
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data.product);
      });
      for (const type of ['error', 'messageerror']) this.worker.addEventListener(type, event => {
        event.preventDefault?.();
        this.fail(new Error(event.message ?? 'Construction geometry worker failed.'));
      });
    } catch (error) { this.fail(error); }
  }
  get available() { return Boolean(this.worker) && this.pending.size < 2; }
  request(request) {
    if (!this.worker) return Promise.reject(this.error);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, request }, [request.groundPatch.values.buffer]); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  fail(error) {
    this.error = error;
    this.worker?.terminate(); this.worker = null;
    for (const job of this.pending.values()) job.reject(error);
    this.pending.clear();
  }
  dispose() { this.fail(new Error('Construction geometry worker disposed.')); }
}
