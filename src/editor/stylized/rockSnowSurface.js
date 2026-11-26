import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  cameraViewMatrix,
  color,
  dFdx,
  dFdy,
  float,
  mix,
  normalize,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { resolveAssetUrl } from '../assets/assetUrl.js';
import { repeatMipTextureLoad } from './RepeatMipTextureLoad.js';
import { worldNoiseField } from './worldNoise.js';
import { WORLD_NOISE_LAYERS } from './worldNoiseLayout.js';

/**
 * Fractured, stratified cold alpine rock surface shared by snow-country boulders
 * (`rockWeathering.js`) and alpine crags (`AlpineRockMaterial.js`).
 *
 * Uses the already-shipped `basalt` 1K PBR scan (`color`, `normal`, `rough`) via
 * sampler-free `repeatMipTextureLoad` so neither scattered boulders nor crags
 * spend additional WebGPU sampler bindings, and textures load lazily on demand
 * rather than at startup.
 */
const FILES = Object.freeze({
  color: 'assets/textures/locations/basalt-color.webp',
  normal: 'assets/textures/locations/basalt-normal.webp',
  rough: 'assets/textures/locations/basalt-rough.webp',
});

/** World-space repeat period (metres) for stratified fractured stone planes. */
const STONE_METERS = 3.2;
/** Macro geological variation period (metres), breaks up tiling across big outcrops. */
const MACRO_METERS = 12;
/** Cool weathered alpine granite/slate grade lifting dark basalt into crisp snow-country contrast. */
const STONE_TINT = '#a4b0be';
const STONE_GAIN = 2.35;
const FALLBACK_STONE = '#5c646e';
/** Wind-packed frost rime tint caught only on upward-facing fractured strata micro-ledges. */
const RIME_COLOR = '#dfe9f4';
const NORMAL_STRENGTH = 1.25;
const TRIPLANAR_THRESHOLD = 0.03;

let shared = null;

/**
 * Lazily loads the fractured cold-stone PBR maps without consuming WebGPU
 * samplers (`NearestFilter` + mipmaps for `repeatMipTextureLoad`). Returns
 * `null` in CPU-only Node environments with no image decoder.
 */
export function acquireColdStoneTextures({ loader, baseUrl = import.meta.env?.BASE_URL ?? '/' } = {}) {
  if (!loader && !shared && typeof document === 'undefined') return null;
  if (!shared) {
    const entry = { textures: {}, ready: uniform(0), failed: false };
    let pending = Object.keys(FILES).length;
    const imageLoader = loader ?? new THREE.TextureLoader();
    for (const [kind, file] of Object.entries(FILES)) {
      const map = imageLoader.load(
        resolveAssetUrl(baseUrl, file),
        () => {
          pending -= 1;
          if (!entry.failed && pending === 0) entry.ready.value = 1;
        },
        undefined,
        () => {
          entry.failed = true;
          entry.ready.value = 0;
        },
      );
      map.name = `Cold alpine rock ${kind}`;
      map.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      map.generateMipmaps = true;
      map.anisotropy = 1;
      entry.textures[kind] = map;
    }
    shared = entry;
  }
  return { ...shared.textures, ready: shared.ready };
}

/**
 * Full cold alpine stone PBR evaluation (albedo, roughness, view-space normal,
 * and normal-mapped upward ledge factor for natural snow & frost rime capture).
 *
 * Uses triplanar sampling of both `basalt` PBR maps and `meso` geological fBm
 * (never `micro.g` pits or skewed 2D projections), keeping dark rock crevices
 * crisp while dusting wind-packed frost rime onto upward-facing strata lips.
 *
 * @param {object} options
 * @param {object} options.point world-metre position node (vec3)
 * @param {object} options.normal world-space unit normal node (vec3)
 * @param {object} options.baseNormal view-space unit normal to perturb (vec3)
 * @param {object} [options.detailFade] 0..1 distance fade for normal micro-relief
 * @param {object} [options.rimeAmount] 0..1 cold frost-rime strength on micro-ledges
 * @param {object|null} [options.gate] optional boolean node gating texture fetches
 * @returns {{ color: object, roughness: object, normal: object, perturbedUp: object }}
 */
