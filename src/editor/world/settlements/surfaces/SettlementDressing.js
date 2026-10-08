/**
 * Which surface textures each settlement wears.
 *
 * A *surface set* is one texture triple (colour, normal, packed
 * AO/roughness/metalness). It is either photographed — CC0, under
 * `public/assets/textures/settlement/`, fetched by
 * `scripts/fetch-settlement-textures.mjs` — or procedural: a Procedural Texture
 * Lab recipe under `public/assets/materials/settlement/`, generated in GPU
 * memory when it is first wanted. A *dressing* names one set per
 * role, and every settlement is given a dressing by its id — so two towns of
 * one culture share stone and render (SettlementProfile) yet are paved and
 * framed differently, and only the sets of the towns in view are ever loaded.
 *
 * Pure data, safe in terrain workers and in node.
 */

/**
 * Set name → its source and the metres one repeat spans on paving.
 *
 * `source` is a Poly Haven asset id. `neutralMean` sets are stored desaturated
 * at that mean brightness: they are surfaces a material tints (a wall finish, a
 * stone palette, a timber tone). `repeat` scales the workshop's own projected
 * UVs for building surfaces.
 *
 * `ptl` is a Procedural Texture Lab preset id instead: the set is baked at
 * runtime over `bakeMetres` of its procedural domain. `neutralGain` makes such
 * a set tintable — its luminance times the gain, with no hue of its own.
 *
 * Only presets that generate in a few seconds belong here: a town waits for its
 * dressing. Measured on a desktop GPU, the three below take 1–4 s; the Lab's
 * cut cobble took 45 s and its limestone gravel 18 s, so paving stays photographed.
 */
export const SETTLEMENT_SURFACE_SETS = Object.freeze({
  'cobble-grey': Object.freeze({ source: 'cobblestone_floor_08', tileMetres: 1.9 }),
  'cobble-mossy': Object.freeze({ source: 'cobblestone_floor_04', tileMetres: 2.2 }),
  'cobble-dark': Object.freeze({ source: 'cobblestone_05', tileMetres: 1.7 }),
  'flag-slate': Object.freeze({ source: 'stone_tiles_02', tileMetres: 2.8 }),
  'flag-pebble': Object.freeze({ source: 'patterned_cobblestone_02', tileMetres: 3 }),
  'earth-dry': Object.freeze({ source: 'dirt_floor', tileMetres: 3.2 }),
  'timber-beam': Object.freeze({ source: 'rough_wood', neutralMean: 196, repeat: 1.4 }),
  'plaster-lime': Object.freeze({ source: 'white_plaster_02', neutralMean: 222 }),
  'stone-rock': Object.freeze({ source: 'rock_boulder_dry', neutralMean: 214, repeat: 0.8 }),
  'roof-slate': Object.freeze({ source: 'grey_roof_tiles_02', neutralMean: 206, repeat: 0.62 }),
  'roof-clay': Object.freeze({ source: 'roof_09', neutralMean: 206, repeat: 0.62 }),
  'stone-speckle': Object.freeze({ ptl: 'texture-field-stone', bakeMetres: 1.8, neutralGain: 2.2 }),
  'stone-mottle': Object.freeze({ ptl: 'texture-field-rock', bakeMetres: 2.2, neutralGain: 2.2 }),
  'plaster-aged': Object.freeze({ ptl: 'designer-aged-plaster', bakeMetres: 2.4, neutralGain: 1.3 }),
});

/** The roles a dressing fills; the roof set follows the settlement style's roofing. */
export const SETTLEMENT_SURFACE_ROLES = Object.freeze(['cobble', 'flagstone', 'earth', 'timber', 'plaster', 'stone', 'roof']);

/**
 * The photographed set each role falls back to when a town's own cannot be made
 * — a procedural set on a device that cannot generate it must not leave a town bare.
 */
export const SETTLEMENT_ROLE_FALLBACK = Object.freeze({
  cobble: 'cobble-grey',
  flagstone: 'flag-slate',
  earth: 'earth-dry',
  timber: 'timber-beam',
  plaster: 'plaster-lime',
  stone: 'stone-rock',
  roof: 'roof-slate',
});

/** Timber tones a town may frame its houses in, over the one neutral beam set. */
export const TIMBER_TONES = Object.freeze({ brown: '#c9925f', grey: '#b9ae9c', dark: '#94694a' });

const ROOF_SETS = Object.freeze({ slate: 'roof-slate', terracotta: 'roof-clay' });

const dressing = (key, cobble, flagstone, timberTone, { stone = 'stone-rock', plaster = 'plaster-lime' } = {}) => (
  Object.freeze({ key, cobble, flagstone, timberTone, stone, plaster, earth: 'earth-dry' })
);

const DRESSINGS = Object.freeze([
  dressing('grey-setts', 'cobble-grey', 'flag-slate', 'brown', { stone: 'stone-speckle', plaster: 'plaster-aged' }),
  dressing('mossy-lanes', 'cobble-mossy', 'flag-pebble', 'grey'),
  dressing('dark-quarter', 'cobble-dark', 'flag-slate', 'dark', { stone: 'stone-mottle' }),
  dressing('river-stone', 'cobble-mossy', 'flag-slate', 'dark', { stone: 'stone-speckle' }),
  dressing('old-market', 'cobble-grey', 'flag-pebble', 'grey', { plaster: 'plaster-aged' }),
  dressing('black-setts', 'cobble-dark', 'flag-pebble', 'brown', { stone: 'stone-mottle', plaster: 'plaster-aged' }),
]);

export const SETTLEMENT_DRESSING_KEYS = Object.freeze(DRESSINGS.map(({ key }) => key));

/**
 * The dressing of one settlement: a set name per role, and its timber tone.
 *
 * @param {{ id: number }} settlement
 * @param {{ topStyle: string }} style the settlement's style (SettlementProfile)
 */
export function dressingFor(settlement, style) {
  let hash = Math.imul((settlement.id | 0) ^ 0x51ed27, 0x9e3779b1);
  hash ^= hash >>> 15;
  const base = DRESSINGS[(hash >>> 0) % DRESSINGS.length];
  return Object.freeze({
    ...base,
    timber: 'timber-beam',
    roof: ROOF_SETS[style.topStyle] ?? ROOF_SETS.slate,
  });
}

/** Where a procedural set's recipe lives, relative to the app's base URL. */
export function surfaceSetRecipe(name) {
  return `assets/materials/settlement/${name}.ptl.json`;
}

export function surfaceSetFiles(name) {
  return Object.freeze({ color: `${name}-color.webp`, normal: `${name}-normal.webp`, arm: `${name}-arm.webp` });
}
