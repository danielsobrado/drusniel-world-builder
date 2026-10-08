function isShared(resource) {
  return resource?.userData?.sharedSurface === true;
}

/** Retire unused material textures without releasing maps still used by material clones. */
export function disposeUnusedModelMaterials(materials, retained = new Set()) {
  const retainedTextures = new Set([...retained].flatMap((m) => Object.values(m).filter((v) => v?.isTexture)));
  const textures = new Set();
  for (const material of new Set(materials)) {
    if (retained.has(material) || isShared(material)) continue;
    for (const value of Object.values(material))
      if (value?.isTexture && !isShared(value) && !retainedTextures.has(value)) textures.add(value);
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}

export function disposeModelParts(parts) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  for (const part of parts) {
    geometries.add(part.geometry);
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      // Procedural surface materials and their textures are shared across the
      // whole catalog, so only this part's own resources may be released.
      if (isShared(material)) {
        continue;
      }
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture && !isShared(value)) {
          textures.add(value);
        }
      }
    }
  }

  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
