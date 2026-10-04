import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createBrowserErrorMonitor } from '../scripts/lib/perf-browser-errors.mjs';

test('capture errors include caught console failures and uncaught exceptions, with bounded storage', () => {
  const page = new EventEmitter();
  const monitor = createBrowserErrorMonitor(page, 2);
  page.emit('console', { type: () => 'warning', text: () => 'warning' });
  assert.equal(monitor.snapshot().count, 0);
  page.emit('pageerror', new Error('missing builder'));
  page.emit('console', { type: () => 'error', text: () => 'texture decoder failed' });
  page.emit('console', { type: () => 'error', text: () => 'texture decoder failed again' });
  const result = monitor.snapshot();
  assert.equal(result.count, 3);
  assert.equal(result.errors.length, 2);
  assert.equal(result.truncated, true);
  assert.match(result.errors[0].message, /missing builder/);
  assert.equal(result.errors[1].message, 'texture decoder failed');
});
