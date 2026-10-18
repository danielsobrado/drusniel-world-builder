import assert from 'node:assert/strict';
import test from 'node:test';
import { PersistentMap } from '../src/editor/workshop/kernel/PersistentMap.js';
import { WorkshopDocument } from '../src/editor/workshop/kernel/WorkshopDocument.js';
import { WorkshopCommandBus } from '../src/editor/workshop/kernel/WorkshopCommandBus.js';

test('persistent tree survives randomized insertion/deletion with immutable prior versions', () => {
  let tree = new PersistentMap(), seed = 19;
  const oracle = new Map();
  for (let i = 0; i < 3000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const key = String(seed % 200);
    const before = tree, previous = [...tree];
    if (seed & 256) { tree = tree.set(key, i); oracle.set(key, i); }
    else { tree = tree.delete(key); oracle.delete(key); }
    assert.deepEqual([...before], previous);
    assert.deepEqual([...tree], [...oracle].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    assert.equal(tree.size, oracle.size);
  }
});

test('local properties retain topology and never enumerate unrelated document entities', () => {
  const document = new WorkshopDocument({ entities: Array.from({ length: 10000 }, (_, i) => ({
    id: `entity:${i}`, type: 'wall', properties: { height: 3 },
  })) });
  const bus = new WorkshopCommandBus(document);
  bus.dispatch({ type: 'entity.set-properties', id: 'entity:0', properties: { height: 4 } });
  const original = WorkshopDocument.prototype.listEntities;
  WorkshopDocument.prototype.listEntities = () => { throw new Error('global enumeration'); };
  try {
    const result = bus.dispatch({ type: 'entity.set-properties', id: 'entity:0', properties: { height: 5 } });
    assert.equal(result.document.topology, document.topology);
    assert.deepEqual(result.impactedIds, ['entity:0']);
    assert.equal(result.document.getEntity('entity:9999'), document.getEntity('entity:9999'));
    assert.equal(document.getEntity('entity:0').properties.height, 3);
    bus.dispatch({ type: 'entity.set-dependencies', id: 'entity:1', dependsOn: ['entity:0'] });
    assert.deepEqual(bus.dispatch({ type: 'entity.set-properties', id: 'entity:0', properties: { height: 6 } }).impactedIds,
      ['entity:0', 'entity:1']);
    assert.throws(() => bus.dispatch({ type: 'entity.set-dependencies', id: 'entity:0', dependsOn: ['entity:1'] }), /cycle/);
    assert.throws(() => bus.dispatch({ type: 'entity.remove', id: 'entity:0' }), /missing dependency/);
  } finally { WorkshopDocument.prototype.listEntities = original; }
});
