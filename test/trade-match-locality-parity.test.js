import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyWorldState, cloneWorldState, listEntities, upsertEntity } from '../src/sim/model/worldState.js';
import { matchTradeOffers } from '../src/sim/logistics/shipments.js';
import { referenceMatchTradeOffers } from './fixtures/trade-match-reference.js';

function fixture() {
  const state = createEmptyWorldState();
  for (let i = 0; i < 4; i++) {
    upsertEntity(state, { id: `s${i}`, kind: 'settlement', status: 'active', data: { inventoryAccountId: `inv${i}` } });
    upsertEntity(state, { id: `inv${i}`, kind: 'inventoryAccount', status: 'active',
      data: { quantities: { grain: 5000, wood: 5000, ore: 5000 }, reserved: {} } });
    upsertEntity(state, { id: `n${i}`, kind: 'graphNode', status: 'active',
      data: { settlementId: `s${i}`, nodeKind: 'settlement' } });
  }
  for (let from = 0; from < 3; from++) for (let to = 0; to < 3; to++) {
    if (from === to) continue;
    upsertEntity(state, { id: `e${from}${to}`, kind: 'graphEdge', status: 'active',
      data: { fromNodeId: `n${from}`, toNodeId: `n${to}`, baseTravelHours: 1, danger: 0, toll: 0 } });
  }
  return state;
}

test('indexed trade matching preserves exact reference events, quantities and reason order over randomized books', () => {
  let seed = 20261018;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
  let matches = 0, failures = 0, partials = 0;
  for (let trial = 0; trial < 100; trial++) {
    const source = fixture();
    for (let index = 0; index < 80; index++) {
      upsertEntity(source, { id: `offer-${String(index).padStart(3, '0')}`, kind: 'tradeOffer',
        status: random(10) === 0 ? 'inactive' : 'active', data: {
          kind: random(2) ? 'buy' : 'sell', settlementId: `s${random(4)}`,
          commodityId: ['grain', 'wood', 'ore'][random(3)], quantity: random(12), limitPrice: random(5),
        } });
    }
    const actualState = cloneWorldState(source), expectedState = cloneWorldState(source);
    const options = { commandId: `trial-${trial}`, config: {}, ordinalBase: 7 };
    const expected = referenceMatchTradeOffers(expectedState, { worldId: 'qa' }, options);
    const actual = matchTradeOffers(actualState, { worldId: 'qa' }, options);
    assert.deepEqual(actual, expected, `trial ${trial}`);
    assert.deepEqual(listEntities(actualState, 'tradeOffer'), listEntities(expectedState, 'tradeOffer'));
    assert.deepEqual(listEntities(actualState, 'inventoryAccount'), listEntities(expectedState, 'inventoryAccount'));
    matches += actual.shipments.length;
    failures += actual.reasonCodes.filter(reason => reason.code === 'trade_match_failed').length;
    partials += actual.reasonCodes.filter(reason => reason.code === 'trade_matched' && (reason.sellRemaining || reason.buyRemaining)).length;
  }
  assert.ok(matches > 0 && failures > 0 && partials > 0, 'exercise success, route failures and partial fills');
});

test('filled sell offers leave subsequent candidate scans', () => {
  const state = fixture();
  let reads = 0;
  const count = 500;
  for (let i = 0; i < count; i++) for (const kind of ['buy', 'sell']) {
    const id = `${kind}-${String(i).padStart(4, '0')}`;
    const offer = { kind: 'tradeOffer', status: 'active', get id() { reads++; return id; }, data: {
      kind, settlementId: kind === 'buy' ? 's1' : 's0', commodityId: 'grain', quantity: 1,
      limitPrice: kind === 'buy' ? 1000 + i : 1 + i,
    } };
    state.tradeOffers.set(id, offer);
  }
  // Isolate matching from the unrelated initial canonical entity sort.
  listEntities(state, 'tradeOffer'); reads = 0;
  const actual = matchTradeOffers(state, { worldId: 'qa' }, { commandId: 'filled', config: {} });
  assert.equal(actual.shipments.length, count);
  assert.ok(reads < count * 20, `${reads} offer ID reads for ${count} matches`);
});
