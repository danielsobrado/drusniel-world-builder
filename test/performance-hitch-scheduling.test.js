import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene, Group } from 'three/webgpu';
import { acquireReflectionShadowRegistry } from '../src/render/reflections/ReflectionShadowRegistry.js';
import { CellResidency, CELL_PENDING } from '../src/editor/stylized/lod/CellResidency.js';
import { TownStreamer } from '../src/editor/towns/TownStreamer.js';

test('blocked cells cannot starve ready cells', () => {
  const residency = new CellResidency({ cellMeters: 1, reachCells: 1, cellsPerFrame: 1 });
  residency.refocus(0, 0);
  const visited = new Set();
  const resolve = (x, z) => {
    visited.add(`${x}:${z}`);
    return x === 0 && z === 0 ? CELL_PENDING : { x, z };
  };
  for (let i = 0; i < 9; i++) residency.step(resolve);
  assert.equal(visited.size, 9);
  assert.equal(residency.pending.length, 1);
  assert.equal(residency.step(() => ({ x: 0, z: 0 })), true);
  assert.equal(residency.values().length, 9);
});

test('reflection and draw preparation can share a registry without premature disposal', () => {
  const scene = new Scene(), first = acquireReflectionShadowRegistry(scene);
  const second = acquireReflectionShadowRegistry(scene);
  assert.equal(first.registry, second.registry);
  first.release(); first.release();
  const child = new Group(); scene.add(child);
  assert.ok(second.registry.objects.has(child));
  second.release();
  assert.equal(second.registry.objects.size, 0);
  const third = acquireReflectionShadowRegistry(scene);
  assert.notEqual(third.registry, first.registry);
  assert.ok(third.registry.objects.has(child));
  third.release();
});

test('town LOD scheduling resumes at the next town after budget exhaustion', () => {
  const streamer = Object.create(TownStreamer.prototype);
  streamer.towns = new Map([1, 2, 3].map(id => [id, { id }]));
  streamer.lodCursor = null;
  const visited = [];
  let remaining;
  streamer.selection = function* (town) {
    for (;;) { visited.push(town.id); remaining--; yield; }
  };
  for (let frame = 0; frame < 6; frame++) {
    remaining = 1;
    streamer.updateLods({ x: 0, z: 0 }, () => remaining <= 0);
  }
  assert.deepEqual(visited, [1, 2, 3, 1, 2, 3]);
});
