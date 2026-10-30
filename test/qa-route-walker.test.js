import assert from 'node:assert/strict';
import test from 'node:test';
import { QaRouteWalker, streetRoute } from '../src/editor/performance/qa/QaRouteWalker.js';

const line = [{ x: 0, z: 0 }, { x: 0, z: -20 }, { x: 0, z: -40 }];

test('streets join nearest end first', () => {
  const route = streetRoute([{ points: [[0, 10], [0, 20]] }, { points: [[0, 40], [0, 30]] }], { x: 0, z: 0 },
    ([x, z]) => ({ x, z }));
  assert.deepEqual(route.map(p => p.z), [0, 10, 20, 30, 40]);
});

test('the walker faces the next waypoint and turns round at the end', () => {
  const walker = new QaRouteWalker(line);
  assert.ok(Math.abs(walker.update(0, 0, 0, 0).yaw) < 1e-9, 'yaw 0 looks along -z');
  walker.update(0, -18, 0, 1);
  walker.update(0, -39, 0, 2);
  assert.equal(walker.direction, -1);
  assert.equal(walker.index, 1);
});

test('a blocked walker hops on instead of idling', () => {
  const walker = new QaRouteWalker(line);
  walker.update(0, 0, 0, 0);
  assert.equal(walker.update(0.1, 0, 0, 1).hop, null);
  assert.deepEqual(walker.update(0.1, 0, 0, 2).hop, line[1]);
  assert.equal(walker.hops, 1);
});
