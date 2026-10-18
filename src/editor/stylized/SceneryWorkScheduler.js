export const SCENERY_WORK_ORDER = Object.freeze(['fields', 'meadow', 'rockManifest', 'treeManifest', 'rock', 'tree', 'bush', 'detail', 'flower', 'settlement', 'town', 'objects']);
/** Rotate the first preparation turn without granting another frame allowance. */
export class SceneryWorkScheduler {
  constructor() { this.cursor = 0; this.first = 0; }
  beginFrame(consumers, shouldYield = null) {
    this.first = this.cursor;
    this.cursor = (this.cursor + 1) % SCENERY_WORK_ORDER.length;
    return this.flush(consumers, shouldYield);
  }
  flush(consumers, shouldYield = null) {
    const visited = [];
    for (let offset = 0; offset < SCENERY_WORK_ORDER.length; offset++) {
      if (shouldYield?.()) break;
      const name = SCENERY_WORK_ORDER[(this.first + offset) % SCENERY_WORK_ORDER.length];
      const consumer = consumers[name];
      if (!consumer?.pending() || consumer.blocked?.()) continue;
      consumer.run(); visited.push(name);
    }
    return visited;
  }
}

export function createSceneryConsumers(surface) {
  const viewConsumer = (layer, property = 'pendingRebuild') => ({
    pending: () => Boolean(surface[`${layer}View`]?.[property]),
    run: () => {
      sync(layer, [surface[`${layer}View`]], property);
      surface[`${layer}BuildQueue`].flush((_job, shouldYield) => surface[`${layer}View`]?.applyPendingRebuild(shouldYield) ?? false);
    },
  });
  const sync = (layer, views, property) => surface.syncSceneryQueue(surface[`${layer}BuildQueue`], views, property);
  const manifestConsumer = layer => ({
    pending: () => (surface[`${layer}View`]?.manifestStore?.queue.size ?? 0) > 0,
    run: () => surface[`${layer}View`].manifestStore.flush({ consumeCompleted: false }),
  });
  return {
    objects: {
      pending: () => (surface.terrainView?.objectView?.pendingObjectUpdates?.size ?? 0) > 0,
      run: () => surface.terrainView.objectView.advancePreparation(surface.shouldYieldWork),
    },
    settlement: {
      pending: () => Boolean(surface.terrainView?.settlementView?.hasPendingWork?.()),
      run: () => surface.terrainView.settlementView.advanceWork(surface.shouldYieldWork),
    },
    town: {
      pending: () => {
        const streamer = surface.terrainView?.townRuntime?.streamer;
        return Boolean(streamer?.assets.ready && (streamer.pending.size || streamer.buildJob));
      },
      run: () => surface.terrainView.townRuntime.streamer.buildNearest(undefined, undefined, surface.shouldYieldWork),
    },
    fields: {
      pending: () => (surface.preparedPlacement?.completed?.length ?? 0) > (surface.preparedPlacement?.completedHead ?? 0),
      run: () => surface.preparedPlacement.flush(surface.shouldYieldWork),
    },
    meadow: { pending: () => Boolean(surface.meadowGrass?.frameInputs) &&
      (surface.meadowGrass.blades.staleTiles.length + (surface.meadowGrass.cards?.staleTiles.length ?? 0) > 0),
      run: () => surface.meadowGrass?.prepareFrame(surface.shouldYieldWork, surface.workBudgetProvider) },
    rockManifest: manifestConsumer('rock'), treeManifest: manifestConsumer('tree'),
    rock: viewConsumer('rock'), tree: viewConsumer('tree', 'pendingLodRebuild'), bush: viewConsumer('bush'),
    detail: { pending: () => surface.detailViews.some(view => view.pendingRebuild), run: () => {
      sync('detail', surface.detailViews);
      surface.detailBuildQueue.flush((job, shouldYield) => {
        const view = surface.detailViews.find(view => job.key.startsWith(`${view.layerName}:`));
        return view?.applyPendingRebuild(shouldYield) ?? false;
      });
    } },
    flower: { pending: () => surface.flowerBuildQueue.size > 0, run: () => surface.flowerBuildQueue.flush((job, shouldYield) => job.slot.applyPendingRebuild(shouldYield)) },
  };
}
