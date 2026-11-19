import {
  createSurfaceTexturePixels,
  sampleSurface,
  SURFACE_KINDS,
} from '../assets/proceduralTexturePixels.js';

const DEFAULT_SIZE = 256;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const fract = (v) => v - Math.floor(v);
const smoothstep = (e0, e1, v) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const toByte = (v) => Math.round(clamp01(v) * 255);
const wrapIndex = (v, p) => ((v % p) + p) % p;

function hashUnit(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const xb = xf * xf * (3 - 2 * xf), yb = yf * yf * (3 - 2 * yf);
  const x0 = wrapIndex(xi, px), y0 = wrapIndex(yi, py);
  const x1 = wrapIndex(xi + 1, px), y1 = wrapIndex(yi + 1, py);
  const lo = lerp(hashUnit(x0, y0, seed), hashUnit(x1, y0, seed), xb);
  const hi = lerp(hashUnit(x0, y1, seed), hashUnit(x1, y1, seed), xb);
  return lerp(lo, hi, yb);
}

function fbm(u, v, fx, fy, octaves, seed) {
  let amp = 1, total = 0, norm = 0, px = fx, py = fy;
  for (let o = 0; o < octaves; o += 1) {
    total += amp * valueNoise(u * px, v * py, px, py, seed + o * 131);
    norm += amp;
    amp *= 0.5;
    px *= 2;
    py *= 2;
  }
  return total / norm;
}

function rgb(hex) {
  const s = hex.replace('#', '');
  return Object.freeze([
    Number.parseInt(s.slice(0, 2), 16) / 255,
    Number.parseInt(s.slice(2, 4), 16) / 255,
    Number.parseInt(s.slice(4, 6), 16) / 255,
  ]);
}

function mixInto(out, a, b, t) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

const ASHLAR_DARK = rgb('#65645f');
const ASHLAR_LIGHT = rgb('#a49f94');
const ASHLAR_MORTAR = rgb('#3a3936');
const MOSS_DARK = rgb('#3c4a2e');
const MOSS_LIGHT = rgb('#5c6f3e');
const LIME_DARK = rgb('#afa591');
const LIME_LIGHT = rgb('#d7cfb9');
const LIME_MORTAR = rgb('#797265');
const SLATE_DARK = rgb('#3a434c');
const SLATE_LIGHT = rgb('#5d6873');
const SLATE_EDGE = rgb('#242a30');

/** Irregular hand-dressed medieval fortress ashlar with wavy chiseled joints and weathering. */
function generateWeatheredAshlar(u, v, seed, out) {
  const courses = 6;
  const blocks = 3;
  // Domain warp makes every bed and head joint subtly organic rather than ruler-straight.
  const warpV = (fbm(u, v, 6, 6, 3, seed + 5) - 0.5) * 0.14;
  const warpU = (fbm(u, v, 8, 8, 3, seed + 11) - 0.5) * 0.11;
  const course = v * courses + warpV;
  const row = wrapIndex(Math.floor(course), courses);
  const cf = fract(course);
  const stagger = hashUnit(row, 17, seed) * 0.85;
  const block = u * blocks + stagger + warpU;
  const col = wrapIndex(Math.floor(block), blocks);
  const bf = fract(block);

  const jointX = smoothstep(0.01, 0.075, bf) * smoothstep(0.99, 0.925, bf);
  const jointY = smoothstep(0.015, 0.09, cf) * smoothstep(0.985, 0.91, cf);
  const face = jointX * jointY;
  const chip = fbm(u, v, 24, 24, 3, seed + 29);
  const grain = fbm(u, v, 56, 56, 3, seed + 41);
  const streak = fbm(u, v, 8, 2, 3, seed + 53);
  const blockTone = hashUnit(col, row, seed + 3);
  const dome = Math.sin(Math.PI * bf) * Math.sin(Math.PI * cf);

  mixInto(out, ASHLAR_DARK, ASHLAR_LIGHT, clamp01(blockTone * 0.62 + chip * 0.25 + streak * 0.13));
  mixInto(out, ASHLAR_MORTAR, out, face);
  const shade = 0.78 + dome * 0.16 + grain * 0.16 - (1 - streak) * 0.12;
  out[0] *= shade;
  out[1] *= shade;
  out[2] *= shade;
  out[3] = clamp01(face * (0.58 + dome * 0.26 + chip * 0.14) + grain * 0.08);
  out[4] = lerp(0.97, 0.82 + grain * 0.14, face);
}

