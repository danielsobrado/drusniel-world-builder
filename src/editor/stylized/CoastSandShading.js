import { Color } from 'three/webgpu';
import {
  Fn,
  If,
  cameraPosition,
  cameraViewMatrix,
  cameraWorldMatrix,
  clamp,
  cos,
  float,
  length,
  max,
  mix,
  normalize,
  oneMinus,
  positionWorld,
  sin,
  smoothstep,
  time,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { acquireSandDetailMaps } from '../assets/godsEnd/sandDetailMaps.js';
import { createSandOpticalResponse, sampleSandMicroGrain } from '../materials/SandSurfaceShading.js';
import { periodicFbm2 } from './PeriodicNoiseNodes.js';
import { seaStateUniforms } from '../water/seaState.js';
import { godsEndCausticLattice } from '../water/GodsEndWaterPatterns.js';
import { resolveCoastSand } from '../water/CoastSandConfig.js';

/** Metres of height by which the sand's band edges wander. */
const BAND_NOISE_METRES = 0.7;

function colorNode(value) {
  const c = new Color(value);
  return vec3(c.r, c.g, c.b);
}

/**
 * Upgraded coastal & beach sand shading:
 *  - Warm sunlit beach sand, pale submerged bed, mottled reef shelf & seabed caustics.
 *  - Sampler-free CC0 quartz micro-grain normals + subtle shore-aligned wave/wind
 *    beach ripples (replaces the flat smooth brown gradient on dry beaches).
 *  - World-locked dry-beach quartz glints & soft sunlit sheen (strictly dry sand
 *    above the water, scaled by sun light so cast shadows stay dark).
 */
export function createCoastSandNodes({
  localXZ,
  patterns,
  groundHeight,
  sandMask,
  waterCoverage,
  oceanMask = float(1),
  organic = float(0),
  cold = float(0),
  config = {},
  clock = time,
  terrainUv = null,
  chunkWorldSize = 64,
  chunkCenter = null,
  material = null,
  sun = null,
  baseNormal = null,
}) {
  const settings = resolveCoastSand(config);
  if (!settings.enabled) return null;

  const sandMaps = acquireSandDetailMaps();
  if (sandMaps && material) {
    const dispose = () => {
      sandMaps.release();
      material.removeEventListener('dispose', dispose);
    };
    material.addEventListener('dispose', dispose);
  }

  const height = groundHeight.sub(seaStateUniforms.seaLevel);
  // Widest reach of the bands below once the noise has moved them, for the branch.
  const reach = smoothstep(-16 - BAND_NOISE_METRES, -15.9 - BAND_NOISE_METRES, height)
    .mul(oneMinus(smoothstep(2.8 + BAND_NOISE_METRES, 2.9 + BAND_NOISE_METRES, height)))
    .mul(sandMask.max(waterCoverage))
    .mul(oceanMask)
    .toVar('coastSandReach');

  const hasDetailCoords = Boolean(terrainUv && chunkCenter);
  const local = hasDetailCoords
    ? vec2(terrainUv.x.sub(0.5), float(0.5).sub(terrainUv.y)).mul(chunkWorldSize)
    : localXZ;
  const grainPoint = hasDetailCoords ? chunkCenter.mod(8).add(local).mul(0.125) : localXZ.mul(0.125);
  const grainDx = grainPoint.dFdx().toVar('coastSandDx');
  const grainDy = grainPoint.dFdy().toVar('coastSandDy');
  const footprint = max(length(local.dFdx()), length(local.dFdy())).toVar('coastSandFootprint');

  const dryBeachWeight = oneMinus(smoothstep(1.9, 2.8, height))
    .mul(smoothstep(0.02, 0.45, height))
    .mul(sandMask)
    .mul(oceanMask)
    .mul(oneMinus(cold.mul(0.85)))
    .mul(oneMinus(organic.mul(0.85)))
    .toVar('coastDryBeach');

  const microGrain = sampleSandMicroGrain({
    point: grainPoint,
    dx: grainDx,
    dy: grainDy,
    footprint,
    maps: sandMaps,
    active: reach.mul(oneMinus(cold.mul(0.75))).mul(oneMinus(organic.mul(0.75))),
    strength: float(0.44),
  });

  // Pre-compute ripple phase derivatives outside the branch for WGSL uniform control flow.
  const ripplePhaseFull = patterns.wavePhase('sandRippleX', localXZ)
    .add(sin(patterns.wavePhase('sandRippleWarp', localXZ)).mul(0.8))
    .toVar('coastRipplePhase');
  const rippleResolved = oneMinus(smoothstep(0.6, 2.4, ripplePhaseFull.fwidth())).toVar('coastRippleResolved');

  // Subtle beach ripple & quartz micro-grain world slope (zero on submerged deep bed, cold gravel, or mud).
  const beachSlope = Fn(() => {
    const out = vec2(0).toVar();
    If(reach.greaterThan(0.001), () => {
      const aboveBed = smoothstep(-0.8, 0.15, height);
      const sandPurity = oneMinus(cold.mul(0.75)).mul(oneMinus(organic.mul(0.75)));
      const weight = reach.mul(aboveBed).mul(sandPurity);
      // Gentle wind/wave beach ripples along shore ripple phase + crisp micro quartz grain normals.
      const rippleSlope = cos(ripplePhaseFull).mul(rippleResolved).mul(0.068);
      out.assign(vec2(rippleSlope, rippleSlope.mul(0.35)).add(microGrain.xy.mul(0.54)).mul(weight));
    });
    return out;
  })().toVar('coastBeachSlope');

  const perturbViewNormal = (normal) => {
    if (!normal) return normal;
    const viewSlope = cameraViewMatrix.mul(vec4(beachSlope.x.negate(), 0, beachSlope.y.negate(), 0)).xyz;
    return normalize(normal.add(viewSlope));
  };

  const localMeters = hasDetailCoords ? vec2(terrainUv.x, terrainUv.y).mul(chunkWorldSize) : localXZ;
  const originMeters = hasDetailCoords
    ? vec2(chunkCenter.x.sub(chunkWorldSize * 0.5), chunkCenter.y.negate().sub(chunkWorldSize * 0.5)).round()
    : vec2(0, 0);
  const worldPerturbedNormal = baseNormal
    ? normalize(cameraWorldMatrix.mul(vec4(perturbViewNormal(baseNormal), 0)).xyz)
    : normalize(vec3(beachSlope.x.negate(), float(1), beachSlope.y.negate()));
  const sunResponse = sun
    ? createSandOpticalResponse({
      localMeters,
      originMeters,
      worldNormal: worldPerturbedNormal,
      sun,
      sandWeight: dryBeachWeight,
      sparkleMask: microGrain.w,
      glintGain: 0.72,
      sheenGain: 0.75,
    })
    : vec3(0);

  // Noise, shelf mottling and caustics execute only in the coastal band.
  return {
    sunResponse,
    dryBeachWeight,
    normal: perturbViewNormal,
    apply(color, roughness) {
      const result = Fn(() => {
        const response = vec4(color, roughness).toVar();
        If(reach.greaterThan(0.001), () => {
          // Every band edge wanders by up to BAND_NOISE_METRES of height. The bed is
          // a 2 m triangle mesh, often near planar where it was carved, so a band
          // keyed on plain height drew its contours as long straight lines.
          const wander = periodicFbm2(patterns.latticePoint('sandReef', localXZ)).sub(0.5).mul(BAND_NOISE_METRES * 2);
          const banded = height.add(wander);
          const bedDepth = banded.negate();
          const beach = oneMinus(smoothstep(1.8, 2.8, banded)).mul(smoothstep(-1.6, 0.2, banded)).mul(sandMask);
          const bed = smoothstep(0.1, 1.6, bedDepth).mul(oneMinus(smoothstep(10, 16, bedDepth))).mul(waterCoverage);
          const amount = beach.max(bed).mul(oceanMask);
          const macro = periodicFbm2(patterns.latticePoint('sandMacro', localXZ));
          const phase = (name) => patterns.wavePhase(name, localXZ);
          const meso = sin(phase('sandMesoX').add(sin(phase('sandMesoWarp'))))
            .mul(sin(phase('sandMesoZ'))).mul(0.5).add(0.5);
          const ripples = sin(ripplePhaseFull).mul(rippleResolved).mul(0.048).add(1);
          const grainSpeckle = microGrain.z.sub(0.5).mul(0.10).add(1);
          // Warm sunlit dry upper beach sand with clean grain variation (avoids flat dull clay).
          const warm = mix(colorNode(settings.dryDark), colorNode(settings.dryLight), macro)
            .mul(mix(float(1.03), float(1.16), smoothstep(0.18, 1.15, banded)));
          const gravel = mix(colorNode('#686f6b'), colorNode('#a8aaa1'), macro);
          const mud = mix(colorNode('#424a36'), colorNode('#82785b'), macro);
          const dry = mix(mix(warm, gravel, cold.mul(0.8)), mud, organic.mul(0.75))
            .mul(ripples)
            .mul(grainSpeckle)
            .mul(mix(float(0.93), float(1.06), meso));
          const bedSand = mix(dry, colorNode(settings.seabedColor).mul(ripples),
            float(settings.seabedColorWeight).mul(oneMinus(cold.mul(0.65))).mul(oneMinus(organic.mul(0.7))));
          const reefBand = smoothstep(0.6, 1.6, bedDepth).mul(oneMinus(smoothstep(4.5, 6.5, bedDepth)));
          const reef = smoothstep(0.52, 0.68, periodicFbm2(patterns.latticePoint('sandReef', localXZ)))
            .mul(reefBand).mul(settings.reefStrength).mul(oneMinus(cold)).mul(oneMinus(organic));
          const reefColor = mix(colorNode(settings.reefColor), colorNode(settings.reefRockColor), meso);
          const bedColor = mix(bedSand, reefColor, reef);
          const causticFade = smoothstep(0.25, 0.65, bedDepth)
            .mul(oneMinus(smoothstep(2, 5.7, bedDepth)))
            .mul(oneMinus(smoothstep(26, 54, cameraPosition.distance(positionWorld))));
          const caustic = godsEndCausticLattice(patterns.latticePoint('sandCaustics', localXZ), 5.5, clock)
            .mul(causticFade).mul(settings.causticStrength);
          const sand = mix(dry, bedColor.mul(caustic.add(1)), bed);
          const dryRough = clamp(float(0.89).add(microGrain.z.sub(0.5).mul(0.08)), 0.80, 0.96);
          response.assign(vec4(mix(color, sand, amount), mix(roughness, dryRough, amount)));
        });
        return response;
      })().toVar();
      return { color: result.rgb, roughness: result.a };
    },
  };
}
