/**
 * Ground inputs many meadow tiles share — the terrain page, canopy grid and
 * growth tables — are sent to a worker once per content identity instead of
 * being structured-cloned into every tile job. The tile request carries only
 * its own fields and a key; the worker merges the two back into the identical
 * flat snapshot `createMeadowGroundSample` reads.
 */
export const SHARED_GROUND_FIELDS = Object.freeze([
  'page', 'chunkSize', 'tileSize', 'eligible', 'shapeTable', 'growth', 'worldSeed', 'pathConfig', 'forest',
]);
const SHARED = new Set(SHARED_GROUND_FIELDS);
/** Per worker. A long route revisits few pages; the bytes bound protects large chunks. */
const MAX_ENTRIES = 24;
const MAX_BYTES = 6 * 1024 * 1024;

const identities = new WeakMap();
let nextIdentity = 1;
/** A stable id per object; replaced settings objects get a new one. */
export function identityOf(value) {
  if (!value || typeof value !== 'object') return String(value ?? '-');
  let id = identities.get(value);
  if (!id) { id = nextIdentity++; identities.set(value, id); }
  return id;
}

function typedBytes(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return 0;
  if (ArrayBuffer.isView(value)) return value.buffer.byteLength;
  let bytes = 0;
  for (const key in value) bytes += typedBytes(value[key], depth + 1);
  return bytes;
}

export function splitGroundSnapshot(snapshot) {
  const shared = {}, local = {};
  for (const key in snapshot) {
    if (key === 'sharedKey') continue;
    (SHARED.has(key) ? shared : local)[key] = snapshot[key];
  }
  return { shared, local };
}

/** Main-thread mirror of one worker's cache; messages apply in order, so no pinning is needed. */
export class MeadowSharedGroundInputs {
  constructor({ maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES } = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.entries = new Map();
    this.bytes = 0;
  }

  /** The request fields for a snapshot; `bytes` is what this request clones. */
  request(snapshot) {
    const key = snapshot.sharedKey;
    if (!key) return { fields: { snapshot }, bytes: typedBytes(snapshot) };
    const { shared, local } = splitGroundSnapshot(snapshot);
    const known = this.entries.get(key);
    if (known !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, known);
      return { fields: { snapshot: local, sharedKey: key }, bytes: typedBytes(local) };
    }
    const size = typedBytes(shared);
    const evict = [];
    for (const [oldKey, oldSize] of this.entries) {
      if (this.entries.size < this.maxEntries && this.bytes + size <= this.maxBytes) break;
      this.entries.delete(oldKey);
      this.bytes -= oldSize;
      evict.push(oldKey);
    }
    this.entries.set(key, size);
    this.bytes += size;
    return { fields: { snapshot: local, sharedKey: key, shared, evict }, bytes: size + typedBytes(local) };
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}

/** Worker side: apply evictions, store any new shared inputs, return the flat snapshot. */
export function resolveGroundSnapshot(cache, request) {
  if (!request.sharedKey) return request.snapshot;
  for (const key of request.evict ?? []) cache.delete(key);
  if (request.shared) cache.set(request.sharedKey, request.shared);
  const shared = cache.get(request.sharedKey);
  if (!shared) throw new Error(`Meadow worker is missing shared ground ${request.sharedKey}.`);
  return { ...shared, ...request.snapshot };
}
