const QUEUES = ['grass', 'flower', 'tree', 'rock', 'bush', 'detail', 'aquatic', 'tropical'];

export function hasPreparationBacklog(surface) {
  if (!surface) return false;
  for (const name of QUEUES) {
    if (surface[`${name}BuildQueue`]?.size > 0) return true;
    const view = surface[`${name}View`];
    if (view?.pendingRebuild || view?.pendingLodRebuild || view?.stagedRebuild) return true;
  }
  if (surface.detailViews?.some(view => view.pendingRebuild || view.stagedRebuild)) return true;
  if (surface.treeView?.manifestStore?.queue?.size > 0 || surface.rockView?.manifestStore?.queue?.size > 0) return true;
  if (surface.preparedPlacement?.pending?.size > 0 || surface.terrainView?.commitQueue?.size > 0) return true;
  if (surface.terrainView?.drawPreparation?.pending?.size > 0) return true;
  return (surface.meadowGrass?.blades?.staleTiles?.length ?? 0)
    + (surface.meadowGrass?.cards?.staleTiles?.length ?? 0) > 0;
}

/** Sustained preparation can use the existing ceiling when a high FPS target
 * otherwise leaves only the tiny safety floor forever. Never renews an allowance. */
export class PreparationPressure {
  constructor({ minimumMs = 0.25, maximumMs = 1.2 } = {}) {
    this.minimumMs = minimumMs;
    this.maximumMs = maximumMs;
    this.since = null;
    this.ageMs = 0;
    this.floorMs = minimumMs;
  }

  update(now, pending) {
    this.since = pending ? this.since ?? now : null;
    this.ageMs = this.since === null ? 0 : Math.max(0, now - this.since);
    const pressure = Math.min(1, Math.max(0, (this.ageMs - 500) / 1000));
    this.floorMs = Math.min(this.maximumMs,
      this.minimumMs + pressure * (this.maximumMs - this.minimumMs));
  }
}
