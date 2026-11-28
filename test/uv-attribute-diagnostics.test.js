import assert from 'node:assert/strict';
import test from 'node:test';
import { installUvAttributeDiagnostics } from '../src/render/UvAttributeDiagnostics.js';

test('missing UV query records geometry and restores chained hook without changing its result', () => {
  let chained = 0;
  const prior = () => { chained++; };
  const renderer = { debug: { onNodeBuilderCreated: prior } };
  const probe = installUvAttributeDiagnostics(renderer);
  const builder = { object: { name: 'tree' }, geometry: { uuid: 'g', attributes: { position: {} } },
    material: { name: 'leaf', uuid: 'm' }, hasGeometryAttribute: name => name === 'position' };
  renderer.debug.onNodeBuilderCreated(builder, null);
  assert.equal(builder.hasGeometryAttribute('position'), true);
  assert.equal(builder.hasGeometryAttribute('uv'), false);
  assert.equal(builder.hasGeometryAttribute('uv'), false);
  assert.equal(probe.snapshot().candidates[0].count, 2);
  assert.equal(probe.snapshot().candidates[0].object, 'tree');
  assert.equal(chained, 1);
  probe.dispose();
  assert.equal(renderer.debug.onNodeBuilderCreated, prior);
});
