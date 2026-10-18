import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyWorldState, upsertEntity } from '../src/sim/model/worldState.js';
import { shortestPath } from '../src/sim/geography/geographicGraph.js';
import { matchTradeOffers } from '../src/sim/logistics/shipments.js';
import { TownDoorController } from '../src/editor/towns/TownDoors.js';
import { TownMesh } from '../src/editor/towns/TownMesh.js';
import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three/webgpu';

test('path adjacency retains unrelated rows and updates moved, disabled and removed edges', () => {
  const state = createEmptyWorldState();
  const edge = (id, from, to, extra = {}) => ({ id, kind: 'graphEdge', status: 'active',
    data: { fromNodeId: from, toNodeId: to, baseTravelHours: 1, ...extra } });
  let unrelatedReads = 0;
  const remote = edge('remote', 'x', 'y');
  Object.defineProperty(remote.data, 'fromNodeId', { get: () => { unrelatedReads++; return 'x'; } });
  state.graphEdges.set('remote', remote);
  upsertEntity(state, edge('ab', 'a', 'b'));
  assert.equal(shortestPath(state, 'a', 'b').ok, true);
  unrelatedReads = 0;
  for (let i = 0; i < 10; i++) assert.equal(shortestPath(state, 'a', 'b').cost, 1);
  upsertEntity(state, edge('ab', 'a', 'c'));
  assert.equal(shortestPath(state, 'a', 'b').ok, false);
  assert.equal(shortestPath(state, 'a', 'c').ok, true);
  assert.equal(unrelatedReads, 0);
  upsertEntity(state, edge('ab', 'a', 'c', { enabled: false }));
  assert.equal(shortestPath(state, 'a', 'c').ok, false);
  state.graphEdges.delete('ab');
  assert.equal(shortestPath(state, 'a', 'c').ok, false);
  state.graphEdges.clear();
  assert.equal(shortestPath(state, 'x', 'y').ok, false);
});

test('incompatible commodity work is linear in offer count', () => {
  const state = createEmptyWorldState();
  let reads = 0;
  for (let i = 0; i < 1000; i++) {
    for (const kind of ['buy', 'sell']) state.tradeOffers.set(`${kind}${i}`, {
      id: `${kind}${i}`, status: 'active', data: { kind, limitPrice: 1,
        get commodityId() { reads++; return kind; } },
    });
  }
  assert.deepEqual(matchTradeOffers(state, {}).events, []);
  assert.equal(reads, 2000);
});

test('door focus preserves reach and tie order while only moving doors animate', () => {
  const changed = [], collisions = [];
  const doors = Array.from({ length: 1000 }, (_, i) => ({ centre: [i * 8, 1, 0], openYaw: 1, box: { id: i } }));
  const town = { id: 1, layout: { anchor: { x: 10, z: 20 }, doors }, doorAngles: new Float32Array(1000),
    doorTargets: new Float32Array(1000), mesh: { setDoorAngle: (...args) => changed.push(args) } };
  const streamer = { towns: new Map([[1, town]]), ownerId: () => 'town:1' };
  const controller = new TownDoorController({ streamer, collisionSource: {
    setBoxEnabled: (...args) => collisions.push(args),
  } });
  assert.equal(controller.focus({ x: 10, y: 0, z: 20 }).index, 0);
  controller.toggle(); controller.update(1);
  assert.deepEqual(changed, [[0, 1]]);
  assert.equal(controller.moving.size, 0);
  controller.update(1); assert.equal(changed.length, 1);
  controller.toggle(); controller.update(1);
  assert.equal(collisions.at(-1)[2], true);
  controller.toggle(); streamer.towns.clear(); controller.update(1);
  assert.equal(controller.moving.size, 0);
});

test('door subranges survive culled frames and isolate changed matrices', () => {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const mesh = new InstancedMesh(geometry, material, 1024);
  const fake = { layout: { doors: [{ hinge: [0, 0, 0], yaw: 0 }, { hinge: [4, 0, 0], yaw: 0 }] }, doorMeshes: [mesh] };
  TownMesh.prototype.writeDoor.call(fake, 0, 1);
  TownMesh.prototype.writeDoor.call(fake, 1, 1);
  assert.deepEqual(mesh.instanceMatrix.updateRanges, [{ start: 0, count: 32 }]);
  mesh.dispose(); geometry.dispose(); material.dispose();
});
