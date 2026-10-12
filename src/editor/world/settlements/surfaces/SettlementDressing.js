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
 * dressing. Measured on a desktop GPU, the plaster below takes 4–5 s (the Lab's
 * two stone fields took 1 s but were too blotchy for dressed masonry); the Lab's
 * cut cobble (nine layers) took 45 s and its limestone gravel (six) 21 s, so
 * paving stays photographed. The time is the driver optimising the shader:
 * building the layer stack once instead of per stage, and emitting the noise as
 * shader functions instead of inline, were both tried and changed nothing.
 */
/**
 * Seen from a stride away — walls, roofs, the setts underfoot — a set keeps 1K
 * colour and normals and its photographic detail rather than the painterly
 * 512 px default (scripts/fetch-settlement-textures.mjs).
 */
const CLOSE_UP = Object.freeze({ size: 1024, median: 0 });

export const SETTLEMENT_SURFACE_SETS = Object.freeze({
  'cobble-grey': Object.freeze({ source: 'cobblestone_floor_08', tileMetres: 1.9, ...CLOSE_UP }),
  'cobble-mossy': Object.freeze({ source: 'cobblestone_floor_04', tileMetres: 2.2, ...CLOSE_UP }),
  'cobble-dark': Object.freeze({ source: 'cobblestone_05', tileMetres: 1.7, ...CLOSE_UP }),
  // The medieval kit's own setts (medkit/scans.py), so both town renderers pave alike.
  'cobble-kit': Object.freeze({ source: 'cobblestone_floor_01', tileMetres: 1.6, ...CLOSE_UP }),
  'flag-slate': Object.freeze({ source: 'stone_tiles_02', tileMetres: 1.7, ...CLOSE_UP }),
  // Irregular old flags with deep joints: what a medieval square is laid in.
  'flag-monastery': Object.freeze({ source: 'monastery_stone_floor', tileMetres: 2.6, saturation: 0.3, ...CLOSE_UP }),
  // Rough, worn field cobbles for back lanes.
  'cobble-old': Object.freeze({ source: 'cobblestone_floor_13', tileMetres: 2.2, saturation: 0.9, ...CLOSE_UP }),
  // The photograph is an orange clay; a town's trodden ground is duller than its setts.
  'earth-dry': Object.freeze({ source: 'dirt_floor', tileMetres: 3.2, saturation: 0.22 }),
  'timber-beam': Object.freeze({ source: 'rough_wood', neutralMean: 196, repeat: 1.4, ...CLOSE_UP }),
  'plaster-lime': Object.freeze({ source: 'white_plaster_02', neutralMean: 222, ...CLOSE_UP }),
  // The medieval kit's own render (tools/blender/medieval_town_kit/medkit/scans.py),
  // so a town reads the same whichever renderer draws it.
  'plaster-painted': Object.freeze({ source: 'painted_plaster_wall', neutralMean: 214, contrast: 0.8, ...CLOSE_UP }),
  // A block reads by its bevel and joints first, but up close it needs a face:
  // pitting, veins and weathered patches. A quarter of the photograph's contrast
  // goes, enough that a street of blocks does not read as blotches (see SettlementGrade).
  // Random rubble, the medieval kit's own wall stone (medkit/scans.py): the
  // fill of a masonry-finished house's frame and the core behind its blocks.
  'stone-rubble': Object.freeze({ source: 'rustic_stone_wall', neutralMean: 196, contrast: 0.9, ...CLOSE_UP }),
  'stone-rock': Object.freeze({ source: 'rock_boulder_dry', neutralMean: 218, repeat: 0.8, contrast: 0.75, ...CLOSE_UP }),
  'roof-slate': Object.freeze({ source: 'grey_roof_tiles_02', neutralMean: 206, repeat: 0.62, ...CLOSE_UP }),
  'roof-clay': Object.freeze({ source: 'roof_09', neutralMean: 206, repeat: 0.62, ...CLOSE_UP }),
  'plaster-aged': Object.freeze({ ptl: 'designer-aged-plaster', bakeMetres: 2.4, neutralGain: 1.3 }),
});

/** The roles a dressing fills; the roof set follows the settlement style's roofing. */
export const SETTLEMENT_SURFACE_ROLES = Object.freeze(['cobble', 'flagstone', 'earth', 'timber', 'plaster', 'stone', 'rubble', 'roof']);

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
  rubble: 'stone-rubble',
  roof: 'roof-slate',
});

/** Timber tones a town may frame its houses in, over the one neutral beam set. */
export const TIMBER_TONES = Object.freeze({ brown: '#c9925f', grey: '#b9ae9c', dark: '#94694a' });

const ROOF_SETS = Object.freeze({ slate: 'roof-slate', terracotta: 'roof-clay' });

const dressing = (key, cobble, flagstone, timberTone, { plaster = 'plaster-lime' } = {}) => (
  Object.freeze({ key, cobble, flagstone, timberTone, stone: 'stone-rock', rubble: 'stone-rubble', plaster, earth: 'earth-dry' })
);

const DRESSINGS = Object.freeze([
  dressing('grey-setts', 'cobble-grey', 'flag-monastery', 'brown', { plaster: 'plaster-painted' }),
  dressing('mossy-lanes', 'cobble-mossy', 'flag-monastery', 'grey'),
  dressing('dark-quarter', 'cobble-dark', 'flag-slate', 'dark'),
  dressing('river-stone', 'cobble-old', 'flag-monastery', 'dark'),
  dressing('old-market', 'cobble-kit', 'flag-monastery', 'grey', { plaster: 'plaster-painted' }),
  dressing('black-setts', 'cobble-dark', 'flag-monastery', 'brown', { plaster: 'plaster-painted' }),
  dressing('kit-setts', 'cobble-kit', 'flag-slate', 'dark', { plaster: 'plaster-painted' }),
  dressing('old-town', 'cobble-old', 'flag-monastery', 'brown', { plaster: 'plaster-painted' }),
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
