/**
 * Standardized multi-substrate WSC PR 0 environment test fixture.
 *
 * Uses ordinary authored chunk overrides and placed runtime objects consumed by
 * the real terrain workers, scatter views, and production materials — zero
 * fixture-only shaders. Places identical trees, rocks, bushes, walls, and timber
 * structures across grassland, temperate rainforest, bare road soil, desert sand,
 * and tundra snow so material coherence can be compared under controlled lighting.
 */

export const WSC_FIXTURE = Object.freeze({
  centerX: -10240,
  centerZ: 10240,
  sideMeters: 256,
  baseHeight: 24,
});

function substrateTileAt(dx, dz) {
  // Central road cross provides bare soil / road verge right beside all 4 biomes.
  if (Math.abs(dx) <= 4 || Math.abs(dz) <= 4) return 13;
  // NW: Grassland (4), NE: Temperate Rainforest (8), SW: Hot Desert (1), SE: Tundra / Snow (10).
  if (dx < 0 && dz > 0) return 4;
  if (dx >= 0 && dz > 0) return 8;
  if (dx < 0 && dz <= 0) return 1;
  return 10;
}

function fixtureHeightAt(dx, dz, baseHeight) {
  // Gentle mound in SE snow quadrant (exposes slope rock vs snow) and shallow hollow in NE forest.
  if (dx > 28 && dz < -28) {
    const r = Math.hypot(dx - 54, dz + 54);
    if (r < 26) {
      const t = 1 - r / 26;
      return baseHeight + t * t * 8.5;
    }
  }
  if (dx > 18 && dz > 18) {
    const r = Math.hypot(dx - 44, dz - 44);
    if (r < 22) {
      const t = 1 - r / 22;
      return baseHeight - t * t * 1.4;
    }
  }
  return baseHeight;
}

/**
 * Builds deterministic placed runtime objects spanning all four substrates + road.
 */
function buildFixtureObjects(centerX, centerZ, tileSize) {
  const cellX = Math.floor(centerX / tileSize);
  const cellZ = Math.floor(-centerZ / tileSize);
  // Note: dz = -cz * tileSize - centerZ, so oz < 0 => dz > 0 (NW Grassland 4, NE Temp. Rainforest 8),
  // oz > 0 => dz < 0 (SW Hot Desert 1, SE Tundra 10). Road cross covers |ox|<=2 or |oz|<=2.
  const placements = [
    // Identical boulders on grassland (NW), forest (NE), desert sand (SW), tundra snow (SE), and grassland verge.
    { definitionKey: 'boulder', ox: -10, oz: -10, rot: 0 },
    { definitionKey: 'boulder', ox: 10, oz: -10, rot: 0 },
    { definitionKey: 'boulder', ox: -10, oz: 10, rot: 0 },
    { definitionKey: 'boulder', ox: 10, oz: 10, rot: 0 },
    { definitionKey: 'boulder', ox: -4, oz: -14, rot: 1 },
    // Identical broadleaf & conifer trees across grassland, forest, and tundra.
    { definitionKey: 'oak_tree', ox: -16, oz: -14, rot: 0 },
    { definitionKey: 'oak_tree', ox: 16, oz: -14, rot: 0 },
    { definitionKey: 'pine_tree', ox: 18, oz: 14, rot: 1 },
    { definitionKey: 'pine_tree', ox: -18, oz: -20, rot: 1 },
    // Identical bushes in sunlit grass (NW), forest shade (NE), and tundra (SE).
    { definitionKey: 'bush', ox: -7, oz: -8, rot: 0 },
    { definitionKey: 'bush', ox: 7, oz: -8, rot: 0 },
    { definitionKey: 'bush', ox: 7, oz: 8, rot: 0 },
    // Stone walls & timber cottage on grassland/road/desert substrates.
    { definitionKey: 'wall', ox: -4, oz: -18, rot: 0 },
    { definitionKey: 'wall', ox: -3, oz: -18, rot: 0 },
    { definitionKey: 'cottage', ox: -12, oz: -22, rot: 0 },
    { definitionKey: 'wall', ox: -8, oz: 16, rot: 0 },
  ];
  return placements.map((entry, index) => ({
    id: index + 1,
    definitionKey: entry.definitionKey,
    x: cellX + entry.ox,
    z: cellZ + entry.oz,
    rotation: entry.rot,
  }));
}