/** Damp medieval castle masonry with lichen/moss creeping out of deep irregular mortar joints. */
function generateMossyFortress(u, v, seed, out) {
  generateWeatheredAshlar(u, v, seed + 7, out);
  const mossPatch = fbm(u, v, 5, 5, 4, seed + 71);
  const mossDetail = fbm(u, v, 32, 32, 3, seed + 83);
  const inJoint = 1 - smoothstep(0.28, 0.65, out[3]);
  const mossMask = clamp01(smoothstep(0.46, 0.72, mossPatch + inJoint * 0.32 + mossDetail * 0.14));
  const mossColor = [
    lerp(MOSS_DARK[0], MOSS_LIGHT[0], mossDetail),
    lerp(MOSS_DARK[1], MOSS_LIGHT[1], mossDetail),
    lerp(MOSS_DARK[2], MOSS_LIGHT[2], mossDetail),
  ];
  mixInto(out, out, mossColor, mossMask * 0.82);
  out[3] = clamp01(out[3] + mossMask * 0.06 * mossDetail);
  out[4] = lerp(out[4], 0.94 + mossDetail * 0.05, mossMask);
}

/** Warm dressed limestone with hand-chiseled horizontal tooling marks and subtle fossil pitting. */
function generateChiseledLimestone(u, v, seed, out) {
  const courses = 5;
  const blocks = 3;
  const warpV = (fbm(u, v, 4, 4, 2, seed + 3) - 0.5) * 0.06;
  const course = v * courses + warpV;
  const row = wrapIndex(Math.floor(course), courses);
  const cf = fract(course);
  const stagger = (row % 2) * 0.48 + (hashUnit(row, 9, seed) - 0.5) * 0.12;
  const block = u * blocks + stagger;
  const col = wrapIndex(Math.floor(block), blocks);
  const bf = fract(block);

  const jointX = smoothstep(0, 0.04, bf) * smoothstep(1, 0.96, bf);
  const jointY = smoothstep(0, 0.055, cf) * smoothstep(1, 0.945, cf);
  const face = jointX * jointY;
  const chisel = fbm(u, v, 10, 64, 2, seed + 19);
  const pores = fbm(u, v, 40, 40, 3, seed + 31);
  const tint = hashUnit(col, row, seed + 61);

  mixInto(out, LIME_DARK, LIME_LIGHT, clamp01(tint * 0.55 + pores * 0.45));
  mixInto(out, LIME_MORTAR, out, face);
  const shade = 0.86 + chisel * 0.12 + pores * 0.08;
  out[0] *= shade;
  out[1] *= shade;
  out[2] *= shade;
  out[3] = clamp01(face * (0.68 + chisel * 0.2) + pores * 0.1);
  out[4] = lerp(0.95, 0.78 + pores * 0.14, face);
}

/** Overlapping scalloped medieval fortress slate roof shingles. */
function generateSlateShingle(u, v, seed, out) {
  const rows = 8;
  const cols = 6;
  const rowF = v * rows;
  const row = wrapIndex(Math.floor(rowF), rows);
  const rf = fract(rowF);
  const colF = u * cols + (row % 2) * 0.5;
  const col = wrapIndex(Math.floor(colF), cols);
  const cf = fract(colF);

  const arch = Math.sqrt(Math.max(0, 1 - (cf * 2 - 1) ** 2)) * 0.18;
  const lip = smoothstep(0.02, 0.14, rf + arch * 0.5) * smoothstep(0.02, 0.07, cf) * smoothstep(0.98, 0.93, cf);
  const grain = fbm(u, v, 24, 48, 3, seed + 13);
  const tint = hashUnit(col, row, seed + 29);

  mixInto(out, SLATE_DARK, SLATE_LIGHT, clamp01(tint * 0.65 + grain * 0.35));
  mixInto(out, SLATE_EDGE, out, lip);
  const shade = 0.78 + rf * 0.24 + grain * 0.12;
  out[0] *= shade;
  out[1] *= shade;
  out[2] *= shade;
  out[3] = clamp01(lip * (0.38 + rf * 0.52) + grain * 0.08);
  out[4] = lerp(0.92, 0.68 + grain * 0.18, lip);
}

