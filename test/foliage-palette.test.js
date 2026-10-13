import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { FallingLeaves } from '../src/editor/stylized/leaves/FallingLeaves.js';
import { fallingLeafPalette, resolveFoliagePalette } from '../src/editor/stylized/forest/foliagePalette.js';

const foliageConfig = {
  grass: { meadow: { palette: { base: '#50852b', tip: '#a6bf65',
    byTileId: { 8: { base: '#2f6a2c', tip: '#86b25a' } } } } },
  trees: { canopyGrade: { shadow: '#286746', light: '#8cb75a' } },
};
const difference = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

function leavesFor(config = {}) {
  let tile = 6;
  const leaves = new FallingLeaves({ scene: new THREE.Scene(), config, foliageConfig,
    getTile: () => tile, getTileSize: () => 2, getOrigin: () => ({ x: 0, z: 0 }) });
  return { leaves, setTile: id => { tile = id; } };
}

test('floating leaf pigment follows the local forest without replacing its GPU texture', () => {
  const { leaves, setTile } = leavesFor();
  const texture = leaves.material.userData.leafTexture;
  const camera = new THREE.PerspectiveCamera();
  for (let frame = 0; frame < 240; frame++) leaves.update(frame / 30, 1 / 30, camera, { x: 0, z: 0 });
  const previous = leaves.uniforms.palette.map(node => node.value.clone());
  setTile(8);
  leaves.update(8, 1 / 30, camera, { x: 0, z: 0 });
  assert.ok(difference(leaves.uniforms.palette[2].value, previous[2]) < 0.02, 'a biome boundary eases its pigment');
  for (let frame = 0; frame < 240; frame++) leaves.update(8 + frame / 30, 1 / 30, camera, { x: 0, z: 0 });
  const expected = fallingLeafPalette(foliageConfig, 8);
  leaves.uniforms.palette.forEach((node, index) => {
    assert.ok(difference(node.value, expected[index]) < 0.002);
    assert.ok(difference(node.value, previous[index]) > 0.01, 'rainforest leaves take its deeper meadow pigment');
  });
  assert.equal(leaves.material.userData.leafTexture, texture, 'walking never repaints or uploads a leaf atlas');
  leaves.dispose();
});

test('an explicit leaf palette remains authoritative across biome changes', () => {
  const palette = [[0.1, 0.2, 0.05], [0.3, 0.4, 0.1], [0.5, 0.6, 0.2]];
  const { leaves, setTile } = leavesFor({ palette });
  setTile(8);
  leaves.update(1, 1, new THREE.PerspectiveCamera(), { x: 0, z: 0 });
  assert.deepEqual(leaves.uniforms.palette.map(node => node.value.toArray()), palette);
  leaves.dispose();
});

test('understory and floating leaves follow authored grass/canopy palette edits', () => {
  const changed = structuredClone(foliageConfig);
  changed.grass.meadow.palette.tip = '#b8b878';
  changed.trees.canopyGrade.light = '#b2a66b';
  const original = resolveFoliagePalette(foliageConfig);
  const updated = resolveFoliagePalette(changed);
  assert.ok(difference(updated.tip, original.tip) > 0.05);
  assert.deepEqual(fallingLeafPalette(changed)[2].toArray(), updated.tip.toArray());
  for (const color of fallingLeafPalette(foliageConfig)) {
    assert.ok(color.g > color.r && color.g > color.b, 'green woods shed green leaves');
  }
});
