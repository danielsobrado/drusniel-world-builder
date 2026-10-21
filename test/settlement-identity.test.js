import assert from 'node:assert/strict';
import test from 'node:test';
import { buildingRecipe } from '../src/editor/world/settlements/SettlementBuildingCatalog.js';
import { planSettlement } from '../src/editor/world/settlements/SettlementPlanner.js';
import { SETTLEMENT_STYLES, settlementProfile, styleFor } from '../src/editor/world/settlements/SettlementProfile.js';
import { pickVariant, settlementSignature } from '../src/editor/world/settlements/SettlementSignature.js';
import { planRandom } from '../src/editor/world/settlements/SettlementStreets.js';
import { dressingFor } from '../src/editor/world/settlements/surfaces/SettlementDressing.js';

const town = (id, extra = {}) => ({ id, name: `Town ${id}`, cellX: 0, cellZ: 0, population: 6, ...extra });

test('a town signature is deterministic in the world seed and the burg', () => {
  const burg = town(7, { walls: true });
  const profile = settlementProfile(burg);
  assert.deepEqual(settlementSignature(burg, profile, 99), settlementSignature(burg, profile, 99));
});

test('towns of one culture and size still differ in what they build and what they are known for', () => {
  const signatures = Array.from({ length: 12 }, (_, id) => {
    const burg = town(id + 1, { culture: 3 });
    return JSON.stringify(settlementSignature(burg, settlementProfile(burg), 99));
  });
  assert.ok(new Set(signatures).size >= 10, 'same-culture towns came out alike');
});

test('trait counts follow rank: a hamlet one, a city three to five', () => {
  for (let id = 1; id < 30; id += 1) {
    const hamlet = town(id, { population: 0.3 });
    assert.equal(settlementSignature(hamlet, settlementProfile(hamlet), 5).traits.length, 1);
    const city = town(id, { population: 20, walls: true, port: true });
    const { traits } = settlementSignature(city, settlementProfile(city), 5);
    assert.ok(traits.length >= 3 && traits.length <= 5, `${traits.length} traits`);
  }
});

test('a town builds its favoured variants far more often than the rest', () => {
  const burg = town(4);
  const signature = settlementSignature(burg, settlementProfile(burg), 1);
  const random = planRandom(3);
  const counts = [0, 0, 0, 0, 0];
  for (let index = 0; index < 4000; index += 1) counts[pickVariant(signature, 'house', random)] += 1;
  const weights = signature.houseWeights.house;
  const favoured = counts.filter((_, index) => weights[index] > 1);
  const plain = counts.filter((_, index) => weights[index] === 1);
  assert.ok(Math.min(...favoured) > 2 * Math.max(...plain));
});

test('a realm with a steep or low roof line gets the matching pooled style', () => {
  const recipe = (settlementStyleKey, roofPitch) => ({ architecture: { settlementStyleKey, roofPitch } });
  assert.equal(styleFor({ id: 1 }, recipe('granite-slate', 52)).key, 'granite-slate-steep');
  assert.equal(styleFor({ id: 1 }, recipe('granite-slate', 26)).key, 'granite-slate-low');
  assert.equal(styleFor({ id: 1 }, recipe('limestone-slate', 42)).key, 'limestone-slate');
  assert.equal(styleFor({ id: 1 }, recipe('swamp-thatch', 46)).key, 'granite-slate-steep');
  const steep = SETTLEMENT_STYLES.find(({ key }) => key === 'granite-slate-steep');
  assert.equal(buildingRecipe(steep, 'house', 0).roofPitch, 50);
  // Cultures without a realm keep to the four culture styles.
  for (let culture = 0; culture < 40; culture += 1) assert.equal(styleFor({ id: 1, culture }).roofPitch, undefined);
});

test('a realm that prefers a dressing wears it in most of its towns, not all', () => {
  const worn = Array.from({ length: 60 }, (_, id) => dressingFor({ id }, { topStyle: 'slate' }, 'river-stone').key);
  const share = worn.filter((key) => key === 'river-stone').length / worn.length;
  assert.ok(share > 0.55 && share < 0.95, `share ${share}`);
});

test('the plan carries its signature', () => {
  const plan = planSettlement({ settlement: town(11), worldSeed: 3 });
  assert.ok(plan.signature.traits.length >= 1);
});
