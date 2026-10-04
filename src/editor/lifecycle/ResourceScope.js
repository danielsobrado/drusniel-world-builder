/** Owns construction resources until the scope is transferred to a live world. */
export class ResourceScope {
  constructor() {
    this.callbacks = [];
    this.owned = new WeakSet();
    this.disposed = false;
  }

  own(resource) {
    if (!resource || this.owned.has(resource)) return resource;
    this.owned.add(resource);
    this.defer(() => {
      if (globalThis.location?.search.includes('qaRecovery=1')) console.log('Recovery release:', resource.constructor.name);
      resource.dispose();
    });
    return resource;
  }

  defer(callback) {
    if (this.disposed) {
      callback();
      throw new Error('Cannot publish resources into a disposed scope.');
    }
    this.callbacks.push(callback);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const callback of this.callbacks.splice(0).reverse()) {
      try { callback(); } catch (error) { console.warn('Resource cleanup failed.', error); }
    }
  }
}

