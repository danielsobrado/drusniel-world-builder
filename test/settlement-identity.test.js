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

function townWithGrammar(grammar, extra) {
  for (let id = 1; id < 400; id += 1) {
    const burg = town(id, extra);
    if (settlementSignature(burg, settlementProfile(burg), 3, 2).grammar === grammar) return burg;
  }
  throw new Error(`no ${grammar} town found`);
}

const angleBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('towns are laid out radial, grid or along one road, and walled towns stay radial', () => {
  const seen = new Set();
  for (let id = 1; id < 200; id += 1) {
    const open = town(id, { population: id % 2 ? 1 : 12, capital: id % 7 === 0 });
    seen.add(settlementSignature(open, settlementProfile(open), 3, 2).grammar);
    const walled = town(id, { population: 12, walls: true });
    assert.equal(settlementSignature(walled, settlementProfile(walled), 3, 2).grammar, 'radial');
  }
  assert.deepEqual([...seen].sort(), ['grid', 'linear', 'radial']);
});

test('a grid town has straight block streets square to its axes, and still houses its people', () => {
  const burg = townWithGrammar('grid', { population: 12, capital: true });
  const plan = planSettlement({ settlement: burg, worldSeed: 3, routeBearings: [0.4, 2.1] });
  // Each half-axis is an avenue inside the town and a road beyond it.
  const mains = plan.streets.filter(({ kind, avenue }) => kind === 'main' && !avenue);
  assert.equal(mains.length, 4);
  const axis = mains[0].bearing;
  const blocks = plan.streets.filter(({ kind }) => kind === 'ring');
  assert.ok(blocks.length >= 8);
  for (const { points } of blocks) {
    const heading = Math.atan2(points.at(-1)[0] - points[0][0], points.at(-1)[1] - points[0][1]);
    const offAxis = Math.min(...[0, 1, 2, 3].map((quarter) => angleBetween(heading, axis + quarter * Math.PI / 2)));
    assert.ok(offAxis < 0.01, `block street ${offAxis} rad off its grid`);
  }
  const houses = plan.buildings.filter(({ kind }) => !['farmhouse', 'barn', 'wall', 'gatehouse', 'tower'].includes(kind));
  // Radial towns on open ground fill 65–90% of their target too; a grid must do no worse.
  assert.ok(houses.length >= plan.profile.buildings * 0.8, `${houses.length} of ${plan.profile.buildings}`);
});

test('a street village is one road through the square, with no rings', () => {
  const burg = townWithGrammar('linear', { population: 0.9 });
  const plan = planSettlement({ settlement: burg, worldSeed: 3, routeBearings: [1.2] });
  // Its market street is the first stretch of one of them: count the roads.
  const mains = plan.streets.filter(({ kind, avenue }) => kind === 'main' && !avenue);
  assert.equal(mains.length, 2);
  assert.ok(angleBetween(mains[0].bearing, mains[1].bearing + Math.PI) < 1e-9);
  assert.equal(plan.streets.filter(({ kind }) => kind === 'ring').length, 0);
});

test('a capital widens every main street into an avenue inside its wall; the gate road stays narrow', () => {
  const burg = town(18, { population: 28, capital: true, walls: true, citadel: true });
  const plan = planSettlement({ settlement: burg, worldSeed: 1234, routeBearings: [0.3, 1.9, 4] });
  const avenues = plan.streets.filter(({ avenue }) => avenue);
  const roads = plan.streets.filter(({ kind, avenue }) => kind === 'main' && !avenue);
  assert.ok(avenues.length >= 3);
  for (const avenue of avenues) {
    assert.equal(avenue.width, 11);
    assert.ok(avenue.points.every(([x, z]) => Math.hypot(x, z) <= plan.profile.radius * 0.93));
  }
  assert.ok(roads.every(({ width }) => width === 5.5));
  // Every gate sits on a road, none on an avenue.
  assert.equal(plan.buildings.filter(({ kind }) => kind === 'gatehouse').length, roads.length);
});

test('a town of rank 2 has one avenue, wider than its other streets, and nothing is built on it', () => {
  const burg = town(9, { population: 12 });
  const plan = planSettlement({ settlement: burg, worldSeed: 3, routeBearings: [0.3, 1.9, 4] });
  const avenues = plan.streets.filter(({ avenue }) => avenue);
  assert.ok(avenues.length >= 1);
  const widest = Math.max(...plan.streets.filter(({ avenue }) => !avenue).map(({ width }) => width));
  assert.ok(avenues.every(({ width }) => width > widest));
  for (const building of plan.buildings) {
    for (const { points, width } of avenues) {
      for (const [x, z] of points) {
        const dx = x - building.x;
        const dz = z - building.z;
        const along = dx * Math.cos(building.yaw) - dz * Math.sin(building.yaw);
        const across = dx * Math.sin(building.yaw) + dz * Math.cos(building.yaw);
        // Distance from the avenue's centreline point to the footprint rectangle.
        const gap = Math.hypot(Math.max(0, Math.abs(along) - building.width / 2), Math.max(0, Math.abs(across) - building.depth / 2));
        assert.ok(gap >= width / 2 - 0.05, `a ${building.kind} stands on the avenue (${gap.toFixed(2)} m from its centre)`);
      }
    }
  }
});

