/** Runs in the page. Compare the same objects so a reused slot is not called an eviction. */
export function observeLodRevisitResources() {
  const phases = new Set(['first-visit', 'cold-region', 'revisit-hold']);
  const snapshots = window.__lodRevisitResources = [];
  let initialKeys, initialManifests, initialGpuResources;
  const observe = () => {
    const qa = window.__perfQa;
    if (qa?.status === 'done') return;
    const { phase, elapsedSeconds } = qa?.live ?? {};
    if (qa?.recording && phases.has(phase) && elapsedSeconds >= qa.config.durationSeconds / 5) {
      phases.delete(phase);
      const { terrainView, stylizedSurface } = window.__editor;
      const store = stylizedSurface.treeView?.manifestStore;
      const slots = terrainView.slots.filter(slot => slot.key && slot.mesh.visible);
      const keys = new Set(slots.map(slot => slot.key));
      const memory = terrainView.renderer.info.memoryMap;
      if (phase === 'first-visit') {
        initialKeys = keys;
        initialManifests = store?.cache instanceof Map ? new Set(store.cache.keys()) : null;
        const attributes = slots.flatMap(({ mesh }) => [
          ...Object.values(mesh.geometry.attributes), mesh.geometry.index,
        ]);
        const atlases = (stylizedSurface.treeView?.impostorAtlases ?? []).flatMap(atlas =>
          atlas ? [atlas.albedo, atlas.normal] : []);
        initialGpuResources = memory?.has
          ? new Set([...attributes, ...atlases].filter(resource => resource && memory.has(resource))) : null;
      }
      snapshots.push({
        phase, elapsedSeconds, origin: terrainView.floatingOrigin.getState(),
        visibleTerrainKeys: keys.size,
        firstVisitTerrainKeysAbsent: initialKeys ? [...initialKeys].filter(key => !keys.has(key)).length : null,
        trackedManifestEntries: initialManifests?.size ?? null,
        firstVisitManifestsAbsent: initialManifests && store?.cache
          ? [...initialManifests].filter(key => !store.cache.has(key)).length : null,
        trackedGpuResources: initialGpuResources?.size ?? null,
        firstVisitGpuResourcesUnaccounted: initialGpuResources && memory?.has
          ? [...initialGpuResources].filter(resource => !memory.has(resource)).length : null,
      });
    }
    if (phases.size) requestAnimationFrame(observe);
  };
  requestAnimationFrame(observe);
}
