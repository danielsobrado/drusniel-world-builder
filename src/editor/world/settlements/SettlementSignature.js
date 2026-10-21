/**
 * What makes one town itself rather than another of its culture and size.
 *
 * A town's signature is a handful of discrete choices drawn from the burg it
 * already is — world seed, id, rank, walls, port, routes, realm — never a
 * per-town asset: which variants of the pooled buildings it favours, and a few
 * local traits from a fixed table (place-identity plan §27). Every choice is a
 * plan-time knob, so a town's identity costs no meshes and no draw calls; the
 * world's mesh pool stays styles × kinds × variants.
 *
 * Drawn from its own random stream, so retuning a signature never reshuffles
 * the rest of a plan. Pure data, safe in terrain workers.
 */

import { SETTLEMENT_BUILDINGS } from './SettlementBuildingCatalog.js';
import { hashInts } from './SettlementProfile.js';
import { planRandom } from './SettlementStreets.js';

/**
 * Local traits: an id and who may have it. What each trait does lives with the
 * planner stage it changes (streets, decor, markets), keyed by id.
 */
const TRAITS = Object.freeze([
  Object.freeze({ id: 'grand-avenue', when: (profile) => profile.rank >= 2 }),
  Object.freeze({ id: 'tree-lined-avenue', when: (profile) => profile.rank >= 2 }),
  Object.freeze({ id: 'fountain-square', when: (profile) => profile.square }),
  Object.freeze({ id: 'market-hall', when: (profile) => profile.market }),
  Object.freeze({ id: 'double-market', when: (profile) => profile.rank >= 2 }),
  Object.freeze({ id: 'harbour-market', when: (profile) => profile.port && profile.rank >= 1 }),
  Object.freeze({ id: 'gate-market', when: (profile) => profile.walled }),
  Object.freeze({ id: 'flower-town', when: () => true }),
  Object.freeze({ id: 'lantern-lit', when: (profile) => profile.rank >= 1 }),
]);

/** [fewest, most] traits by rank: hamlet 1, village 1–2, town 2–3, city 3–5, metropolis 4–6. */
const TRAIT_COUNT = Object.freeze([[1, 1], [1, 2], [2, 3], [3, 5], [4, 6]]);

/** How much more often a town builds one of its favoured variants than the others. */
const FAVOURED_WEIGHT = 4;

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** Per kind with a choice of variants, the weight of each: two or three favoured, the rest plain. */
function houseWeights(random) {
  const weights = {};
  for (const [kind, variants] of Object.entries(SETTLEMENT_BUILDINGS)) {
    if (variants.length < 3) continue;
    const favoured = new Set(shuffled(variants.map((_, index) => index), random).slice(0, 2 + Math.floor(random() * 2)));
    weights[kind] = Object.freeze(variants.map((_, index) => (favoured.has(index) ? FAVOURED_WEIGHT : 1)));
  }
  return Object.freeze(weights);
}

function pickTraits(profile, random) {
  const [fewest, most] = TRAIT_COUNT[profile.rank] ?? TRAIT_COUNT.at(-1);
  const count = fewest + Math.floor(random() * (most - fewest + 1));
  const eligible = shuffled(TRAITS.filter((trait) => trait.when(profile)), random);
  return Object.freeze(eligible.slice(0, count).map(({ id }) => id));
}

/**
 * The signature of one settlement.
 *
 * @param {object} settlement the burg (SettlementData)
 * @param {object} profile its settlementProfile
 * @param {number} worldSeed
 */
export function settlementSignature(settlement, profile, worldSeed) {
  const random = planRandom(hashInts(worldSeed, settlement.id, 0x5167));
  const traits = pickTraits(profile, random);
  return Object.freeze({
    traits,
    houseWeights: houseWeights(random),
  });
}

export function hasTrait(signature, id) {
  return Boolean(signature?.traits.includes(id));
}

/** A variant of `kind`, weighted toward the ones this town favours. */
export function pickVariant(signature, kind, random) {
  const count = SETTLEMENT_BUILDINGS[kind].length;
  const weights = signature?.houseWeights[kind];
  if (!weights) return Math.floor(random() * count);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let index = 0; index < count; index += 1) {
    roll -= weights[index];
    if (roll < 0) return index;
  }
  return count - 1;
}