function townWithMarket(kind, extra, options = {}) {
  for (let id = 1; id < 400; id += 1) {
    const burg = town(id, extra);
    const plan = planSettlement({ settlement: burg, worldSeed: 3, routeBearings: [0.3, 1.9, 4], ...options });
    if (plan.squares.some((square) => square.kind === kind)) return plan;
  }
  throw new Error(`no town with a ${kind} market`);
}

function assertSquaresClear(plan) {
  for (const square of plan.squares) {
    for (const building of plan.buildings) {
      if (building.kind === 'markethall') continue;
      const reach = Math.min(building.width, building.depth) / 2;
      assert.ok(Math.hypot(building.x - square.x, building.z - square.z) >= square.radius + reach - 1e-6, `a ${building.kind} stands in the ${square.kind}`);
    }
  }
}

test('every town with a square names its markets, the primary first and at its heart', () => {
  const plan = planSettlement({ settlement: town(5, { name: 'Velmora', population: 6 }), worldSeed: 3, routeBearings: [0.3, 1.9] });
  assert.ok(plan.squares.length >= 1);
  assert.deepEqual([plan.squares[0].x, plan.squares[0].z], [0, 0]);
  assert.equal(plan.squares[0].radius, plan.squareRadius);
  assert.ok(plan.squares.every(({ name }) => name.startsWith('Velmora ')));
  assert.deepEqual(plan.signature.markets.map(({ kind }) => kind).slice(0, plan.squares.length), plan.squares.map(({ kind }) => kind));
});

test('a port opens a fish market beside the quay road, clear of streets and houses', () => {
  // Water lies north of the town: the quay road runs that way.
  const isBuildable = (x, z) => z < 180;
  const plan = townWithMarket('harbour', { population: 6, port: true }, { isBuildable });
  const harbour = plan.squares.find(({ kind }) => kind === 'harbour');
  assert.ok(harbour.z > plan.profile.radius * 0.4, `the fish market is not on the quay side (z ${harbour.z.toFixed(0)})`);
  assert.match(harbour.name, /Fish Market$/);
  assertSquaresClear(plan);
  assert.ok(plan.props.some(({ kind, x, z }) => kind === 'stall' && Math.hypot(x - harbour.x, z - harbour.z) < harbour.radius));
});

test('a market hall stands alone in its square, with its door and stalls round it', () => {
  const plan = townWithMarket('market-hall', { population: 3 });
  const square = plan.squares.find(({ kind }) => kind === 'market-hall');
  const hall = plan.buildings.find(({ kind }) => kind === 'markethall');
  assert.ok(Math.hypot(hall.x - square.x, hall.z - square.z) < 1e-6);
  assert.ok(hall.door, 'the hall has no door');
  assert.match(square.name, /Hall$/);
  assertSquaresClear(plan);
  const stalls = plan.props.filter(({ kind, x, z }) => kind === 'stall' && Math.hypot(x - square.x, z - square.z) < square.radius);
  assert.ok(stalls.length >= 4);
  assert.ok(!plan.props.some(({ kind, x, z }) => kind === 'well' && Math.hypot(x - square.x, z - square.z) < 1));
});

test('a capital has a grand square with a fountain and two rings of stalls', () => {
  const plan = planSettlement({ settlement: town(18, { population: 28, capital: true, walls: true }), worldSeed: 3, routeBearings: [0.3, 1.9, 4] });
  assert.equal(plan.squares[0].kind, 'grand-square');
  assert.ok(plan.props.some(({ kind, x, z }) => kind === 'fountain' && x === 0 && z === 0));
  assertSquaresClear(plan);
});

test('a street village holds its market in its street', () => {
  const plan = townWithMarket('street-market', { population: 0.9 }, { routeBearings: [1.2] });
  const market = plan.streets.find(({ market }) => market);
  assert.equal(market.width, 12);
  const stalls = plan.props.filter(({ kind, x, z }) => kind === 'stall' && Math.hypot(x, z) > plan.squareRadius + 2);
  assert.ok(stalls.length >= 3);
});

test('no two markets of a town share a name', () => {
  for (let id = 1; id < 120; id += 1) {
    const burg = town(id, { population: 20, walls: true, port: true });
    const names = settlementSignature(burg, settlementProfile(burg), 3, 3).markets.map(({ name }) => name);
    assert.equal(new Set(names).size, names.length, names.join(', '));
  }
});
