import assert from 'node:assert/strict';
import test from 'node:test';

import { approachTownEdgeForward } from '../src/editor/performance/qa/SettlementApproachFixture.js';
import { stillmeadowPose } from '../scripts/lib/stillmeadow-pose.mjs';

test('the town edge is the first building beside the approach, not the street end', () => {
  // Street runs 200 m out along +z; the spawn stands 90 m past it.
  const buildings = [
    { x: 4, z: 100 }, // beside the approach, 100 m out: the edge
    { x: 60, z: 150 }, // farther out but 60 m off the line
    { x: -3, z: 20 },
  ];
  assert.equal(approachTownEdgeForward(buildings, [0, 200]), 190);
  assert.equal(approachTownEdgeForward([{ x: 60, z: 150 }], [0, 200]), 140, 'nothing beside: the outermost');
  assert.equal(approachTownEdgeForward([], [0, 200]), null);
});

test('a camera with offsetFromTownEdge stands that far before the edge; others keep offsetForward', () => {
  const approach = { yawDegrees: 90, settlementFixture: { canonicalX: 0, canonicalZ: 0, townEdgeForward: 190 } };
  const spec = { offsetForward: 88, offsetFromTownEdge: 12, pitch: -0.1, mode: 'player' };
  const pose = stillmeadowPose(approach, spec);
  assert.ok(Math.abs(pose.x + 178) < 1e-9 && Math.abs(pose.z) < 1e-9, `${pose.x}, ${pose.z}`);
  const legacy = stillmeadowPose(approach, { offsetForward: 88 });
  assert.ok(Math.abs(legacy.x + 88) < 1e-9);
  const noEdge = stillmeadowPose({ ...approach, settlementFixture: { ...approach.settlementFixture, townEdgeForward: null } }, spec);
  assert.ok(Math.abs(noEdge.x + 88) < 1e-9, 'falls back to offsetForward');
});
