/** Covers render planning, blocker dependencies, and precise sample neighbors. */
export function placementPreparationRadius(config, loadRadius = 0) {
  const lod = config.lod;
  const tree = lod?.tree ?? {};
  const treeRadius = lod?.enabled === false ? config.trees.residentRadius ?? 2
    : Math.max(tree.meshRadius ?? 2, tree.proxyRadius ?? 3, tree.impostorRadius ?? 5,
      tree.clusterPixels > 0 ? tree.clusterRadius ?? 8 : 0);
  const rockRadius = lod?.enabled === false ? config.rocks.residentRadius ?? 2
    : Math.max(lod?.rock?.meshRadius ?? 2, lod?.rock?.proxyRadius ?? 3);
  return Math.max(loadRadius + 2, treeRadius + 4, rockRadius + 3);
}

export function withinPreparationWindow(x, z, window) {
  return !window || Math.max(Math.abs(x - window.x), Math.abs(z - window.z)) <= window.radius;
}
