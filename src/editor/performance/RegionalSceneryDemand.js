import { regionalCardEligible } from './RegionalAdmission.js';
import { addRenderCost, emptyRenderCost } from './RegionalRenderCost.js';

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
export function* collectRegionalSceneryDemand(surface, focus, size, settings, townCache, costModel = null, admissionContext = null) {
  const cells = new Map();
  const add = (key, kind, count) => {
    if (!(count > 0) || !Number.isFinite(count) || !inWindow(key, focus, settings.spatialChunkRadius)) return;
    let cell = cells.get(key);
    if (!cell) cells.set(key, cell = {});
    cell[kind] = (cell[kind] ?? 0) + count;
  };
  const addCost = (key, kind, estimate) => {
    if (!estimate || !inWindow(key, focus, settings.spatialChunkRadius)) return;
    let cell = cells.get(key);
    if (!cell) cells.set(key, cell = {});
    cell.renderCost ??= { requested: emptyRenderCost(), selected: emptyRenderCost(), layers: {} };
    const layer = cell.renderCost.layers[kind] ??= { requested: emptyRenderCost(), selected: emptyRenderCost() };
    addRenderCost(cell.renderCost.requested, estimate.requested);
    addRenderCost(cell.renderCost.selected, estimate.selected);
    addRenderCost(layer.requested, estimate.requested);
    addRenderCost(layer.selected, estimate.selected);
    if (admissionContext && ['tree', 'rock', 'bush', 'card'].includes(kind)) {
      layer.options ??= settings.admissionFactors.map(factor => ({ factor, cost: emptyRenderCost() }));
      for (const option of layer.options) {
        const cost = estimate.options?.find(candidate => candidate.factor === option.factor)?.cost ?? estimate.requested;
        addRenderCost(option.cost, cost);
      }
    }
  };
  const caches = [
    ['tree', surface.treeView?.manifestStore?.cache, surface.treeView],
    ['rock', surface.rockView?.manifestStore?.cache, surface.rockView],
    ['bush', surface.bushView?.manifestCache, surface.bushView],
    ...(surface.detailViews ?? []).map(view => ['detail', view.manifestCache, view]),
  ];
  for (const [kind, cache, view] of caches) {
    if (!cache) continue;
    let remaining = cache.size;
    for (const [key, entry] of cache) {
      if (remaining-- <= 0) break;
      add(key, kind, entry.placements?.length ?? 0);
      if (costModel && inWindow(key, focus, settings.spatialChunkRadius)) {
        addCost(key, kind, yield* costModel.manifest(view, kind, key, entry.placements));
      }
      yield;
    }
  }
  for (const [kind, layer] of [['blade', surface.meadowGrass?.blades], ['card', surface.meadowGrass?.cards]]) {
    if (!layer) continue;
    let remaining = layer.tiles.size;
    for (const tile of layer.tiles.values()) {
      if (remaining-- <= 0) break;
      if (tile.band != null) {
        const key = sceneryChunkKey(tile.centerX, tile.centerZ, size);
        add(key, kind, tile.output?.count ?? 0);
        if (costModel && inWindow(key, focus, settings.spatialChunkRadius)) {
          const eligible = kind === 'card' && admissionContext && regionalCardEligible(tile.centerX, tile.centerZ,
            layer.tileSize / 2, focus, admissionContext.cameraChunk, size, admissionContext.handoffEnd, settings.protectedChunkRadius);
          addCost(key, kind, costModel.grass(layer, tile, kind, admissionContext ? settings.admissionFactors : null, eligible));
        }
      }
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
    if (costModel) {
      const costs = yield* costModel.town(town, size, sceneryChunkKey);
      const selected = yield* costModel.selectedTown(town, size, sceneryChunkKey);
      for (const [key, cost] of costs ?? []) {
        const estimate = costModel.townPasses(cost);
        addCost(key, 'town', { requested: estimate, selected: selected ? {} : { unknown: cached.cells.get(key) ?? 1 } });
        yield;
      }
      if (!costs) for (const [key, count] of cached.cells) {
        addCost(key, 'town', { requested: { unknown: count }, selected: selected ? {} : { unknown: count } });
        yield;
      }
      for (const [key, cost] of selected ?? []) {
        addCost(key, 'town', { requested: {}, selected: cost });
        yield;
      }
    }
  }
  for (const slot of surface.waterSlots ?? []) {
    const d = slot.terrainSlot?.descriptor;
    if (slot.hasWaterCoverage && Number.isInteger(d?.chunkX) && Number.isInteger(d?.chunkZ)) {
      const key = `${d.chunkX}:${d.chunkZ}`;
      add(key, 'water', 1);
      if (costModel) addCost(key, 'water', costModel.water(slot));
    }
    yield;
  }
  return cells;
}
