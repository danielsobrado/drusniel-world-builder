/**
 * Pure offline image color analysis utilities for WSC PR 0.
 *
 * Implements:
 * - Exact sRGB <-> Linear RGB <-> CIE XYZ (D65) <-> CIELAB conversion
 * - Exact CIEDE2000 (Delta E 2000) perceptual color difference
 * - Region-of-interest & D24 material-family masked statistics (mean/median RGB,
 *   linear luminance mean & p10/p50/p90, HSV hue/saturation, contrast, coverage)
 * - PR 0 investigation threshold tagging
 */

const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i += 1) {
  const v = i / 255;
  SRGB_TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function srgbChannelToLinear(byteValue) {
  const idx = Math.max(0, Math.min(255, Math.round(byteValue)));
  return SRGB_TO_LINEAR[idx];
}

export function linearToSrgbChannel(linear) {
  const c = Math.max(0, Math.min(1, linear));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
}

export function srgbToLinearLuminance(r, g, b) {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

/** Converts sRGB bytes [0..255] to CIELAB (D65, 2-degree observer). */
export function srgbToLab(r, g, b) {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);
  // sRGB D65 matrix
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) / 1.0;
  const z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) / 1.08883;
  const f = (t) => (t > 0.008856451679 ? Math.cbrt(t) : 7.787037037 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** Exact CIEDE2000 perceptual color difference (Sharma, Wu, Dalal 2005). */
export function ciede2000(lab1, lab2) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const avgL = (L1 + L2) * 0.5;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) * 0.5;
  const avgC7 = avgC ** 7;
  const G = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + 25 ** 7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) * 0.5;
  const radToDeg = 180 / Math.PI;
  const degToRad = Math.PI / 180;
  const hueAngle = (b, ap) => {
    if (Math.abs(b) < 1e-12 && Math.abs(ap) < 1e-12) return 0;
    const h = Math.atan2(b, ap) * radToDeg;
    return h >= 0 ? h : h + 360;
  };
  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p > 1e-12) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * 0.5) * degToRad);
  let avgHp = h1p + h2p;
  if (C1p * C2p > 1e-12) {
    if (Math.abs(h1p - h2p) <= 180) avgHp *= 0.5;
    else if (avgHp < 360) avgHp = (avgHp + 360) * 0.5;
    else avgHp = (avgHp - 360) * 0.5;
  }
  const T = 1
    - 0.17 * Math.cos((avgHp - 30) * degToRad)
    + 0.24 * Math.cos((2 * avgHp) * degToRad)
    + 0.32 * Math.cos((3 * avgHp + 6) * degToRad)
    - 0.20 * Math.cos((4 * avgHp - 63) * degToRad);
  const avgLm50Sq = (avgL - 50) ** 2;
  const SL = 1 + (0.015 * avgLm50Sq) / Math.sqrt(20 + avgLm50Sq);
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const dTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const avgCp7 = avgCp ** 7;
  const RC = 2 * Math.sqrt(avgCp7 / (avgCp7 + 25 ** 7));
  const RT = -RC * Math.sin(2 * dTheta * degToRad);
  const termL = dLp / SL;
  const termC = dCp / SC;
  const termH = dHp / SH;
  return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH);
}

