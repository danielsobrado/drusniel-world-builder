/** Exact canonical height lattice, gathered in bounded preparation steps. */
export function createConstructionGroundPatch(bounds, record, tileSize) {
  const margin = record.dimensions.thickness / 2 + 3;
  const minX = Math.floor((bounds.minX - margin) / tileSize);
  const maxX = Math.ceil((bounds.maxX + margin) / tileSize);
  const minZ = Math.floor(-(bounds.maxZ + margin) / tileSize);
  const maxZ = Math.ceil(-(bounds.minZ - margin) / tileSize);
  const width = maxX - minX + 1; const height = maxZ - minZ + 1;
  return { minX, minZ, width, height, tileSize, values: new Float64Array(width * height), cursor: 0 };
}

export function advanceConstructionGroundPatch(patch, terrainView, maxSamples = 16) {
  const started = performance.now();
  let sampled = 0;
  while (patch.cursor < patch.values.length && sampled < maxSamples) {
    const x = patch.minX + patch.cursor % patch.width;
    const z = patch.minZ + Math.floor(patch.cursor / patch.width);
    patch.values[patch.cursor++] = terrainView.worldStore?.getHeight
      ? terrainView.worldStore.getHeight(x, z)
      : terrainView.getCanonicalHeight(x * patch.tileSize, -z * patch.tileSize) ?? 0;
    sampled += 1;
    if (performance.now() - started >= 0.75) break;
  }
  return patch.cursor === patch.values.length;
}

export function constructionGroundSampler(patch) {
  return (worldX, worldZ) => {
    const x = worldX / patch.tileSize; const z = -worldZ / patch.tileSize;
    const ix = Math.floor(x); const iz = Math.floor(z);
    const lx = ix - patch.minX; const lz = iz - patch.minZ;
    if (lx < 0 || lz < 0 || lx + 1 >= patch.width || lz + 1 >= patch.height) {
      throw new Error('Construction geometry sampled outside its canonical ground patch.');
    }
    const offset = lz * patch.width + lx;
    const a = patch.values[offset]; const b = patch.values[offset + 1];
    const c = patch.values[offset + patch.width]; const d = patch.values[offset + patch.width + 1];
    const north = a + (b - a) * (x - ix);
    return north + (c + (d - c) * (x - ix) - north) * (z - iz);
  };
}
