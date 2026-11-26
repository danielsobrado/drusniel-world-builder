import * as THREE from 'three/webgpu';
import { createMeadowGroundPalette } from '../meadow/meadowGroundPalette.js';
import { resolveMeadowGroundDetail } from '../meadow/meadowGroundDetailConfig.js';
import { MEADOW_PATCH_METERS } from '../meadow/meadowColorNodes.js';
import { createNaturalTrailSampler } from '../naturalTrailMath.js';
import { WORLD_NOISE_LAYERS, WORLD_NOISE_METERS, WORLD_NOISE_SIZE } from '../worldNoiseLayout.js';

const TWO_PI = Math.PI * 2;
const MEADOW_HASH_SCALE = 43758.5453;
const NOISE_WRAP_METERS = 65536;
const PATCH_NOISE_CONTRAST = 0.7;
const PATCH_FIELD_DRIFT = 0.07;
const STYLE_LUSH_ROOT = Object.freeze([0.62, 0.84, 0.6]);
const STYLE_STRAW_HEX = '#c6b986';
const STYLE_EARTH_HEX = '#7c6a4c';
const GENOME_HASH_A = Object.freeze([127.1, 311.7]);
const GENOME_HASH_B = Object.freeze([269.5, 183.3]);
const GENOME_HASH_OFFSET = 19.73;
const WORLD_NOISE_NEUTRAL_NORM = 128 / 255;
/**
 * Representative grazing-angle view factor for `meadowCanopyView()` in
 * view-independent WSC storage (standing/walking pitch -15°..-35° yields
 * smoothstep(0.1, 0.85, 1 - abs(view.y)) ≈ 0.65..0.95; far bake uses 1.0).
 */
const CANONICAL_MEADOW_CANOPY_VIEW = 0.78;

/**
 * Shared terrain surface shading constants used by both `terrainMaterial.js` /
 * `TerrainMaterialBakedNodes.js` and the World Surface Context (WSC) PR 2
 * low-frequency surface evaluator — single source of truth so terrain and WSC
 * never drift apart.
 */
export const TERRAIN_SURFACE_CONSTANTS = Object.freeze({
  HEIGHT_SHADE_SCALE: 0.018,
  MINIMUM_HEIGHT_SHADE: 0.72,
  MAXIMUM_HEIGHT_SHADE: 1.22,
  SNOW_ALBEDO_PURITY: 0.92,
  ALPINE_ROCK_HEIGHT: 300,
  ALPINE_ROCK_PURITY: 0.8,
  FOREST_CORE_FALLBACK_HEX: '#273c25',
  FOREST_LITTER_FALLBACK_HEX: '#5c4a30',
  FOREST_MOSS_ROOT_SCALE: 0.78,
  FOREST_MOSS_ROOT_MIX: 0.52,
  FOREST_LITTER_DETAIL_MIX: 0.72,
  DEFAULT_FOREST_STRENGTH: 0.68,
  DEFAULT_DIRT_HEX: '#63513d',
  DEFAULT_ROCK_HEX: '#787b7d',
  DEFAULT_SNOW_HEX: '#e7edf2',
  DEFAULT_SHORELINE_HEX: '#8c7e64',
  DEFAULT_ROUGHNESS: 0.9,
});

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const v = i / 255;
  SRGB_TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function srgbByteToLinear(byteValue) {
  return SRGB_TO_LINEAR[byteValue & 255];
}

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

