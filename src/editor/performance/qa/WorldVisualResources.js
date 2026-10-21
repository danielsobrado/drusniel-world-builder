/** Bounded, on-demand accounting. This is tracked resources, not driver GPU memory. */
export function trackedWorldResources(editor) {
  const geometries = new Set(), arrays = new Set(), textures = new Set();
  let geometryBytes = 0, textureBytes = 0;
  const countArray = array => {
    if (!array || arrays.has(array)) return 0;
    arrays.add(array); return array.byteLength ?? 0;
  };
  editor.terrainView.scene.traverse(object => {
    const geometry = object.geometry;
    if (geometry && !geometries.has(geometry)) {
      geometries.add(geometry);
      geometryBytes += countArray(geometry.index?.array);
      for (const attribute of Object.values(geometry.attributes)) geometryBytes += countArray(attribute.array ?? attribute.data?.array);
    }
    geometryBytes += countArray(object.instanceMatrix?.array) + countArray(object.instanceColor?.array);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      for (const value of [...Object.values(material), ...(material.resourceTextures ?? [])]) {
        if (!value?.isTexture || textures.has(value)) continue;
        textures.add(value);
        textureBytes += value.mipmaps?.length
          ? value.mipmaps.reduce((sum,mip) => sum + (mip.data?.byteLength ?? 0),0)
          : value.image?.data?.byteLength ?? (value.image?.width ?? 0)*(value.image?.height ?? 0)*4;
      }
    }
  });
  const placementBytes = editor.stylizedSurface.preparedPlacement?.arrayBytes ?? 0;
  let waterTextureBytes = 0;
  const waterSlots = editor.stylizedSurface.waterSlots ?? [];
  for (const slot of waterSlots) for (const texture of [slot.waterFieldTexture, slot.waterFlowTexture, slot.waterAppearanceTexture, slot.waterObstacleTexture]) {
    if (!texture || textures.has(texture)) continue;
    textures.add(texture); waterTextureBytes += countArray(texture.image?.data);
  }
  const interactionBytes = [editor.stylizedSurface.meadowGrass?.interaction,editor.stylizedSurface.meadowGrass?.spellGround]
    .reduce((bytes,map)=>bytes+[map?.pixels,map?.scratch,map?.press,map?.pressScratch].reduce((n,array)=>n+countArray(array),0),0);
  const workers = editor.terrainView.worldStore.chunkWorker;
  const settlements = { main: editor.terrainView.worldStore.generator.settlementField?.planCache?.getStatus() ?? null,
    terrainWorkers: [...(workers?.settlementCacheStatuses?.values() ?? [])],
    authority: [...(workers?.settlementWorker?.settlementCacheStatuses?.values() ?? [])] };
  let settlementSkylineBytes = 0;
  for (const [entry] of editor.terrainView.worldStore.generator.settlementField?.planCache?.entries ?? []) {
    for (const name of ['positions', 'normals', 'colors', 'indices']) settlementSkylineBytes += countArray(entry.skyline?.[name]);
  }
  return { label:'tracked resource bytes', geometryBytes, textureBytes, waterTextureBytes, waterSlots: waterSlots.length, placementBytes, interactionBytes,
    settlements, settlementSkylineBytes,
    total:geometryBytes+textureBytes+waterTextureBytes+placementBytes+interactionBytes+settlementSkylineBytes,
    included:['scene geometry attributes','instance matrices/colors','material texture sources/mips','prepared placement arrays','interaction pixels, scroll scratch and float press buffers'] };
}
