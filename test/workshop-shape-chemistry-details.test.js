import assert from 'node:assert/strict';
import test from 'node:test';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import {
  normalizeProceduralRecipe,
  ProceduralAssetStore,
} from '../src/editor/workshop/ProceduralAssetStore.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { WorkshopShapeSession } from '../src/editor/workshop/shapes/WorkshopShapeSession.js';
import { WorkshopShapeCache } from '../src/editor/workshop/shapes/WorkshopShapeCache.js';
import { createShapeWallSurface } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { promoteShapeGate } from '../src/editor/workshop/shapes/ShapeGateControls.js';
import { planShapeIvy } from '../src/editor/workshop/shapes/ShapeIvyLayout.js';
import { buildShapeIvy } from '../src/editor/workshop/shapes/ShapeIvyBuilder.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';

const plan = (composition) => planWorkshopComposition({ composition });
const wall = (composition) => plan(composition).shapePlans.find((p) => p.id === 'garden-wall');

test('a path crossing a curved wall publishes one resolved arch and matching shared masks', () => {
  const composition = createShapePreset('garden-gateway');
  const before = structuredClone(composition);
  const host = wall(composition),
    gate = host.automaticOpenings[0];
  assert.equal(host.automaticOpenings.length, 1);
  assert.equal(gate.profile, 'arched');
  assert.equal(gate.provenance.source, 'auto');
  assert.deepEqual(gate.provenance.sourceEntityIds, ['garden-wall', 'garden-path']);
  assert.equal(host.rpg.portals[0].openingId, gate.id);
  assert.ok(host.rpg.collisionSlabs.every((s) => s.gaps.includes(gate)));
  const surface = createShapeWallSurface(host);
  assert.ok(surface.excluded(gate.at * surface.length, 1));
  assert.ok(!surface.excluded(gate.at * surface.length, host.primitive.height - 0.1));
  assert.deepEqual(composition, before, 'Resolution must not add authored openings.');
  assert.deepEqual(wall(composition), host, 'Replaying the same intent must be deterministic.');
});

test('low walls open fully and elevated or parallel paths leave walls unchanged', () => {
  const composition = createShapePreset('garden-gateway');
  composition.primitives[0].height = 1.4;
  let host = wall(composition),
    gate = host.automaticOpenings[0];
  assert.equal(gate.profile, 'square');
  assert.equal(gate.height, host.primitive.height);
  assert.ok(createShapeWallSurface(host).excluded(gate.at * host.curve.length, 1.39));
  composition.primitives[1].elevation = 5;
  assert.equal(wall(composition).automaticOpenings.length, 0);
  composition.primitives[1].elevation = 0;
  composition.primitives[1].rotation = 0;
  composition.primitives[0].bend = 0;
  composition.primitives[1].position = [0, 0];
  assert.equal(wall(composition).automaticOpenings.length, 0);
});

test('gate selection respects explicit openings, suppression, and rule disablement', () => {
  const composition = createShapePreset('garden-gateway');
  const gate = wall(composition).automaticOpenings[0];
  const host = composition.primitives[0];
  host.openings = [{ id: 'door', role: 'door', at: gate.at, width: 1, height: 2.1, bottom: 0 }];
  assert.equal(wall(composition).automaticOpenings.length, 0);
  assert.equal(wall(composition).openings[0].role, 'door');
  host.openings = [];
  host.suppressed = [gate.derivationKey];
  assert.equal(wall(composition).automaticOpenings.length, 0);
  host.suppressed = [];
  host.automaticGates = false;
  assert.equal(wall(composition).automaticOpenings.length, 0);
});

test('keeping a gate persists editable opening intent with promotion provenance and undo', () => {
  const session = new WorkshopShapeSession(createShapePreset('garden-gateway'));
  try {
    const gate = wall(session.composition).automaticOpenings[0];
    const original = session.composition;
    const id = promoteShapeGate(session, 'garden-wall', gate);
    assert.equal(session.history.undoDepth, 1);
    const kept = session.getPrimitive('garden-wall').openings.find((o) => o.id === id);
    assert.equal(kept.promotedFrom, gate.derivationKey);
    session.undo();
    assert.deepEqual(session.composition, original);
    session.redo();
    session.update('garden-path', { position: [12, 12] });
    assert.equal(wall(session.composition).openings.length, 1);
    assert.equal(wall(session.composition).automaticOpenings.length, 0);
    const store = new ProceduralAssetStore();
    store.add({
      label: 'Kept garden gate',
      recipe: { composition: session.composition },
    });
    const restored = new ProceduralAssetStore();
    restored.replaceAll(store.toDocument());
    assert.deepEqual(restored.toDocument(), store.toDocument());
  } finally {
    session.dispose();
  }
});

