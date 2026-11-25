import * as THREE from 'three/webgpu';
import {
  float,
  max,
  oneMinus,
  select,
  smoothstep,
  sqrt,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { bilinearTexels } from '../../materials/TerrainSlotBindings.js';
import { frameUniform } from '../../../render/FrameUniforms.js';

/**
 * World Surface Context (WSC) — PR 1 canonical GPU state & sampling contract.
 *
 * Evolves the camera-centred ground-contact window (`1 m` texels over `128 m`)
 * into three cleanly separated, linear-space surface fields with explicit
 * per-texel validity and zero WebGPU sampler bindings (`bilinearTexels` uses
 * `textureLoad`):
 *
 * - `wscGeoTexture` (`RGBA16F`, `NoColorSpace`):
 *   R = height - baseHeight (m), G = terrain normal X, B = terrain normal Z,
 *   A = per-texel validity (`1.0` resident finite terrain, `0.0` missing/unloaded).
 * - `wscBaseTexture` (`RGBA8`, `NoColorSpace`):
 *   RGB = sqrt(linear low-frequency surface albedo), A = surface roughness (`0..1`).
 * - `wscEcoTexture` (`RGBA8`, `NoColorSpace`):
 *   R = contact occlusion (`0..1`), G = canopy coverage (`0..1`),
 *   B = forest litter (`0..1`), A = vegetation coverage (`0..1`).
 */
export const WSC_RESOLUTION = 128;
export const WSC_SPAN_M = 128;
export const WSC_BORDER_FADE_M = 12;
export const WSC_DEFAULT_ROUGHNESS_BYTE = 230; // ~0.90 matte natural ground
const MIN_TEXEL_WEIGHT = 1e-6;
const EMPTY_ROUGHNESS = 0.9;

function createWscTexture(data, name, type) {
  const tex = new THREE.DataTexture(data, WSC_RESOLUTION, WSC_RESOLUTION, THREE.RGBAFormat, type);
  tex.name = name;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const texelCount = WSC_RESOLUTION * WSC_RESOLUTION * 4;
const geoPixels = new Uint16Array(texelCount);
const basePixels = new Uint8Array(texelCount);
const ecoPixels = new Uint8Array(texelCount);

export const wscGeoTexture = createWscTexture(geoPixels, 'wsc-surface-geo', THREE.HalfFloatType);
export const wscBaseTexture = createWscTexture(basePixels, 'wsc-surface-base', THREE.UnsignedByteType);
export const wscEcoTexture = createWscTexture(ecoPixels, 'wsc-surface-eco', THREE.UnsignedByteType);

export const wscUniforms = Object.freeze({
  /** Render-space minimum (x, z) corner of the WSC window. */
  renderOrigin: frameUniform(new THREE.Vector2()),
  /** Canonical minimum (x, z) corner (snapped to whole texels). */
  canonicalOrigin: frameUniform(new THREE.Vector2()),
  inverseSpan: frameUniform(1 / WSC_SPAN_M),
  fadeFraction: frameUniform(WSC_BORDER_FADE_M / WSC_SPAN_M),
  baseHeight: frameUniform(0),
  /** 0 until at least one overlapping terrain slot is resident. */
  active: frameUniform(0),
});

export function clearWorldSurfaceContext() {
  wscGeoTexture.image.data.fill(0);
  wscBaseTexture.image.data.fill(0);
  wscEcoTexture.image.data.fill(0);
  wscGeoTexture.needsUpdate = true;
  wscBaseTexture.needsUpdate = true;
  wscEcoTexture.needsUpdate = true;
  wscUniforms.baseHeight.value = 0;
  wscUniforms.active.value = 0;
}

function reconstructNormal(nx, nz, weight) {
  const bx = nx.mul(weight);
  const bz = nz.mul(weight);
  const ny = sqrt(max(float(0.01), float(1).sub(bx.mul(bx)).sub(bz.mul(bz))));
  return vec3(bx, ny, bz).normalize();
}

function computeWindowMask(uv) {
  const fade = wscUniforms.fadeFraction;
  return smoothstep(0, fade, uv.x)
    .mul(smoothstep(0, fade, uv.y))
    .mul(oneMinus(smoothstep(oneMinus(fade), 1, uv.x)))
    .mul(oneMinus(smoothstep(oneMinus(fade), 1, uv.y)))
    .mul(wscUniforms.active);
}

/**
 * Samples the World Surface Context at an XZ coordinate (vertex or fragment).
 *
 * Uses validity-weighted bilinear `textureLoad` (`bilinearTexels`) so:
 * - zero WebGPU samplers are consumed;
 * - invalid/unloaded texels (`geo.a == 0`) never pull heights toward `0` or
 *   bleed placeholder colors across streaming edges;
 * - `validity` (and backwards-compatible `inside`) smoothly drop to `0` over
 *   unloaded chunks or outside the active window.
 *
 * @param {object} xzNode TSL `vec2` in render space (default) or canonical metres
 * @param {{ canonical?: boolean, includeBase?: boolean, includeEco?: boolean }} [options]
 */
export function sampleWorldSurfaceContextAt(
  xzNode,
  { canonical = false, includeBase = true, includeEco = true } = {},
) {
  const origin = canonical ? wscUniforms.canonicalOrigin : wscUniforms.renderOrigin;
  const uv = xzNode.sub(origin).mul(wscUniforms.inverseSpan);
  const windowInside = computeWindowMask(uv);
  const clampedUv = uv.clamp(vec2(0), vec2(1));

  const { texels: geoTexels, blend: blendGeo } = bilinearTexels(wscGeoTexture, clampedUv);
  const weights = geoTexels.map((t) => t.w.clamp(0, 1));
  const texelValidity = blendGeo(weights).clamp(0, 1);
  const safeWeight = max(texelValidity, float(MIN_TEXEL_WEIGHT));

  const relHeight = blendGeo(geoTexels.map((t, i) => t.r.mul(weights[i]))).div(safeWeight);
  const rawNx = blendGeo(geoTexels.map((t, i) => t.g.mul(weights[i]))).div(safeWeight);
  const rawNz = blendGeo(geoTexels.map((t, i) => t.b.mul(weights[i]))).div(safeWeight);

  const validity = texelValidity.mul(windowInside).clamp(0, 1);
  const height = relHeight.add(wscUniforms.baseHeight);
  const normal = reconstructNormal(rawNx, rawNz, validity);

  let albedo = vec3(0);
  let roughness = float(EMPTY_ROUGHNESS);
  if (includeBase) {
    const { texels: baseTexels, blend: blendBase } = bilinearTexels(wscBaseTexture, clampedUv);
    albedo = blendBase(baseTexels.map((t, i) => t.rgb.mul(t.rgb).mul(weights[i]))).div(safeWeight);
    const baseRoughness = blendBase(baseTexels.map((t, i) => t.a.mul(weights[i]))).div(safeWeight).clamp(0, 1);
    roughness = select(texelValidity.greaterThan(0), baseRoughness, roughness);
  }

  let contact = float(0);
  let canopy = float(0);
  let litter = float(0);
  let vegetationCoverage = float(0);
  if (includeEco) {
    const { texels: ecoTexels, blend: blendEco } = bilinearTexels(wscEcoTexture, clampedUv);
    const eco = blendEco(ecoTexels.map((t, i) => t.mul(weights[i]))).div(safeWeight).clamp(0, 1);
    contact = eco.r.mul(validity);
    canopy = eco.g.mul(validity);
    litter = eco.b.mul(validity);
    vegetationCoverage = eco.a.mul(validity);
  }

  return {
    height,
    normal,
    validity,
    inside: validity,
    windowInside,
    texelValidity,
    albedo,
    soilColor: albedo,
    roughness,
    contact,
    canopy,
    litter,
    vegetationCoverage,
  };
}

/**
 * Evaluates the World Surface Context in the vertex stage and forwards three
 * compact varyings (`vGeo`, `vBase`, `vEco`) to fragments (zero fragment loads).
 *
 * @param {object} xzNode TSL `vec2` (typically `positionWorld.xz`)
 * @param {string} prefix unique varying prefix per material family
 * @param {{ canonical?: boolean }} [options]
 */
export function sampleWorldSurfaceContextVarying(xzNode, prefix, options = {}) {
  const raw = sampleWorldSurfaceContextAt(xzNode, options);
  const vGeo = varying(vec4(raw.height, raw.normal.x, raw.normal.z, raw.validity), `${prefix}WscGeo`);
  const vBase = varying(vec4(raw.albedo, raw.roughness), `${prefix}WscBase`);
  const vEco = varying(vec4(raw.contact, raw.canopy, raw.litter, raw.vegetationCoverage), `${prefix}WscEco`);
  const validity = vGeo.w.clamp(0, 1);
  return {
    height: vGeo.x,
    normal: reconstructNormal(vGeo.y, vGeo.z, float(1)),
    validity,
    inside: validity,
    albedo: vBase.xyz,
    soilColor: vBase.xyz,
    roughness: vBase.w.clamp(0, 1),
    contact: vEco.x.clamp(0, 1),
    canopy: vEco.y.clamp(0, 1),
    litter: vEco.z.clamp(0, 1),
    vegetationCoverage: vEco.w.clamp(0, 1),
  };
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function smoothstepCpu(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Pure CPU mirror of `sampleWorldSurfaceContextAt` using identical validity-weighted
 * bilinear math for deterministic unit tests, QA inspection, and CPU placement.
 *
 * @param {number} x canonical X (default) or render X when `canonical: false`
 * @param {number} z canonical Z (default) or render Z when `canonical: false`
 * @param {{ canonical?: boolean, resolution?: number }} [options]
 */
export function sampleWorldSurfaceContextCpu(x, z, { canonical = true, resolution = WSC_RESOLUTION } = {}) {
  if (resolution !== WSC_RESOLUTION) throw new RangeError(`World Surface Context resolution must be ${WSC_RESOLUTION}.`);
  const active = wscUniforms.active.value;
  const origin = canonical ? wscUniforms.canonicalOrigin.value : wscUniforms.renderOrigin.value;
  const invSpan = wscUniforms.inverseSpan.value;
  const fade = wscUniforms.fadeFraction.value;
  const baseHeight = wscUniforms.baseHeight.value;
  const u = (x - origin.x) * invSpan;
  const v = (z - origin.y) * invSpan;

  const windowInside = active > 0
    ? smoothstepCpu(0, fade, u)
      * smoothstepCpu(0, fade, v)
      * (1 - smoothstepCpu(1 - fade, 1, u))
      * (1 - smoothstepCpu(1 - fade, 1, v))
      * active
    : 0;

  const cu = clamp01(u);
  const cv = clamp01(v);
  const tx = cu * resolution - 0.5;
  const tz = cv * resolution - 0.5;
  const bx = Math.floor(tx);
  const bz = Math.floor(tz);
  const fx = tx - bx;
  const fz = tz - bz;
  const maxIdx = resolution - 1;

  const geo = wscGeoTexture.image.data;
  const base = wscBaseTexture.image.data;
  const eco = wscEcoTexture.image.data;
  const fromHalf = THREE.DataUtils.fromHalfFloat;

  const corners = [
    [bx, bz, (1 - fx) * (1 - fz)],
    [bx + 1, bz, fx * (1 - fz)],
    [bx, bz + 1, (1 - fx) * fz],
    [bx + 1, bz + 1, fx * fz],
  ];

  let texelValidity = 0;
  let relH = 0;
  let nx = 0;
  let nz = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let roughness = 0;
  let contact = 0;
  let canopy = 0;
  let litter = 0;
  let vegetationCoverage = 0;

  for (let i = 0; i < 4; i += 1) {
    const ix = Math.max(0, Math.min(maxIdx, corners[i][0]));
    const iz = Math.max(0, Math.min(maxIdx, corners[i][1]));
    const bw = corners[i][2];
    const o = (iz * resolution + ix) * 4;
    const tv = clamp01(fromHalf(geo[o + 3]));
    const w = bw * tv;
    texelValidity += w;
    if (w <= 0) continue;
    relH += fromHalf(geo[o]) * w;
    nx += fromHalf(geo[o + 1]) * w;
    nz += fromHalf(geo[o + 2]) * w;
    const br = base[o] / 255;
    const bg = base[o + 1] / 255;
    const bb = base[o + 2] / 255;
    r += br * br * w;
    g += bg * bg * w;
    b += bb * bb * w;
    roughness += (base[o + 3] / 255) * w;
    contact += (eco[o] / 255) * w;
    canopy += (eco[o + 1] / 255) * w;
    litter += (eco[o + 2] / 255) * w;
    vegetationCoverage += (eco[o + 3] / 255) * w;
  }

  const validity = clamp01(texelValidity * windowInside);
  if (texelValidity <= 0) {
    return {
      active,
      u,
      v,
      windowInside,
      texelValidity: 0,
      validity: 0,
      inside: 0,
      valid: false,
      height: baseHeight,
      normal: [0, 1, 0],
      albedo: [0, 0, 0],
      roughness: EMPTY_ROUGHNESS,
      contact: 0,
      canopy: 0,
      litter: 0,
      vegetationCoverage: 0,
    };
  }

  const invW = 1 / Math.max(texelValidity, MIN_TEXEL_WEIGHT);
  const nnx = nx * invW * validity;
  const nnz = nz * invW * validity;
  const nny = Math.sqrt(Math.max(0.01, 1 - nnx * nnx - nnz * nnz));
  const normalLength = Math.hypot(nnx, nny, nnz);

  return {
    active,
    u,
    v,
    windowInside,
    texelValidity: clamp01(texelValidity),
    validity,
    inside: validity,
    valid: validity > 0,
    height: relH * invW + baseHeight,
    normal: [nnx / normalLength, nny / normalLength, nnz / normalLength],
    albedo: [r * invW, g * invW, b * invW],
    roughness: clamp01(roughness * invW),
    contact: clamp01(contact * invW) * validity,
    canopy: clamp01(canopy * invW) * validity,
    litter: clamp01(litter * invW) * validity,
    vegetationCoverage: clamp01(vegetationCoverage * invW) * validity,
  };
}
