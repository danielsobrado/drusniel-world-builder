import {
  attachConstructionGrowth,
  buildModuleGrowth,
  buildModuleMasonry,
  mergeModuleMasonryBatches,
} from '../compile/ConstructionMasonryBuilder.js';

const DEFAULT_PLACEMENTS_PER_SLICE = 8;

function buildOptions(state) {
  return {
    record: state.record,
    materials: state.materials,
    arcTable: state.arcTable,
    moduleOrigin: state.moduleOrigin,
    groundHeightAt: state.groundHeightAt,
    pathInterval: state.pathInterval,
    lodBand: state.lodBand,
  };
}

export class ConstructionModuleBuilder {
  constructor({ terrainView, placementsPerSlice = DEFAULT_PLACEMENTS_PER_SLICE }) {
    this.terrainView = terrainView;
    this.placementsPerSlice = Math.max(1, Math.floor(placementsPerSlice));
  }

  createState({
    key,
    record,
    materials,
    arcTable,
    moduleOrigin,
    pathInterval,
    lodBand,
    placements,
    terrainRevision,
    retainedGrowth = null,
  }) {
    return {
      key,
      record,
      materials,
      arcTable,
      moduleOrigin,
      pathInterval,
      lodBand,
      placements,
      terrainRevision,
      retainedGrowth,
      groundHeightAt: (x, z) => this.terrainView.getCanonicalHeight(x, z) ?? 0,
      offset: 0,
      batches: [],
      growth: retainedGrowth,
      ownsGrowth: false,
      growthPrepared: Boolean(retainedGrowth) || placements.length === 0,
      merged: false,
    };
  }

  advance(state) {
    if (state.offset < state.placements.length) {
      const end = Math.min(
        state.placements.length,
        state.offset + this.placementsPerSlice,
      );
      const slice = state.placements.slice(state.offset, end);
      state.batches.push(buildModuleMasonry(slice, {
        ...buildOptions(state),
        includeGrowth: false,
      }));
      state.offset = end;
      return { done: false, built: null };
    }

    if (!state.growthPrepared) {
      state.growth = buildModuleGrowth(state.placements, buildOptions(state));
      state.ownsGrowth = Boolean(state.growth);
      state.growthPrepared = true;
      return { done: false, built: null };
    }

    if (!state.merged) {
      const built = mergeModuleMasonryBatches(state.batches);
      state.batches.length = 0;
      if (state.growth) {
        state.growth.castShadow = state.lodBand !== 'coarse';
        attachConstructionGrowth(built, state.growth);
        state.ownsGrowth = false;
      }
      state.merged = true;
      return { done: true, built };
    }

    return { done: true, built: null };
  }

  dispose(state) {
    if (!state) return;
    for (const batch of state.batches ?? []) {
      for (const mesh of batch.meshes ?? []) mesh.geometry.dispose();
    }
    state.batches?.splice(0);
    if (state.ownsGrowth) state.growth?.geometry?.dispose();
    state.growth = null;
    state.ownsGrowth = false;
  }
}