/**
 * Produces an immutable world document containing the standardized 4-substrate
 * WSC test arena around `WSC_FIXTURE.centerX, WSC_FIXTURE.centerZ`.
 */
export function createWscFixtureDocument(document) {
  const { chunkSize, tileSize } = document.world;
  const { centerX, centerZ, sideMeters, baseHeight } = WSC_FIXTURE;
  const minCellX = Math.floor((centerX - sideMeters / 2) / tileSize);
  const maxCellX = Math.floor((centerX + sideMeters / 2) / tileSize);
  const minCellZ = Math.floor(-(centerZ + sideMeters / 2) / tileSize);
  const maxCellZ = Math.floor(-(centerZ - sideMeters / 2) / tileSize);
  const chunks = new Map();
  const ensureChunk = (cellX, cellZ) => {
    const cx = Math.floor(cellX / chunkSize);
    const cz = Math.floor(cellZ / chunkSize);
    const key = `${cx}:${cz}`;
    if (!chunks.has(key)) chunks.set(key, { x: cx, z: cz, tiles: [], heights: [] });
    return chunks.get(key);
  };
  for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
      const chunk = ensureChunk(cx, cz);
      const lx = cx - chunk.x * chunkSize;
      const lz = cz - chunk.z * chunkSize;
      const dx = cx * tileSize - centerX;
      const dz = -cz * tileSize - centerZ;
      chunk.heights.push([lz * (chunkSize + 1) + lx, fixtureHeightAt(dx, dz, baseHeight)]);
      if (cx < maxCellX && cz < maxCellZ) {
        chunk.tiles.push([lz * chunkSize + lx, substrateTileAt(dx, dz)]);
      }
    }
  }
  return {
    ...document,
    world: { ...document.world, baseTerrain: null },
    chunks: [...chunks.values()],
    objects: buildFixtureObjects(centerX, centerZ, tileSize),
    forestEdits: { version: 1, felled: [], planted: [], patches: [] },
  };
}

/** Deterministic camera poses inside the standardized WSC fixture. */
export const WSC_FIXTURE_CAMERAS = Object.freeze({
  overview: Object.freeze({
    id: 'FX-C01-overview',
    x: WSC_FIXTURE.centerX - 24,
    z: WSC_FIXTURE.centerZ - 26,
    yaw: -0.68,
    pitch: -0.32,
    mode: 'fly',
    heightAboveGround: 14,
    fov: 60,
  }),
  quadJunction: Object.freeze({
    id: 'FX-C02-junction',
    x: WSC_FIXTURE.centerX - 8,
    z: WSC_FIXTURE.centerZ - 14,
    yaw: -0.45,
    pitch: -0.14,
    mode: 'player',
    heightAboveGround: 1.7,
    fov: 68,
  }),
  grassForestSeam: Object.freeze({
    id: 'FX-C03-grass-forest',
    x: WSC_FIXTURE.centerX - 6,
    z: WSC_FIXTURE.centerZ + 12,
    yaw: -1.15,
    pitch: -0.18,
    mode: 'player',
    heightAboveGround: 1.7,
    fov: 68,
  }),
  rockSubstrates: Object.freeze({
    id: 'FX-C04-rocks',
    x: WSC_FIXTURE.centerX - 2,
    z: WSC_FIXTURE.centerZ - 32,
    yaw: 0.05,
    pitch: -0.22,
    mode: 'fly',
    heightAboveGround: 2.2,
    fov: 65,
  }),
});
