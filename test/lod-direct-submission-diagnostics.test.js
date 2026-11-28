import assert from 'node:assert/strict';
import test from 'node:test';
import { LodDirectSubmissionDiagnostics } from '../src/render/LodDirectSubmissionDiagnostics.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';

test('direct fade accounting honors signed fade, draw groups, sliced row changes and indirect exclusion', () => {
  PerfCounters.reset();
  const attr = { array: new Float32Array([-1, 0, 0, -.5, 0, 0, .4, 0, 0, 0, 0, 0]), itemSize: 3, count: 4, version: 0 };
  const geometry = { index: { count: 60 }, drawRange: { start: 3, count: 30 },
    getAttribute: key => key === 'instanceDither' ? attr : null };
  const draw = { geometry, object: { isInstancedMesh: true, count: 4 }, group: { start: 6, count: 12 } };
  const diagnostics = new LodDirectSubmissionDiagnostics();
  diagnostics.observe(draw);
  assert.equal(PerfCounters.get('lodDirectTriangles'), 16);
  assert.equal(PerfCounters.get('lodDirectFadingTriangles'), 8);
  assert.equal(PerfCounters.get('lodDirectZeroFadeInstances'), 1);
  attr.array[3] = -1; // Sliced copies can preserve the attribute version.
  diagnostics.observe(draw);
  assert.equal(PerfCounters.get('lodDirectFadingTriangles'), 12);
  geometry.indirect = {};
  diagnostics.observe(draw);
  assert.equal(PerfCounters.get('lodIndirectDrawsUnmeasured'), 1);
  assert.equal(PerfCounters.get('lodDirectDraws'), 2);
  PerfCounters.reset();
});
