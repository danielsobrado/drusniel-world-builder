import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeRegion,
  buildD15ValidInteriorMask,
  buildFamilyMask,
  ciede2000,
  comparePairedPixels,
  compareRegions,
  intersectMasks,
  linearToSrgbChannel,
  srgbChannelToLinear,
  srgbToLab,
  srgbToLinearLuminance,
} from '../scripts/lib/wsc-color-metrics.mjs';

test('sRGB <-> linear conversion round-trips accurately across the full byte range', () => {
  for (const byteVal of [0, 1, 10, 42, 128, 200, 255]) {
    const lin = srgbChannelToLinear(byteVal);
    const back = Math.round(linearToSrgbChannel(lin) * 255);
    assert.equal(back, byteVal);
  }
  assert.ok(Math.abs(srgbToLinearLuminance(255, 255, 255) - 1) < 1e-6);
  assert.equal(srgbToLinearLuminance(0, 0, 0), 0);
});

test('CIEDE2000 matches Sharma-Wu-Dalal (2005) reference test pairs', () => {
  // Exact published reference pair #1: (50, 2.6772, -79.7751) vs (50, 0, -82.7485) -> 2.0425
  const d1 = ciede2000({ L: 50.0, a: 2.6772, b: -79.7751 }, { L: 50.0, a: 0.0, b: -82.7485 });
  assert.ok(Math.abs(d1 - 2.0425) < 0.001, `expected ~2.0425, got ${d1}`);
  // Identical colors must yield 0.
  const lab = srgbToLab(64, 128, 52);
  assert.equal(ciede2000(lab, lab), 0);
});

test('analyzeRegion and buildFamilyMask isolate ROI colors and flag PR 0 thresholds accurately', () => {
  const width = 4;
  const height = 4;
  const colorData = new Uint8Array(width * height * 3);
  const familyData = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 3;
      if (x < 2) {
        // Bright neon green terrain
        colorData[o] = 35; colorData[o + 1] = 160; colorData[o + 2] = 45;
        familyData[o] = 46; familyData[o + 1] = 125; familyData[o + 2] = 50;
      } else {
        // Dark grass blades
        colorData[o] = 28; colorData[o + 1] = 52; colorData[o + 2] = 24;
        familyData[o] = 118; familyData[o + 1] = 255; familyData[o + 2] = 3;
      }
    }
  }
  const terrainMask = buildFamilyMask({ data: familyData, width, height, targetRgb: [46, 125, 50] });
  const grassMask = buildFamilyMask({ data: familyData, width, height, targetRgb: [118, 255, 3] });
  const regTerrain = analyzeRegion({ data: colorData, width, height, mask: terrainMask });
  const regGrass = analyzeRegion({ data: colorData, width, height, mask: grassMask });
  assert.equal(regTerrain.count, 8);
  assert.equal(regGrass.count, 8);
  assert.equal(regGrass.coverage, 0.5);
  const diff = compareRegions(regGrass, regTerrain, { kind: 'contact' });
  assert.ok(diff.deltaE00 > 10, `expected major mismatch >10, got ${diff.deltaE00}`);
  assert.equal(diff.flag, 'major-mismatch-candidate');
});

test('comparePairedPixels catches opposing local errors that cancel in aggregate mean RGB', () => {
  const width = 4;
  const height = 4;
  const dataA = new Uint8Array(width * height * 3);
  const dataB = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 3;
      // Base neutral grey-green in B; left half of A is +32 brighter, right half is -32 darker.
      dataB[o] = 100; dataB[o + 1] = 120; dataB[o + 2] = 90;
      const shift = x < 2 ? 32 : -32;
      dataA[o] = 100 + shift; dataA[o + 1] = 120 + shift; dataA[o + 2] = 90 + shift;
    }
  }
  const res = comparePairedPixels(
    { data: dataA, width, height, channels: 3 },
    { data: dataB, width, height, channels: 3 },
    { kind: 'contact' },
  );
  assert.equal(res.count, 16);
  // Aggregate mean cancels completely (~0), while paired per-pixel ΔE00 exposes the local error!
  assert.ok(res.meanColorDeltaE00 < 0.01, `expected aggregate mean ΔE00 ~ 0, got ${res.meanColorDeltaE00}`);
  assert.ok(res.pairedDeltaE00.median > 8, `expected high paired median ΔE00, got ${res.pairedDeltaE00.median}`);
  assert.ok(res.pairedDeltaE00.p95 > 8, `expected high paired p95 ΔE00, got ${res.pairedDeltaE00.p95}`);
  assert.equal(res.pctAbove5, 100);
  assert.notEqual(res.flag, 'ok');
});

test('buildD15ValidInteriorMask and intersectMasks exclude outside-window, border-fade, and missing-slot pixels', () => {
  // 4x1 image: [green valid interior, red outside window, yellow border fade, magenta missing slot]
  const d15 = new Uint8Array([
    98, 234, 134,
    225, 42, 42,
    235, 220, 48,
    230, 42, 228,
  ]);
  const validMask = buildD15ValidInteriorMask({ data: d15, width: 4, height: 1, channels: 3 });
  assert.deepEqual(Array.from(validMask), [1, 0, 0, 0]);

  const terrainMask = new Uint8Array([1, 1, 0, 1]);
  const combined = intersectMasks(validMask, terrainMask);
  assert.deepEqual(Array.from(combined), [1, 0, 0, 0]);
});
