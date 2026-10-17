/** QA-only survey of source geography; no camera cuts or residency changes. */
export function worldVisualNeighborhood(editor) {
  const terrain = editor.terrainView, camera = editor.viewModeController.camera;
  const center = terrain.floatingOrigin.toCanonical(camera.position.x, camera.position.z);
  const field = editor.stylizedSurface.treeView?.manifestStore?.forestField;
  const tileSize = terrain.worldStore.tileSize;
  const samples = [];
  for (const distance of [16, 64, 256, 1024, 4096]) {
    for (let heading = 0; heading < 8; heading++) {
      const radians = heading * Math.PI / 4;
      const x = center.x + Math.sin(radians) * distance;
      const z = center.z - Math.cos(radians) * distance;
      const height = terrain.getCanonicalHeight(x, z);
      const tileId = terrain.worldStore.getTile(Math.floor(x / tileSize), Math.floor(-z / tileSize));
      const habitat = distance <= 64 ? field?.sample(x, z) : null;
      samples.push({ distance, heading: heading * 45, x, z, height, tileId,
        elevationAngle: Math.atan2(height - camera.position.y, distance) * 180 / Math.PI,
        habitat: habitat ? { profileKey: habitat.profileKey, patchCoverage: habitat.patchCoverage,
          patchEdge: habitat.patchEdge, slope: habitat.slope } : null });
    }
  }
  return { center, height: terrain.getCanonicalHeight(center.x, center.z), samples };
}
