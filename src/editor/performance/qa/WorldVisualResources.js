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
      for (const value of Object.values(material)) {
        if (!value?.isTexture || textures.has(value)) continue;
        textures.add(value);
        textureBytes += value.mipmaps?.length
          ? value.mipmaps.reduce((sum,mip) => sum + (mip.data?.byteLength ?? 0),0)
          : value.image?.data?.byteLength ?? (value.image?.width ?? 0)*(value.image?.height ?? 0)*4;
      }
    }
  });
  const placementBytes = editor.stylizedSurface.preparedPlacement?.arrayBytes ?? 0;
  const interactionBytes = countArray(editor.stylizedSurface.meadowGrass?.interaction?.pixels)
    + countArray(editor.stylizedSurface.meadowGrass?.spellGround?.pixels);
  return { label:'tracked resource bytes', geometryBytes, textureBytes, placementBytes, interactionBytes,
    total:geometryBytes+textureBytes+placementBytes+interactionBytes,
    included:['scene geometry attributes','instance matrices/colors','material texture sources/mips','prepared placement arrays','interaction pixels'] };
}
