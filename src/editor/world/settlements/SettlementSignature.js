/**
 * What makes one town itself rather than another of its culture and size.
 *
 * A town's signature is a handful of discrete choices drawn from the burg it
 * already is — world seed, id, rank, walls, port, routes, realm — never a
 * per-town asset: its layout grammar, which variants of the pooled buildings it
 * favours, and a few local traits from a fixed table (place-identity plan §27). Every choice is a
 * plan-time knob, so a town's identity costs no meshes and no draw calls; the
 * world's mesh pool stays styles × kinds × variants.
 *
 * Drawn from its own random stream, so retuning a signature never reshuffles
 * the rest of a plan. Pure data, safe in terrain workers.
 */

import { SETTLEMENT_BUILDINGS } from './SettlementBuildingCatalog.js';
import { marketKinds } from './SettlementMarkets.js';
import { hashInts } from './SettlementProfile.js';
import { planRandom } from './SettlementStreets.js';

/**
 * Local traits: an id and who may have it. What each trait does lives with the
 * planner stage it changes (streets, decor, markets), keyed by id.
 */
const TRAITS = Object.freeze([
  Object.freeze({ id: 'grand-avenue', when: (profile) => profile.rank >= 2 }),
  Object.freeze({ id: 'planted-avenue', when: (profile) => profile.rank >= 2 }),
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

/** Street villages stay small: past this many buildings one road cannot front them all. */
const LINEAR_MAX_BUILDINGS = 150;

/** Realm street grammars (VisualIdentityCatalog) that lean a town toward a layout. */
const REALM_LAYOUT = Object.freeze({
  'axial-imperial-grid': Object.freeze({ grid: 2 }),
  'scholarly-terraced-avenue': Object.freeze({ grid: 0.8 }),
  'sparse-waystation-trail': Object.freeze({ linear: 1.5 }),
  'windbreak-hearth-cluster': Object.freeze({ radial: 0.8 }),
  'organic-canopy-ring': Object.freeze({ radial: 0.8 }),
});

/**
 * Layout grammar (place-identity plan §10–11), scored from what the burg is and
 * drawn by those scores: a walled town keeps its radial plan, so gates still
 * meet its main streets; capitals and imperial realms lean to a planned grid;
 * small towns on one or two roads string out along them.
 */
function pickGrammar(settlement, profile, routeCount, random) {
  if (profile.walled) return 'radial';
  const lean = (profile.hasRegionalIdentity && REALM_LAYOUT[profile.recipe?.streetConfig?.grammar]) || {};
  const scores = [
    ['radial', 1 + (lean.radial ?? 0)],
    ['grid', profile.rank >= 1
      ? (profile.rank >= 2 ? 0.5 : 0.15) + (settlement.capital ? 1.5 : 0) + (lean.grid ?? 0)
      : 0],
    ['linear', profile.rank <= 1 && profile.buildings <= LINEAR_MAX_BUILDINGS
      ? (routeCount <= 2 ? 1.4 : 0.4) + (lean.linear ?? 0)
      : 0],
  ];
  const total = scores.reduce((sum, [, score]) => sum + score, 0);
  let roll = random() * total;
  for (const [grammar, score] of scores) {
    roll -= score;
    if (roll < 0) return grammar;
  }
  return 'radial';
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
 * @param {number} routeCount how many Azgaar roads leave the burg
 */
export function settlementSignature(settlement, profile, worldSeed, routeCount = 0) {
  const random = planRandom(hashInts(worldSeed, settlement.id, 0x5167));
  const grammar = pickGrammar(settlement, profile, routeCount, random);
  const traits = pickTraits(profile, random);
  const capital = Boolean(settlement.capital);
  const avenues = profile.rank < 2 ? 'none' : (grammar === 'grid' || capital ? 'all' : 'first');
  return Object.freeze({
    grammar,
    traits,
    // Which main streets are avenues inside the town (SettlementStreets), and whether they are grand.
    avenues,
    grandAvenue: profile.rank >= 2 && (capital || traits.includes('grand-avenue')),
    houseWeights: houseWeights(random),
    // Its markets' kinds and names, primary first; SettlementMarkets places their squares.
    markets: marketKinds({ settlement, profile, grammar, traits, avenues }),
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
