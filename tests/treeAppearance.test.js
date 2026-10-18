import assert from 'node:assert/strict';
import test from 'node:test';
import {
  treeBaseSeed,
  treeColorVariation,
  treeLeanAngles,
  treeMorphology,
  treeProxyMorphology,
  treeRenderSeed,
} from '../src/editor/stylized/forest/TreeAppearance.js';

test('tree morphology separates horizontal crown, vertical crown, and trunk scales', () => {
  assert.deepEqual(treeMorphology({
    crownScale: 0.8,
    crownAspect: 0.5,
    trunkScale: 1.2,
  }), [0.4, 1, 1.2]);
});

test('tree morphology thins crowns with foliage density', () => {
  const [horizontal, vertical, trunk] = treeMorphology({
    crownScale: 1,
    crownAspect: 1,
    trunkScale: 1,
    foliageDensity: 0.64,
  });
  assert.equal(trunk, 1);
  assert.ok(Math.abs(horizontal - 0.8) < 1e-12);
  assert.equal(vertical, 1, 'thinning cannot expose the full-height branch skeleton');
});

test('dead trees have no green crown in near and proxy representations', () => {
  const dead = { ageClass: 'dead', crownScale: .42, crownAspect: .78, trunkScale: .94 };
  assert.deepEqual(treeMorphology(dead), [1, 0, .94]);
  assert.deepEqual(treeProxyMorphology(dead), [1, 0, .94]);
});

test('authored silhouettes take ecological width variation without a second species squeeze', () => {
  assert.deepEqual(treeMorphology({ crownScale: 1, crownAspect: .48, crownAspectScale: 1,
    foliageDensity: 1, trunkScale: 1 }), [1, 1, 1]);
});

test('tree proxy morphology keeps the abstract crown connected to its trunk', () => {
  assert.deepEqual(treeProxyMorphology({
    crownScale: 0.42,
    crownAspect: 0.78,
    trunkScale: 0.94,
    foliageDensity: 0.55,
  }), [0.55, 1, 0.94]);
  assert.deepEqual(treeProxyMorphology({
    crownScale: 1.2,
    crownAspect: 1.1,
    trunkScale: 1.2,
    foliageDensity: 1,
  }), [1.32, 1.2, 1.2]);
});

test('tree lean angles follow leanX/leanZ and branch droop', () => {
  const lean = treeLeanAngles({ leanX: 0.1, leanZ: -0.05, branchDroop: 0.2 });
  assert.ok(lean.rotationZ < 0);
  assert.ok(lean.rotationX < 0);
});

test('tree render seed prefers the ecological wind seed across every LOD', () => {
  const placement = { priority: 0.2, index: 17, windSeed: 0.75 };
  assert.equal(treeRenderSeed(placement), 0.75);
  assert.equal(treeBaseSeed(placement), 0.2);
});

test('tree colour variation derives from the shared render seed', () => {
  const placement = { windSeed: 0.75, colorSeed: 0.1 };
  assert.ok(Math.abs(treeColorVariation(placement) - 1.05) < 1e-12);
});

test('tree render seed falls back deterministically when wind metadata is absent', () => {
  const placement = { index: 17 };
  assert.equal(treeRenderSeed(placement), treeBaseSeed(placement));
  assert.equal(treeRenderSeed(placement), treeRenderSeed({ index: 17 }));
});