test('crossing-path edits rebuild the host masks while preserving distant wall resources', () => {
  const composition = createShapePreset('garden-gateway');
  composition.primitives.push({
    ...composition.primitives[0],
    id: 'distant-wall',
    position: [30, 30],
  });
  const cache = new WorkshopShapeCache();
  const update = () => {
    const recipe = normalizeProceduralRecipe({ composition, ivy: true });
    const result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans);
    cache.releaseRemoved(result);
    return result;
  };
  try {
    update();
    const distant = cache.entries.get('distant-wall');
    const host = cache.entries.get('garden-wall').domains;
    composition.primitives[1].position = [2, 1.5];
    const result = update();
    assert.equal(cache.entries.get('distant-wall'), distant);
    assert.notEqual(cache.entries.get('garden-wall').domains.get('walls'), host.get('walls'));
    assert.notEqual(cache.entries.get('garden-wall').domains.get('ivy'), host.get('ivy'));
    assert.equal(result.stats.reused, 1);
  } finally {
    cache.clear();
  }
});

test('facade and shutter changes reuse wall, roof, and ivy geometry', () => {
  const composition = createShapePreset('cottage-turret');
  const cache = new WorkshopShapeCache();
  const update = () => {
    const recipe = normalizeProceduralRecipe({ composition, ivy: true });
    const result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans);
    cache.releaseRemoved(result);
    return result;
  };
  try {
    update();
    const before = cache.entries.get('cottage').domains;
    const turret = cache.entries.get('turret');
    composition.primitives[0].facade = 'timber';
    const result = update();
    const after = cache.entries.get('cottage').domains;
    for (const domain of ['walls', 'roof', 'ivy'])
      assert.equal(after.get(domain), before.get(domain));
    assert.notEqual(after.get('facade'), before.get('facade'));
    assert.equal(result.stats.rebuiltDomains, 1);
    assert.equal(
      cache.entries.get('turret'),
      turret,
      'Facade edits must not rebuild attached structures.',
    );
    composition.primitives[0].shutters = false;
    update();
    for (const domain of ['walls', 'roof', 'ivy'])
      assert.equal(cache.entries.get('cottage').domains.get(domain), after.get(domain));
  } finally {
    cache.clear();
  }
});

test('ivy leaf keys and appearance remain stable when walls grow taller or details change', () => {
  const composition = createShapePreset('garden-gateway');
  const before = wall(composition);
  const short = planShapeIvy(before, 1848);
  composition.primitives[0].height = 5;
  const tall = planShapeIvy(wall(composition), 1848);
  const byKey = new Map(tall.leaves.map((leaf) => [leaf.key, leaf]));
  assert.ok(short.leaves.length > 30);
  for (const leaf of short.leaves) assert.deepEqual(byKey.get(leaf.key), leaf);
  const coarse = planShapeIvy(before, 1848, 1);
  const near = new Map(short.leaves.map((leaf) => [leaf.key, leaf]));
  for (const leaf of coarse.leaves) assert.deepEqual(near.get(leaf.key), leaf);
  assert.ok(new Set(short.leaves.map((leaf) => leaf.size)).size > 10);
});

test('ivy geometry excludes authored windows and open wall ends', () => {
  const composition = createShapePreset('garden-gateway');
  const p = composition.primitives[0];
  p.bend = 0;
  p.height = 4;
  p.automaticGates = false;
  p.openings = [
    {
      id: 'window',
      role: 'window',
      profile: 'square',
      at: 0.5,
      width: 1.8,
      height: 2,
      bottom: 1,
    },
  ];
  const host = wall(composition),
    surface = createShapeWallSurface(host),
    foliage = new ShapeMesh();
  buildShapeIvy(host, { foliage }, { ivy: true, seed: 1848, detail: 2 });
  assert.ok(foliage.positions.length > 0);
  for (let i = 0; i < foliage.positions.length; i += 3) {
    const x = foliage.positions[i],
      y = foliage.positions[i + 1];
    assert.ok(x >= -p.length / 2 && x <= p.length / 2);
    assert.ok(!surface.excluded(x + p.length / 2, y), 'Leaves/stems must not cover the opening.');
  }
  const geometry = foliage.geometry();
  try {
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++)
      assert.ok(normals.getZ(i) < 0, 'Ivy must face outward from the wall.');
  } finally {
    geometry.dispose();
  }
});

test('invalid facade and gate intent rejects atomically', () => {
  const session = new WorkshopShapeSession(createShapePreset('garden-gateway'));
  const original = session.composition;
  assert.throws(() => session.update('garden-wall', { automaticGates: 'yes' }), /boolean/);
  assert.deepEqual(session.composition, original);
  session.dispose();
  const cottage = new WorkshopShapeSession(createShapePreset('rounded-cottage'));
  assert.throws(() => cottage.update('cottage', { facade: 'unknown' }), /facade/);
  assert.throws(() => cottage.update('cottage', { shutters: 1 }), /boolean/);
  cottage.dispose();
});
