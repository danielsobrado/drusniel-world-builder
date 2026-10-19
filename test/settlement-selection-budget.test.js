import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Matrix4, MeshBasicNodeMaterial } from 'three/webgpu';
import { settlementSelectionJob, placeSettlementRows } from '../src/editor/world/settlements/view/SettlementSelection.js';
import { SETTLEMENT_VIEW } from '../src/editor/world/settlements/view/SettlementView.js';
import { createInstancedRenderers, disposeInstancedRenderers } from '../src/editor/stylized/lod/StylizedLodRuntime.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';

function fixture(t) {
  const root = new Group(), geometry = new BoxGeometry(), material = new MeshBasicNodeMaterial();
  const entries = new Map(Array.from({ length: 3 }, (_, i) => {
    const tier = band => ({ meshes: createInstancedRenderers({ root,
      partsByPrototype: [[{ geometry, material }]], capacity: 1024, name: `${i}-${band}` })[0] });
    return [`house-${i}`, { state: 'ready', near: tier('near'), far: tier('far') }];
  }));
  const placements = Array.from({ length: 1000 }, (_, i) => ({ key: `house-${i % 3}`, kind: 'house', variant: 0,
    x: i / 100, z: 0, y: 0, small: false, blend: 0, shown: 0,
    near: { matrix: new Matrix4().makeTranslation(i / 100, 0, 0), seed: i / 1000 },
    far: { matrix: new Matrix4().makeTranslation(i / 100, 0, 0), seed: i / 1000 } }));
  const view = { root, origin: { x: 0, z: 0 }, rows: new Map(), culls: false,
    sites: new Map([[1, { id: 1, surfaces: {}, plan: { profile: { style: {} }, buildings: placements }, placements }]]),
    pool: { request: key => entries.get(key), tier: (entry, band) => entry[band] } };
  t.after(() => { for (const entry of entries.values()) for (const band of ['near', 'far']) disposeInstancedRenderers(root, [entry[band].meshes]); geometry.dispose(); material.dispose(); });
  return { view, entries, placements };
}
function run(view, timestamp, focus = { x: 0, z: 0 }) {
  const job = settlementSelectionJob(view, focus, timestamp, SETTLEMENT_VIEW);
  let steps = 0;
  for (;;) {
    const before = PerfCounters.get('settlementPlacementsEvaluated') + PerfCounters.get('settlementRetirementRowsChecked');
    const step = job.next(); steps++;
    assert.ok(PerfCounters.get('settlementPlacementsEvaluated') + PerfCounters.get('settlementRetirementRowsChecked') - before <= 32,
      'one scheduler unit never traverses the complete town');
    if (step.done) return { fading: step.value, steps };
    assert.ok(steps < 1000);
  }
}

test('dense-town selection yields, retains rows during suspension and stops rewriting settled tiers', t => {
  const f = fixture(t);
  for (const time of [0, 100, 200, 400]) assert.ok(run(f.view, time).steps > 1);
  assert.equal(f.view.visibleBuildings, 1000);
  assert.equal([...f.entries.values()].reduce((sum, e) => sum + e.near.meshes[0].count, 0), 1000);
  PerfCounters.reset(); run(f.view, 500);
  assert.equal(PerfCounters.get('stylizedInstanceRowsCompared'), 0, 'unchanged membership/fades cause no matrix traversal');
  const before = [...f.entries.values()].map(e => e.near.meshes[0].instanceMatrix.array.slice());
  const job = settlementSelectionJob(f.view, { x: 200, z: 0 }, 600, SETTLEMENT_VIEW);
  job.next();
  const suspended = [...f.entries.values()].map(e => e.near.meshes[0].count);
  placeSettlementRows(f.view);
  assert.deepEqual([...f.entries.values()].map(e => e.near.meshes[0].count), suspended,
    'placing retained tiers does not advance an exhausted selection budget');
  assert.ok(before.every((array, i) => array.length === [...f.entries.values()][i].near.meshes[0].instanceMatrix.array.length));
  // A new current-world cycle also retires publications from an evicted site.
  f.view.sites.clear(); run(f.view, 700);
  assert.ok([...f.entries.values()].every(e => e.near.meshes[0].count === 0 && e.far.meshes[0].count === 0));
});

test('origin movement preserves complete old tiers until their own rows are rewritten', t => {
  const f = fixture(t); run(f.view, 0); run(f.view, 400);
  const mesh = f.entries.get('house-0').near.meshes[0];
  const x = mesh.instanceMatrix.array[12] + mesh.position.x;
  f.view.origin.x = 4096; placeSettlementRows(f.view);
  assert.equal(mesh.instanceMatrix.array[12] + mesh.position.x + 4096, x);
  run(f.view, 800);
  assert.equal(mesh.instanceMatrix.array[12] + mesh.position.x + 4096, x);
});
