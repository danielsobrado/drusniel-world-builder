export const SCENERY_WORK_ORDER = Object.freeze(['meadow', 'rock', 'tree', 'bush', 'detail', 'flower']);
/** Rotate the first preparation turn without granting another frame allowance. */
export class SceneryWorkScheduler {
  constructor() { this.cursor = 0; this.first = 0; }
  beginFrame(consumers, shouldYield = null) {
    this.first = this.cursor;
    this.cursor = (this.cursor + 1) % SCENERY_WORK_ORDER.length;
    return this.flush(consumers, shouldYield, true);
  }
  flush(consumers, shouldYield = null, oneTurn = false) {
    const visited = [];
    for (let offset = 0; offset < SCENERY_WORK_ORDER.length; offset++) {
      if (shouldYield?.()) break;
      const name = SCENERY_WORK_ORDER[(this.first + offset) % SCENERY_WORK_ORDER.length];
      const consumer = consumers[name];
      if (!consumer?.pending() || consumer.blocked?.()) continue;
      consumer.run(); visited.push(name);
      if (oneTurn) break;
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
  return {
    meadow: { pending: () => Boolean(surface.meadowGrass?.frameInputs) &&
      (surface.meadowGrass.blades.staleTiles.length + (surface.meadowGrass.cards?.staleTiles.length ?? 0) > 0),
      run: () => surface.meadowGrass?.prepareFrame(surface.shouldYieldWork, surface.workBudgetProvider) },
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
