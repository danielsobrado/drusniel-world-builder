import { CITY_STYLE_DEFAULTS, cityStyle, raiseOnStilts } from './ShapeCityParts.js';
import { FARM_BLUEPRINTS, HOUSE_BLUEPRINTS } from './ShapeCityHomes.js';
import { INN_BLUEPRINTS, SHOP_BLUEPRINTS } from './ShapeCityTrade.js';
import { STAIR_BLUEPRINTS, TOWER_BLUEPRINTS, WALL_BLUEPRINTS } from './ShapeCityDefences.js';
import { expandPlacedPrimitive } from './ShapeSidePlacement.js';
import { addSurroundings } from './ShapeCitySurroundings.js';

/** Every reusable city building type, keyed by the `blueprint` a realm catalog names. */
export const CITY_BLUEPRINTS = Object.freeze({ ...HOUSE_BLUEPRINTS, ...FARM_BLUEPRINTS, ...INN_BLUEPRINTS,
  ...SHOP_BLUEPRINTS, ...TOWER_BLUEPRINTS, ...WALL_BLUEPRINTS, ...STAIR_BLUEPRINTS });

/**
 * Shape primitives for one kit entry of a realm catalog: the blueprint drawn in the realm's
 * style (with the entry's own style tweaks), raised on stilts where the realm builds them,
 * then `with` merged into the main shape for one-off adjustments.
 */
export function buildCityKitPreset(realmStyle, entry) {
  const make = CITY_BLUEPRINTS[entry.blueprint];
  if (!make) throw new Error(`Unknown city blueprint: ${entry.blueprint}.`);
  const st = cityStyle(CITY_STYLE_DEFAULTS, realmStyle, entry.style);
  const primitives = addSurroundings(st, entry.blueprint.split('-')[0], raiseOnStilts(st, make(st)));
  if (entry.with) primitives[0] = { ...primitives[0], ...entry.with };
  return primitives.map((p) => expandPlacedPrimitive(p, entry.id));
}
