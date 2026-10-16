/**
 * A per-biome value (snow cover, grass density) blurred across biome borders.
 *
 * A value keyed on the cell's biome id is a step at every border: snow began at
 * a line, a tundra's thin grass began at a line. Blurred with this triangular
 * kernel it ramps over ±`BIOME_BLUR_CELLS` (±10 m at 2 m cells) instead. Chunk
 * builds blur a halo once (`blurTileField`); point queries evaluate the same
 * kernel from tiles (`blurTileValueAt`), so both agree.
 */
export const BIOME_BLUR_CELLS = 5;
const WEIGHTS = Array.from({ length: BIOME_BLUR_CELLS * 2 + 1 },
  (_, index) => BIOME_BLUR_CELLS + 1 - Math.abs(index - BIOME_BLUR_CELLS));
const TOTAL = WEIGHTS.reduce((sum, weight) => sum + weight, 0);

/**
 * Blurred `valueOf(tileId)` over a `size × size` halo of tile ids. Only cells at
 * least BIOME_BLUR_CELLS inside the halo are exact; callers read the core.
 */
export function blurTileField(halo, size, valueOf) {
  const values = Float32Array.from(halo, valueOf);
  const rows = new Float32Array(values.length);
  const r = BIOME_BLUR_CELLS;
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1) sum += values[z * size + Math.min(size - 1, Math.max(0, x + k))] * WEIGHTS[k + r];
      rows[z * size + x] = sum / TOTAL;
    }
  }
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1) sum += rows[Math.min(size - 1, Math.max(0, z + k)) * size + x] * WEIGHTS[k + r];
      values[z * size + x] = sum / TOTAL;
    }
  }
  return values;
}

/** The same blur at one cell, read from `tileAt(cellX, cellZ)`. */
export function blurTileValueAt(tileAt, cellX, cellZ, valueOf) {
  const r = BIOME_BLUR_CELLS;
  let sum = 0;
  for (let dz = -r; dz <= r; dz += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const value = valueOf(tileAt(cellX + dx, cellZ + dz));
      if (value) sum += value * WEIGHTS[dx + r] * WEIGHTS[dz + r];
    }
  }
  return sum / (TOTAL * TOTAL);
}
