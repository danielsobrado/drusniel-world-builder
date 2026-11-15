import { CITY_STYLE_DEFAULTS, cityStyle, raiseOnStilts } from './ShapeCityParts.js';
import { FARM_BLUEPRINTS, HOUSE_BLUEPRINTS } from './ShapeCityHomes.js';
import { INN_BLUEPRINTS, SHOP_BLUEPRINTS } from './ShapeCityTrade.js';
import { STAIR_BLUEPRINTS, TOWER_BLUEPRINTS, WALL_BLUEPRINTS } from './ShapeCityDefences.js';
import { PLAZA_BLUEPRINTS } from './ShapeCityPlazas.js';
import { expandPlacedPrimitive } from './ShapeSidePlacement.js';
import { addSurroundings } from './ShapeCitySurroundings.js';

/** Every reusable city building type, keyed by the `blueprint` a realm catalog names. */
export const CITY_BLUEPRINTS = Object.freeze({ ...HOUSE_BLUEPRINTS, ...FARM_BLUEPRINTS, ...INN_BLUEPRINTS,
  ...SHOP_BLUEPRINTS, ...TOWER_BLUEPRINTS, ...WALL_BLUEPRINTS, ...STAIR_BLUEPRINTS, ...PLAZA_BLUEPRINTS });

/**
 * Shape primitives for one kit entry of a realm catalog: the blueprint drawn in the realm's
 * style (with the entry's own style tweaks), `with` merged into the main shape for one-off
 * adjustments, then raised on stilts and set in its plot where the realm builds them.
 */
export function buildCityKitPreset(realmStyle, entry) {
  const make = CITY_BLUEPRINTS[entry.blueprint];
  if (!make) throw new Error(`Unknown city blueprint: ${entry.blueprint}.`);
  const st = cityStyle(CITY_STYLE_DEFAULTS, realmStyle, entry.style);
  const drawn = make(st);
  // Patch the main shape first, so stilts and the plot are laid around the shape as patched.
  if (entry.with) drawn[0] = { ...drawn[0], ...entry.with };
  const primitives = addSurroundings(st, entry.blueprint.split('-')[0], raiseOnStilts(st, drawn));
  return primitives.map((p) => expandPlacedPrimitive(p, entry.id));
}
