export const TERRAIN_FEATURES = Object.freeze({ WATER: 1, GRASS: 2, ARID: 4, GLACIER: 8 });
export const FULL_TERRAIN_FEATURES = 15;

/** Unknown fields keep the expensive graph. Climate-dependent snow and rain stay universal. */
export function terrainRegionalFeatures(page, config, wet) {
  const F = TERRAIN_FEATURES;
  if (!page?.tiles?.length) return FULL_TERRAIN_FEATURES;
  let features = wet ? F.WATER : 0;
  const mask = page.surfaceMaskPixels;
  if (!mask || mask.length !== page.tiles.length * 4) features |= F.GRASS;
  else for (let i = 1; i < mask.length; i += 4) {
    if (mask[i] > 0) { features |= F.GRASS; break; }
  }
  const arid = config.biomeLooks?.arid ?? { sand: [1], mineral: [2] };
  const aridIds = new Set([...(arid.sand ?? []), ...(arid.mineral ?? [])]);
  const glacier = config.biomeLooks?.glacier;
  for (const id of page.tiles) {
    if (aridIds.has(id)) features |= F.ARID;
    if (glacier?.[id] > 0) features |= F.GLACIER;
  }
  return features;
}
