/**
 * City skins: how one kit dresses up as very different places.
 *
 * A skin is chosen per town from where and what it is, never stored:
 *
 *   frost     snow on the ground or a cold biome   dark ashlar, snow-laden roofs (Windhelm)
 *   imperial  capital, or a citadel city           pale dressed ashlar, limewash (Solitude)
 *   sun       Mediterranean culture or hot biome   sandstone, bleached render
 *   marsh     wetland or rainforest                wet dark timber, mossy stone (Riften)
 *   plains    other Nordic towns                   warm weathered wood (Whiterun)
 *   heartland everything else                      the kit as authored
 *
 * Tints multiply the shared kit textures, so a skin costs uniforms, not new
 * textures. They are deliberately gentle: the kit is authored warm (scanned
 * rubble, slate and cream render), and stronger tints — marsh once turned
 * stone olive — pull towns away from that look. Pure data, no three.js.
 */

// Azgaar standard biome ids (AzgaarBiomeCatalog).
const COLD_BIOMES = new Set([2, 9, 10, 11]);
const HOT_BIOMES = new Set([1, 3, 5, 7]);
const WET_BIOMES = new Set([8, 12]);

const WHITE = Object.freeze([1, 1, 1]);

export const TOWN_SKINS = Object.freeze({
  frost: Object.freeze({
    ashlar: true, stone: [0.86, 0.89, 0.94], timber: [0.86, 0.84, 0.84],
    roof: [0.9, 0.9, 0.94], plaster: [0.94, 0.95, 0.97], snow: 1,
  }),
  imperial: Object.freeze({
    ashlar: true, stone: [1.05, 1.03, 0.99], timber: [0.86, 0.8, 0.76],
    roof: [0.9, 0.9, 0.94], plaster: [1.04, 1.03, 1.0], snow: 0,
  }),
  sun: Object.freeze({
    ashlar: false, stone: [1.08, 1.0, 0.88], timber: [1.0, 0.94, 0.88],
    roof: [1.02, 0.99, 0.95], plaster: [1.05, 1.02, 0.97], snow: 0,
  }),
  marsh: Object.freeze({
    ashlar: false, stone: [0.9, 0.93, 0.88], timber: [0.84, 0.82, 0.78],
    roof: [0.9, 0.94, 0.86], plaster: [0.95, 0.95, 0.91], snow: 0,
  }),
  plains: Object.freeze({
    ashlar: false, stone: [1.0, 0.98, 0.95], timber: [1.06, 1.0, 0.92],
    roof: [1.05, 0.98, 0.9], plaster: [1.0, 0.99, 0.95], snow: 0,
  }),
  heartland: Object.freeze({
    ashlar: false, stone: WHITE, timber: WHITE, roof: WHITE, plaster: WHITE, snow: 0,
  }),
});

/** Heraldic banner colours; a culture keeps its colour in every town. */
export const BANNER_COLOURS = Object.freeze([
  [0.16, 0.22, 0.56], [0.52, 0.1, 0.09], [0.12, 0.34, 0.18], [0.42, 0.33, 0.08],
  [0.3, 0.14, 0.38], [0.12, 0.12, 0.13], [0.06, 0.32, 0.36],
]);

export const SNOW_THRESHOLD = 0.3;

/**
 * @param {object} town
 * @param {string} town.family Nordic | Tudor | Med
 * @param {number|null} town.biome Azgaar biome id at the burg
 * @param {number} town.snow 0..1 ground snow at the burg (terrain snow classification)
 * @param {boolean} town.capital
 * @param {boolean} town.citadel
 * @param {number} town.rank settlement class rank (3 = city)
 */
export function skinFor({ family, biome = null, snow = 0, capital = false, citadel = false, rank = 0 }) {
  if (snow >= SNOW_THRESHOLD || COLD_BIOMES.has(biome)) return 'frost';
  if (capital || (citadel && rank >= 3)) return 'imperial';
  if (family === 'Med' || HOT_BIOMES.has(biome)) return 'sun';
  if (WET_BIOMES.has(biome)) return 'marsh';
  if (family === 'Nordic') return 'plains';
  return 'heartland';
}

export function bannerColourFor(culture, settlementId) {
  const key = Number.isFinite(culture) ? culture : settlementId;
  return BANNER_COLOURS[Math.abs(key | 0) % BANNER_COLOURS.length];
}
