import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  cameraViewMatrix,
  color,
  dFdx,
  dFdy,
  dot,
  float,
  mix,
  normalize,
  select,
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
/** Fine close-range crystalline / chipped micro-normal period (metres). */
const MICRO_STONE_METERS = 1.15;
/** Macro geological variation period (metres), smooth Perlin breaks up tiling across big outcrops. */
const MACRO_METERS = 24;
/** Cool weathered alpine granite/slate grade lifting dark basalt into crisp snow-country contrast. */
const STONE_TINT = '#a4b0be';
/** Subtle mineral hue shifts (iron-rich dark slate vs pale quartz/feldspar bands). */
const MINERAL_COOL = '#8693a3';
const MINERAL_WARM = '#b0aaa0';
const STONE_GAIN = 2.35;
const FALLBACK_STONE = '#5c646e';
/** Wind-packed frost rime tint caught only on upward-facing fractured strata micro-ledges. */
const RIME_COLOR = '#dfe9f4';
const NORMAL_STRENGTH = 1.15;
const MICRO_NORMAL_STRENGTH = 0.42;
const TRIPLANAR_THRESHOLD = 0.03;
const BASALT_MEAN = 0.025;
const LUMA_WEIGHTS = vec3(0.3, 0.55, 0.15);

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
  tint = null,
  gate = null,
}) {
  const n = normalize(normal).toVar();
  const blend = abs(n).pow(vec3(5)).toVar();
  const weights = blend.div(blend.x.add(blend.y).add(blend.z).max(1e-5)).toVar();
  const signX = select(n.x.greaterThanEqual(0), float(1), float(-1));
  const signY = select(n.y.greaterThanEqual(0), float(1), float(-1));
  const signZ = select(n.z.greaterThanEqual(0), float(1), float(-1));

  // Smooth triplanar Perlin (`macro`: R/G/B are pure Perlin octaves — NEVER swirly `meso.g`
  // `super-noise-09`, whose steep ridges folded `warpedY` into closed marble rings).
  const macro = worldNoiseField(WORLD_NOISE_LAYERS.macro);
  const macroScale = float(1 / MACRO_METERS);
  const macroNoise = macro(vec2(point.z, point.y).mul(macroScale)).mul(weights.x)
    .add(macro(vec2(point.x, point.z).mul(macroScale)).mul(weights.y))
    .add(macro(vec2(point.x, point.y).mul(macroScale)).mul(weights.z))
    .toVar();
  const macroTone = mix(float(0.84), float(1.16), macroNoise.r);
  // Subtle mineral colour variation: cool blue-slate iron patches vs faint warm quartz/feldspar veins.
  const mineralTint = mix(color(MINERAL_COOL), color(MINERAL_WARM), macroNoise.b.smoothstep(0.22, 0.78));
  // Gentle directional geological bedding dip + smooth monotonic undulation (|d/dy| < 0.03: zero folding).
  const beddingDip = point.x.mul(0.09).add(point.z.mul(-0.06));
  const strataUndulation = macroNoise.g.sub(0.5).mul(0.24);
  const bedY = point.y.add(beddingDip).add(strataUndulation);

  const maps = acquireColdStoneTextures();
  if (!maps) {
    const fallback = color(FALLBACK_STONE).mul(mineralTint).mul(macroTone);
    return {
      color: fallback,
      roughness: mix(float(0.84), float(0.96), macroNoise.g),
      normal: baseNormal,
      perturbedUp: n.y,
      crevice: float(0),
      height: float(0.5),
    };
  }

  // Screen derivatives must stay in uniform control flow outside every `If`.
  // Compute derivatives from the unwarped linear projection so mip selection stays razor sharp.
  const scale = float(1 / STONE_METERS);
  const linX = vec2(point.z, point.y.add(beddingDip)).mul(scale);
  const linY = vec2(point.x, point.z).mul(scale);
  const linZ = vec2(point.x, point.y.add(beddingDip)).mul(scale);
  const uvX = vec2(point.z, bedY).mul(scale).toVar();
  const uvY = linY.toVar();
  const uvZ = vec2(point.x, bedY).mul(scale).toVar();
  const dxX = dFdx(linX).toVar(), dyX = dFdy(linX).toVar();
  const dxY = dFdx(linY).toVar(), dyY = dFdy(linY).toVar();
  const dxZ = dFdx(linZ).toVar(), dyZ = dFdy(linZ).toVar();

  // Dominant-axis close-range micro-normal coordinates (1 tap, zero extra WebGPU samplers).
  const microScale = float(1 / MICRO_STONE_METERS);
  const topAxis = abs(n.y).greaterThan(0.58);
  const xAxis = abs(n.x).greaterThan(abs(n.z));
  const microUv = select(
    topAxis,
    vec2(point.x, point.z),
    select(xAxis, vec2(point.z, bedY), vec2(point.x, bedY)),
  ).mul(microScale).toVar();
  const microDx = select(topAxis, linY.dFdx(), select(xAxis, linX.dFdx(), linZ.dFdx()))
    .mul(STONE_METERS / MICRO_STONE_METERS).toVar();
  const microDy = select(topAxis, linY.dFdy(), select(xAxis, linX.dFdy(), linZ.dFdy()))
    .mul(STONE_METERS / MICRO_STONE_METERS).toVar();

  const sampledColorRough = Fn(() => {
    const colSum = vec3(0).toVar();
    const roughSum = float(0.88).toVar();

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

      // Sign-aware Whiteout triplanar normal blend so -X/-Y/-Z faces orient fracture bevels properly.
      If(weights.x.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const t = repeatMipTextureLoad(maps.normal, uvX, dxX, dyX).xyz.mul(2).sub(1);
        worldNormalSum.addAssign(
          vec3(n.x.abs().mul(t.z).mul(signX), n.y.add(t.y), n.z.add(t.x.mul(signX))).mul(weights.x),
        );
      });
      If(weights.y.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const t = repeatMipTextureLoad(maps.normal, uvY, dxY, dyY).xyz.mul(2).sub(1);
        worldNormalSum.addAssign(
          vec3(n.x.add(t.x), n.y.abs().mul(t.z).mul(signY), n.z.add(t.y)).mul(weights.y),
        );
      });
      If(weights.z.greaterThan(TRIPLANAR_THRESHOLD), () => {
        const t = repeatMipTextureLoad(maps.normal, uvZ, dxZ, dyZ).xyz.mul(2).sub(1);
        worldNormalSum.addAssign(
          vec3(n.x.add(t.x.mul(signZ)), n.y.add(t.y), n.z.abs().mul(t.z).mul(signZ)).mul(weights.z),
        );
      });

      // Close-range micro-normal grain (1 dominant-axis tap, skipped past detailFade).
      If(detailFade.greaterThan(0.05), () => {
        const mt = repeatMipTextureLoad(maps.normal, microUv, microDx, microDy).xyz.mul(2).sub(1);
        const microDelta = select(
          topAxis,
          vec3(mt.x, float(0), mt.y),
          select(xAxis, vec3(float(0), mt.y, mt.x.mul(signX)), vec3(mt.x.mul(signZ), mt.y, float(0))),
        );
        worldNormalSum.addAssign(microDelta.mul(MICRO_NORMAL_STRENGTH).mul(detailFade));
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
  const stoneTint = tint ?? color(STONE_TINT);
  const fallbackAlbedo = color(FALLBACK_STONE).mul(mineralTint).mul(macroTone);
  // Normalized rock relief height & fracture crevice mask derived from the basalt scan.
  const scanLuma = dot(sampledColorRough.rgb, LUMA_WEIGHTS).max(0.001).div(BASALT_MEAN).pow(0.6).clamp(0.15, 1.85);
  const surfaceHeight = scanLuma.sub(0.25).div(1.25).clamp(0, 1).toVar();
  const crevice = surfaceHeight.smoothstep(0.55, 0.08).mul(ready).toVar();

  // Lift dark basalt scan into legible matte alpine granite/slate with subtle mineral colour shifts.
  const scannedAlbedo = sampledColorRough.rgb.max(vec3(0.002)).pow(vec3(0.78))
    .mul(stoneTint)
    .mul(mix(vec3(1), mineralTint.mul(1.08), 0.45))
    .mul(STONE_GAIN)
    .mul(macroTone);
  const stoneAlbedo = mix(fallbackAlbedo, scannedAlbedo, ready).toVar();

  const normalWeight = float(NORMAL_STRENGTH).mul(detailFade).mul(ready);
  const deltaWorld = sampledWorldNormal.sub(n).mul(normalWeight);
  const perturbedWorld = normalize(n.add(deltaWorld)).toVar();
  const deltaView = cameraViewMatrix.mul(vec4(deltaWorld, 0)).xyz;
  const perturbedViewNormal = normalize(baseNormal.add(deltaView));

  // Delicate frost rime catches only on upward-facing fractured strata micro-ledges & seams,
  // leaving exposed vertical rock faces dark, matte, craggy and high-contrast.
  const ledgeLip = smoothstep(0.48, 0.84, perturbedWorld.y);
  const seamShelf = crevice.mul(smoothstep(0.15, 0.65, perturbedWorld.y)).mul(0.55);
  const rimeBreakup = smoothstep(0.22, 0.78, macroNoise.b);
  const rimeMask = ledgeLip.add(seamShelf).clamp(0, 1).mul(rimeBreakup).mul(rimeAmount).clamp(0, 0.44);
  const finalAlbedo = mix(stoneAlbedo, color(RIME_COLOR), rimeMask);

  // Natural mountain rock stays matte (0.82..0.97) — zero oily/polished marble glare.
  const stoneRough = mix(float(0.82), float(0.97), sampledColorRough.a.clamp(0, 1));
  const baseRough = mix(float(0.88), stoneRough, ready);
  const finalRoughness = mix(baseRough, float(0.94), rimeMask.mul(0.75).max(crevice.mul(0.35)));

  return {
    color: finalAlbedo,
    roughness: finalRoughness,
    normal: perturbedViewNormal,
    perturbedUp: perturbedWorld.y,
    crevice,
    height: surfaceHeight,
  };
}

/** Triplanar cold alpine stone albedo at world point `p` (metres) with world normal `n`. */
export function coldStone(p, n) {
  return coldStoneSurface({ point: p, normal: n, baseNormal: vec3(0, 0, 1), detailFade: float(0) }).color;
}

/**
 * Lightweight fractured stone relief (albedo crevice contrast, normal & roughness)
 * for non-snow painted boulders and 4.5–8.5x rock formations across all biomes.
 *
 * Uses dominant-axis sampler-free `repeatMipTextureLoad` (3 taps total, zero
 * extra WebGPU samplers) and skips every fetch outside `gate`. Normalizes
 * basalt fracture luminance to mean ~1.0 so every biome keeps its exact palette
 * while gaining crisp fractured rock crevices and strata relief even in shadow.
 */
export function rockFractureDetail({
  point,
  normal,
  baseNormal,
  strength = float(0.82),
  gate = null,
}) {
  const maps = acquireColdStoneTextures();
  if (!maps) return { normal: baseNormal, roughnessDelta: float(0), albedoFactor: float(1) };

  const n = normalize(normal).toVar();
  const q = point.div(STONE_METERS);
  const top = abs(n.y).greaterThan(0.58);
  const xSide = abs(n.x).greaterThan(abs(n.z));
  const uv = select(top, q.xz, select(xSide, q.zy, q.xy)).toVar();
  // Continuous derivatives per axis before the branch prevent mip seams on bevels.
  const dx = select(top, q.xz.dFdx(), select(xSide, q.zy.dFdx(), q.xy.dFdx())).toVar();
  const dy = select(top, q.xz.dFdy(), select(xSide, q.zy.dFdy(), q.xy.dFdy())).toVar();

  const sampled = Fn(() => {
    // xy = tangent normal xy, z = normalized crevice luma, w = roughness
    const out = vec4(0, 0, 1, 0.75).toVar();
    const run = () => {
      const c = repeatMipTextureLoad(maps.color, uv, dx, dy).rgb;
      const t = repeatMipTextureLoad(maps.normal, uv, dx, dy).xyz.mul(2).sub(1);
      const r = repeatMipTextureLoad(maps.rough, uv, dx, dy).g;
      const luma = dot(c, LUMA_WEIGHTS).max(0.001).div(BASALT_MEAN).pow(0.55).clamp(0.45, 1.42);
      out.assign(vec4(t.x, t.y, luma, r));
    };
    if (gate) If(gate, run);
    else run();
    return out;
  })();

  const ready = maps.ready;
  const signX = select(n.x.greaterThanEqual(0), float(1), float(-1));
  const signZ = select(n.z.greaterThanEqual(0), float(1), float(-1));
  const worldN = select(
    top,
    vec3(n.x.add(sampled.x), n.y, n.z.add(sampled.y)),
    select(
      xSide,
      vec3(n.x, n.y.add(sampled.y), n.z.add(sampled.x.mul(signX))),
      vec3(n.x.add(sampled.x.mul(signZ)), n.y.add(sampled.y), n.z),
    ),
  );
  const deltaWorld = normalize(worldN.add(n.mul(1e-4))).sub(n).mul(strength).mul(ready);
  const deltaView = cameraViewMatrix.mul(vec4(deltaWorld, 0)).xyz;
  const albedoFactor = mix(float(1), sampled.z, strength.clamp(0, 1).mul(0.72).mul(ready));
  return {
    normal: normalize(baseNormal.add(deltaView)),
    roughnessDelta: sampled.w.sub(0.75).mul(0.32).mul(strength).mul(ready),
    albedoFactor,
  };
}