export function coldStoneSurface({
  point,
  normal,
  baseNormal,
  detailFade = float(1),
  rimeAmount = float(0.45),
  gate = null,
}) {
  const n = normalize(normal).toVar();
  const blend = abs(n).pow(vec3(5)).toVar();
  const weights = blend.div(blend.x.add(blend.y).add(blend.z).max(1e-5)).toVar();

  // Triplanar geological fBm (`meso`: R = fine fBm, G = smooth mottle — zero circular pits).
  const meso = worldNoiseField(WORLD_NOISE_LAYERS.meso);
  const macroScale = float(1 / MACRO_METERS);
  const macroNoise = meso(vec2(point.z, point.y).mul(macroScale)).mul(weights.x)
    .add(meso(vec2(point.x, point.z).mul(macroScale)).mul(weights.y))
    .add(meso(vec2(point.x, point.y).mul(macroScale)).mul(weights.z))
    .toVar();
  const macroTone = mix(float(0.82), float(1.18), macroNoise.r);
  const strataWarp = macroNoise.g.sub(0.5).mul(0.45);
  const warpedY = point.y.add(strataWarp);

  const maps = acquireColdStoneTextures();
  if (!maps) {
    const fallback = color(FALLBACK_STONE).mul(macroTone);
    return {
      color: fallback,
      roughness: mix(float(0.76), float(0.92), macroNoise.g),
      normal: baseNormal,
      perturbedUp: n.y,
    };
  }

  // Screen derivatives must stay in uniform control flow outside every `If`.
  const scale = float(1 / STONE_METERS);
  const uvX = vec2(point.z, warpedY).mul(scale).toVar();
  const uvY = vec2(point.x, point.z).mul(scale).toVar();
  const uvZ = vec2(point.x, warpedY).mul(scale).toVar();
  const dxX = dFdx(uvX).toVar(), dyX = dFdy(uvX).toVar();
  const dxY = dFdx(uvY).toVar(), dyY = dFdy(uvY).toVar();
  const dxZ = dFdx(uvZ).toVar(), dyZ = dFdy(uvZ).toVar();

  const sampledColorRough = Fn(() => {
    const colSum = vec3(0).toVar();
    const roughSum = float(0.84).toVar();

    const runSamples = () => {
      colSum.assign(vec3(0));
      roughSum.assign(float(0));

      If(weights.x.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const c = repeatMipTextureLoad(maps.color, uvX, dxX, dyX).rgb;
        const r = repeatMipTextureLoad(maps.rough, uvX, dxX, dyX).g;
        colSum.addAssign(c.mul(weights.x));
        roughSum.addAssign(r.mul(weights.x));
      });
      If(weights.y.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const c = repeatMipTextureLoad(maps.color, uvY, dxY, dyY).rgb;
        const r = repeatMipTextureLoad(maps.rough, uvY, dxY, dyY).g;
        colSum.addAssign(c.mul(weights.y));
        roughSum.addAssign(r.mul(weights.y));
      });
      If(weights.z.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const c = repeatMipTextureLoad(maps.color, uvZ, dxZ, dyZ).rgb;
        const r = repeatMipTextureLoad(maps.rough, uvZ, dxZ, dyZ).g;
        colSum.addAssign(c.mul(weights.z));
        roughSum.addAssign(r.mul(weights.z));
      });
    };

    if (gate) {
      If(gate, runSamples);
    } else {
      runSamples();
    }
    return vec4(colSum, roughSum);
  })();

  const sampledWorldNormal = Fn(() => {
    const worldNormalSum = vec3(n).toVar();

    const runNormalSamples = () => {
      worldNormalSum.assign(vec3(0));

      If(weights.x.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const t = repeatMipTextureLoad(maps.normal, uvX, dxX, dyX).xyz.mul(2).sub(1);
        worldNormalSum.addAssign(vec3(n.x, n.y.add(t.y), n.z.add(t.x)).mul(weights.x));
      });
      If(weights.y.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const t = repeatMipTextureLoad(maps.normal, uvY, dxY, dyY).xyz.mul(2).sub(1);
        worldNormalSum.addAssign(vec3(n.x.add(t.x), n.y, n.z.add(t.y)).mul(weights.y));
      });
      If(weights.z.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const t = repeatMipTextureLoad(maps.normal, uvZ, dxZ, dyZ).xyz.mul(2).sub(1);
        worldNormalSum.addAssign(vec3(n.x.add(t.x), n.y.add(t.y), n.z).mul(weights.z));
      });
    };

    if (gate) {
      If(gate, runNormalSamples);
    } else {
      runNormalSamples();
    }
    return normalize(worldNormalSum.add(n.mul(1e-4)));
  })();

  const ready = maps.ready;
  const fallbackAlbedo = color(FALLBACK_STONE).mul(macroTone);
  // Lift dark basalt scan into legible cool alpine granite/slate while preserving deep crack contrast.
  const scannedAlbedo = sampledColorRough.rgb.max(vec3(0.002)).pow(vec3(0.78))
    .mul(color(STONE_TINT))
    .mul(STONE_GAIN)
    .mul(macroTone);
  const stoneAlbedo = mix(fallbackAlbedo, scannedAlbedo, ready).toVar();

  const normalWeight = float(NORMAL_STRENGTH).mul(detailFade).mul(ready);
  const deltaWorld = sampledWorldNormal.sub(n).mul(normalWeight);
  const perturbedWorld = normalize(n.add(deltaWorld)).toVar();
  const deltaView = cameraViewMatrix.mul(vec4(deltaWorld, 0)).xyz;
  const perturbedViewNormal = normalize(baseNormal.add(deltaView));

  // Delicate frost rime catches only on true upward-facing fractured strata micro-ledges,
  // leaving vertical faces and deep fractures dark, craggy and high-contrast.
  const ledgeLip = smoothstep(0.46, 0.84, perturbedWorld.y);
  const rimeBreakup = smoothstep(0.25, 0.78, macroNoise.g);
  const rimeMask = ledgeLip.mul(rimeBreakup).mul(rimeAmount).clamp(0, 0.42);
  const finalAlbedo = mix(stoneAlbedo, color(RIME_COLOR), rimeMask);

  // Mineral cleavage faces glint subtly in cold air; fracture seams & frost stay matte.
  const stoneRough = mix(float(0.60), float(0.95), sampledColorRough.a.clamp(0, 1));
  const baseRough = mix(float(0.84), stoneRough, ready);
  const finalRoughness = mix(baseRough, float(0.92), rimeMask.mul(0.7));

  return {
    color: finalAlbedo,
    roughness: finalRoughness,
    normal: perturbedViewNormal,
    perturbedUp: perturbedWorld.y,
  };
}

/** Triplanar cold alpine stone albedo at world point `p` (metres) with world normal `n`. */
export function coldStone(p, n) {
  return coldStoneSurface({ point: p, normal: n, baseNormal: vec3(0, 0, 1), detailFade: float(0) }).color;
}
