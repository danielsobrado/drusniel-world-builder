/** Runs in the page. Compare object identities without keeping disposed GPU resources alive. */
export function observeLodRevisitResources() {
  const phases = new Set(['first-visit', 'cold-region', 'revisit-hold']);
  const snapshots = window.__lodRevisitResources = [];
  let initialKeys, initialManifests, initialGpuResources, initialRenderer;
  const observe = () => {
    const qa = window.__perfQa;
    if (qa?.status === 'done') {
      for (const phase of phases) snapshots.push({ phase, unavailable: 'checkpoint not observed' });
      return;
    }
    const { phase, elapsedSeconds } = qa?.live ?? {};
    if (qa?.recording && phases.has(phase) && elapsedSeconds >= qa.config.durationSeconds / 5) {
      phases.delete(phase);
      const { terrainView, stylizedSurface } = window.__editor;
      const store = stylizedSurface.treeView?.manifestStore;
      const slots = terrainView.slots.filter(slot => slot.key && slot.mesh.visible && !slot.loading);
      const keys = new Set(slots.map(slot => slot.key));
      const renderer = terrainView.renderer;
      const memory = renderer?.info?.memoryMap;
      if (phase === 'first-visit') {
        initialKeys = keys;
        initialManifests = store?.cache instanceof Map ? new Set(store.cache.keys()) : null;
        initialRenderer = new WeakRef(renderer);
        const attributes = slots.flatMap(({ mesh }) => [
          ...Object.values(mesh.geometry.attributes), mesh.geometry.index,
        ]);
        const atlases = (stylizedSurface.treeView?.impostorAtlases ?? []).flatMap(atlas =>
          atlas ? [atlas.albedo, atlas.normal] : []);
        initialGpuResources = typeof memory?.has === 'function'
          ? [...new Set([...attributes, ...atlases].filter(resource => resource && memory.has(resource)))]
            .map(resource => new WeakRef(resource)) : null;
      }
      const sameRenderer = initialRenderer ? initialRenderer.deref() === renderer : null;
      let unaccounted = null, collected = null;
      if (initialGpuResources && sameRenderer && typeof memory?.has === 'function') {
        unaccounted = 0;
        collected = 0;
        for (const ref of initialGpuResources) {
          const resource = ref.deref();
          if (!resource) collected++;
          else if (!memory.has(resource)) unaccounted++;
        }
      }
      snapshots.push({
        phase, elapsedSeconds, origin: terrainView.floatingOrigin.getState(),
        visibleTerrainKeys: keys.size,
        firstVisitTerrainKeysAbsent: initialKeys ? [...initialKeys].filter(key => !keys.has(key)).length : null,
        trackedManifestEntries: initialManifests?.size ?? null,
        firstVisitManifestsAbsent: initialManifests && store?.cache
          ? [...initialManifests].filter(key => !store.cache.has(key)).length : null,
        trackedGpuResources: initialGpuResources?.length ?? null,
        sameRenderer,
        firstVisitGpuResourcesUnaccounted: unaccounted,
        firstVisitGpuResourcesCollected: collected,
      });
    }
    if (phases.size) requestAnimationFrame(observe);
  };
  requestAnimationFrame(observe);
}
