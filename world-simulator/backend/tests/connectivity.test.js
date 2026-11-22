import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldAudit } from '../src/world/WorldAudit.js';
import { buildSettlementConnectivity } from '../src/geography/SettlementConnectivity.js';
import { config, eldaraModel, fixtureDocument } from './fixtures.js';

function fixtureConnectivity(mutate = (doc) => doc) {
  const document = mutate(fixtureDocument());
  const audit = buildWorldAudit({ identity: { mapId: 'fixture' }, document }, config.simulator);
  return buildSettlementConnectivity(audit, document.pack.routes, config.simulator.connectivity);
}

const byId = (c) => Object.fromEntries(c.settlements.map((s) => [s.settlementId.split(':').pop(), s]));

test('routes join settlements through their cells and through junctions', () => {
  const c = fixtureConnectivity();
  const s = byId(c);
  assert.deepEqual(c.components[0].settlementIds, ['1', '2', '3', '4'].map((i) => `settlement:azgaar-burg:${i}`));
  assert.equal(s[2].roadComponentId, s[4].roadComponentId);
  assert.deepEqual(s[2].roadLinks.map((l) => l.settlementId), ['settlement:azgaar-burg:1'], 'junction is not a direct link');
  assert.equal(c.routes.find((r) => r.routeId === 0).length, 45, '15 px x distanceScale 3');
});

test('proximity never counts as connectivity', () => {
  const s = byId(fixtureConnectivity());
  assert.equal(s[5].roadConnected, false);
  assert.equal(s[5].onLandRoute, false);
  assert.equal(s[5].nearby[0].settlementId, 'settlement:azgaar-burg:2', 'Two is nearest');
  assert.equal(s[5].nearby[0].sameRoadComponent, false);
  assert.deepEqual(s[5].seaLinks.map((l) => l.settlementId), ['settlement:azgaar-burg:3']);
});

test('routes that cross fewer than two settlements are reported unresolved', () => {
  const c = fixtureConnectivity();
  assert.deepEqual(c.unresolvedRoutes.map((r) => r.routeId), [2]);
  assert.equal(c.summary.isolatedSettlements, 1);
});

test('points without cell ids fall back to the coordinate tolerance', () => {
  const c = fixtureConnectivity((doc) => {
    doc.pack.routes.push({ i: 4, group: 'trails', points: [[40.5, 10.5], [60, 60, 10]] });
    return doc;
  });
  assert.equal(c.routes.find((r) => r.routeId === 4).coordinateMatches, 1);
});

test('Eldara connectivity is consistent', () => {
  const { connectivity } = eldaraModel();
  const { summary } = connectivity;
  assert.equal(summary.landRoutes + summary.seaRoutes, 433);
  assert.equal(connectivity.components.reduce((sum, c) => sum + c.size, 0) + summary.isolatedSettlements, 502);
  for (const s of connectivity.settlements) {
    for (const link of s.roadLinks) {
      const other = connectivity.settlements.find((o) => o.settlementId === link.settlementId);
      assert.equal(other.roadComponentId, s.roadComponentId);
    }
  }
});
