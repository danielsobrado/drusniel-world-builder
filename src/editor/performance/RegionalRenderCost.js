import { isTreeImpostorMorphologyCompatible } from '../stylized/TreeLodAssembler.js';

export const COST_FIELDS = Object.freeze(['triangles', 'draws', 'shadowTriangles', 'shadowDraws', 'reflectionTriangles', 'reflectionDraws', 'unknown']);
export function emptyRenderCost() {
  return Object.fromEntries(COST_FIELDS.map(key => [key, 0]));
}

export function addRenderCost(target, source) {
  for (const key of COST_FIELDS) target[key] += source[key] ?? 0;
  return target;
}

export function geometryTriangles(geometry) {
  const count = geometry?.index?.count ?? geometry?.attributes?.position?.count;
  if (!Number.isFinite(count) || count < 0) return null;
  const start = Math.max(0, geometry.drawRange?.start ?? 0);
  const length = Math.max(0, Math.min(count - start, geometry.drawRange?.count ?? Infinity));
  return Math.floor(length / 3);
}

/** One part is one draw for the existing single-material scenery batches. */
export function partsRenderCost(parts, castsShadow = () => false) {
  if (!parts) return null;
  const result = { triangles: 0, draws: 0, shadowTriangles: 0, shadowDraws: 0 };
  for (const part of Array.isArray(parts) ? parts : [parts]) {
    const triangles = geometryTriangles(part?.geometry);
    if (triangles === null) return null;
    if (!triangles) continue;
    result.triangles += triangles;
    result.draws++;
    if (castsShadow(part)) {
      result.shadowTriangles += triangles;
      result.shadowDraws++;
    }
  }
  return result;
}

export function batchRenderCost(cost, instances, passes, drawGroups = 1) {
  const result = emptyRenderCost();
  if (!cost) { result.unknown = instances; return result; }
  if (!(instances > 0)) return result;
  result.triangles = cost.triangles * instances;
  result.draws = cost.draws * drawGroups;
  result.shadowTriangles = cost.shadowTriangles * instances * passes.shadow;
  result.shadowDraws = cost.shadowDraws * drawGroups * passes.shadow;
  result.reflectionTriangles = result.triangles * passes.reflection;
  result.reflectionDraws = result.draws * passes.reflection;
  return result;
}

export function effectiveRenderCost(cost, reflectionWeight) {
  return {
    triangles: cost.triangles + cost.shadowTriangles + cost.reflectionTriangles * reflectionWeight,
    draws: cost.draws + cost.shadowDraws + cost.reflectionDraws * reflectionWeight,
  };
}

/** Cached metadata only: never allocates a renderer or requests source geometry. */
export class RegionalRenderCostModel {
  constructor(surface) {
    this.surface = surface;
    this.prototypeCosts = new WeakMap();
    this.plans = new WeakMap();
    this.townCosts = new WeakMap();
    this.refreshPasses();
  }

  refreshPasses() {
    const surface = this.surface;
    const enhancements = surface.config?.enhancements;
    this.passes = {
      shadow: enhancements?.shadowCascades ?? 1,
      reflection: enhancements?.waterReflections?.enabled && surface.waterSlots?.some(slot => slot.hasWaterCoverage) ? 1 : 0,
    };
  }

  planEntry(view, key) {
    const plan = view.previousPlan;
    if (!plan) return null;
    let entries = this.plans.get(plan);
    if (!entries) {
      entries = new Map(plan.entries.map(entry => [`${entry.chunkX}:${entry.chunkZ}`, entry]));
      this.plans.set(plan, entries);
    }
    return entries.get(key);
  }

  physicalBand(view, kind, index, band, compatible) {
    if (kind !== 'tree' || band !== 'impostor') return band;
    return compatible && view.impostorAtlases?.[index] && view.impostorBatches?.[index]?.batch?.geometry
      ? 'impostor' : 'impostor-fallback';
  }

