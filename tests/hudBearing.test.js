import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPASS_POINTS, relativeBearing } from '../src/editor/player/hud/hudBearing.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('bearing is measured from the camera forward, positive to the right', () => {
  // Yaw 0 looks down -Z, so +X is on the right.
  near(relativeBearing(0, -1, 0), 0);
  near(relativeBearing(1, 0, 0), 90);
  near(relativeBearing(-1, 0, 0), -90);
  near(Math.abs(relativeBearing(0, 1, 0)), 180);
});

test('turning left by a quarter puts what was on the left dead ahead', () => {
  near(relativeBearing(-1, 0, Math.PI / 2), 0);
  near(relativeBearing(0, -1, Math.PI / 2), 90);
});

test('compass points follow the Azgaar axes: north -Z, east +X', () => {
  assert.equal(COMPASS_POINTS.length, 16);
  const point = (label) => COMPASS_POINTS.find((entry) => entry.label === label);
  near(point('N').worldDz, -1);
  near(point('E').worldDx, 1);
  near(point('S').worldDz, 1);
  near(point('W').worldDx, -1);
  assert.equal(COMPASS_POINTS.filter(({ label }) => label).length, 8);
});
