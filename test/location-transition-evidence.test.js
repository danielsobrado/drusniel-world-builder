import test from 'node:test';
import assert from 'node:assert/strict';
import { locationTransitionVerdict } from '../scripts/lib/location-transition-evidence.mjs';

const fixture = () => ({
  adapter: { webgpu: true, vendor: 'nvidia', isFallbackAdapter: false },
  surfaceReady: true, focus: { passed: true }, errors: { count: 0 }, cycles: 1,
  cycleResults: [{ cycle: 0, entered: true, exited: true, surfaceSettled: true,
    firstReturnFrames: 120, peakAccountedBytes: 1024, inside: { state: 'inside' }, after: { state: 'idle' } }],
});

test('valid complete capture is eligible for manual acceptance review', () => {
  assert.deepEqual(locationTransitionVerdict(fixture()), { passed: true, failures: [] });
});

test('reject incomplete captures, unverified adapters, focus loss and browser errors', () => {
  for (const patch of [{ adapter: null }, { adapter: { webgpu: false, vendor: 'nvidia' } },
    { focus: null }, { surfaceReady: false }, { errors: { count: 1 } }, { cycleResults: [] }, { failure: 'exception' }]) {
    assert.equal(locationTransitionVerdict({ ...fixture(), ...patch }).passed, false);
  }
});

test('reject unsuccessful transitions, missing memory samples and insufficient return frames', () => {
  for (const patch of [{ entered: false }, { exited: false }, { surfaceSettled: false },
    { peakAccountedBytes: 0 }, { firstReturnFrames: 119 }, { after: { state: 'inside' } }]) {
    const report = fixture();
    Object.assign(report.cycleResults[0], patch);
    assert.equal(locationTransitionVerdict(report).passed, false);
  }
});
