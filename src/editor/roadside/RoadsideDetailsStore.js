const KEY = /^lantern-v1:[0-9a-f]+:\d+:[LR]$/;

/** Sparse semantic decisions only. Automatic placements are never serialized. */
export class RoadsideDetailsStore {
  constructor() { this.suppressed = new Set(); this.enabled = null; this.revision = 0; }
  has(key) { return this.suppressed.has(key); }
  suppress(key) { if (!KEY.test(key)) throw new Error('Invalid roadside detail identity.'); this.suppressed.add(key); this.revision += 1; }
  toDocument() { return { version: 1, suppressed: [...this.suppressed].sort(), ...(this.enabled === null ? {} : { enabled: this.enabled }) }; }
  replaceDocument(document = null) {
    if (document != null && (document.version !== 1 || !Array.isArray(document.suppressed)
      || document.suppressed.length > 100000 || document.enabled !== undefined && typeof document.enabled !== 'boolean'
      || document.suppressed.some(key => typeof key !== 'string' || !KEY.test(key)))) {
      throw new Error('Invalid roadside details document.');
    }
    this.suppressed = new Set(document?.suppressed ?? []);
    this.enabled = document?.enabled ?? null;
    this.revision += 1;
  }
}
