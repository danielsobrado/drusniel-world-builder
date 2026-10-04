/** Planted evaluation and roots are part of the same resumable manifest. */
export function* finalizeTreeManifest(store, state, generated, chunkX, chunkZ) {
  const context = state.context;
  const raw = [...generated];
  const plants = store.editStore.plantedForChunk(
    chunkX,
    chunkZ,
    store.terrainView.chunkWorldSize,
  );
  for (let index = 0; index < plants.length; index++) {
    yield;
    const plant = plants[index];
    const habitat = store.forestField?.sample(plant.x, plant.z) ?? {
      patchId: null,
      profileKey: null,
      structure: null,
      suitability: 1,
      patchCoverage: 1,
      patchEdge: 0,
      slope: 0,
      elevation: store.terrainView.getCanonicalHeight(plant.x, plant.z),
      waterWeight: 1,
    };
    const candidate = {
      stableId: plant.stableId,
      ownerChunkX: chunkX,
      ownerChunkZ: chunkZ,
      index: state.candidateBudget + index,
      x: plant.x,
      z: plant.z,
      height: store.terrainView.getCanonicalHeight(plant.x, plant.z),
      scale: store.config.trees.minScale,
      rotationY: 0,
      prototypeIndex: 0,
      radius: context.clearRadius,
      priority: 0,
      speciesId: plant.speciesId,
      ageClass: plant.ageClass,
    };
    const ecological = store.speciesRegistry.select(candidate, {
      ...habitat,
      profileKey: habitat.profileKey ?? 'temperate_deciduous_forest',
    });

    raw.push(Object.freeze({
      ...candidate,
      ...ecological,
      patchId: habitat.patchId ?? `planted:${plant.stableId}`,
      forestProfileKey: habitat.profileKey,
      forestStructure: habitat.structure ?? 'planted',
      forestSuitability: habitat.suitability,
      forestPatchCoverage: habitat.patchCoverage,
      forestPatchEdge: habitat.patchEdge,
      forestSlope: habitat.slope,
      forestElevation: habitat.elevation,
      planted: true,
    }));
  }

  const fitted = [];
  const species = new Map(), patches = new Set();
  for (const source of raw) {
    yield;
    const record = store.fitPlacement ? store.fitPlacement(source) : source;
    if (!record) continue;
    fitted.push(record);
    if (record.patchId) patches.add(record.patchId);
    species.set(record.speciesId, (species.get(record.speciesId) ?? 0) + 1);
  }
  state.species = species;
  state.patchCount = patches.size;
  return Object.freeze(fitted);
}
