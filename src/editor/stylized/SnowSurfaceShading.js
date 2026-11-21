import { frameUniform } from '../../render/FrameUniforms.js';
import {
  Fn,
  If,
  cameraPosition,
  cameraWorldMatrix,
  clamp,
  cross,
  dot,
  float,
  floor,
  fract,
  fwidth,
  int,
  length,
  max,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  select,
  smoothstep,
  uint,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { latticeHashNode } from '../weather/wind/windNoise.js';
import { directionFromAngles } from './StylizedGodRaysPostProcess.js';
import { skyLightUniforms, snowLightUniforms } from './sky/skyLight.js';
import { resolveSnowSurfaceConfig } from './SnowSurfaceConfig.js';

/**
 * Upgraded Snowflow-inspired snow optical response (MIT, Maksymilian Dendura):
 *
 *  - World-locked dual-octave crystalline glints (0.052 m & 0.185 m) with subtle
 *    prismatic RGB dispersion and relaxed noon legibility (never crawling across
 *    TAA frames and never glowing in cast shadow because SnowLightingModel scales
 *    `sunResponse` by `lightColor`).
 *  - Thickness-inverted back-scatter SSS (thin drift lips & crests glow cool-white
 *    widely; deep pack transmits tight deep blue).
 *  - Powder velvet grazing rim (`(1 - N·V)^2.4`) giving snow ridges a soft fuzzy
 *    micro-powder halo instead of matte clay.
 *  - Snow-to-snow upward bounce (`bounceUp = clamp(-N.y * 0.5 + 0.5)`) keeping
 *    shaded troughs luminous cool blue-white.
 */

const FINE_CELL_METERS = 0.052;
const COARSE_CELL_METERS = 0.185;
const FACET_SHARE = 0.44;
const GLINT_FADE = [0.55, 2.2];

function cellHash(originMeters, cell, salt) {
  return latticeHashNode(
    uint(int(originMeters.x)).add(uint(int(cell.x)).mul(uint(0x9e3779b1))).add(uint(salt)),
    uint(int(originMeters.y)).add(uint(int(cell.y)).mul(uint(0x85ebca6b))).add(uint(salt * 7919)),
  );
}

/** Returns vec3 RGB glint response (subtle prismatic ice crystal tint per facet). */
function glintOctave({ localMeters, originMeters, cellMeters, salt, normal, halfVector, sharpness }) {
  const point = localMeters.div(cellMeters);
  const cell = floor(point);
  const local = fract(point);
  const jitter = vec2(cellHash(originMeters, cell, salt), cellHash(originMeters, cell, salt + 1));
  const centre = jitter.mul(0.72).add(0.14);
  const distance = length(local.sub(centre)).div(0.19);
  const disc = clamp(float(1).sub(distance.mul(distance)), 0, 1);
  const angle = cellHash(originMeters, cell, salt + 2).mul(Math.PI * 2);
  const tilt = cellHash(originMeters, cell, salt + 3).mul(0.32).add(0.08);
  const up = select(normal.y.abs().greaterThan(0.95), vec3(1, 0, 0), vec3(0, 1, 0));
  const tangent = normalize(cross(up, normal));
  const bitangent = cross(normal, tangent);
  const facet = normalize(normal.add(tangent.mul(angle.cos()).add(bitangent.mul(angle.sin())).mul(tilt)));
  const response = disc.mul(clamp(dot(facet, halfVector), 0, 1).pow(sharpness));
  const prism = cellHash(originMeters, cell, salt + 5);
  // Subtle prismatic ice-crystal dispersion (cool cyan-white to faint warm gold spark).
  const tint = mix(vec3(0.84, 0.96, 1.12), vec3(1.08, 1.0, 0.9), prism);
  const holds = cellHash(originMeters, cell, salt + 4).lessThan(FACET_SHARE);
  return select(holds, tint.mul(response), vec3(0));
}

export function createSnowSurfaceNodes({
  terrainUv,
  chunkWorldSize,
  chunkCenter,
  snow,
  stylizedConfig,
  sunDirection = null,
  baseNormal = null,
  pathMask = float(0),
  crestMask = float(0),
  settings = resolveSnowSurfaceConfig(stylizedConfig?.snowSurface),
}) {
  const sky = stylizedConfig?.sky;
  const sunVector = directionFromAngles(sky?.sunElevation ?? 10, sky?.sunAzimuth ?? 258);
  const sun = sunDirection
    ? normalize(frameUniform(sunDirection))
    : vec3(sunVector.x, sunVector.y, sunVector.z);
  const normal = normalize(baseNormal ? cameraWorldMatrix.mul(vec4(baseNormal, 0)).xyz : normalWorld).toVar();
  const view = normalize(cameraPosition.sub(positionWorld));
  const halfVector = normalize(view.add(sun));

  const localMeters = vec2(terrainUv.x, terrainUv.y).mul(chunkWorldSize);
  const originMeters = vec2(
    chunkCenter.x.sub(chunkWorldSize * 0.5),
    chunkCenter.y.negate().sub(chunkWorldSize * 0.5),
  ).round();
  const footprint = length(fwidth(localMeters));
  const compacted = pathMask.clamp(0, 1);
  const ndv = clamp(dot(normal, view), 0, 1);
  // Relaxed grazing curve so sunlit slopes visibly sparkle even under high midday sun.
  const graze = float(1).sub(ndv).pow(2.0).mul(0.82).add(0.18);
  const facingSun = clamp(dot(normal, sun), 0, 1);
  const lightGate = smoothstep(0.02, 0.25, facingSun)
    .mul(smoothstep(0.75, 1.0, facingSun).mul(0.32).oneMinus());

  const glints = Fn(() => {
    const result = vec3(0).toVar();
    If(snow.greaterThan(0.02).and(normal.y.greaterThanEqual(-1)).and(footprint.greaterThanEqual(0)), () => {
      const fine = glintOctave({
        localMeters, originMeters, cellMeters: FINE_CELL_METERS, salt: 11, normal, halfVector, sharpness: 420,
      }).mul(float(1).sub(smoothstep(FINE_CELL_METERS * GLINT_FADE[0], FINE_CELL_METERS * GLINT_FADE[1], footprint)));
      const coarse = glintOctave({
        localMeters, originMeters, cellMeters: COARSE_CELL_METERS, salt: 53, normal, halfVector, sharpness: 920,
      }).mul(float(1).sub(smoothstep(COARSE_CELL_METERS * GLINT_FADE[0], COARSE_CELL_METERS * GLINT_FADE[1], footprint)))
        .mul(1.35);
      result.assign(fine.add(coarse).mul(graze).mul(lightGate).mul(snow).mul(compacted.mul(0.8).oneMinus()));
    });
    return result;
  })();

  const shade = float(1).sub(smoothstep(0.05, 0.62, max(dot(normal, sun), 0)));
  const backscatter = snow.mul(shade).mul(snowLightUniforms.shade);

  // Thickness-inverted Snowflow SSS: thin drift crests & lips transmit wide and bright;
  // deep flats transmit tight and bluer (red absorbed over longer path).
  const thickness = mix(float(1), float(0.28), max(compacted.mul(0.65), crestMask.clamp(0, 1))).toVar();
  const transmitted = normalize(sun.add(normal.mul(0.28)));
  const lobe = dot(view, transmitted.negate()).clamp(0, 1)
    .pow(mix(float(3), float(9), thickness))
    .mul(mix(float(1), float(0.28), thickness));
  const transmissionTint = mix(vec3(0.94, 0.965, 1.0), vec3(0.55, 0.72, 1.0), thickness);
  const subsurface = transmissionTint.mul(lobe).mul(settings.subsurfaceStrength * 1.45).mul(snow);

  // Powder velvet grazing rim: softens snow silhouettes into fuzzy backlit powder.
  const velvetRim = float(1).sub(ndv).pow(2.4)
    .mul(smoothstep(0.05, 0.65, facingSun.add(0.25)))
    .mul(compacted.mul(0.7).oneMinus())
    .mul(snow);
  const velvet = mix(vec3(0.76, 0.88, 1.0), vec3(1.0, 0.98, 0.95), smoothstep(0.15, 0.7, dot(view.negate(), sun)))
    .mul(velvetRim.mul(0.26));

  // Snow-to-snow upward bounce (Snowflow): shaded troughs receive cool blue sky bounce.
  const bounceUp = clamp(normal.y.negate().mul(0.5).add(0.5), 0, 1);
  const snowBounce = snowLightUniforms.shadeTint
    .mul(skyLightUniforms.reflectionTint)
    .mul(skyLightUniforms.brightness)
    .mul(bounceUp.mul(0.055).mul(snow));

  return {
    apply(color) {
      const albedo = mix(color, color.mul(snowLightUniforms.brightness), snow);
      return mix(albedo, albedo.mul(snowLightUniforms.shadeTint), backscatter);
    },
    sunResponse: glints.mul(2.8).add(subsurface).add(velvet),
    snowBounce,
  };
}
