import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_WATER_FEATURES, WATER_FEATURES as F, waterFeatureProfile } from '../src/editor/stylized/WaterFeatureProfile.js';

function page(kinds, { wet = true, cold = [], falls = [] } = {}) {
  const waterFieldPixels = new Uint16Array(kinds.length * 4);
  const waterAppearancePixels = new Uint8Array(kinds.length * 4);
  const waterFlowPixels = new Uint8Array(kinds.length * 4);
  for (let i = 0; i < kinds.length; i++) {
    waterFieldPixels[i * 4] = wet && kinds[i] ? 0x3c00 : 0;
    waterAppearancePixels[i * 4] = kinds[i];
    waterAppearancePixels[i * 4 + 2] = cold.includes(i) ? 255 : 0;
    waterFlowPixels[i * 4 + 2] = falls.includes(i) ? 255 : 0;
  }
  return { waterFieldPixels, waterAppearancePixels, waterFlowPixels };
}

test('dry fields omit all water features even with inherited shore identity', () => {
  assert.equal(waterFeatureProfile(page([1, 3], { wet: false })), 0);
});
test('warm ocean, river, and lake omit unrelated feature graphs', () => {
  assert.equal(waterFeatureProfile(page([1, 1])), F.OCEAN);
  assert.equal(waterFeatureProfile(page([3, 3])), F.INLAND);
  assert.equal(waterFeatureProfile(page([2, 2])), F.INLAND);
});
test('mixed and cold edge data retain the union of required features', () => {
  assert.equal(waterFeatureProfile(page([1, 3, 0], { cold: [2], falls: [1] })), ALL_WATER_FEATURES);
  assert.equal(waterFeatureProfile(page([2, 0], { cold: [1] })), F.INLAND | F.ICE);
});
test('unknown wet identity and missing appearance use a conservative graph', () => {
  const unknown = page([0]); unknown.waterFieldPixels[0] = 0x3c00;
  assert.equal(waterFeatureProfile(unknown), ALL_WATER_FEATURES);
  const missing = page([1]); delete missing.waterAppearancePixels;
  assert.equal(waterFeatureProfile(missing), ALL_WATER_FEATURES);
});