function clamp01(value) {
  return value < 0 ? 0 : (value > 1 ? 1 : value);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hexToLinearRgb(hex, fallbackHex) {
  const c = new THREE.Color(typeof hex === 'string' ? hex : fallbackHex);
  return [c.r, c.g, c.b];
}

/**
 * Resolves the mean linear RGB multiplier of `TerrainMaterialWorldNoiseNodes`
 * (`patchWarm` / `patchCool` at `patchStrength`) so grass blades and far cards
 * stay seamlessly calibrated to terrain reflectance both inside and beyond the
 * 128 m World Surface Context window (WSC PR 3).
 */
export function resolveTerrainWorldNoiseMean(stylizedConfig) {
  const wn = stylizedConfig?.materialBake?.families?.worldNoise;
  if (!wn?.enabled) return [1, 1, 1];
  const strength = clamp01(Number.isFinite(wn.patchStrength) ? wn.patchStrength : 0);
  if (strength <= 0) return [1, 1, 1];
  const warm = hexToLinearRgb(wn.patchWarm, '#808080');
  const cool = hexToLinearRgb(wn.patchCool, '#808080');
  return [
    lerp(1, (warm[0] + cool[0]), strength),
    lerp(1, (warm[1] + cool[1]), strength),
    lerp(1, (warm[2] + cool[2]), strength),
  ];
}

function fract(x) {
  return x - Math.floor(x);
}

function wrapSignedCoord(v) {
  return v - Math.floor(v / NOISE_WRAP_METERS + 0.5) * NOISE_WRAP_METERS;
}

/** Exact CPU port of `StylizedNoiseNodes.js` `stylizedFbm` + `stylizedDirtMask`. */
function stylizedHash2(px, py) {
  const vx = fract(px * 127.1);
  const vy = fract(py * 311.7);
  const d = vx * (vx + 19.19) + vy * (vy + 19.19);
  return fract((vx + d) * (vy + d));
}

function stylizedNoise2(px, py) {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const cx = fx * fx * (3 - 2 * fx);
  const cy = fy * fy * (3 - 2 * fy);
  const n = lerp(stylizedHash2(ix, iy), stylizedHash2(ix + 1, iy), cx);
  const s = lerp(stylizedHash2(ix, iy + 1), stylizedHash2(ix + 1, iy + 1), cx);
  return lerp(n, s, cy);
}

function stylizedFbmCpu(px, py) {
  const o0 = stylizedNoise2(px, py) * 0.5;
  const o1 = stylizedNoise2(px * 2.03 + 3.1, py * 2.03 + 7.7) * 0.25;
  const o2 = stylizedNoise2(px * 4.1209 + 9.393, py * 4.1209 + 23.331) * 0.125;
  const o3 = stylizedNoise2(px * 8.365427 + 22.168, py * 8.365427 + 55.062) * 0.0625;
  return (o0 + o1 + o2 + o3) / 0.9375;
}

function stylizedDirtMaskCpu(wx, wz, scale, coverage, softness, warp) {
  const px = wx * scale;
  const pz = wz * scale;
  const warpX = (stylizedFbmCpu(px + 11.3, pz + 2.7) - 0.5) * warp;
  const warpZ = (stylizedFbmCpu(px + 5.9, pz + 17.1) - 0.5) * warp;
  const val = stylizedFbmCpu(px + warpX, pz + warpZ);
  const threshold = 1 - coverage;
  return smoothstep(threshold - softness, threshold + softness, val);
}

/** Exact zero-allocation CPU port of `meadowNoise` (`src/editor/stylized/meadow/meadowNoise.js`). */
function meadowNoiseCpu(px, py) {
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const lx = px - cx;
  const ly = py - cy;
  const fx = lx * lx * (3 - 2 * lx);
  const fy = ly * ly * (3 - 2 * ly);
  const a0 = fract(Math.sin(cx * 0.1 + cy * 0.7) * MEADOW_HASH_SCALE) * TWO_PI;
  const a = Math.cos(a0) * lx + Math.sin(a0) * ly;
  const a1 = fract(Math.sin((cx + 1) * 0.1 + cy * 0.7) * MEADOW_HASH_SCALE) * TWO_PI;
  const b = Math.cos(a1) * (lx - 1) + Math.sin(a1) * ly;
  const a2 = fract(Math.sin(cx * 0.1 + (cy + 1) * 0.7) * MEADOW_HASH_SCALE) * TWO_PI;
  const c = Math.cos(a2) * lx + Math.sin(a2) * (ly - 1);
  const a3 = fract(Math.sin((cx + 1) * 0.1 + (cy + 1) * 0.7) * MEADOW_HASH_SCALE) * TWO_PI;
  const d = Math.cos(a3) * (lx - 1) + Math.sin(a3) * (ly - 1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) + 0.5;
}

/**
 * Zero-allocation CPU port of `terrainSubstrateResponse` (`TerrainSubstrateMath.js`)
 * writing directly into a reusable scratch object.
 */
function evalSubstrateZeroAlloc(tileId, canopy, wetness, shoreline, profiles, out) {
  const S = tileId === 1 ? 1 : 0;
  const T = (tileId === 10 || tileId === 11) ? 1 : 0;
  const W = clamp01(wetness);
  const M = Math.max(W, clamp01(shoreline) * 0.75);
  const oneMinusM = 1 - M;
  const wSand = S * oneMinusM;
  const wThaw = T * oneMinusM;
  const wLitter = clamp01(canopy) * oneMinusM * (1 - S) * (1 - T);
  const wMud = M;
  const wMineral = Math.max(0, 1 - (S + T) * oneMinusM - wLitter - M);

  const pSand = profiles.sand;
  const pThaw = profiles.thaw;
  const pLitter = profiles.litter;
  const pMud = profiles.mud;
  const pMineral = profiles.mineral;

  out.roughness = wSand * (pSand.roughness + (pSand.wetRoughness - pSand.roughness) * W)
    + wThaw * (pThaw.roughness + (pThaw.wetRoughness - pThaw.roughness) * W)
    + wLitter * (pLitter.roughness + (pLitter.wetRoughness - pLitter.roughness) * W)
    + wMud * (pMud.roughness + (pMud.wetRoughness - pMud.roughness) * W)
    + wMineral * (pMineral.roughness + (pMineral.wetRoughness - pMineral.roughness) * W);

  const aSand = wSand * pSand.tintMix;
  const aThaw = wThaw * pThaw.tintMix;
  const aLitter = wLitter * pLitter.tintMix;
  const aMud = wMud * pMud.tintMix;
  const aMineral = wMineral * pMineral.tintMix;
  out.alpha = aSand + aThaw + aLitter + aMud + aMineral;
  out.tintR = aSand * pSand.linearColor[0] + aThaw * pThaw.linearColor[0]
    + aLitter * pLitter.linearColor[0] + aMud * pMud.linearColor[0] + aMineral * pMineral.linearColor[0];
  out.tintG = aSand * pSand.linearColor[1] + aThaw * pThaw.linearColor[1]
    + aLitter * pLitter.linearColor[1] + aMud * pMud.linearColor[1] + aMineral * pMineral.linearColor[1];
  out.tintB = aSand * pSand.linearColor[2] + aThaw * pThaw.linearColor[2]
    + aLitter * pLitter.linearColor[2] + aMud * pMud.linearColor[2] + aMineral * pMineral.linearColor[2];
}

/** Bilinear wrapped sample of `worldNoise` macro layer (layer 0, 256x256 RGBA8). */
function sampleWorldNoiseLayer(pixels, layer, u, v, out) {
  const size = WORLD_NOISE_SIZE;
  const layerOffset = layer * size * size * 4;
  const tx = fract(u) * size - 0.5;
  const ty = fract(v) * size - 0.5;
  const x0 = ((Math.floor(tx) % size) + size) % size;
  const y0 = ((Math.floor(ty) % size) + size) % size;
  const x1 = (x0 + 1) % size;
  const y1 = (y0 + 1) % size;
  const fx = tx - Math.floor(tx);
  const fy = ty - Math.floor(ty);
  const i00 = layerOffset + (y0 * size + x0) * 4;
  const i10 = layerOffset + (y0 * size + x1) * 4;
  const i01 = layerOffset + (y1 * size + x0) * 4;
  const i11 = layerOffset + (y1 * size + x1) * 4;
  const inv = 1 / 255;
  out[0] = lerp(lerp(pixels[i00], pixels[i10], fx), lerp(pixels[i01], pixels[i11], fx), fy) * inv;
  out[1] = lerp(lerp(pixels[i00 + 1], pixels[i10 + 1], fx), lerp(pixels[i01 + 1], pixels[i11 + 1], fx), fy) * inv;
  out[2] = lerp(lerp(pixels[i00 + 2], pixels[i10 + 2], fx), lerp(pixels[i01 + 2], pixels[i11 + 2], fx), fy) * inv;
}

/**
 * Computes exact GPU `bilinearTexels` (`TerrainSlotBindings.js`) texel-centre
 * indices and weights for normalized `(u, v)` in `[0, 1]` on a `res x res` map.
 * Zero allocations: writes into caller-supplied scratch object.
 */
export function bilinearTexelCoords(u, v, res, out) {
  const tx = clamp01(u) * res - 0.5;
  const tz = clamp01(v) * res - 0.5;
  const bx = Math.floor(tx);
  const bz = Math.floor(tz);
  const fx = tx - bx;
  const fz = tz - bz;
  const maxIdx = res - 1;
  const x0 = bx < 0 ? 0 : (bx > maxIdx ? maxIdx : bx);
  const x1 = bx + 1 < 0 ? 0 : (bx + 1 > maxIdx ? maxIdx : bx + 1);
  const z0 = bz < 0 ? 0 : (bz > maxIdx ? maxIdx : bz);
  const z1 = bz + 1 < 0 ? 0 : (bz + 1 > maxIdx ? maxIdx : bz + 1);
  out.i00 = z0 * res + x0;
  out.i10 = z0 * res + x1;
  out.i01 = z1 * res + x0;
  out.i11 = z1 * res + x1;
  out.w00 = (1 - fx) * (1 - fz);
  out.w10 = fx * (1 - fz);
  out.w01 = (1 - fx) * fz;
  out.w11 = fx * fz;
  return out;
}

const BILINEAR_SCRATCH = { i00: 0, i10: 0, i01: 0, i11: 0, w00: 1, w10: 0, w01: 0, w11: 0 };

/**
 * Samples an RGBA8 texture (`size x size`, `LinearFilter`) at normalized `(u, v)`
 * using exact texel-centre bilinear interpolation into `out` (`[r, g, b, a]` in `0..1`).
 */
export function sampleRgba8Bilinear(pixels, size, u, v, out) {
  const c = bilinearTexelCoords(u, v, size, BILINEAR_SCRATCH);
  const o00 = c.i00 * 4;
  const o10 = c.i10 * 4;
  const o01 = c.i01 * 4;
  const o11 = c.i11 * 4;
  const inv = 1 / 255;
  out[0] = (pixels[o00] * c.w00 + pixels[o10] * c.w10 + pixels[o01] * c.w01 + pixels[o11] * c.w11) * inv;
  out[1] = (pixels[o00 + 1] * c.w00 + pixels[o10 + 1] * c.w10 + pixels[o01 + 1] * c.w01 + pixels[o11 + 1] * c.w11) * inv;
  out[2] = (pixels[o00 + 2] * c.w00 + pixels[o10 + 2] * c.w10 + pixels[o01 + 2] * c.w01 + pixels[o11 + 2] * c.w11) * inv;
  out[3] = (pixels[o00 + 3] * c.w00 + pixels[o10 + 3] * c.w10 + pixels[o01 + 3] * c.w01 + pixels[o11 + 3] * c.w11) * inv;
  return out;
}

/**
 * Samples baked material channels (`materialWeights`, `wetnessShoreline`,
 * `macroTint`, `terrainShape`) at normalized chunk coordinates `(u, v)` using
 * the exact GPU `bilinearLoad` texel-centre kernel (`TerrainSlotBindings.js`),
 * writing into a caller-supplied scratch object with zero per-call allocations.
 */
export function sampleMaterialBakeChannels(materialBake, u, v, out) {
  const channels = materialBake?.channels;
  const res = materialBake?.resolution ?? 0;
  if (!channels || res <= 0) return false;

  const c = bilinearTexelCoords(u, v, res, BILINEAR_SCRATCH);
  const { i00, i10, i01, i11, w00, w10, w01, w11 } = c;
  const inv255 = 1 / 255;

  const mw = channels.materialWeights;
  if (mw) {
    const o00 = i00 * 4;
    const o10 = i10 * 4;
    const o01 = i01 * 4;
    const o11 = i11 * 4;
    const g = (mw[o00] * w00 + mw[o10] * w10 + mw[o01] * w01 + mw[o11] * w11) * inv255;
    const d = (mw[o00 + 1] * w00 + mw[o10 + 1] * w10 + mw[o01 + 1] * w01 + mw[o11 + 1] * w11) * inv255;
    const r = (mw[o00 + 2] * w00 + mw[o10 + 2] * w10 + mw[o01 + 2] * w01 + mw[o11 + 2] * w11) * inv255;
    const s = (mw[o00 + 3] * w00 + mw[o10 + 3] * w10 + mw[o01 + 3] * w01 + mw[o11 + 3] * w11) * inv255;
    // Match `normalizedWeights(samples.materialWeights)` (`TerrainMaterialBakedNodes.js:54-60`).
    const sum = g + d + r + s;
    const inv = sum > 1e-4 ? 1 / sum : 0;
    out.grassWeight = sum > 1e-4 ? g * inv : 0;
    out.dirtWeight = sum > 1e-4 ? d * inv : 1;
    out.rockWeight = sum > 1e-4 ? r * inv : 0;
    out.snowWeight = sum > 1e-4 ? s * inv : 0;
  } else {
    out.grassWeight = 0;
    out.dirtWeight = 1;
    out.rockWeight = 0;
    out.snowWeight = 0;
  }

  const ws = channels.wetnessShoreline;
  if (ws) {
    const o00 = i00 * 2;
    const o10 = i10 * 2;
    const o01 = i01 * 2;
    const o11 = i11 * 2;
    out.wetness = (ws[o00] * w00 + ws[o10] * w10 + ws[o01] * w01 + ws[o11] * w11) * inv255;
    out.shoreline = (ws[o00 + 1] * w00 + ws[o10 + 1] * w10 + ws[o01 + 1] * w01 + ws[o11 + 1] * w11) * inv255;
  } else {
    out.wetness = 0;
    out.shoreline = 0;
  }

  const mt = channels.macroTint;
  if (mt) {
    const o00 = i00 * 4;
    const o10 = i10 * 4;
    const o01 = i01 * 4;
    const o11 = i11 * 4;
    const mr = (mt[o00] * w00 + mt[o10] * w10 + mt[o01] * w01 + mt[o11] * w11) * inv255;
    const mg = (mt[o00 + 1] * w00 + mt[o10 + 1] * w10 + mt[o01 + 1] * w01 + mt[o11 + 1] * w11) * inv255;
    const mb = (mt[o00 + 2] * w00 + mt[o10 + 2] * w10 + mt[o01 + 2] * w01 + mt[o11 + 2] * w11) * inv255;
    out.macroR = clamp(mr * 2, 0.65, 1.35);
    out.macroG = clamp(mg * 2, 0.65, 1.35);
    out.macroB = clamp(mb * 2, 0.65, 1.35);
  } else {
    out.macroR = 1;
    out.macroG = 1;
    out.macroB = 1;
  }

  const ts = channels.terrainShape;
  if (ts) {
    const fromHalf = THREE.DataUtils.fromHalfFloat;
    const o00 = i00 * 2;
    const o10 = i10 * 2;
    const o01 = i01 * 2;
    const o11 = i11 * 2;
    out.slope = fromHalf(ts[o00]) * w00 + fromHalf(ts[o10]) * w10
      + fromHalf(ts[o01]) * w01 + fromHalf(ts[o11]) * w11;
    out.curvature = fromHalf(ts[o00 + 1]) * w00 + fromHalf(ts[o10 + 1]) * w10
      + fromHalf(ts[o01 + 1]) * w01 + fromHalf(ts[o11 + 1]) * w11;
  } else {
    out.slope = 0;
    out.curvature = 0;
  }
  return true;
}

function hashGenomeCell(cellX, cellZ, vec, seedOffset) {
  const px = cellX + seedOffset;
  const pz = cellZ + seedOffset * 0.618;
  return fract(Math.sin(px * vec[0] + pz * vec[1]) * MEADOW_HASH_SCALE);
}

/**
 * Creates a pure CPU evaluator of Drusniel's resolved low-frequency unlit
 * terrain albedo and roughness (`PR 2`), mirroring `terrainMaterial.js` and
 * `TerrainMaterialBakedNodes.js` without lighting, fog, or contact-AO darkening.
 *
 * Precomputes all lookup tables once at construction; `evaluate()` writes into
 * `out` with zero heap allocations on the hot loop.
 */
export function createTerrainSurfaceEvaluator(stylizedConfig = {}) {
  const C = TERRAIN_SURFACE_CONSTANTS;
  const meadowPalette = createMeadowGroundPalette(stylizedConfig);
  const groundDetail = resolveMeadowGroundDetail(stylizedConfig?.grass?.meadow?.groundDetail);
  const dirtColor = hexToLinearRgb(stylizedConfig?.dirt?.color, C.DEFAULT_DIRT_HEX);

  // Fallback grass tint when meadow system is disabled.
  const bottom = hexToLinearRgb(stylizedConfig?.color?.bottom, '#4d7a36');
  const brightness = Number.isFinite(stylizedConfig?.color?.brightness) ? stylizedConfig.color.brightness : 1;
  const fallbackGrass = [bottom[0] * brightness, bottom[1] * brightness, bottom[2] * brightness];

  const forestCfg = stylizedConfig?.trees?.forestFloor ?? {};
  const forestCore = hexToLinearRgb(forestCfg.groundCoreColor, C.FOREST_CORE_FALLBACK_HEX);
  const forestLitter = hexToLinearRgb(forestCfg.litterColor, C.FOREST_LITTER_FALLBACK_HEX);
  const forestStrength = Number.isFinite(forestCfg.groundStrength) ? forestCfg.groundStrength : C.DEFAULT_FOREST_STRENGTH;
  const litterStrength = Number.isFinite(forestCfg.litterStrength) ? forestCfg.litterStrength : 0;

  const bake = stylizedConfig?.materialBake ?? {};
  const render = bake.render ?? {};
  const families = bake.families ?? {};
  const profiles = families.profiles ?? null;
  const substrates = families.substrates ?? null;
  const transitionsEnabled = Boolean(families.transitions?.enabled);
  const genomesCfg = families.genomes?.enabled ? families.genomes : null;
  const weatheringCfg = families.weathering?.enabled ? families.weathering : null;
  const worldNoiseCfg = families.worldNoise?.enabled ? families.worldNoise : null;

  // Precompute grey-centred linear*2 tints for TerrainMaterialWorldNoiseNodes.
  const wnPatchWarm = worldNoiseCfg ? hexToLinearRgb(worldNoiseCfg.patchWarm, '#808080').map((c) => c * 2) : null;
  const wnPatchCool = worldNoiseCfg ? hexToLinearRgb(worldNoiseCfg.patchCool, '#808080').map((c) => c * 2) : null;
  const wnMossTint = worldNoiseCfg ? hexToLinearRgb(worldNoiseCfg.mossTint, '#808080').map((c) => c * 2) : null;
  const wnStainTint = worldNoiseCfg ? hexToLinearRgb(worldNoiseCfg.stainTint, '#808080').map((c) => c * 2) : null;

  const pathCfg = stylizedConfig?.path ?? {};
  const vergeWidth = Number.isFinite(pathCfg.vergeWidth) ? pathCfg.vergeWidth : 0.45;
  const vergeBlend = Number.isFinite(pathCfg.vergeBlend) ? pathCfg.vergeBlend : 0.55;
  const vergeCut = Number.isFinite(pathCfg.vergeCut) ? pathCfg.vergeCut : 0.72;
  const naturalTrailSampler = pathCfg.naturalTrail?.enabled
    ? createNaturalTrailSampler(pathCfg.naturalTrail)
    : null;
  const dirtCfg = stylizedConfig?.dirt ?? {};
  const dirtScale = Number.isFinite(dirtCfg.scale) ? dirtCfg.scale : 0.07;
  const dirtCoverage = Number.isFinite(dirtCfg.coverage) ? dirtCfg.coverage : 0;
  const dirtSoftness = Number.isFinite(dirtCfg.softness) ? dirtCfg.softness : 0.045;
  const dirtWarp = Number.isFinite(dirtCfg.warp) ? dirtCfg.warp : 0.35;

  const rockColor = hexToLinearRgb(render.rockColor, C.DEFAULT_ROCK_HEX);
  const snowColor = hexToLinearRgb(render.snowColor, C.DEFAULT_SNOW_HEX);
  const shorelineColor = hexToLinearRgb(render.shorelineColor, C.DEFAULT_SHORELINE_HEX);
  const nearMacroStrength = Number.isFinite(render.nearMacroStrength) ? render.nearMacroStrength : 0.45;
  const nearMaterialBlendBase = Number.isFinite(render.nearMaterialBlend) ? render.nearMaterialBlend : 0.14;
  const wetDarkening = Number.isFinite(render.wetDarkening) ? render.wetDarkening : 0.35;
  const nearWetnessScale = Number.isFinite(render.nearWetnessScale) ? render.nearWetnessScale : 0.6;
  const shorelineStrength = Number.isFinite(render.shorelineStrength) ? render.shorelineStrength : 0.35;
  const canopyStrength = Number.isFinite(render.canopyStrength) ? render.canopyStrength : 0.3;
  const fallbackRoughness = Number.isFinite(render.fallbackRoughness) ? render.fallbackRoughness : C.DEFAULT_ROUGHNESS;

  const biomeSnowGround = new Float32Array(256);
  const snowGroundSrc = stylizedConfig?.biomeLooks?.snow?.ground;
  if (snowGroundSrc) {
    for (let i = 0; i < Math.min(256, snowGroundSrc.length); i += 1) {
      biomeSnowGround[i] = clamp01(Number(snowGroundSrc[i]) || 0);
    }
  }
  const craggyFlags = new Uint8Array(256);
  const cragSrc = stylizedConfig?.biomeLooks?.crags;
  if (cragSrc) {
    for (let i = 0; i < Math.min(256, cragSrc.length); i += 1) {
      if (cragSrc[i]) craggyFlags[i] = 1;
    }
  }

  // Precompute per-tile moss & litter tables (exact mirror of terrainMaterial.js:276-281).
  const grassRootTable = new Float32Array(256 * 3);
  const floorMossTable = new Float32Array(256 * 3);
  const floorLitterTable = new Float32Array(256 * 3);
  for (let id = 0; id < 256; id += 1) {
    const o = id * 3;
    const gr = meadowPalette ? meadowPalette.roots[o] : fallbackGrass[0];
    const gg = meadowPalette ? meadowPalette.roots[o + 1] : fallbackGrass[1];
    const gb = meadowPalette ? meadowPalette.roots[o + 2] : fallbackGrass[2];
    grassRootTable[o] = gr;
    grassRootTable[o + 1] = gg;
    grassRootTable[o + 2] = gb;

    if (meadowPalette) {
      floorMossTable[o] = lerp(forestCore[0], gr * C.FOREST_MOSS_ROOT_SCALE, C.FOREST_MOSS_ROOT_MIX);
      floorMossTable[o + 1] = lerp(forestCore[1], gg * C.FOREST_MOSS_ROOT_SCALE, C.FOREST_MOSS_ROOT_MIX);
      floorMossTable[o + 2] = lerp(forestCore[2], gb * C.FOREST_MOSS_ROOT_SCALE, C.FOREST_MOSS_ROOT_MIX);
    } else {
      floorMossTable[o] = forestCore[0];
      floorMossTable[o + 1] = forestCore[1];
      floorMossTable[o + 2] = forestCore[2];
    }

    if (groundDetail) {
      const lo = id * 4;
      floorLitterTable[o] = lerp(forestLitter[0], groundDetail.litter[lo], C.FOREST_LITTER_DETAIL_MIX);
      floorLitterTable[o + 1] = lerp(forestLitter[1], groundDetail.litter[lo + 1], C.FOREST_LITTER_DETAIL_MIX);
      floorLitterTable[o + 2] = lerp(forestLitter[2], groundDetail.litter[lo + 2], C.FOREST_LITTER_DETAIL_MIX);
    } else {
      floorLitterTable[o] = forestLitter[0];
      floorLitterTable[o + 1] = forestLitter[1];
      floorLitterTable[o + 2] = forestLitter[2];
    }
  }

  const substrateScratch = { roughness: 0.9, alpha: 0, tintR: 0, tintG: 0, tintB: 0 };
  const noiseA = [0.5, 0.5, 0.5];
  const noiseB = [0.5, 0.5, 0.5];
  const wnMacro = [WORLD_NOISE_NEUTRAL_NORM, WORLD_NOISE_NEUTRAL_NORM, WORLD_NOISE_NEUTRAL_NORM];
  const wnMeso = [WORLD_NOISE_NEUTRAL_NORM, WORLD_NOISE_NEUTRAL_NORM, WORLD_NOISE_NEUTRAL_NORM];
  const appearance = meadowPalette?.appearance ?? null;
  const patchCool = appearance?.patchCool ?? [1, 1, 1];
  const patchWarm = appearance?.patchWarm ?? [1, 1, 1];
  const dryColor = appearance ? hexToLinearRgb(appearance.dryColor, '#777455') : [0.2, 0.19, 0.1];
  const dryBrightness = meadowPalette?.brightness ?? 1;
  const dryPigment = [dryColor[0] * dryBrightness, dryColor[1] * dryBrightness, dryColor[2] * dryBrightness];
  const styleStraw = hexToLinearRgb(STYLE_STRAW_HEX, STYLE_STRAW_HEX);
  const styleEarth = hexToLinearRgb(STYLE_EARTH_HEX, STYLE_EARTH_HEX);
  const groundStyleStrength = appearance?.groundStyle ?? 0;

  function evaluate({
    tileId = 0,
    tileR = 0,
    tileG = 0,
    tileB = 0,
    worldX = Number.NaN,
    worldZ = Number.NaN,
    height = 0,
    grassCoverage = 0,
    pathMask = 0,
    canopy = 0,
    litter = 0,
    bakeSample = null,
    worldNoisePixels = null,
    stormSnow = 0,
  }, out = { r: 0, g: 0, b: 0, roughness: C.DEFAULT_ROUGHNESS }) {
    const id = tileId & 255;
    const o = id * 3;
    let gr = grassRootTable[o];
    let gg = grassRootTable[o + 1];
    let gb = grassRootTable[o + 2];
    const hasWorldCoords = Number.isFinite(worldX) && Number.isFinite(worldZ);
    // Exact match to `wrapNoiseOrigin(chunkCenter) + localXZ` (centred on zero).
    const wx = hasWorldCoords ? wrapSignedCoord(worldX) : 0;
    const wz = hasWorldCoords ? wrapSignedCoord(worldZ) : 0;

    // Apply canonical meadowPatchColors + meadowGroundStyle + eye-level canopy share
    // (exact mirror of MeadowGroundShading.js:47-65).
    if (meadowPalette) {
      let cr = meadowPalette.canopies[id * 4];
      let cg = meadowPalette.canopies[id * 4 + 1];
      let cb = meadowPalette.canopies[id * 4 + 2];
      const canopyWeight = meadowPalette.canopies[id * 4 + 3];

      if (hasWorldCoords) {
        let tintR = 1;
        let tintG = 1;
        let tintB = 1;
        let dry = 0;

        if (worldNoisePixels) {
          sampleWorldNoiseLayer(worldNoisePixels, WORLD_NOISE_LAYERS.macro, wx / MEADOW_PATCH_METERS, wz / MEADOW_PATCH_METERS, noiseA);
          const periodB = MEADOW_PATCH_METERS * 1.618;
          sampleWorldNoiseLayer(worldNoisePixels, WORLD_NOISE_LAYERS.macro, -wz / periodB + 0.31, wx / periodB + 0.31, noiseB);
          const fR = (noiseA[0] * 0.62 + noiseB[0] * 0.38 - 0.5) * PATCH_NOISE_CONTRAST + 0.5;
          const fG = (noiseA[1] * 0.62 + noiseB[1] * 0.38 - 0.5) * PATCH_NOISE_CONTRAST + 0.5;
          const fB = (noiseA[2] * 0.62 + noiseB[2] * 0.38 - 0.5) * PATCH_NOISE_CONTRAST + 0.5;
          const patchT = smoothstep(0.15, 0.85, fB);
          const drift = (fR - 0.5) * (PATCH_FIELD_DRIFT * 2 / PATCH_NOISE_CONTRAST) + 1;
          tintR = lerp(patchCool[0], patchWarm[0], patchT) * drift;
          tintG = lerp(patchCool[1], patchWarm[1], patchT) * drift;
          tintB = lerp(patchCool[2], patchWarm[2], patchT) * drift;
          if (appearance.dryStrength > 0) {
            dry = smoothstep(appearance.dryStart, appearance.dryEnd, fG) * appearance.dryStrength;
          }
        } else {
          const ps = appearance.patchScale;
          const patch = meadowNoiseCpu(wx * ps, wz * ps) * 0.65
            + meadowNoiseCpu(wx * ps * 2.7 + 19.3, wz * ps * 2.7 + 19.3) * 0.35;
          const patchT = smoothstep(0.15, 0.85, patch);
          tintR = lerp(patchCool[0], patchWarm[0], patchT);
          tintG = lerp(patchCool[1], patchWarm[1], patchT);
          tintB = lerp(patchCool[2], patchWarm[2], patchT);
          if (appearance.dryStrength > 0) {
            dry = smoothstep(
              appearance.dryStart,
              appearance.dryEnd,
              meadowNoiseCpu(wx * appearance.dryPatchScale + 53.7, wz * appearance.dryPatchScale + 53.7),
            ) * appearance.dryStrength;
          }
        }

        const lush = meadowPalette.lush[id];
        const ptR = lerp(1, tintR, lush);
        const ptG = lerp(1, tintG, lush);
        const ptB = lerp(1, tintB, lush);
        gr = lerp(gr * ptR, dryPigment[0], dry);
        gg = lerp(gg * ptG, dryPigment[1], dry);
        gb = lerp(gb * ptB, dryPigment[2], dry);
        cr = lerp(cr * ptR, dryPigment[0], dry);
        cg = lerp(cg * ptG, dryPigment[1], dry);
        cb = lerp(cb * ptB, dryPigment[2], dry);

        if (groundStyleStrength > 0) {
          const styleShare = meadowPalette.areaStyles[id] * groundStyleStrength;
          if (styleShare > 0) {
            const warp = meadowNoiseCpu(wx / 7 + 71.3, wz / 7 + 11.9) - 0.5;
            const area = meadowNoiseCpu(wx / 28 + 3.7 + warp * 1.3, wz / 28 + 29.1 + warp * 1.3) + warp * 0.35;
            const bare = meadowNoiseCpu(wx / 19 + 47.9 - warp * 1.1, wz / 19 + 83.3 - warp * 1.1) + warp * 0.3;
            const sLush = (1 - smoothstep(0.3, 0.5, area)) * styleShare * lush;
            const sDry = smoothstep(0.5, 0.74, area) * styleShare;
            const sWorn = smoothstep(0.58, 0.8, bare) * (1 - (1 - smoothstep(0.3, 0.5, area)) * styleShare) * styleShare;
            const rootVal = (gr * 0.3 + gg * 0.59 + gb * 0.11) * 1.4 + 0.4;
            gr = lerp(lerp(gr * lerp(1, STYLE_LUSH_ROOT[0], sLush), styleStraw[0] * rootVal, sDry * 0.5), styleEarth[0] * rootVal, sWorn * 0.5);
            gg = lerp(lerp(gg * lerp(1, STYLE_LUSH_ROOT[1], sLush), styleStraw[1] * rootVal, sDry * 0.5), styleEarth[1] * rootVal, sWorn * 0.5);
            gb = lerp(lerp(gb * lerp(1, STYLE_LUSH_ROOT[2], sLush), styleStraw[2] * rootVal, sDry * 0.5), styleEarth[2] * rootVal, sWorn * 0.5);
            const canVal = (cr * 0.3 + cg * 0.59 + cb * 0.11) * 1.4 + 0.4;
            cr = lerp(lerp(cr * lerp(1, STYLE_LUSH_ROOT[0], sLush), styleStraw[0] * canVal, sDry * 0.5), styleEarth[0] * canVal, sWorn * 0.5);
            cg = lerp(lerp(cg * lerp(1, STYLE_LUSH_ROOT[1], sLush), styleStraw[1] * canVal, sDry * 0.5), styleEarth[1] * canVal, sWorn * 0.5);
            cb = lerp(lerp(cb * lerp(1, STYLE_LUSH_ROOT[2], sLush), styleStraw[2] * canVal, sDry * 0.5), styleEarth[2] * canVal, sWorn * 0.5);
          }
        }
      }

      const canopyMix = clamp01(canopyWeight * CANONICAL_MEADOW_CANOPY_VIEW);
      gr = lerp(gr, cr, canopyMix);
      gg = lerp(gg, cg, canopyMix);
      gb = lerp(gb, cb, canopyMix);
    }

    const cov = clamp01(grassCoverage);
    const naturalTrail = (naturalTrailSampler && hasWorldCoords && cov > 0)
      ? naturalTrailSampler.maskAt(worldX, worldZ) * cov
      : 0;
    const path = Math.max(clamp01(pathMask), naturalTrail);
    const proceduralDirt = (dirtCoverage > 0 && hasWorldCoords && cov > 0)
      ? stylizedDirtMaskCpu(wx, wz, dirtScale, dirtCoverage, dirtSoftness, dirtWarp) * cov
      : 0;
    const can = clamp01(canopy);
    const lit = clamp01(litter);

    // 1. Tile vs meadow root pigment + path verge/tread + proceduralDirt (`terrainMaterial.js:200-265`).
    let r = lerp(tileR, gr, cov);
    let g = lerp(tileG, gg, cov);
    let b = lerp(tileB, gb, cov);

    const tread = smoothstep(vergeWidth, 1, path);
    const verge = Math.max(0, path - tread);
    const wear = clamp01(tread + verge * vergeCut);
    const dirtMask = Math.max(wear, proceduralDirt);
    if (verge > 0) {
      r = lerp(r, lerp(gr, dirtColor[0], vergeBlend), verge);
      g = lerp(g, lerp(gg, dirtColor[1], vergeBlend), verge);
      b = lerp(b, lerp(gb, dirtColor[2], vergeBlend), verge);
    }
    const bareTread = Math.max(tread, proceduralDirt);
    if (bareTread > 0) {
      r = lerp(r, dirtColor[0], bareTread);
      g = lerp(g, dirtColor[1], bareTread);
      b = lerp(b, dirtColor[2], bareTread);
    }

    // 2. Forest floor moss & biome litter (`terrainMaterial.js:278-303`), without contact AO darkening.
    const dryShare = 1 - dirtMask;
    const mossShare = clamp01(can * forestStrength * dryShare);
    const mossR = meadowPalette ? lerp(forestCore[0], gr * C.FOREST_MOSS_ROOT_SCALE, C.FOREST_MOSS_ROOT_MIX) : floorMossTable[o];
    const mossG = meadowPalette ? lerp(forestCore[1], gg * C.FOREST_MOSS_ROOT_SCALE, C.FOREST_MOSS_ROOT_MIX) : floorMossTable[o + 1];
    const mossB = meadowPalette ? lerp(forestCore[2], gb * C.FOREST_MOSS_ROOT_SCALE, C.FOREST_MOSS_ROOT_MIX) : floorMossTable[o + 2];
    r = lerp(r, mossR, mossShare);
    g = lerp(g, mossG, mossShare);
    b = lerp(b, mossB, mossShare);

    if (litterStrength > 0 && lit > 0) {
      const litShare = clamp01(lit * litterStrength * dryShare);
      r = lerp(r, floorLitterTable[o], litShare);
      g = lerp(g, floorLitterTable[o + 1], litShare);
      b = lerp(b, floorLitterTable[o + 2], litShare);
    }

    // 3. Elevation height shade (`terrainMaterial.js:173-177, 371`).
    const heightShade = clamp(
      height * C.HEIGHT_SHADE_SCALE + 1,
      C.MINIMUM_HEIGHT_SHADE,
      C.MAXIMUM_HEIGHT_SHADE,
    );
    let nearR = Math.max(0, r) * heightShade;
    let nearG = Math.max(0, g) * heightShade;
    let nearB = Math.max(0, b) * heightShade;

    if (!bakeSample) {
      // Unbaked fallback mirrors `snowedFallback()` (`TerrainMaterialBakedNodes.js:412-417`).
      const snowCov = clamp01(Math.max(biomeSnowGround[id], stormSnow));
      out.r = clamp01(lerp(nearR, snowColor[0] * heightShade, snowCov));
      out.g = clamp01(lerp(nearG, snowColor[1] * heightShade, snowCov));
      out.b = clamp01(lerp(nearB, snowColor[2] * heightShade, snowCov));
      out.roughness = clamp01(fallbackRoughness);
      return out;
    }

    // 4. Baked substrate, genome, weathering, worldNoise, rock, snow, shoreline, wetness & roughness
    // (`TerrainMaterialBakedNodes.js:176-356`).
    const {
      grassWeight: wGrass,
      dirtWeight: wDirt,
      rockWeight: wRock,
      snowWeight: wSnow,
      wetness,
      shoreline,
      macroR,
      macroG,
      macroB,
      slope = 0,
      curvature = 0,
    } = bakeSample;

    // 4a. Deterministic regional genome multiplier (`TerrainMaterialGenomeNodes.js`).
    let genomeR = 1;
    let genomeG = 1;
    let genomeB = 1;
    let genomeRoughOffset = 0;
    if (genomesCfg && hasWorldCoords) {
      const cellX = Math.floor(wx / genomesCfg.regionScaleMeters);
      const cellZ = Math.floor(wz / genomesCfg.regionScaleMeters);
      const regA = hashGenomeCell(cellX, cellZ, GENOME_HASH_A, genomesCfg.seedOffset);
      const regB = hashGenomeCell(cellX, cellZ, GENOME_HASH_B, genomesCfg.seedOffset + GENOME_HASH_OFFSET);
      const biomeSig = fract((tileR * 0.41 + tileG * 0.73 + tileB * 0.19) * 13.37);
      const sigA = (lerp(regA, biomeSig, genomesCfg.biomeInfluence) - 0.5) * 2;
      const sigB = (lerp(regB, 1 - biomeSig, genomesCfg.biomeInfluence) - 0.5) * 2;
      const cs = genomesCfg.colorStrength;
      genomeR = clamp(1 + sigA * cs, 0.82, 1.18);
      genomeG = clamp(1 + (sigA * 0.35 + sigB * 0.25) * cs, 0.82, 1.18);
      genomeB = clamp(1 + sigB * cs, 0.82, 1.18);
      genomeRoughOffset = sigB * genomesCfg.roughnessStrength;
    }

    // 4b. Terrain weathering multiplier (`TerrainMaterialWeatheringNodes.js`, 100% active inside WSC window).
    let weatherMul = 1;
    let weatherRoughOffset = 0;
    if (weatheringCfg) {
      const curvNorm = clamp01(curvature * 8 + 0.5);
      const concavity = smoothstep(0.52, 0.84, curvNorm);
      const exposure = (1 - can) * (1 - wetness) * lerp(1, 0.62, smoothstep(0.28, 0.68, slope));
      const retainedMoisture = wetness * lerp(0.45, 1, concavity);
      const shorelineDeposit = shoreline * (1 - wetness * 0.35);
      const lift = exposure * weatheringCfg.exposureBleach + shorelineDeposit * weatheringCfg.shorelineDeposit;
      const darken = retainedMoisture * weatheringCfg.wetDarkening + concavity * weatheringCfg.concavityDarkening;
      weatherMul = clamp(1 + lift - darken, 0.72, 1.22);
      weatherRoughOffset = exposure * weatheringCfg.roughnessResponse
        + concavity * (weatheringCfg.roughnessResponse * 0.45)
        - retainedMoisture * (weatheringCfg.roughnessResponse * 0.55);
    }

    // 4c. Low-frequency world-noise shaping (`TerrainMaterialWorldNoiseNodes.js`, macro 512m + meso 32m).
    let wnMulR = 1;
    let wnMulG = 1;
    let wnMulB = 1;
    let wnRoughOffset = 0;
    if (worldNoiseCfg) {
      if (worldNoisePixels && hasWorldCoords) {
        sampleWorldNoiseLayer(worldNoisePixels, WORLD_NOISE_LAYERS.macro, wx / WORLD_NOISE_METERS.macro, wz / WORLD_NOISE_METERS.macro, wnMacro);
        sampleWorldNoiseLayer(worldNoisePixels, WORLD_NOISE_LAYERS.meso, wx / WORLD_NOISE_METERS.meso, wz / WORLD_NOISE_METERS.meso, wnMeso);
      } else {
        wnMacro[0] = WORLD_NOISE_NEUTRAL_NORM;
        wnMacro[1] = WORLD_NOISE_NEUTRAL_NORM;
        wnMacro[2] = WORLD_NOISE_NEUTRAL_NORM;
        wnMeso[0] = WORLD_NOISE_NEUTRAL_NORM;
        wnMeso[1] = WORLD_NOISE_NEUTRAL_NORM;
        wnMeso[2] = WORLD_NOISE_NEUTRAL_NORM;
      }
      const soilWeight = wGrass + wDirt;
      const bareWeight = 1 - wSnow;
      const moisture = (wnMacro[0] - 0.5) * 2;
      const damp = moisture * 0.5 + 0.5;
      const moistureShade = 1 - moisture * worldNoiseCfg.moistureDarkening * soilWeight;
      const patchWeight = bareWeight * worldNoiseCfg.patchStrength;
      const ptR = lerp(1, lerp(wnPatchCool[0], wnPatchWarm[0], wnMacro[1]), patchWeight);
      const ptG = lerp(1, lerp(wnPatchCool[1], wnPatchWarm[1], wnMacro[1]), patchWeight);
      const ptB = lerp(1, lerp(wnPatchCool[2], wnPatchWarm[2], wnMacro[1]), patchWeight);
      const mossW = smoothstep(worldNoiseCfg.mossLevel, worldNoiseCfg.mossLevel + 0.22, wnMeso[1])
        * wGrass * lerp(0.45, 1, damp) * worldNoiseCfg.mossStrength;
      const stainW = smoothstep(0.5, 0.82, wnMeso[2]) * wRock * worldNoiseCfg.stainStrength;
      wnMulR = ptR * moistureShade * lerp(1, wnMossTint[0], mossW) * lerp(1, wnStainTint[0], stainW);
      wnMulG = ptG * moistureShade * lerp(1, wnMossTint[1], mossW) * lerp(1, wnStainTint[1], stainW);
      wnMulB = ptB * moistureShade * lerp(1, wnMossTint[2], mossW) * lerp(1, wnStainTint[2], stainW);
      wnRoughOffset = -moisture * worldNoiseCfg.moistureRoughness * soilWeight;
    }

    if (substrates) {
      evalSubstrateZeroAlloc(id, can, wetness, shoreline, substrates, substrateScratch);
      const subShare = clamp01(wDirt) * (1 - path);
      const subKeep = 1 - subShare * substrateScratch.alpha;
      nearR = nearR * subKeep + substrateScratch.tintR * subShare;
      nearG = nearG * subKeep + substrateScratch.tintG * subShare;
      nearB = nearB * subKeep + substrateScratch.tintB * subShare;
    }

    const nearWetMul = 1 - wetness * wetDarkening * nearWetnessScale;
    nearR = clamp01(nearR * genomeR * lerp(1, macroR, nearMacroStrength) * nearWetMul * weatherMul) * wnMulR;
    nearG = clamp01(nearG * genomeG * lerp(1, macroG, nearMacroStrength) * nearWetMul * weatherMul) * wnMulG;
    nearB = clamp01(nearB * genomeB * lerp(1, macroB, nearMacroStrength) * nearWetMul * weatherMul) * wnMulB;
    nearR = clamp01(nearR);
    nearG = clamp01(nearG);
    nearB = clamp01(nearB);

    let midR = gr * wGrass + dirtColor[0] * wDirt + rockColor[0] * wRock + snowColor[0] * wSnow;
    let midG = gg * wGrass + dirtColor[1] * wDirt + rockColor[1] * wRock + snowColor[1] * wSnow;
    let midB = gb * wGrass + dirtColor[2] * wDirt + rockColor[2] * wRock + snowColor[2] * wSnow;
    if (substrates) {
      const subShare = clamp01(wDirt) * (1 - path);
      const subKeep = 1 - subShare * substrateScratch.alpha;
      midR = midR * subKeep + substrateScratch.tintR * subShare;
      midG = midG * subKeep + substrateScratch.tintG * subShare;
      midB = midB * subKeep + substrateScratch.tintB * subShare;
    }
    midR = clamp01(midR * macroR * genomeR * weatherMul) * wnMulR;
    midG = clamp01(midG * macroG * genomeG * weatherMul) * wnMulG;
    midB = clamp01(midB * macroB * genomeB * weatherMul) * wnMulB;
    midR = clamp01(midR);
    midG = clamp01(midG);
    midB = clamp01(midB);

    const shoreMix = clamp01(shoreline * shorelineStrength);
    midR = lerp(midR, shorelineColor[0], shoreMix);
    midG = lerp(midG, shorelineColor[1], shoreMix);
    midB = lerp(midB, shorelineColor[2], shoreMix);

    const midCanopyMix = clamp01(can * canopyStrength * (1 - wDirt));
    midR = lerp(midR, forestCore[0], midCanopyMix);
    midG = lerp(midG, forestCore[1], midCanopyMix);
    midB = lerp(midB, forestCore[2], midCanopyMix);

    const midMul = (1 - wetness * wetDarkening) * heightShade;
    midR *= midMul;
    midG *= midMul;
    midB *= midMul;

    const snowPurity = clamp01(wSnow * C.SNOW_ALBEDO_PURITY + stormSnow * (1 - C.SNOW_ALBEDO_PURITY));
    midR = lerp(midR, snowColor[0] * heightShade, snowPurity);
    midG = lerp(midG, snowColor[1] * heightShade, snowPurity);
    midB = lerp(midB, snowColor[2] * heightShade, snowPurity);

    const alpine = craggyFlags[id] ? 1 : smoothstep(C.ALPINE_ROCK_HEIGHT, C.ALPINE_ROCK_HEIGHT + 200, height);
    const rockPurity = clamp01(wRock * alpine * C.ALPINE_ROCK_PURITY);
    midR = lerp(midR, rockColor[0] * heightShade, rockPurity);
    midG = lerp(midG, rockColor[1] * heightShade, rockPurity);
    midB = lerp(midB, rockColor[2] * heightShade, rockPurity);

    const nearMaterialBlend = transitionsEnabled
      ? Math.max(nearMaterialBlendBase, clamp01(wRock + wSnow + stormSnow + shoreline * 0.5))
      : nearMaterialBlendBase;

    out.r = clamp01(lerp(nearR, midR, nearMaterialBlend));
    out.g = clamp01(lerp(nearG, midG, nearMaterialBlend));
    out.b = clamp01(lerp(nearB, midB, nearMaterialBlend));

    // 5. Exact material roughness (`TerrainMaterialBakedNodes.js:87-94, 208-218`).
    if (profiles) {
      const dryR = wGrass * profiles.grass.roughness
        + wDirt * profiles.dirt.roughness
        + wRock * profiles.rock.roughness
        + wSnow * profiles.snow.roughness;
      const wetR = wGrass * profiles.grass.wetRoughness
        + wDirt * profiles.dirt.wetRoughness
        + wRock * profiles.rock.wetRoughness
        + wSnow * profiles.snow.wetRoughness;
      let rough = lerp(dryR, wetR, wetness);
      if (substrates) {
        const dirtBaseR = lerp(profiles.dirt.roughness, profiles.dirt.wetRoughness, wetness);
        rough += wDirt * (substrateScratch.roughness - dirtBaseR);
      }
      out.roughness = clamp01(rough + genomeRoughOffset + weatherRoughOffset + wnRoughOffset);
    } else {
      out.roughness = clamp01(fallbackRoughness);
    }
    return out;
  }

  return Object.freeze({ evaluate, hasMeadowPalette: Boolean(meadowPalette) });
}
