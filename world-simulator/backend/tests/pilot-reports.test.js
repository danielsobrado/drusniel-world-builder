import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPilot } from '../src/pilot/PilotSelector.js';
import { buildReports } from '../src/reports/ReportBuilder.js';
import { canonicalJson } from '../src/reports/ReportWriter.js';
import { buildWorldModel } from '../src/world/WorldModel.js';
import { config, eldaraModel } from './fixtures.js';

test('search reproduces the pinned pilot and keeps it road-connected', () => {
  const model = eldaraModel();
  const searched = selectPilot({ ...model, pilotConfig: { ...config.pilot, pinnedSourceIds: [] } });
  assert.equal(searched.mode, 'search');
  assert.deepEqual(searched.roles.map((r) => r.sourceId), config.pilot.pinnedSourceIds);
  assert.equal(model.pilot.mode, 'pinned');
  assert.deepEqual(model.pilot.roles, searched.roles);
  assert.ok(model.pilot.pairwiseRoutes.every((p) => p.distancePx > 0 && p.distancePx <= config.pilot.constraints.maxRouteDistance));
  assert.ok(model.pilot.roles.every((r) => r.roleStatus === 'hypothesis' && r.evidence.length > 0));
  assert.equal(model.pilot.totalNpcs, model.pilot.roles.reduce((sum, r) => sum + r.npcs, 0));
});

test('a pinned id that is not a settlement fails loudly', () => {
  const model = eldaraModel();
  assert.throws(() => selectPilot({ ...model, pilotConfig: { ...config.pilot, pinnedSourceIds: [1, 2, 99999] } }), /99999/);
});

test('reports are byte-identical across runs and carry identity metadata', () => {
  const first = buildReports(eldaraModel());
  const second = buildReports(buildWorldModel(config));
  assert.deepEqual(Object.keys(first).sort(), ['connectivity.json', 'npc-budget-comparison.json', 'pilot-settlements.json', 'settlements.json', 'world-summary.json']);
  for (const name of Object.keys(first)) {
    const text = canonicalJson(first[name]);
    assert.equal(text, canonicalJson(second[name]), name);
    assert.doesNotMatch(text, /[A-Za-z]:\\\\|\/Users\/|generatedAt/, `${name} has no machine paths`);
    const { meta } = first[name];
    assert.equal(meta.schemaVersion, 1);
    assert.match(meta.world.sourceFingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.match(meta.configFingerprint, /^[0-9a-f]{8}$/);
  }
  const ids = first['settlements.json'].data.map((s) => s.sourceId);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});
