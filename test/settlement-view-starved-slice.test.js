import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { settlementSiteDrawn } from '../src/editor/world/settlements/view/SettlementSelection.js';
import { SettlementView } from '../src/editor/world/settlements/view/SettlementView.js';

// A city's site used to stall forever while terrain streaming spent the whole
// deferred budget: the starved slice's one permitted unit went to the checks
// between stages, so the site and the mesh pool never ran.
test('a starved slice still advances a preparing site and dispatches variants', () => {
  let siteUnits = 0;
  let dispatched = 0;
  const view = {
    starved: 0,
    dirty: false,
    plans: { advance() {} },
    skyline: { advance() {} },
    sites: new Map([[1, { job: {}, advance(gate) { while (!gate()) siteUnits += 1; return false; } }]]),
    pool: { dispatch() { dispatched += 1; }, advance() { return false; } },
  };
  const starving = () => true;
  SettlementView.prototype.advanceWork.call(view, starving);
  assert.equal(siteUnits, 0, 'the first starved frame waits');
  SettlementView.prototype.advanceWork.call(view, starving);
  assert.ok(siteUnits >= 1, 'the second starved frame does site work');
  assert.equal(dispatched, 1);
});

// A city's selection pass spans hundreds of frames; the camera moves during it.
// When any motion voided the pass, a walk never handed the massing over to the houses.
test('a walk keeps a finished pass valid; a real turn voids it', () => {
  const camera = (x, yaw) => new Matrix4().compose(new Vector3(x, 1.7, 0),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1));
  const site = { surfaces: {}, job: null, pavingReady: true,
    buildingCoverage: { complete: true, camera: camera(0, 0), required: new Map() } };
  const view = { cameraMatrix: camera(12, 0.05), pool: { get: () => null } };
  assert.equal(settlementSiteDrawn(view, site), true, 'twelve metres of walking with head sway keep the pass');
  view.cameraMatrix = camera(12, Math.PI / 2);
  assert.equal(settlementSiteDrawn(view, site), false, 'turning to a new street voids it');
  view.cameraMatrix = camera(120, 0);
  assert.equal(settlementSiteDrawn(view, site), false, 'walking on through the town voids it');
});
