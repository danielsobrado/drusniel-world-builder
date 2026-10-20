import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferAttribute, BufferGeometry, Scene } from 'three/webgpu';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { generateSettlementPlan } from '../src/editor/world/settlements/SettlementPlanRequest.js';
import { SettlementSkyline } from '../src/editor/world/settlements/view/SettlementSkyline.js';
import { settlementSkylineArrays } from '../src/editor/world/settlements/view/SettlementSkylineGeometry.js';
import { skylineColors } from '../src/editor/world/settlements/view/SettlementSkylineData.js';
import { settlementPreparationStatus } from '../src/editor/world/settlements/view/SettlementPreparationStatus.js';

function fixture(t) {
  const field = new SettlementField({ settlements: Array.from({ length: 3 }, (_, id) => ({ id, population: .3,
    cellX: id * 300, cellZ: 0 })), tileSize: 2, worldSeed: 7, sampleGround: () => 4, isBuildable: () => true });
  for (const entry of field.entries) {
    const result = generateSettlementPlan({ ensureSettlementField: () => field }, entry.settlement.id);
    entry.skyline = result.skyline;
  }
  const pending = new Set(), ready = new Set();
  const preparation = { settings: { enabled: true },
    requestMaterial: mesh => pending.add(mesh), isMaterialReady: mesh => ready.has(mesh) };
  const skyline = new SettlementSkyline({ scene: new Scene(), getDrawPreparation: () => preparation });
  const focus = { x: 1000, z: 0 };
  skyline.refresh(field, focus, 2); skyline.update(focus, { x: 0, z: 0 });
  t.after(() => skyline.dispose());
  return { field, skyline, pending, ready, focus };
}

test('worker skyline matches canonical geometry, normals and bounds exactly', t => {
  const { field } = fixture(t), entry = field.entries[0];
  const old = settlementSkylineArrays(entry.plan, skylineColors(entry.plan.profile.style));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(old.positions, 3));
  geometry.setIndex(new BufferAttribute(old.indices, 1)); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  assert.deepEqual(entry.skyline.positions, old.positions); assert.deepEqual(entry.skyline.colors, old.colors);
  assert.deepEqual(entry.skyline.indices, old.indices);
  assert.deepEqual(entry.skyline.normals, geometry.getAttribute('normal').array);
  assert.deepEqual(entry.skyline.sphere, { center: geometry.boundingSphere.center.toArray(), radius: geometry.boundingSphere.radius });
  geometry.dispose();
});

test('several distant skylines block readiness through budget suspension and shader preparation', t => {
  const { skyline, pending, ready, focus } = fixture(t);
  const view = { enabled: true, sites: new Map(), skyline,
    pool: { entries: new Map(), pending: 0, uncompiled: [], compiling: 0, unrevealed: [] } };
  assert.equal(skyline.getPreparationStatus().expected, 3);
  assert.equal(settlementPreparationStatus(view).ready, false);
  skyline.advance(() => true); assert.equal(skyline.towns.size, 0);
  let turns = 0;
  while (skyline.pending && turns++ < 100) {
    let units = 0; skyline.advance(() => ++units > 3);
    for (const mesh of pending) ready.add(mesh);
    skyline.update(focus, { x: 4096, z: 0 });
  }
  assert.ok(turns > 3); assert.equal(skyline.pending, 0);
  assert.equal(settlementPreparationStatus(view).ready, true);
  for (const town of skyline.towns.values()) assert.equal(town.mesh.position.x + 4096, town.centre.x);
});

test('eviction cancels staged skyline geometry before exposing it', t => {
  const { skyline, pending } = fixture(t);
  skyline.advance(() => false);
  assert.ok(pending.size > 0); assert.equal(skyline.towns.size, 0);
  let disposals = 0;
  for (const mesh of pending) mesh.geometry.addEventListener('dispose', () => disposals++);
  skyline.refresh(null, { x: 0, z: 0 }, 2);
  assert.equal(skyline.pending, 0); assert.equal(skyline.root.children.length, 0); assert.ok(disposals > 0);
});
