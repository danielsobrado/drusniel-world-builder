/** Covers render planning, blocker dependencies, and precise sample neighbors. */
export function placementPreparationRadius(config, loadRadius = 0) {
  const lod = config.lod;
  const tree = lod?.tree ?? {};
  const treeRadius = lod?.enabled === false ? config.trees.residentRadius ?? 2
    : Math.max(tree.meshRadius ?? 2, tree.proxyRadius ?? 3, tree.impostorRadius ?? 5,
      tree.clusterPixels > 0 ? tree.clusterRadius ?? 8 : 0);
  const rockRadius = lod?.enabled === false ? config.rocks.residentRadius ?? 2
    : Math.max(lod?.rock?.meshRadius ?? 2, lod?.rock?.proxyRadius ?? 3);
  const bushRadius = lod?.enabled === false ? config.bushes?.residentRadius ?? 1
    : Math.max(lod?.bush?.meshRadius ?? 1, lod?.bush?.proxyRadius ?? 2);
  const detailRadius = Math.max(...['groundDetails','tropicalKit','aquaticPlants','shoreLife'].map(name => config[name]?.enabled === false ? 0 : config[name]?.residentRadius ?? 1));
  return Math.max(loadRadius + 2, treeRadius + 4, rockRadius + 3, bushRadius + 4, detailRadius + 3);
}

export function withinPreparationWindow(x, z, window) {
  return !window || Math.max(Math.abs(x - window.x), Math.abs(z - window.z)) <= window.radius;
}
