const MAX_CANDIDATES = 64;

/** QA-only: a missing attribute query can be optional; retain it as a candidate, not a shader error. */
export function installUvAttributeDiagnostics(renderer) {
  const candidates = new Map();
  const debug = renderer.debug;
  const supported = Boolean(debug && 'onNodeBuilderCreated' in debug);
  let dropped = 0, active = true;
  const previous = debug?.onNodeBuilderCreated;
  const hook = (builder, target) => {
    previous?.(builder, target);
    const original = builder.hasGeometryAttribute;
    if (typeof original !== 'function') return;
    builder.hasGeometryAttribute = function (name) {
      const exists = original.call(this, name);
      if (active && !exists && /^uv\d*$/.test(name)) {
        const object = builder.object ?? target?.object ?? target;
        const material = builder.material ?? object?.material;
        const geometry = builder.geometry ?? object?.geometry;
        const key = [object?.name, geometry?.uuid, material?.uuid, name].join(':');
        let row = candidates.get(key);
        if (!row && candidates.size < MAX_CANDIDATES) {
          row = { object: object?.name ?? null, material: material?.name ?? material?.type ?? null,
            geometry: geometry?.name ?? null, geometryUuid: geometry?.uuid ?? null,
            requested: name, attributes: Object.keys(geometry?.attributes ?? {}), count: 0 };
          candidates.set(key, row);
        }
        if (row) row.count++; else dropped++;
      }
      return exists;
    };
  };
  if (supported) debug.onNodeBuilderCreated = hook;
  return {
    snapshot: () => ({ supported, dropped, candidates: [...candidates.values()].map(row => ({ ...row })) }),
    dispose() {
      active = false;
      if (supported && debug.onNodeBuilderCreated === hook) debug.onNodeBuilderCreated = previous;
      candidates.clear();
    },
  };
}
