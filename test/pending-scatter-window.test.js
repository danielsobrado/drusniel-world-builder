import assert from 'node:assert/strict';
import test from 'node:test';
import { retainPendingScatterWindow } from '../src/editor/stylized/PendingScatterWindow.js';

test('unfinished scatter builds survive within the new window but remote work is released', () => {
  const pending = new Map(['-3:0', '0:0', '2:-2', '3:0'].map(key => [key, {}]));
  retainPendingScatterWindow(pending, { chunkX: 0, chunkZ: 0 }, 2);
  assert.deepEqual([...pending.keys()], ['0:0', '2:-2']);
  retainPendingScatterWindow(pending, { chunkX: 20, chunkZ: -20 }, 2);
  assert.equal(pending.size, 0);
});
