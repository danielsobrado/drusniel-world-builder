import { planDecor } from './SettlementDecor.js';
import { planDefences } from './SettlementDefences.js';
import { SettlementOccupancy } from './SettlementOccupancy.js';
import { planBuildings, planFarms } from './SettlementPlots.js';
import { hashInts, settlementProfile } from './SettlementProfile.js';
import { planStones } from './SettlementStones.js';
import { planRandom, planStreets } from './SettlementStreets.js';

export const SETTLEMENT_PLAN_VERSION = 3;

/**
 * Plan one settlement: streets, market square, landmark and house plots,
 * defences, the farm belt, walkway decor and loose stone.
 *
 * Deterministic in its inputs — the world seed, the burg, the routes near it
 * and the ground — so terrain workers and the main thread derive the same plan
 * independently, and nothing is stored with the world. Coordinates are plan
 * space (see SettlementGeometry); `sampleHeight` and `isBuildable` take plan
 * space too.
 *
 * Every building carries `pad`, the level its footprint is flattened to: the
 * ground at its centre. The terrain grades to it and the renderer stands the
 * building on it, so the two cannot disagree.
 */
export function planSettlement({ settlement, worldSeed, routeBearings = [], sampleHeight, isBuildable }) {
  const profile = settlementProfile(settlement);
  const random = planRandom(hashInts(worldSeed, settlement.id, SETTLEMENT_PLAN_VERSION));
  const { streets, squareRadius, bearings } = planStreets({ profile, routeBearings, random, isBuildable });
  const occupancy = new SettlementOccupancy({ streets, squareRadius, isBuildable, sampleHeight });
  const buildings = planBuildings({ profile, occupancy, streets, bearings, random });
  const defences = planDefences({ profile, occupancy, streets });
  const { farms, fields } = planFarms({ profile, occupancy, streets, random });
  const { props, walks } = planDecor({
    profile,
    occupancy,
    streets,
    squareRadius,
    buildings: [...buildings, ...farms],
    fields,
    random,
  });
  // Last, so adding or retuning loose stone never reshuffles the town itself.
  const stones = planStones({ profile, occupancy, buildings: [...buildings, ...farms], fields, random });
  const withPad = (item) => ({ ...item, pad: sampleHeight(item.x, item.z) });
  return Object.freeze({
    version: SETTLEMENT_PLAN_VERSION,
    id: settlement.id,
    name: settlement.name ?? '',
    profile,
    squareRadius,
    streets: [...streets, ...walks],
    buildings: [...buildings, ...farms, ...defences].map(withPad),
    props: [...props, ...stones],
    fields,
  });
}
