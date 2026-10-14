/** Derived field; canonical terrain IDs and the RGBA mask layout stay unchanged. */
export const GRASS_COVERAGE_RECIPE_REVISION = 2;
export const GRASS_HABITAT_EDGE_METERS = 8;
export function grassHabitatHaloCells(tileSize) {
  if (!(tileSize > 0) || !Number.isFinite(tileSize)) throw new Error('Grass habitat tileSize must be positive.');
  return Math.ceil(GRASS_HABITAT_EDGE_METERS / tileSize) + 2;
}
export function grassHabitatEligible({tileId, snow = 0, water = 0}, tileIds) {
  return tileIds.has(tileId) && snow < .5 && water < 1;
}
export function grassHabitatEdge(distance, tileSize) {
  const t = Math.max(0, Math.min(1, Math.max(0, distance - .5) * tileSize / GRASS_HABITAT_EDGE_METERS));
  return t * t * (3 - 2 * t);
}
/** Inward eight-neighbour chamfer distance. A seedless eligible field is full. */
export function grassHabitatCoverage(eligible, width, height, tileSize) {
  if (eligible.length !== width * height) throw new Error('Invalid grass habitat dimensions.');
  const distance = new Float32Array(eligible.length);
  for (let i = 0; i < distance.length; i++) distance[i] = eligible[i] ? 1e9 : 0;
  const diagonal = Math.SQRT2;
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x;
    let d = distance[i];
    if (x) d = Math.min(d, distance[i - 1] + 1);
    if (z) d = Math.min(d, distance[i - width] + 1);
    if (x && z) d = Math.min(d, distance[i - width - 1] + diagonal);
    if (x + 1 < width && z) d = Math.min(d, distance[i - width + 1] + diagonal);
    distance[i] = d;
  }
  for (let z = height - 1; z >= 0; z--) for (let x = width - 1; x >= 0; x--) {
    const i = z * width + x;
    let d = distance[i];
    if (x + 1 < width) d = Math.min(d, distance[i + 1] + 1);
    if (z + 1 < height) d = Math.min(d, distance[i + width] + 1);
    if (x + 1 < width && z + 1 < height) d = Math.min(d, distance[i + width + 1] + diagonal);
    if (x && z + 1 < height) d = Math.min(d, distance[i + width - 1] + diagonal);
    distance[i] = d;
  }
  return Uint8Array.from(distance, (d, i) => eligible[i] ? Math.round(grassHabitatEdge(d, tileSize) * 255) : 0);
}