export function srgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const maxV = Math.max(rn, gn, bn);
  const minV = Math.min(rn, gn, bn);
  const delta = maxV - minV;
  let h = 0;
  if (delta > 1e-6) {
    if (maxV === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (maxV === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
    if (h < 0) h += 360;
  }
  const s = maxV > 1e-6 ? delta / maxV : 0;
  return { h, s, v: maxV };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Computes color, luminance, hue/saturation, and CIELAB statistics over pixels
 * selected by an optional boolean mask and rectangular ROI (`{ x0, y0, x1, y1 }` in 0..1).
 */
export function analyzeRegion({ data, width, height, channels = 3, roi = null, mask = null }) {
  const x0 = roi ? Math.max(0, Math.floor(roi.x0 * width)) : 0;
  const y0 = roi ? Math.max(0, Math.floor(roi.y0 * height)) : 0;
  const x1 = roi ? Math.min(width, Math.ceil(roi.x1 * width)) : width;
  const y1 = roi ? Math.min(height, Math.ceil(roi.y1 * height)) : height;
  const rs = [];
  const gs = [];
  const bs = [];
  const lumas = [];
  const sats = [];
  let hueSin = 0;
  let hueCos = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;
  let sumSat = 0;
  let totalRoiPixels = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      totalRoiPixels += 1;
      const pIdx = y * width + x;
      if (mask && !mask[pIdx]) continue;
      const offset = pIdx * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      rs.push(r);
      gs.push(g);
      bs.push(b);
      sumR += r;
      sumG += g;
      sumB += b;
      const luma = srgbToLinearLuminance(r, g, b);
      lumas.push(luma);
      sumLuma += luma;
      const { h, s } = srgbToHsv(r, g, b);
      sats.push(s);
      sumSat += s;
      const rad = (h * Math.PI) / 180;
      hueSin += Math.sin(rad) * s;
      hueCos += Math.cos(rad) * s;
    }
  }

  const count = rs.length;
  if (count === 0) {
    return {
      count: 0,
      coverage: 0,
      meanRgb: [0, 0, 0],
      medianRgb: [0, 0, 0],
      meanLinearLuminance: 0,
      luminancePercentiles: { p10: 0, p50: 0, p90: 0 },
      meanHueDeg: 0,
      meanSaturation: 0,
      saturationP90: 0,
      lab: { L: 0, a: 0, b: 0 },
    };
  }

  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  lumas.sort((a, b) => a - b);
  sats.sort((a, b) => a - b);
  const meanRgb = [sumR / count, sumG / count, sumB / count];
  const medianRgb = [percentile(rs, 0.5), percentile(gs, 0.5), percentile(bs, 0.5)];
  let meanHueDeg = (Math.atan2(hueSin, hueCos) * 180) / Math.PI;
  if (meanHueDeg < 0) meanHueDeg += 360;

  return {
    count,
    coverage: totalRoiPixels > 0 ? count / totalRoiPixels : 0,
    meanRgb: meanRgb.map((v) => Number(v.toFixed(2))),
    medianRgb: medianRgb.map((v) => Number(v.toFixed(2))),
    meanLinearLuminance: Number((sumLuma / count).toFixed(5)),
    luminancePercentiles: {
      p10: Number(percentile(lumas, 0.1).toFixed(5)),
      p50: Number(percentile(lumas, 0.5).toFixed(5)),
      p90: Number(percentile(lumas, 0.9).toFixed(5)),
    },
    meanHueDeg: Number(meanHueDeg.toFixed(1)),
    meanSaturation: Number((sumSat / count).toFixed(4)),
    saturationP90: Number(percentile(sats, 0.9).toFixed(4)),
    lab: srgbToLab(meanRgb[0], meanRgb[1], meanRgb[2]),
  };
}

/**
 * Multi-path D24 RGB prototypes covering raw un-tonemapped output, fly-mode
 * direct WebGPU output, and player-mode cinematicFinish + ACESFilmic output.
 */
