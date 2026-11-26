/**
 * A bake source's cell arrays with a border of the neighbouring chunks' cells.
 *
 * The bake's texels are edge-aligned (texel 0 and `resolution - 1` lie on the
 * chunk edges), so a chunk's border texels read the cells just across its edge:
 * with them, two neighbours bake the same values on their shared border and the
 * terrain does not step there. Curvature reads one cell further, hence two.
 *
 * Where a neighbour page is not resident, the missing axis falls back to this
 * chunk's edge (the nearest resident page along the other axis is still used):
 * cells repeat the edge cell, heights continue quadratically so the border
 * keeps its gradient and curvature. The bake runtime only bakes once the water
 * halo's pages, which cover these, are resident, so that is the edge case.
 */
export const BAKE_SOURCE_PAD = 2;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

/**
 * Quadratic continuation of `get` past [0, limit], through the edge sample and
 * the two inside it: exact for a slope or a bowl, so the border keeps both its
 * gradient and its curvature.
 */
function extrapolate(get, local, limit) {
  const beyond = local > limit ? local - limit : (local < 0 ? -local : 0);
  if (beyond === 0) return get(local);
  const step = local > limit ? -1 : 1;
  const edge = local > limit ? limit : 0;
  const e0 = get(edge);
  const e1 = get(clamp(edge + step, 0, limit));
  const e2 = get(clamp(edge + 2 * step, 0, limit));
  return e0 + beyond * (e0 - e1) + (beyond * (beyond + 1) / 2) * (e0 - 2 * e1 + e2);
}

/**
 * @param {object} options
 * @param {object} options.page committed page: originX/Z, tiles?, tilePixels, surfaceMaskPixels, snowBiomeCover?, heights
 * @param {number} options.chunkSize cells per chunk side
 * @param {(chunkX: number, chunkZ: number) => object|null} [options.pageAt] resident neighbour pages
 * @returns {{ pad: number, size: number, tiles: Uint8Array|null, tilePixels: Uint8Array,
 *   surfaceMaskPixels: Uint8Array, snowBiomeCover: Uint8Array|null, heights: Float32Array }}
 *   cells `size × size` (`chunkSize + 2·pad`), heights `(size + 1)²` vertices
 */
export function padTerrainMaterialBakeSource({ page, chunkSize, pageAt = null }) {
  const pad = BAKE_SOURCE_PAD;
  const size = chunkSize + pad * 2;
  const chunkX = Math.floor(page.originX / chunkSize);
  const chunkZ = Math.floor(page.originZ / chunkSize);
  const pageFor = (dx, dz) => (dx === 0 && dz === 0 ? page : pageAt?.(chunkX + dx, chunkZ + dz) ?? null);

  /**
   * The resident page nearest to chunk-local point (lx, lz): the page holding it,
   * else the one across the axis that still has a neighbour, else this page.
   * Returns the page and the point in its own local frame (possibly outside it).
   */
  const resolve = (lx, lz) => {
    const ox = Math.floor(lx / chunkSize);
    const oz = Math.floor(lz / chunkSize);
    for (const [dx, dz] of [[ox, oz], [ox, 0], [0, oz]]) {
      const found = pageFor(dx, dz);
      if (found) return { from: found, x: lx - dx * chunkSize, z: lz - dz * chunkSize };
    }
    return { from: page, x: lx, z: lz };
  };

  const tiles = page.tiles ? new Uint8Array(size * size) : null;
  const snowBiomeCover = page.snowBiomeCover ? new Uint8Array(size * size) : null;
  const tilePixels = new Uint8Array(size * size * 4);
  const surfaceMaskPixels = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z += 1) {
    const interiorRow = z >= pad && z < pad + chunkSize;
    if (interiorRow) {
      // This page's own row: one copy per array, then only the border cells resolve.
      const from = (z - pad) * chunkSize;
      const to = z * size + pad;
      if (tiles) tiles.set(page.tiles.subarray(from, from + chunkSize), to);
      if (snowBiomeCover) snowBiomeCover.set(page.snowBiomeCover.subarray(from, from + chunkSize), to);
      tilePixels.set(page.tilePixels.subarray(from * 4, (from + chunkSize) * 4), to * 4);
      surfaceMaskPixels.set(page.surfaceMaskPixels.subarray(from * 4, (from + chunkSize) * 4), to * 4);
    }
    for (let x = 0; x < size; x += 1) {
      if (interiorRow && x >= pad && x < pad + chunkSize) continue;
      const at = resolve(x - pad, z - pad);
      const cell = clamp(at.z, 0, chunkSize - 1) * chunkSize + clamp(at.x, 0, chunkSize - 1);
      const to = z * size + x;
      // Neighbour pages are committed the same way, so they carry the same arrays.
      if (tiles) tiles[to] = at.from.tiles[cell];
      if (snowBiomeCover) snowBiomeCover[to] = at.from.snowBiomeCover[cell];
      tilePixels.set(at.from.tilePixels.subarray(cell * 4, cell * 4 + 4), to * 4);
      surfaceMaskPixels.set(at.from.surfaceMaskPixels.subarray(cell * 4, cell * 4 + 4), to * 4);
    }
  }

  const vertices = size + 1;
  const pageVertices = chunkSize + 1;
  const heights = new Float32Array(vertices * vertices);
  for (let z = 0; z < vertices; z += 1) {
    const interiorRow = z >= pad && z <= pad + chunkSize;
    if (interiorRow) {
      const from = (z - pad) * pageVertices;
      heights.set(page.heights.subarray(from, from + pageVertices), z * vertices + pad);
    }
    for (let x = 0; x < vertices; x += 1) {
      if (interiorRow && x >= pad && x <= pad + chunkSize) continue;
      // Vertex `chunkSize` is shared with the next page: read it there only when that page exists.
      const lx = x - pad;
      const lz = z - pad;
      const at = resolve(lx === chunkSize ? lx - 1e-9 : lx, lz === chunkSize ? lz - 1e-9 : lz);
      const ax = Math.round(at.x);
      const az = Math.round(at.z);
      const raw = (vx, vz) => at.from.heights[vz * pageVertices + vx];
      heights[z * vertices + x] = extrapolate(vz => extrapolate(vx => raw(vx, vz), ax, chunkSize), az, chunkSize);
    }
  }
  return { pad, size, tiles, tilePixels, surfaceMaskPixels, snowBiomeCover, heights };
}
