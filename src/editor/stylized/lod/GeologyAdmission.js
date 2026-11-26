function triangles(mesh) {
  const geometry = mesh?.geometry;
  const count = geometry?.index?.count ?? geometry?.attributes?.position?.count;
  if (!Number.isFinite(count) || count < 0) return null;
  const start = Math.max(0, geometry.drawRange?.start ?? 0);
  return Math.floor(Math.max(0, Math.min(count - start, geometry.drawRange?.count ?? Infinity)) / 3);
}

/** Select only cheaper existing representations. Preserve placements and baseline capacity. */
export function planGeologyAdmission(items, meshes, capacity, lod, settings) {
  const indices = new Map(), candidates = [], counts = new Uint32Array(lod.count);
  const kinds = new Uint32Array(lod.kinds);
  const costs = meshes.map(triangles);
  let requested = 0, unknown = 0;
  for (const item of items) {
    if (kinds[item.kind] >= capacity) continue;
    kinds[item.kind]++;
    const index = lod.baselineIndex(item);
    indices.set(item, index);
    counts[index]++;
    const cost = costs[index];
    if (cost == null) { unknown++; continue; }
    requested += cost;
    if (lod.isFarBatch(index) || !lod.focus) continue;
    const far = lod.farIndex(item), farCost = costs[far];
    const distance = Math.hypot(item.x - lod.focus.x, item.z - lod.focus.z);
    const extent = item.scale * Math.max(1, item.stretch ?? 1);
    const protect = Math.max(settings.protectMeters, extent * settings.minimumScaleMultiplier);
    if (distance <= protect || farCost == null || farCost <= 0 || farCost >= cost) continue;
    candidates.push({ item, index, far, saving: cost - farCost, priority: distance / protect });
  }
  const requestedDraws = counts.reduce((n, count) => n + Number(count > 0), 0);
  let selected = requested, draws = requestedDraws, simplified = 0;
  if (selected > settings.triangleBudget) {
    candidates.sort((a, b) => b.priority - a.priority || b.saving - a.saving);
    for (const entry of candidates) {
      if (selected <= settings.triangleBudget) break;
      const { item, index, far, saving } = entry;
      const nextDraws = draws + Number(counts[far] === 0) - Number(counts[index] === 1);
      if (nextDraws > requestedDraws + settings.maxExtraDraws || counts[far] >= capacity) continue;
      counts[index]--; counts[far]++;
      indices.set(item, far);
      selected -= saving;
      draws = nextDraws;
      simplified++;
    }
  }
  return { indices, stats: { requested, selected, requestedDraws, selectedDraws: draws, simplified, unknown,
    overflow: Math.max(0, selected - settings.triangleBudget) } };
}
