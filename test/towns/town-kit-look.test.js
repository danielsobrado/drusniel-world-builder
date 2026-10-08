import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three/webgpu';

import { KIT_DATA_ATTRIBUTE, mergeKitModule } from '../../src/editor/towns/TownKitGeometry.js';
import { placementsWithin, needsRefresh } from '../../src/editor/towns/TownLod.js';
import { resolveLook } from '../../src/editor/towns/TownMaterialPalette.js';
import { seedColour } from '../../src/editor/towns/TownModuleInstances.js';

function strip(top, bottom) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, top, 0, 1, top, 0, 1, bottom, 0], 3));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

const LOOK = Object.freeze({
  skin: 'heartland', stone: 'limestone', finish: 'ochre', family: 'Tudor', thatch: false,
  banner: [0.5, 0.1, 0.1],
});

test('banner cloth sways more the further it hangs below its rod', () => {
  const { opaque } = mergeKitModule('Banner_Blue', [
    { geometry: strip(0, -2), materialName: 'M_cloth_blue' },
    { geometry: strip(0.05, 0.05), materialName: 'M_iron' },
  ], () => 3, () => false);
  const data = opaque.getAttribute(KIT_DATA_ATTRIBUTE);
  assert.equal(data.getY(0), 0, 'top of the cloth is held still');
  assert.equal(data.getY(2), 1, 'the hem swings freely');
  assert.equal(data.getY(3), 0, 'the iron rod does not sway');
  assert.equal(data.getZ(0), 3);
});

test('sacks on carts are cloth but never sway', () => {
  const { opaque } = mergeKitModule('Cart', [{ geometry: strip(1, 0), materialName: 'M_cloth_cream' }],
    () => 0, () => false);
  assert.equal(opaque.getAttribute(KIT_DATA_ATTRIBUTE).getY(2), 0);
});

test('a look tints by kit material, swaps for skins and thatch, and keys stably', () => {
  const look = resolveLook(LOOK);
  assert.deepEqual(look.tints.M_cloth_blue, LOOK.banner);
  assert.equal(look.tints.M_roof_terracotta, undefined, 'terracotta keeps its own colour');
  assert.deepEqual(look.swaps, {});
  assert.equal(resolveLook({ ...LOOK, thatch: true }).swaps.M_roof, 'M_thatch');
  assert.equal(resolveLook({ ...LOOK, skin: 'frost' }).swaps.M_stone, 'M_stone_ashlar');
  assert.equal(resolveLook({ ...LOOK, skin: 'frost' }).snow, 1);
  assert.equal(resolveLook(LOOK).key, resolveLook({ ...LOOK }).key);
  assert.notEqual(resolveLook(LOOK).key, resolveLook({ ...LOOK, finish: 'rose' }).key);
});

test('building seeds become gentle per-channel tones in [0.9, 1]', () => {
  for (const seed of [0, 0.13, 0.5, 0.999]) {
    for (const channel of seedColour(seed)) assert.ok(channel >= 0.9 && channel <= 1, `${channel}`);
  }
  assert.notDeepEqual(seedColour(0.2), seedColour(0.7));
});

test('interiors pick placements near the viewer and re-pick after a few metres', () => {
  const values = new Float32Array([0, 0, 0, 0, 30, 5, 0, 1, 0, 9, 40, 0]);
  const out = new Uint32Array(3);
  const count = placementsWithin(values, 0, 0, 36, out);
  assert.deepEqual([...out.subarray(0, count)], [0, 1]);
  assert.equal(needsRefresh(null, 0, 0, 6), true);
  assert.equal(needsRefresh({ x: 0, z: 0 }, 3, 3, 6), false);
  assert.equal(needsRefresh({ x: 0, z: 0 }, 5, 5, 6), true);
});
