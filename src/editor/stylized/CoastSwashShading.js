import {
  clamp,
  float,
  max,
  mix,
  oneMinus,
  smoothstep,
  vec3,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { seaStateUniforms } from '../water/seaState.js';
import { SEA_SWELL_COMPONENTS } from '../water/SeaSwell.js';
import { PatternOrigins } from './PatternOrigins.js';
import { shoreContactDistance } from './ShoreContactNodes.js';
import { waterVisualClock } from '../water/WaterVisualClock.js';
import { coastSwashForcingNodes } from './CoastSwashForcingNodes.js';
import { sampleCoastalSwashState } from './CoastalSwashStateNodes.js';
import { erodeFoamLace, sampleCoastalFoamPattern } from './CoastalFoamPatterns.js';

/**
 * Swash on the ground at the sea's edge (after grass-test's coast field).
 *
 * grass-test learned to express the swash as a height above still water, not
 * a distance from the coast: the front forms `breakDepth` down in the
 * shallows, crosses the waterline and runs up the sand, and follows the actual
 * ground wherever the coast is. That is the only form that works here, where
 * coasts come from Azgaar rather than an analytic curve.
 *
 *   film     a thin sheet of water behind the front, glossy and faintly tinted;
 *   foam     a broken line riding the front;
 *   wet      wash memory (the last few fronts, decaying) plus a permanently
 *            damp band just above the waterline: darker and far less rough.
 *
 * A beach has one front per wave. Its timing drifts slowly along the shore
 * with a low-frequency noise, since there is no along-shore coordinate.
 * Everything is gated to ground within `band` of sea level, so inland ground
 * costs a few ALU ops and nothing changes there.
 *
 * Coasts lie millions of metres from the origin, so the drift noise and the
 * two breakup waves are addressed through per-chunk PatternOrigins rather than
 * canonical positions (`createCoastPatternOrigins`).
 */

export const DEFAULT_COAST_SWASH = Object.freeze({
  enabled: true,
  period: 7.5,
  runupHeight: 1.1,
  /** Farthest the wash runs up the ground from the still waterline, in metres. */
  runupMeters: 7,
  breakDepth: 0.5,
  frontBand: 0.08,
  foamCore: 0.02,
  foamWidth: 0.12,
  foamCoreMeters: 0.025,
  foamWidthMeters: 0.24,
  breakupStrength: 0.3,
  washDecay: 4,
  dampHeight: 0.5,
  wetDarkening: 0.5,
  wetRoughness: 0.62,
  filmRoughness: 0.42,
  filmTint: '#8ccad0',
  filmTintStrength: 0.18,
  foamColor: '#edf8fb',
  foamStrength: 0.85,
});

const TAU = Math.PI * 2;
/** Lattice cells one repeat of the medium foam-lace tile spans; divides the 512-cell wrap. */
const FOAM_LACE_CELLS = 4;
const MEMORY_CYCLES = Object.freeze([0.15, 0.3, 0.45, 0.6]);
const DRIFT_SCALE = 0.021;
const FRONT_BREAKUP_WAVE = Object.freeze([0.13, 0.09]);

/** The per-chunk pattern origins the swash reads; re-centre them with the terrain chunk. */
export function createCoastPatternOrigins() {
  return new PatternOrigins(COAST_PATTERN_FRAMES);
}

export const COAST_SWASH_PATTERN_FRAMES = Object.freeze({
  drift: { scale: DRIFT_SCALE },
  frontBreakup: { wave: FRONT_BREAKUP_WAVE },
  foamLace: { scale: 0.85 },
});

export const COAST_PATTERN_FRAMES = Object.freeze({
  ...COAST_SWASH_PATTERN_FRAMES,
  sandMacro: { scale: 0.0225 },
  sandReef: { scale: 0.09 },
  sandMesoX: { wave: [0.558, 0] },
  sandMesoWarp: { wave: [0, 0.684] },
  sandMesoZ: { wave: [0, 0.846] },
  sandRippleX: { wave: [3.42, 0] },
  sandRippleWarp: { wave: [0, 1.26] },
  sandCaustics: { scale: 1, period: 5.5 },
});

function colorNode(value) {
  const color = new THREE.Color(value);
  return vec3(color.r, color.g, color.b);
}

/** Shared by the ground and water front. Real cellular lace gaps replace flat
 * grey fade-outs, keeping crisp bubble webbing from eye level to coastal overviews. */
export function createCoastFoamBreakup(patterns, localXZ, clock, strength, laceField = null, waterNoise = null) {
  if (!(strength > 0)) return float(1);
  const pattern = sampleCoastalFoamPattern({
    waterNoise,
    laceField,
    point: patterns.latticePoint('foamLace', localXZ),
    clock,
    cells: FOAM_LACE_CELLS,
  });
  const density = clamp(float(1).sub(strength * 0.48), 0.15, 0.92);
  return erodeFoamLace({
    density,
    laceHeight: pattern.laceHeight,
    frothDetail: pattern.frothDetail,
    uvFootprint: pattern.uvFootprint,
  }).coverage;
}

/**
 * @param {object} options
 * @param {object} options.localXZ vec2 node: metres from the chunk centre, canonical axes
 * @param {PatternOrigins} options.patternOrigins from `createCoastPatternOrigins`
 * @param {object} options.groundHeight float node, world height of the ground
 * @param {object} [options.config] `stylizedSurface.water.coast`
 * @returns {{ apply: (color: object, roughness: object) => { color: object, roughness: object } } | null}
 */
export function createCoastSwashNodes({
  localXZ,
  patternOrigins,
  groundHeight,
  config = DEFAULT_COAST_SWASH,
  clock = waterVisualClock,
  shorelineFadeDepth = 0.35,
  oceanMask = float(1),
  shelter = float(1),
  diffraction = null,
  laceField = null,
  waterNoise = null,
  grassMask = float(0),
  persistentEnabled = true,
}) {
  if (!config.enabled) return null;
  const height = groundHeight.sub(seaStateUniforms.seaLevel);
  // Run-up is a height, so on a nearly flat bank 1.1 m reached some 30 m inland
  // and drew foam lines across dry sand round sea-level pools. Cap it in metres
  // from the still waterline too; a steep beach never reaches the cap.
  const runupMeters = config.runupMeters ?? DEFAULT_COAST_SWASH.runupMeters;
  const inland = shoreContactDistance(max(height, 0), localXZ).distance;
  const reach = oneMinus(smoothstep(runupMeters * 0.6, runupMeters, inland));
  const band = smoothstep(-config.breakDepth - 0.8, -config.breakDepth + 0.1, height)
    .mul(oneMinus(smoothstep(config.runupHeight + 0.2, config.runupHeight + config.dampHeight + 0.4, height)))
    .mul(reach)
    .mul(oceanMask);
  const phaseLag = diffraction?.enabled
    ? shelter.sub(1).mul(SEA_SWELL_COMPONENTS[0].waveNumber * diffraction.phaseLagMeters)
    : float(0);
  const { phase, front, frontVelocity, coverageAt } = coastSwashForcingNodes({
    localXZ, patternOrigins, height, clock, config, runupScale: shelter, phaseLag,
  });
  const analyticFilm = coverageAt(phase).mul(band);
  const foamPattern = sampleCoastalFoamPattern({
    waterNoise,
    laceField,
    point: patternOrigins.latticePoint('foamLace', localXZ),
    clock,
    cells: FOAM_LACE_CELLS,
  });
  // Organic micro-scalloping on the advancing wave lip breaks up geometric contours.
  const frontWarp = foamPattern.organicWarp.mul(0.055 * (config.breakupStrength ?? 0.8));
  const contact = shoreContactDistance(height.sub(front.add(frontWarp)), localXZ);
  const uprushWeight = smoothstep(-0.12, 0.14, frontVelocity).mul(0.62).add(0.38);
  const frontLip = oneMinus(smoothstep(
    config.foamCoreMeters ?? DEFAULT_COAST_SWASH.foamCoreMeters,
    max(float(config.foamWidthMeters ?? DEFAULT_COAST_SWASH.foamWidthMeters), contact.footprint),
    contact.distance,
  ))
    .mul(uprushWeight)
    // Only where the wash actually runs: on nearly flat sand the foam contour
    // otherwise crossed dry ground several times, drawing parallel white wires.
    .mul(smoothstep(0.08, 0.45, analyticFilm))
    .mul(band)
    .mul(shelter);
  let memory = analyticFilm;
  for (const cyclesAgo of MEMORY_CYCLES) {
    memory = max(memory, coverageAt(phase.sub(TAU * cyclesAgo)).mul(Math.exp(-cyclesAgo * config.washDecay)));
  }
  // Analytic trailing lace: receding wash leaves thinning lacy bubble webs on wet sand.
  const analyticTrail = max(analyticFilm.mul(0.34), memory.mul(0.28)).mul(band).mul(shelter);
  const analyticDensity = max(frontLip.mul(0.95), analyticTrail);
  const damp = oneMinus(smoothstep(0, config.dampHeight, height));
  // Ground under the water stays wet all the way down. Gated by `band`, the damp
  // stopped half a metre under, and over a carved bed's near-planar ramp that
  // cut drew a pale patch bounded by long straight contours.
  const above = oneMinus(smoothstep(config.runupHeight + 0.2, config.runupHeight + config.dampHeight + 0.4, height))
    .mul(oneMinus(smoothstep(runupMeters, runupMeters * 1.6, inland)))
    .mul(oceanMask);
  const analyticWet = max(memory.mul(band), damp.mul(above));
  const persistent = persistentEnabled && config.persistent?.enabled ? sampleCoastalSwashState() : null;
  const weight = persistent ? persistent.activeWeight.mul(band).mul(oceanMask) : float(0);
  const film = persistent
    ? mix(analyticFilm, persistent.film.mul(band), weight) : analyticFilm;
  const wet = persistent
    ? mix(analyticWet, persistent.wetness.mul(band), weight) : analyticWet;
  const strandedOpacity = config.persistent?.strandedOpacity ?? 0.52;
  // Combine advected persistent foam/residue with the sub-texel crisp leading bore lip.
  // Cap pre-erosion density so even peak storm surf retains open bubble pockets.
  const persistentDensity = persistent
    ? max(
      max(persistent.mobileFoam.mul(0.84), persistent.strandedFoam.mul(strandedOpacity)),
      frontLip.mul(0.82),
    ).mul(band).clamp(0, 0.84)
    : float(0);
  const beachClear = oneMinus(smoothstep(0.18, 0.55, grassMask));
  const rawFoamDensity = (persistent
    ? mix(analyticDensity.clamp(0, 0.84), persistentDensity, weight)
    : analyticDensity.clamp(0, 0.84)).mul(beachClear);
  const eroded = erodeFoamLace({
    density: rawFoamDensity,
    laceHeight: foamPattern.laceHeight,
    frothDetail: foamPattern.frothDetail,
    uvFootprint: foamPattern.uvFootprint,
    edgeMin: 0.095,
    edgeMax: 0.24,
    bodyFloor: 0.60,
    bodyStrength: 0.22,
  });
  const foam = eroded.coverage;
  const foamThickness = eroded.thickness;
  const filmTint = colorNode(config.filmTint);
  const foamColor = colorNode(config.foamColor);
  // The same foam front crosses sand and water. The ground owns the portion
  // where the water sheet fades out; deeper water owns it through refraction.
  const groundHandoff = oneMinus(smoothstep(0, shorelineFadeDepth, height.negate()));

  return {
    film, foam, foamThickness, wet,
    apply(color, roughness) {
      let result = color.mul(mix(float(1), float(config.wetDarkening), wet));
      result = mix(result, result.mul(filmTint).mul(1.6), film.mul(config.filmTintStrength));
      // Subtle capillary darkening immediately under frothy foam rims gives physical thickness.
      const groundFoam = foam.mul(config.foamStrength).mul(groundHandoff);
      const lipContact = smoothstep(0.08, 0.55, rawFoamDensity).mul(oneMinus(foamThickness.mul(0.65)))
        .mul(groundHandoff).mul(0.14);
      result = result.mul(oneMinus(lipContact));
      const frothyTone = mix(foamColor.mul(0.91), foamColor.mul(1.03),
        clamp(foamThickness.mul(0.65).add(foamPattern.frothDetail.mul(0.35)), 0, 1));
      result = mix(result, frothyTone, groundFoam);
      let resultRoughness = mix(roughness, float(config.wetRoughness), wet);
      resultRoughness = mix(resultRoughness, float(config.filmRoughness), film);
      resultRoughness = mix(resultRoughness, float(0.76), groundFoam);
      return { color: result, roughness: resultRoughness };
    },
  };
}
