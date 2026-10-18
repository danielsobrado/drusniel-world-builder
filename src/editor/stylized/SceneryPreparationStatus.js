/** On-demand diagnostics, including resumable jobs between queue synchronizations. */
export function sceneryPreparationStatus(surface) {
  const names = ['grass','flower','tree','rock','bush','detail'];
  const queues = Object.fromEntries(names.map(name => [name, surface[`${name}BuildQueue`]?.getDiagnostics() ?? emptyQueue()]));
  for (const name of ['tree','rock']) queues[`${name}Manifest`] = surface[`${name}View`]?.manifestStore?.queue.getDiagnostics() ?? emptyQueue();
  const staged = [surface.rockView,surface.treeView,surface.bushView,...(surface.detailViews ?? [])]
    .filter(view => view?.stagedRebuild || view?.pendingRebuild || view?.pendingLodRebuild);
  const queueDepth = Object.values(queues).reduce((sum,q) => sum+q.depth,0);
  const fields = surface.preparedPlacement?.pending?.size ?? 0;
  const meadow = surface.meadowGrass?.getState().building ?? 0;
  const draws = surface.terrainView.drawPreparation?.pending.size ?? 0;
  const variants = surface.preparationVariants?.() ?? 0;
  const waterObstacles = surface.waterObstacleUpdates?.pending ?? 0;
  const errors = [surface.preparedPlacement?.error,surface.rockView?.assetError].filter(Boolean).map(error => String(error.message ?? error));
  errors.push(...(surface.variantResidency?.getPreparationStatus().errors ?? []));
  const settlements = surface.terrainView.settlementView?.getPreparationStatus?.() ?? { ready: true };
  const towns = surface.terrainView.townRuntime?.getPreparationStatus?.() ?? { ready: true };
  const objects = surface.terrainView.objectView?.pendingObjectUpdates?.size ?? 0;
  const farTerrain = surface.terrainView.macroFarTerrain?.getPreparationStatus?.() ?? { ready: true };
  return { ready: queueDepth+fields+meadow+draws+variants+staged.length+waterObstacles === 0 && errors.length === 0
      && settlements.ready && towns.ready && objects === 0 && farTerrain.ready, settlements, towns, objects, farTerrain,
    queueDepth, fields, meadow, draws, variants, waterObstacles, staged: staged.length, queues, errors,
    blockedJobs: staged.filter(view => view.blockedDependency).map(view => ({
      key: (view.pendingRebuild ?? view.pendingLodRebuild ?? view.stagedRebuild?.job)?.key,
      focus: view.stagedRebuild?.job.focus, revision: view.stagedRebuild?.revision,
      lastProgressAt: view.stagedRebuild?.lastProgressAt, ...view.blockedDependency,
    })) };
}
const emptyQueue = () => ({depth:0,oldestAgeMs:0,completed:0,advanced:0,blocked:0,cancelled:0});