const CUSTOM_GENERATORS = Object.freeze({
  weatheredAshlar: Object.freeze({ fn: generateWeatheredAshlar, seed: 211, relief: 3.8 }),
  mossyFortress: Object.freeze({ fn: generateMossyFortress, seed: 223, relief: 4.0 }),
  chiseledLimestone: Object.freeze({ fn: generateChiseledLimestone, seed: 227, relief: 3.0 }),
  slateShingle: Object.freeze({ fn: generateSlateShingle, seed: 229, relief: 3.4 }),
});

export const WORKSHOP_PROCEDURAL_KINDS = Object.freeze(
  new Set([...Object.keys(CUSTOM_GENERATORS), ...SURFACE_KINDS]),
);

function createNormalPixels(heights, size, relief) {
  const normal = new Uint8Array(size * size * 4);
  const scale = relief * (size / 128);
  for (let y = 0; y < size; y += 1) {
    const north = wrapIndex(y - 1, size) * size;
    const south = wrapIndex(y + 1, size) * size;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const west = wrapIndex(x - 1, size);
      const east = wrapIndex(x + 1, size);
      const gx = (heights[row + east] - heights[row + west]) * scale;
      const gy = (heights[south + x] - heights[north + x]) * scale;
      const len = Math.sqrt(gx * gx + gy * gy + 1);
      const off = (row + x) * 4;
      normal[off] = toByte((-gx / len) * 0.5 + 0.5);
      normal[off + 1] = toByte((-gy / len) * 0.5 + 0.5);
      normal[off + 2] = toByte((1 / len) * 0.5 + 0.5);
      normal[off + 3] = 255;
    }
  }
  return normal;
}

export function sampleWorkshopProceduralSurface(kind, u, v, seed) {
  const custom = CUSTOM_GENERATORS[kind];
  if (!custom) return sampleSurface(kind, u, v, seed);
  const sample = new Float64Array(5);
  custom.fn(u, v, seed ?? custom.seed, sample);
  return Array.from(sample);
}

/**
 * Deterministically synthesize tileable full-PBR Albedo + Normal + Roughness pixel
 * buffers for any built-in workshop procedural texture kind (zero Three.js imports).
 */
export function createWorkshopProceduralPixels(kind, options = {}) {
  const custom = CUSTOM_GENERATORS[kind];
  if (!custom) return createSurfaceTexturePixels(kind, options);
  const size = options.size ?? DEFAULT_SIZE;
  if (!Number.isInteger(size) || size < 4) {
    throw new Error(`Procedural surface size must be an integer >= 4, received ${size}.`);
  }
  const seed = options.seed ?? custom.seed;
  const color = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const sample = new Float64Array(5);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      custom.fn(u, v, seed, sample);
      const idx = y * size + x;
      const off = idx * 4;
      color[off] = toByte(sample[0]);
      color[off + 1] = toByte(sample[1]);
      color[off + 2] = toByte(sample[2]);
      color[off + 3] = 255;
      heights[idx] = clamp01(sample[3]);
      const rByte = toByte(sample[4]);
      roughness[off] = rByte;
      roughness[off + 1] = rByte;
      roughness[off + 2] = rByte;
      roughness[off + 3] = 255;
    }
  }
  return Object.freeze({
    kind,
    size,
    color,
    normal: createNormalPixels(heights, size, custom.relief),
    roughness,
  });
}
