import { TEXTURE_METRES } from '../../../assets/godsEnd/houseTextureData.js';
import { WORKSHOP_UV_DENSITY } from '../../WorkshopProjectedUv.js';

/**
 * Palette slot -> material family. Shell slots are per shape surface, so a plaster house, its
 * masonry tower and its plank shed keep their own colours inside one composition.
 */
const SLOTS = Object.freeze({
  plaster: 'walls', masonry: 'walls', planks: 'walls',
  roof: 'roof', trim: 'stone', timber: 'wood', metal: 'metal', glass: 'recess',
});
/** The recipe-wide bases a realm sets: stone palette, plaster finish, roof character, weathering. */
export const CITY_RECIPE_FIELDS = Object.freeze(['style', 'finish', 'topStyle', 'weathering']);

/**
 * One realm material. `color` is the albedo itself (the shapes' vertex colours only add
 * near-neutral occlusion), so it should sit near the workshop defaults' brightness. An optional
 * `surface` multiplies in a generated texture set, which is dark; it suits only pale colours.
 */
function preset(realm, slot, entry) {
  const surface = entry.surface;
  return {
    id: `${realm}-${slot}`, label: `${entry.label ?? `${realm} ${slot}`}`.slice(0, 64), family: SLOTS[slot],
    ...(surface ? { proceduralSurface: surface, repeat: Math.min(16, Math.max(0.1, 1 / (TEXTURE_METRES[surface] * WORKSHOP_UV_DENSITY))) } : {}),
    baseColor: entry.color ?? '#ffffff', tint: entry.tint ?? '#ffffff',
    roughness: entry.roughness ?? (slot === 'glass' ? 0.35 : slot === 'metal' ? 0.45 : 0.9),
    metalness: entry.metalness ?? (slot === 'metal' ? 0.65 : slot === 'glass' ? 0.2 : 0),
    normalStrength: entry.normal ?? 1, aoStrength: 1, heightStrength: 0, weathering: entry.weathering ?? 0.3,
    mapping: 'projected', rotation: 0, alignment: 'world', sources: {},
  };
}

/**
 * The recipe bases and workshop material document a realm design starts with: its palette as presets, family
 * defaults (new shapes take the realm's main shell), and each shell area matched to its surface.
 */
export function cityMaterialDocument(realm, palette, primitives, mainSurface = 'plaster') {
  const recipe = Object.fromEntries(CITY_RECIPE_FIELDS.filter((key) => palette?.recipe?.[key] !== undefined).map((key) => [key, palette.recipe[key]]));
  const slots = Object.keys(palette ?? {}).filter((slot) => SLOTS[slot]);
  const presets = Object.fromEntries(slots.map((slot) => [`${realm}-${slot}`, preset(realm, slot, palette[slot])]));
  const has = (slot) => Object.hasOwn(presets, `${realm}-${slot}`);
  const materialDefaults = {};
  if (has(mainSurface)) materialDefaults.walls = `${realm}-${mainSurface}`;
  for (const slot of ['roof', 'trim', 'timber', 'metal', 'glass']) if (has(slot)) materialDefaults[SLOTS[slot]] = `${realm}-${slot}`;
  const materialAreaOverrides = {};
  for (const p of primitives) {
    if (p.kind === 'traversal') continue;
    const surface = p.surface ?? (p.kind === 'curved-wall' ? 'masonry' : 'plaster');
    if (has(surface)) materialAreaOverrides[`${p.id}:walls`] = `${realm}-${surface}`;
    // A flat top is a walked stone deck (tower leads, terraces), not roofing.
    if (p.roof?.family === 'flat' && has('trim')) materialAreaOverrides[`${p.id}:roof`] = `${realm}-trim`;
  }
  return { recipe, document: { materialLibrary: { presets, sources: {} }, materialDefaults, materialAreaOverrides } };
}