  prototypeCost(view, kind, index, band) {
    if (band === 'culled') return { triangles: 0, draws: 0, shadowTriangles: 0, shadowDraws: 0 };
    const near = band === 'near' || kind === 'detail';
    let parts = near ? view.prototypes?.[index] : view.proxyPrototypes?.[index];
    if (kind === 'tree' && band === 'impostor') {
      const batch = view.impostorBatches?.[index]?.batch;
      if (batch?.geometry) parts = batch.mesh ?? batch;
    }
    // Cluster aggregation is estimated by per-tree proxy cost, not a fabricated cluster count.
    if (!parts) return null;
    if (this.prototypeCosts.has(parts)) return this.prototypeCosts.get(parts);
    const cost = partsRenderCost(parts, part => near && (
      kind === 'rock' || (kind === 'tree' && (part.kind !== 'leaf' || view.config?.enhancements?.crownShadows === true))
      || (kind === 'detail' && view.layerConfig?.castShadow === true)
    ));
    this.prototypeCosts.set(parts, cost);
    return cost;
  }

  *manifest(view, kind, key, placements, transitionCosts = false) {
    const requested = emptyRenderCost(), selected = emptyRenderCost();
    if (!placements?.length) return { requested, selected };
    if (!Array.isArray(placements)) {
      requested.unknown = selected.unknown = placements.length;
      return { requested, selected };
    }
    const entry = this.planEntry(view, key);
    const baseline = entry?.baselineBand ?? (entry?.band === 'culled' || (!entry && view.previousPlan) ? 'culled' : 'near');
    const selectedBand = entry?.band ?? baseline;
    const selectedBands = entry?.representations
      ? [...new Set(entry.representations.filter(rep => rep.fade > 0 && rep.band !== 'culled').map(rep => rep.band))]
      : selectedBand === 'culled' ? [] : [selectedBand];
    if (baseline === 'culled' && selectedBands.length === 0 && (!transitionCosts || selectedBand === 'culled')) return { requested, selected };
    const options = entry?.admissionOptions?.map(option => ({ ...option, cost: emptyRenderCost(), seen: new Set(),
      ...(transitionCosts ? { transitionCost: emptyRenderCost(), transitionSeen: new Set() } : {}) }));
    const activeBands = transitionCosts ? [...new Set([...selectedBands, selectedBand].filter(band => band !== 'culled'))] : [];
    const active = emptyRenderCost(), current = emptyRenderCost();
    const activeDraws = new Set(), currentDraws = new Set();
    const needsImpostor = baseline === 'impostor' || selectedBands.includes('impostor')
      || activeBands.includes('impostor') || options?.some(option => option.band === 'impostor');
    const counts = new Map();
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i];
      const index = kind === 'tree' && typeof view.resolvePalettePrototypeIndex === 'function'
        ? view.resolvePalettePrototypeIndex(placement) : placement.prototypeIndex;
      const compatible = kind === 'tree' && needsImpostor && isTreeImpostorMorphologyCompatible(placement);
      const groupKey = `${index}:${Number(compatible)}`;
      let group = counts.get(groupKey);
      if (!group) counts.set(groupKey, group = { index, compatible, count: 0 });
      group.count++;
      if ((i & 63) === 63) yield;
    }
    const requestedDraws = new Set(), selectedDraws = new Set();
    const accumulate = (target, seen, index, band, compatible, count) => {
      const physical = this.physicalBand(view, kind, index, band, compatible);
      const groupKey = `${index}:${physical}`;
      const cost = this.prototypeCost(view, kind, index, physical);
      addRenderCost(target, batchRenderCost(cost, count, this.passes, seen.has(groupKey) ? 0 : 1));
      seen.add(groupKey);
    };
    for (const { index, compatible, count } of counts.values()) {
      accumulate(requested, requestedDraws, index, baseline, compatible, count);
      for (const band of selectedBands) accumulate(selected, selectedDraws, index, band, compatible, count);
      if (transitionCosts) {
        accumulate(current, currentDraws, index, selectedBand, compatible, count);
        for (const band of activeBands) accumulate(active, activeDraws, index, band, compatible, count);
      }
      for (const option of options ?? []) {
        accumulate(option.cost, option.seen, index, option.band, compatible, count);
        if (transitionCosts) for (const band of new Set([...activeBands, option.band])) {
          accumulate(option.transitionCost, option.transitionSeen, index, band, compatible, count);
        }
      }
      yield;
    }
    return { requested, selected, ...(transitionCosts ? { active, current } : {}),
      options: options?.map(({ factor, cost, transitionCost }) => ({ factor, cost, ...(transitionCosts ? { transitionCost } : {}) })) };
  }

  grass(layer, tile, kind, admissionFactors = null, eligible = false, transitionCosts = false) {
    const template = layer.templates?.[tile.builtBand ?? tile.band];
    const count = Math.min(tile.output?.count ?? 0, template?.instanceCount ?? Infinity);
    const factor = kind === 'card' ? (tile.regionalCountFactor ?? 1) : 1;
    const chosen = count > 0 && factor < 1 ? Math.max(1, Math.floor(count * factor)) : count;
    const cost = template ? partsRenderCost({ geometry: template }) : null;
    // Each tile gets a conservative share of one draw, even when pages batch tiles.
    const requested = batchRenderCost(cost, count, this.passes);
    const selected = batchRenderCost(cost, chosen, this.passes);
    const options = kind === 'card' && admissionFactors ? admissionFactors.map(factor => {
      const target = eligible && count > 0 ? Math.max(1, Math.floor(count * factor)) : count;
      return { factor, cost: batchRenderCost(cost, target, this.passes),
        ...(transitionCosts ? { transitionCost: batchRenderCost(cost, Math.max(chosen, target), this.passes) } : {}) };
    }) : undefined;
    return { requested, selected, options, ...(transitionCosts ? { active: selected, current: selected } : {}) };
  }

  water(slot) {
    const cost = partsRenderCost(slot.mesh, () => false);
    const result = batchRenderCost(cost, 1, { ...this.passes, reflection: 0 });
    return { requested: result, selected: result };
  }

  /** Full near town-kit cost, spatially attributed by immutable module positions. */
  *town(town, size, keyForPosition) {
    const mesh = town.mesh;
    if (!mesh?.modules) return null;
    const cached = this.townCosts.get(mesh);
    if (cached?.size === size) return cached.cells;
    const cells = new Map();
    const anchor = town.layout.anchor;
    for (const module of mesh.modules) {
      const cost = partsRenderCost(module.nearMeshes, part => part.castShadow === true);
      const counts = new Map();
      const values = module.values;
      for (let i = 0; i < values.length; i += 4) {
        const key = keyForPosition(anchor.x + values[i], anchor.z + values[i + 2], size);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if ((i & 255) === 252) yield;
      }
      for (const [key, count] of counts) {
        let entry = cells.get(key);
        if (!entry) cells.set(key, entry = emptyRenderCost());
        // Cache unmultiplied shadow and reflection costs; capture activity varies by sample.
        addRenderCost(entry, batchRenderCost(cost, count, { shadow: 1, reflection: 1 }));
        yield;
      }
    }
    this.townCosts.set(mesh, { size, cells });
    return cells;
  }

  /** Estimate the currently published town tiers from their visible instance rows. */
  *selectedTown(town, size, keyForPosition) {
    if (!town.mesh?.modules) return null;
    const cells = new Map();
    const anchor = town.layout.anchor;
    for (const module of town.mesh.modules) {
      for (const tier of [module.nearMeshes, module.farMeshes]) {
        // Kit parts within a tier share a placement order and count.
        const visible = (tier ?? []).filter(mesh => mesh.visible && mesh.count > 0);
        if (!visible.length) { yield; continue; }
        const first = visible[0];
        const matrices = first.instanceMatrix?.array;
        const count = first.count;
        if (!matrices || matrices.length < count * 16
            || visible.some(mesh => mesh.count !== count)) return null;
        const cost = partsRenderCost(visible, part => part.castShadow === true);
        const counts = new Map();
        for (let i = 0; i < count; i++) {
          const offset = i * 16;
          const key = keyForPosition(anchor.x + matrices[offset + 12], anchor.z + matrices[offset + 14], size);
          counts.set(key, (counts.get(key) ?? 0) + 1);
          if ((i & 63) === 63) yield;
        }
        for (const [key, instances] of counts) {
          let entry = cells.get(key);
          if (!entry) cells.set(key, entry = emptyRenderCost());
          addRenderCost(entry, batchRenderCost(cost, instances, this.passes));
          yield;
        }
      }
    }
    return cells;
  }

  townPasses(cost) {
    return { ...cost, shadowTriangles: cost.shadowTriangles * this.passes.shadow,
      shadowDraws: cost.shadowDraws * this.passes.shadow,
      reflectionTriangles: cost.reflectionTriangles * this.passes.reflection,
      reflectionDraws: cost.reflectionDraws * this.passes.reflection };
  }
}
