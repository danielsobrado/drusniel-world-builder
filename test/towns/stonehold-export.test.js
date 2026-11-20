import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { propClusterFor, STONEHOLD_LANDMARKS } from '../../src/editor/towns/TownPrefabCatalog.js';
import { readGlbJson } from '../../scripts/lib/glb-inspection.mjs';

const kit = JSON.parse(fs.readFileSync(new URL('../../public/assets/environment/medieval-kit/medieval_kit_prefabs.json', import.meta.url)));
const lods = ['medieval_kit.glb', 'medieval_kit_lod1.glb'].map((filename) => {
  const glb = new URL(`../../public/assets/environment/medieval-kit/${filename}`, import.meta.url);
  const { nodes, meshes, accessors } = readGlbJson(fs.readFileSync(glb), filename);
  return new Map(nodes.filter((node) => node.mesh !== undefined).map(({ name, mesh }) => [
    name, meshes[mesh].primitives.map(({ attributes }) => accessors[attributes.POSITION]),
  ]));
});

test('Stonehold reservations contain the baked visual footprint and scaled collision', () => {
  for (const reservation of STONEHOLD_LANDMARKS) {
    const [[module]] = propClusterFor(reservation.kind, reservation.variant);
    for (const [lod, positions] of lods.entries()) {
      const parts = positions.get(module);
      assert.ok(parts?.length > 0, `${module} LOD${lod}: missing geometry`);
      for (const { min, max } of parts) {
        assert.ok(Math.max(Math.abs(min[0]), Math.abs(max[0])) <= reservation.w / 2, `${module} LOD${lod}: width`);
        assert.ok(Math.max(Math.abs(min[2]), Math.abs(max[2])) <= reservation.d / 2, `${module} LOD${lod}: depth`);
      }
    }
    const boxes = kit.moduleColliders[module];
    assert.ok(boxes.length > 0, module);
    for (const { c, s } of boxes) {
      assert.ok(c.every(Number.isFinite) && s.every(value => Number.isFinite(value) && value > 0), module);
      assert.ok(Math.abs(c[0]) + s[0] / 2 <= reservation.w / 2, `${module}: collision width`);
      assert.ok(Math.abs(c[2]) + s[2] / 2 <= reservation.d / 2, `${module}: collision depth`);
    }
  }
  const width = Math.max(...kit.moduleColliders.Stonehold_Twin_Outcrop.map(box => box.s[0]));
  assert.ok(width >= 20, 'an inhabited twin fortress has world-scale collision');
});