export const WSC_D24_FAMILY_PROTOTYPES = Object.freeze({
  terrain: [[46, 125, 50], [68, 128, 61], [15, 56, 12]],
  nearGrass: [[118, 255, 3], [153, 198, 103], [82, 145, 35]],
  farGrassCards: [[238, 255, 65], [197, 197, 127], [142, 143, 54]],
  treeFoliage: [[0, 176, 255], [101, 173, 207], [33, 106, 158]],
  treeBark: [[141, 110, 99], [144, 112, 104], [71, 47, 40]],
  treeImpostor: [[0, 229, 255], [120, 190, 210], [60, 145, 165]],
  shrub: [[255, 196, 0], [204, 175, 102], [152, 119, 52]],
  shrubProxy: [[255, 145, 0], [206, 149, 88], [155, 109, 34]],
  understory: [[174, 234, 0], [170, 192, 100], [110, 136, 36]],
  flowers: [[255, 64, 129], [210, 115, 145], [158, 32, 68]],
  rock: [[124, 77, 255], [133, 124, 211], [72, 42, 162]],
  debris: [[216, 67, 21], [185, 105, 82], [130, 30, 15]],
  cliff: [[63, 81, 181], [85, 104, 168], [14, 31, 100]],
  building: [[244, 67, 54], [200, 108, 100], [144, 30, 13]],
  paving: [[255, 213, 79], [205, 184, 116], [156, 130, 58]],
  water: [[21, 101, 192], [66, 112, 175], [8, 40, 118]],
  other: [[158, 158, 158], [156, 156, 156], [84, 84, 84]],
});

/**
 * Builds a pixel mask from a D24 material-family ID image.
 * Supports either an explicit `targetRgb` or a named `family` matched against
 * `WSC_D24_FAMILY_PROTOTYPES` via nearest-prototype classification.
 */
export function buildFamilyMask({
  data,
  width,
  height,
  channels = 3,
  targetRgb = null,
  family = null,
  tolerance = 24,
}) {
  const mask = new Uint8Array(width * height);
  const tolSq = tolerance * tolerance;
  if (family && WSC_D24_FAMILY_PROTOTYPES[family]) {
    const allEntries = Object.entries(WSC_D24_FAMILY_PROTOTYPES);
    for (let i = 0; i < width * height; i += 1) {
      const o = i * channels;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      let bestFamily = null;
      let bestDistSq = tolSq + 1;
      for (let f = 0; f < allEntries.length; f += 1) {
        const [famId, protos] = allEntries[f];
        for (let p = 0; p < protos.length; p += 1) {
          const pr = protos[p];
          const dr = r - pr[0];
          const dg = g - pr[1];
          const db = b - pr[2];
          const dSq = dr * dr + dg * dg + db * db;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestFamily = famId;
          }
        }
      }
      if (bestFamily === family && bestDistSq <= tolSq) mask[i] = 1;
    }
    return mask;
  }
  const [tr, tg, tb] = targetRgb;
  for (let i = 0; i < width * height; i += 1) {
    const o = i * channels;
    const dr = data[o] - tr;
    const dg = data[o + 1] - tg;
    const db = data[o + 2] - tb;
    if (dr * dr + dg * dg + db * db <= tolSq) mask[i] = 1;
  }
  return mask;
}

/** Compares two analyzed regions and tags PR 0 investigation thresholds. */
export function compareRegions(regionA, regionB, { kind = 'contact' } = {}) {
  const deltaE00 = Number(ciede2000(regionA.lab, regionB.lab).toFixed(3));
  const lumaA = regionA.meanLinearLuminance;
  const lumaB = regionB.meanLinearLuminance;
  const lumaDiffPct = lumaB > 1e-6 ? Number((((lumaA - lumaB) / lumaB) * 100).toFixed(2)) : 0;
  const contrastRatio = Number(((Math.max(lumaA, lumaB) + 0.05) / (Math.min(lumaA, lumaB) + 0.05)).toFixed(3));
  let flag = 'ok';
  if (kind === 'contact') {
    if (deltaE00 > 10) flag = 'major-mismatch-candidate';
    else if (deltaE00 > 5) flag = 'investigate';
  } else if (kind === 'lod') {
    if (Math.abs(lumaDiffPct) > 10) flag = 'investigate';
  } else if (kind === 'chunk-boundary') {
    if (Math.abs(lumaDiffPct) > 5) flag = 'investigate';
  } else if (kind === 'floating-origin') {
    if (deltaE00 > 1.0) flag = 'investigate';
  }
  return { deltaE00, lumaDiffPct, contrastRatio, flag };
}
