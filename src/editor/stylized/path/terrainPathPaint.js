import {
  Fn,
  If,
  cameraPosition,
  color as colorNode,
  dFdx,
  dFdy,
  distance,
  dot,
  float,
  floor,
  fract,
  fwidth,
  int,
  mix,
  positionWorld,
  sin,
  smoothstep,
  texture,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { GROUND_LAYER_MEAN, GROUND_LAYERS } from './groundLayerIds.js';
import { WORLD_NOISE_LAYERS, WORLD_NOISE_METERS } from '../worldNoiseLayout.js';

/**
 * grass-test's path surface (`GroundMaterial`, cinematic style), on this
 * project's terrain.
 *
 * The donor paints a path from a real dirt texture set (`ground_0109`), pulled
 * 48% toward its `groundPath` tint scaled by the texture's own red; it breaks
 * the soft path mask's contour with turf fibres and a macro wave, so grass and
 * soil interpenetrate at the edge instead of meeting on a clean line; and it
 * paints the verge beside the tread as worn turf — duller, browner, broken by
 * soil patches. This is that, verbatim in its constants; what changes is only
 * where the mask comes from (the terrain's own path/road mask) and the
 * coordinates, because this map is not 960 units across:
 *
 *  - The dirt tiles a whole number of times per terrain chunk, so the texture
 *    UV is the chunk UV times an integer — exact at planet scale, where a
 *    world-space UV would have lost its low bits.
 *  - The noise runs in donor units (2.8 per metre) over chunk-local metres
 *    wrapped every `NOISE_PERIOD_METRES`, for the same reason.
 */
export const DEFAULT_PATH_PAINT = Object.freeze({
  enabled: true,
  /** The donor's `cinematic.style.groundPath`. */
  color: '#b7a476',
  /** How far the dirt is pulled toward that tint (donor 0.48). */
  tint: 0.48,
  /** Metres per repeat of the dirt texture (donor: 960 units / 70 ≈ 4.9 m). */
  repeatMeters: 4.9,
  /** Verge wear strength, 0 turns the worn verge off. */
  verge: 1,
});

const DONOR_UNITS_PER_METRE = 2.8;
const NOISE_PERIOD_METRES = 1024;
/** The donor's `ground.antiTiling`. */
const ANTI_TILING = Object.freeze({
  secondaryScale: 0.618,
  offset: [0.37, 0.61],
  blendStart: 0.18,
  blendEnd: 0.82,
  colorVariation: 0.16,
  roughnessVariation: 0.1,
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** @param {object | undefined} source `stylizedSurface.path.paint` */
export function resolvePathPaint(source) {
  if (source?.enabled === false) return null;
  const paint = { ...DEFAULT_PATH_PAINT, ...(source ?? {}) };
  if (typeof paint.color !== 'string' || !HEX_COLOR.test(paint.color)) {
    throw new Error('Invalid editor configuration: stylizedSurface.path.paint.color must be a #rrggbb colour.');
  }
  for (const [key, min, max] of [['tint', 0, 1], ['repeatMeters', 0.5, 64], ['verge', 0, 1]]) {
    if (!Number.isFinite(paint[key]) || paint[key] < min || paint[key] > max) {
      throw new Error(`Invalid editor configuration: stylizedSurface.path.paint.${key} must be in [${min}, ${max}].`);
    }
  }
  return paint;
}

function floorMod(value, period) {
  return value.sub(floor(value.div(period)).mul(period));
}

/**
 * @param {object} options
 * @param {object} options.terrainUv chunk uv
 * @param {number} options.chunkWorldSize metres
 * @param {object} options.chunkCenter vec2 uniform, canonical chunk centre
 * @param {object} options.pathMask 0..1 path/road mask (the donor's path texture R)
 * @param {object} options.verge 0..1 verge band beside the tread
 * @param {object | null} options.settings resolvePathPaint()
 * @param {{ colorRoughness: object } | null} options.textures acquireGroundLayers()
 * @param {{ layers: object, blend: object } | null} [options.floor] floor scans:
 *   layers.xy are array indices, blend moves from x to y, wet (optional) toward grit
 * @param {((layer: number) => (uv: object) => object) | null} [options.noise] the
 *   world-noise layers as the terrain reads them (its family atlas); neutral without
 * @returns {{ apply: (color: object, roughness: object) => { color: object, roughness: object } } | null}
 */
export function createTerrainPathPaint({
  terrainUv, chunkWorldSize, chunkCenter, pathMask, verge, settings, textures, floor: floorScan = null,
  noise = null,
}) {
  if (!settings || !textures) return null;
  const repeats = Math.max(1, Math.round(chunkWorldSize / settings.repeatMeters));
  const secondaryRepeats = Math.max(1, Math.round(repeats * ANTI_TILING.secondaryScale));
  const field = noise ?? (() => () => vec3(0.5));
  const local = vec2(
    floorMod(chunkCenter.x, NOISE_PERIOD_METRES).add(terrainUv.x.sub(0.5).mul(chunkWorldSize)),
    floorMod(chunkCenter.y, NOISE_PERIOD_METRES).add(terrainUv.y.oneMinus().sub(0.5).mul(chunkWorldSize)),
  );

  return {
    apply(baseColor, baseRoughness) {
      const paint = Fn(() => {
        const world = local.mul(DONOR_UNITS_PER_METRE).toVar();
        // Smooth world-space warp, a tile or so over ~15 m: the 4.9 m repeat never lines
        // up into rows along a trail. World-based, so it stays continuous across chunks.
        const warp = vec2(
          sin(world.y.mul(0.041).add(sin(world.x.mul(0.023)).mul(2.1))),
          sin(world.x.mul(0.037).add(sin(world.y.mul(0.029)).mul(1.7))),
        ).mul(0.42).toVar();
        const uvA = terrainUv.mul(repeats).add(warp).toVar();
        const uvB = terrainUv.mul(secondaryRepeats).add(vec2(...ANTI_TILING.offset)).sub(warp.mul(0.7)).toVar();
        // Everything that needs screen derivatives, before the branch.
        const gradA = [dFdx(uvA).toVar(), dFdy(uvA).toVar()];
        const gradB = [dFdx(uvB).toVar(), dFdy(uvB).toVar()];
        // The world noise in the terrain's wrapped metres: the 1024 m wrap divides
        // every layer's period, so neighbouring chunks read one field.
        const macro = field(WORLD_NOISE_LAYERS.macro)(local.div(WORLD_NOISE_METERS.macro)).toVar();
        const meso = field(WORLD_NOISE_LAYERS.meso)(local.div(WORLD_NOISE_METERS.meso)).toVar();
        const micro = field(WORLD_NOISE_LAYERS.micro)(local.div(WORLD_NOISE_METERS.micro)).toVar();
        // Texture repetition, Quilez's third variant: the meso field picks one of
        // eight random offsets of a scan per region, and crosses to the next over
        // its border, so the 4.9 m repeat never lines up into a grid.
        const variant = meso.r.mul(8).toVar();
        const offsetA = fract(sin(vec2(floor(variant).mul(3.17), floor(variant).mul(7.13))).mul(43.7)).toVar();
        const offsetB = fract(sin(vec2(floor(variant).add(1).mul(3.17), floor(variant).add(1).mul(7.13))).mul(43.7)).toVar();
        const variantBlend = fract(variant).toVar();
        // The path edge eroded by clods and pits instead of a wide airbrushed ramp:
        // its width is a pixel or two, taken here because fwidth needs uniform flow.
        const mask = pathMask.toVar();
        const edgeField = mask.add(micro.g.sub(0.5).mul(0.34)).add(meso.b.sub(0.5).mul(0.16))
          .add(macro.b.sub(0.5).mul(0.1)).toVar();
        const edgeWidth = fwidth(edgeField).mul(1.5).max(0.06).toVar();
        const result = vec4(baseColor, baseRoughness).toVar();
        // The ground has no texture of its own: lay a neutral scan over it near the
        // viewer, so the palette keeps the hue and the scan brings the structure, with
        // no brightness ring where it fades. Past 45 m the branch skips its taps.
        const floorFade = smoothstep(14, 45, distance(cameraPosition, positionWorld)).oneMinus().toVar();
        If(floorFade.greaterThan(0), () => {
          // The cracked-mud scan's plates came out ~0.6 m across, triple real
          // dried mud: that layer alone is drawn at twice the frequency.
          const scan = (uv, grad, layer) => {
            const scale = layer.equal(int(GROUND_LAYERS.cracked)).select(float(2), float(1));
            const tap = (offset) => texture(textures.colorRoughness, uv.add(offset).mul(scale))
              .grad(grad[0].mul(scale), grad[1].mul(scale)).depth(layer).rgb;
            const a = tap(offsetA);
            const b = tap(offsetB);
            return mix(a, b, smoothstep(0.2, 0.8, variantBlend.sub(dot(a.sub(b), vec3(0.1)))));
          };
          const layerA = floorScan ? floorScan.layers.x.round().toInt() : int(GROUND_LAYERS.grit);
          const layerB = floorScan ? floorScan.layers.y.round().toInt() : layerA;
          const own = mix(scan(uvA, gradA, layerA), scan(uvB, gradB, layerB), floorScan?.blend ?? float(0));
          const detail = floorScan?.wet ? mix(own, scan(uvA, gradA, int(GROUND_LAYERS.grit)), floorScan.wet) : own;
          result.assign(vec4(result.xyz.mul(mix(vec3(1), detail.div(GROUND_LAYER_MEAN).clamp(0.45, 1.8), floorFade.mul(0.85))), result.w));
        });
        const vergeBand = verge.toVar();
        // Only a path and its verge are painted: elsewhere (nearly all the
        // terrain) the whole paint is skipped. Unbranched it cost a third of the
        // frame rate (chunk-cross 53 vs 77 fps).
        // Below 0.03 the dithered contour cannot reach the soil threshold; the
        // natural-trail mask's soft tail stays under it across open ground.
        If(mask.max(vergeBand).greaterThan(0.03), () => {
          // Anti-tiling: a second, rescaled tap, blended by the meso mottle.
          const macroTile = meso.g;
          const tileBlend = macroTile.smoothstep(ANTI_TILING.blendStart, ANTI_TILING.blendEnd);
          const dirt = mix(
            texture(textures.colorRoughness, uvA.add(offsetA)).grad(...gradA).depth(int(0)),
            texture(textures.colorRoughness, uvB).grad(...gradB).depth(int(0)),
            tileBlend,
          ).toVar();
          // Broad damp hollows and sun-bleached runs, so no stretch of trail is one tone.
          const damp = macro.g.smoothstep(0.42, 0.72);
          const ground = dirt.rgb
            .mul(mix(1 - ANTI_TILING.colorVariation, 1 + ANTI_TILING.colorVariation, macroTile))
            .mul(mix(vec3(1.08, 1.05, 1.0), vec3(0.72, 0.7, 0.68), damp)).toVar();
          const soilRoughness = dirt.a
            .add(macroTile.sub(0.5).mul(ANTI_TILING.roughnessVariation * 2)).clamp(0, 1);
          const pathPaint = mix(ground, colorNode(settings.color).mul(ground.r.mul(0.65).add(0.65)), settings.tint)
            .toVar();
          const soilEdge = smoothstep(float(0.5).sub(edgeWidth), float(0.5).add(edgeWidth), edgeField).toVar();
          // The ground as the terrain painted it, read from the variable: naming
          // `baseColor` here would re-emit its whole graph inside the branch.
          const grass = result.xyz;
          let earth = mix(grass, pathPaint, soilEdge);
          if (settings.verge > 0) {
            // The verge as worn, trampled turf: duller and browner, broken by soil patches.
            const soilPatch = meso.r.add(micro.g.sub(0.5).mul(0.35)).smoothstep(0.5, 0.78);
            const dull = mix(vec3(dot(grass, vec3(0.3, 0.59, 0.11))), grass, 0.5).mul(vec3(1, 0.94, 0.76));
            const worn = mix(dull, pathPaint.mul(0.92), soilPatch.mul(0.55).add(0.18));
            earth = mix(earth, worn, vergeBand.mul(soilEdge.oneMinus()).mul(settings.verge));
          }
          // Damp-free soil stays rough (the donor's `groundRoughness`, dry branch).
          const roughness = mix(result.w, soilRoughness.max(0.65), soilEdge);
          result.assign(vec4(earth, roughness));
        });
        return result;
      })();
      return { color: paint.xyz, roughness: paint.w };
    },
  };
}
