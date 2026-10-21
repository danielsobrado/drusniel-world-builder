const QUEUES = ['grass', 'flower', 'tree', 'rock', 'bush', 'detail', 'aquatic', 'tropical'];
const PRESSURE_DELAY_MS = 150;
const PRESSURE_RAMP_MS = 450;
const QUIET_GRACE_MS = 150;

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
  if (surface.terrainView?.objectView?.pendingObjectUpdates?.size > 0) return true;
  if (surface.terrainView?.settlementView?.hasPendingWork?.()) return true;
  if (surface.terrainView?.macroFarTerrain?.getPreparationStatus?.().ready === false) return true;
  if (surface.terrainView?.worldAmbience?.preparing || surface.terrainView?.worldAmbience?.system.ground?.job
      || surface.terrainView?.minimapPreparation?.minimapRequest) return true;
  const towns = surface.terrainView?.townRuntime?.streamer;
  if (towns?.assets.ready && (towns.pending.size > 0 || towns.buildJob
      || [...(towns.towns?.values() ?? [])].some(town => town.selectionJob))) return true;
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
    this.quietSince = null;
    this.ageMs = 0;
    this.floorMs = minimumMs;
  }

  update(now, pending) {
    if (pending) {
      this.quietSince = null;
      this.since ??= now;
    } else if (this.since !== null) {
      // A completed manifest often publishes its dependent draw next frame.
      // Do not restart the ramp in that brief gap between preparation stages.
      this.quietSince ??= now;
      if (now - this.quietSince >= QUIET_GRACE_MS) this.since = null;
    }
    this.ageMs = this.since === null ? 0 : Math.max(0, now - this.since);
    const pressure = Math.min(1, Math.max(0, (this.ageMs - PRESSURE_DELAY_MS) / PRESSURE_RAMP_MS));
    this.floorMs = Math.min(this.maximumMs,
      this.minimumMs + pressure * (this.maximumMs - this.minimumMs));
  }
}
