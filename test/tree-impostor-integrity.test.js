import assert from 'node:assert/strict';
import test from 'node:test';
import { treeImpostorIntegrity } from '../src/editor/stylized/impostor/TreeImpostorIntegrity.js';

const view = atlases => ({
  config: { trees: { enabled: true }, lod: { impostor: { enabled: true, runtimeBake: false } } },
  prototypes: [{}, {}], impostorBatches: [{}, {}], impostorAtlases: atlases, prototypeSignature: 'actual',
});

test('visual integrity rejects missing, duplicate and runtime fallback atlases', () => {
  for (const atlases of [[], [{ prototypeIndex: 0, source: 'asset' }],
    [{ prototypeIndex: 0, source: 'asset' }, { prototypeIndex: 0, source: 'asset' }],
    [{ prototypeIndex: 0 }, { prototypeIndex: 1 }]]) {
    assert.equal(treeImpostorIntegrity(view(atlases)).ready, false);
  }
});

test('complete offline assets pass and preserve useful failure diagnostics', () => {
  const tree = view([{ prototypeIndex: 0, source: 'asset' }, { prototypeIndex: 1, source: 'asset' }]);
  assert.equal(treeImpostorIntegrity(tree).ready, true);
  tree.impostorBatches = [];
  assert.equal(treeImpostorIntegrity(tree).ready, false);
  tree.impostorBatches = [{}, {}];
  tree.impostorAtlases = []; tree.impostorFailure = 'source signature mismatch';
  assert.equal(treeImpostorIntegrity(tree).failure, 'source signature mismatch');
  tree.config.lod.impostor.enabled = false;
  assert.equal(treeImpostorIntegrity(tree).ready, true);
});
