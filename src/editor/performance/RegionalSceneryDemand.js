export function sceneryChunkKey(x, z, size) {
  return `${Math.floor(x / size)}:${Math.floor(-z / size)}`;
}

export function chunkRingDistance(x, z, focus) {
  return Math.max(Math.abs(x - focus.chunkX), Math.abs(z - focus.chunkZ));
}

function inWindow(key, focus, radius) {
  const separator = key.indexOf(':');
  return chunkRingDistance(Number(key.slice(0, separator)), Number(key.slice(separator + 1)), focus) <= radius;
}

/** Counts full authored town demand, not its currently selected render tier. */
export function* townSceneryCells(layout, size) {
  const cells = new Map();
  const { anchor, parts } = layout;
  for (const values of parts.values()) {
    for (let i = 0; i < values.length; i += 4) {
      const key = sceneryChunkKey(anchor.x + values[i], anchor.z + values[i + 2], size);
      cells.set(key, (cells.get(key) ?? 0) + 1);
      if ((i & 255) === 252) yield;
    }
    yield;
  }
  return cells;
}

/** Read resident data without scheduling new manifests or touching their LRU clocks. */
export function* collectRegionalSceneryDemand(surface, focus, size, settings, townCache) {
  const cells = new Map();
  const add = (key, kind, count) => {
    if (!(count > 0) || !Number.isFinite(count) || !inWindow(key, focus, settings.spatialChunkRadius)) return;
    let cell = cells.get(key);
    if (!cell) cells.set(key, cell = {});
    cell[kind] = (cell[kind] ?? 0) + count;
  };
  const caches = [
    ['tree', surface.treeView?.manifestStore?.cache],
    ['rock', surface.rockView?.manifestStore?.cache],
    ['bush', surface.bushView?.manifestCache],
    ...(surface.detailViews ?? []).map(view => ['detail', view.manifestCache]),
  ];
  for (const [kind, cache] of caches) {
    if (!cache) continue;
    let remaining = cache.size;
    for (const [key, entry] of cache) {
      if (remaining-- <= 0) break;
      add(key, kind, entry.placements?.length ?? 0);
      yield;
    }
  }
  for (const [kind, layer] of [['blade', surface.meadowGrass?.blades], ['card', surface.meadowGrass?.cards]]) {
    if (!layer) continue;
    let remaining = layer.tiles.size;
    for (const tile of layer.tiles.values()) {
      if (remaining-- <= 0) break;
      if (tile.band != null) add(sceneryChunkKey(tile.centerX, tile.centerZ, size), kind, tile.output?.count ?? 0);
      yield;
    }
  }
  const towns = surface.terrainView.townRuntime?.streamer?.towns;
  let remaining = towns?.size ?? 0;
  for (const town of towns?.values() ?? []) {
    if (remaining-- <= 0) break;
    const layout = town.layout;
    if (!layout?.parts || !layout.anchor) continue;
    let cached = townCache.get(layout);
    if (cached?.size !== size) {
      cached = { size, cells: yield* townSceneryCells(layout, size) };
      townCache.set(layout, cached);
    }
    for (const [key, count] of cached.cells) {
      add(key, 'town', count);
      yield;
    }
  }
  for (const slot of surface.waterSlots ?? []) {
    const d = slot.terrainSlot?.descriptor;
    if (slot.hasWaterCoverage && Number.isInteger(d?.chunkX) && Number.isInteger(d?.chunkZ)) {
      add(`${d.chunkX}:${d.chunkZ}`, 'water', 1);
    }
    yield;
  }
  return cells;
}
