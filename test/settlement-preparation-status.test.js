import assert from 'node:assert/strict';
import test from 'node:test';
import { settlementPreparationStatus } from '../src/editor/world/settlements/view/SettlementPreparationStatus.js';
import { sceneryPreparationStatus } from '../src/editor/stylized/SceneryPreparationStatus.js';

function fixture() {
  const site = { plan: { buildings: [1, 2], props: [1] }, surfaces: {}, pavingReady: true };
  return { enabled: true, sites: new Map([[1, site]]), pool: { entries: new Map(), pending: 0,
    uncompiled: [], compiling: 0, unrevealed: [] } };
}
test('all settlement preparation and publication stages block full scenery readiness', () => {
  for (const stage of ['job', 'surfaces', 'pavingReady', 'uncompiled', 'compiling', 'unrevealed', 'pending', 'failed']) {
    const view = fixture(), site = view.sites.get(1);
    if (stage === 'job') site.job = {};
    if (stage === 'surfaces') site.surfaces = null;
    if (stage === 'pavingReady') site.pavingReady = false;
    if (stage === 'uncompiled' || stage === 'unrevealed') view.pool[stage] = [{}];
    if (stage === 'compiling' || stage === 'pending') view.pool[stage] = 1;
    if (stage === 'failed') view.pool.entries.set(1, { failed: new Error('asset failed') });
    const surface = { terrainView: { settlementView: { getPreparationStatus: () => settlementPreparationStatus(view) } } };
    assert.equal(sceneryPreparationStatus(surface).ready, false, stage);
  }
  const view = fixture();
  assert.equal(settlementPreparationStatus(view).ready, true);
  view.sites.clear(); view.dirty = true;
  assert.equal(settlementPreparationStatus(view).ready, true);
  view.enabled = false; view.pool.pending = 100;
  assert.equal(settlementPreparationStatus(view).ready, true);
});

test('far-terrain publication and settlement tier replacement prevent false scenery readiness', () => {
  const view = fixture();
  view.pool.publications = { pending: new Set([{}]) };
  assert.equal(settlementPreparationStatus(view).ready, false);
  const terrainView = { macroFarTerrain: { getPreparationStatus: () => ({ ready: false }) } };
  assert.equal(sceneryPreparationStatus({ terrainView }).ready, false);
});
