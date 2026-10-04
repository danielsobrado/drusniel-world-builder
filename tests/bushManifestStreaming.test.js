import assert from 'node:assert/strict';
import test from 'node:test';
import { StylizedBushView } from '../src/editor/stylized/StylizedBushView.js';

function makeView() {
  let prepared = false;
  const view = Object.assign(Object.create(StylizedBushView.prototype), {
    revisionTracker: { signature: () => 'revision:0' },
    prototypes: [{}], clusterField: { signature: 'cluster:0' },
    prototypeBiomeRules: [], prototypeIndexForRoll: () => 0,
    manifestCache: new Map(), pendingManifests: new Map(),
    config: { bushes: { perChunk: 12, tileIds: [6], minScale: 1, maxScale: 1, radius: 0.2 } },
    terrainView: {
      worldStore: { chunkSize: 8, tileSize: 2 },
      tileMap: { get: () => 6 }, getCanonicalHeight: () => 3,
      preparedPlacement: { ensureChunk: () => prepared },
    },
    createCandidateEvaluator: () => () => ({}),
  });
  return { view, prepare: () => { prepared = true; } };
}

test('bush streaming waits for prepared terrain, resumes slices, and reuses the completed manifest', () => {
  const blockers = { signature: 'empty', placements: [] };
  const reference = makeView();
  reference.prepare();
  const expected = reference.view.manifestForChunk(0, 0, blockers);
  assert.ok(expected.length > 0);
  const actual = makeView();
  assert.equal(actual.view.manifestForChunk(0, 0, blockers), null);
  assert.equal(actual.view.pendingManifests.size, 0);
  actual.prepare();
  let result = null, slices = 0;
  while (result === null && slices++ < 200) {
    let checks = 0;
    result = actual.view.manifestForChunk(0, 0, blockers, () => ++checks > 5);
    if (result === null) {
      assert.equal(actual.view.manifestCache.size, 0);
      assert.equal(actual.view.pendingManifests.size, 1);
    }
  }
  assert.ok(slices > 1);
  assert.deepEqual(result, expected);
  assert.equal(actual.view.pendingManifests.size, 0);
  assert.strictEqual(actual.view.manifestForChunk(0, 0, blockers, () => true), result);
});
