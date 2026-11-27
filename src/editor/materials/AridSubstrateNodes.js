import { Color } from 'three/webgpu';
import {
  Fn,
  If,
  bool,
  cameraViewMatrix,
  cameraWorldMatrix,
  clamp,
  cos,
  float,
  fract,
  length,
  max,
  mix,
  normalize,
  oneMinus,
  select,
  sin,
  smoothstep,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { acquireSandDetailMaps } from '../assets/godsEnd/sandDetailMaps.js';
import { heightRelief } from './heightRelief.js';
import { DEFAULT_DUNE } from '../biomes/BiomeSurfaceLooks.js';
import { periodicFbm2, periodicNoise } from '../stylized/PeriodicNoiseNodes.js';
import { PATTERN_PERIOD } from '../stylized/PatternOrigins.js';
import { createSandOpticalResponse, sampleSandMicroGrain } from './SandSurfaceShading.js';

const DEFAULT_ARID = Object.freeze({ sand: [1], mineral: [2] });
const pigment = (hex) => { const color = new Color(hex); return vec3(color.r, color.g, color.b); };

/** Loose sand and frost-broken mineral ground; canonical IDs remain unchanged. */
const anyOf = (tileId, ids) => ids.map((id) => tileId.equal(id)).reduce((a, b) => a.or(b), bool(false));

const duneVector = (dune) => vec4(dune.a, dune.b, dune.height, dune.sharpness);
/** Lattice cells per metre of the terrain's `broad` frame (TerrainTransitionNodes). */
const BROAD_LATTICE_SCALE = 0.35;
/** Metres between mid-scale wind-swept sand waves bridging fine ripples and broad dunes. */
const WAVE_METRES = 4.6;
/** Metres between broad sweeping dune swells across the erg. */
const SWELL_METRES = 18;
/** Metres between large dune ridges visible from mid-air and far distance. */
const RIDGE_METRES = 52;

/**
 * The swell's frequency on the broad lattice, across the same wind as the
 * ripples. Multiples of 1/PATTERN_PERIOD still close over the pattern's wrap.
 */
function swellVector(dune, metres = SWELL_METRES) {
  const lengthValue = Math.hypot(dune.a, dune.b) || 1;
  const cycles = 1 / (BROAD_LATTICE_SCALE * metres);
  const snap = (value) => Math.round(value * cycles * PATTERN_PERIOD) / PATTERN_PERIOD;
  return vec2(snap(dune.a / lengthValue), snap(dune.b / lengthValue));
}

/** Unit wind direction (wx, wz) for a sand tile's dune entry. */
function duneWindDir(dune) {
  const len = Math.hypot(dune.a, dune.b) || 1;
  return vec2(dune.a / len, dune.b / len);
}

/** A per-sand-tile choice between vectors, the default for every other tile. */
function perDune(tileId, dunes, vector) {
  return Object.entries(dunes).reduce((chosen, [id, dune]) => select(tileId.equal(Number(id)), vector(dune), chosen),
    vector(DEFAULT_DUNE));
}

/** Each sand tile's dune (biome-looks `dunes`) as vec4(lattice a, lattice b, height, sharpness). */
const duneAt = (tileId, dunes) => perDune(tileId, dunes, duneVector);

/**
 * Asymmetric wind-ripple profile (gentle windward ramp up to a sharp crest,
 * steep lee slip-face) and its exact analytic derivative dH/dPhase.
 * Returns vec2(value in -1..1, dValue/dPhase).
 */
function duneProfileAndSlope(phase, sharpness) {
  const s = fract(phase.div(Math.PI * 2));
  const lee = mix(float(0.5), float(0.22), sharpness);
  const windward = oneMinus(lee);
  const onRise = s.lessThan(windward);
  const t = select(onRise, s.div(windward), oneMinus(s).div(lee));
  const shaped = t.mul(t).mul(float(3).sub(t.mul(2))).mul(2).sub(1);
  // Smooth bounded derivative so lee faces read as natural wind-slip sand (~18-24°), never sawtooth furrows.
  const dtDs = select(onRise, float(1).div(windward), float(-1).div(lee));
  const dShaped = t.mul(oneMinus(t)).mul(12 / (Math.PI * 2)).mul(dtDs).clamp(-1.85, 1.85);
  return vec2(
    mix(sin(phase), shaped, sharpness.mul(0.85)),
    mix(cos(phase), dShaped, sharpness.mul(0.85)),
  );
}

/**
 * Upgraded Desert Sand & Arid Mineral substrate shader:
 *  - Smooth organic biome edge feathering when `sandShare` / `mineralShare` are
 *    supplied (eliminates hard blocky tile borders on mixed desert/savanna flats).
 *  - Multi-scale wind-sculpted ripples (fine ~0.22 m, mid ~4.6 m, broad sweeping
 *    18 m & 52 m dunes) with analytic wind-aligned tangent slopes (crisp slip-faces,
 *    zero mashed-potato dimples, zero screen-space derivative edge steps).
 *  - Sampler-free CC0 quartz micro-grain normals + world-locked golden-quartz
 *    sparkle & warm sunlit grazing sheen (`sunResponse`, strictly sun-shadowed).
 */
export function createAridSubstrateNodes({
  tileId,
  bare,
  patterns,
  localXZ,
  cameraDistance,
  arid = DEFAULT_ARID,
  dunes = {},
  crust = float(0),
  sandShare = null,
  mineralShare = null,
  terrainUv = null,
  chunkWorldSize = 64,
  chunkCenter = null,
  material = null,
  sun = null,
  baseNormal = null,
}) {
  const sandMaps = acquireSandDetailMaps();
  if (sandMaps && material) {
    const dispose = () => {
      sandMaps.release();
      material.removeEventListener('dispose', dispose);
    };
    material.addEventListener('dispose', dispose);
  }

  const rawHot = sandShare
    ? sandShare.clamp(0, 1)
    : anyOf(tileId, arid.sand ?? []).select(float(1), float(0));
  const rawCold = mineralShare
    ? mineralShare.clamp(0, 1)
    : anyOf(tileId, arid.mineral ?? []).select(float(1), float(0));

  const bareClamped = bare.clamp(0, 1);
  const active = rawHot.max(rawCold).mul(bareClamped).toVar('aridActive');
  const reach = oneMinus(smoothstep(8, 30, cameraDistance));

  // Pre-compute texture derivatives outside any non-uniform branch (WGSL uniform control flow).
  const hasDetailCoords = Boolean(terrainUv && chunkCenter);
  const local = hasDetailCoords
    ? vec2(terrainUv.x.sub(0.5), float(0.5).sub(terrainUv.y)).mul(chunkWorldSize)
    : localXZ;
  const grainPoint = hasDetailCoords ? chunkCenter.mod(8).add(local).mul(0.125) : localXZ.mul(0.125);
  const grainDx = grainPoint.dFdx().toVar('sandGrainDx');
  const grainDy = grainPoint.dFdy().toVar('sandGrainDy');
  const footprint = max(length(local.dFdx()), length(local.dFdy())).toVar('sandFootprint');

  const fineLattice = patterns.latticePoint('fine', localXZ);
  const broadLattice = patterns.latticePoint('broad', localXZ);
  const dune = duneAt(tileId, dunes).toVar();
  const windDir = perDune(tileId, dunes, duneWindDir).toVar();
  const fineFreqScale = length(dune.xy).mul(1.3); // cycles/m of fine ripples
  const finePhaseFw = fineLattice.x.mul(dune.x).add(fineLattice.y.mul(dune.y)).mul(Math.PI * 2).fwidth().toVar('sandFineFw');
  const waveVec = perDune(tileId, dunes, (d) => swellVector(d, WAVE_METRES));
  const wavePhaseFw = broadLattice.dot(waveVec).mul(Math.PI * 2).fwidth().toVar('sandWaveFw');
  const swellVec = perDune(tileId, dunes, (d) => swellVector(d, SWELL_METRES));
  const swellPhaseFw = broadLattice.dot(swellVec).mul(Math.PI * 2).fwidth().toVar('sandSwellFw');
  const ridgeVec = perDune(tileId, dunes, (d) => swellVector(d, RIDGE_METRES));
  const ridgePhaseFw = broadLattice.dot(ridgeVec).mul(Math.PI * 2).fwidth().toVar('sandRidgeFw');

  // Organic edge softening for sand tiles so desert borders feather broadly instead of stepping in 2 m squares.
  const sandAmount = sandShare
    ? smoothstep(0.02, 0.88, rawHot.add(periodicFbm2(broadLattice).sub(0.5).mul(0.32)))
      .mul(smoothstep(0.005, 0.08, rawHot))
      .mul(bareClamped)
      .toVar('sandAmount')
    : rawHot.mul(bareClamped).toVar('sandAmount');
  const mineralAmount = mineralShare
    ? smoothstep(0.02, 0.88, rawCold.add(periodicFbm2(broadLattice).sub(0.5).mul(0.28)))
      .mul(smoothstep(0.005, 0.08, rawCold))
      .mul(bareClamped)
      .toVar('mineralAmount')
    : rawCold.mul(bareClamped).toVar('mineralAmount');

  const crustFlat = crust.mul(oneMinus(smoothstep(24, 54, cameraDistance))).mul(0.78).clamp(0, 1);
  const looseSand = sandAmount.mul(oneMinus(crustFlat)).toVar('looseSand');

  const microGrain = sampleSandMicroGrain({
    point: grainPoint,
    dx: grainDx,
    dy: grainDy,
    footprint,
    maps: sandMaps,
    active: looseSand,
    strength: float(0.62),
  });

  // Pack color multiplier (rgb) and mineral height (a).
  const evaluated = Fn(() => {
    const colorOut = vec3(1).toVar();
    const mineralHeight = float(0).toVar();

    If(active.greaterThan(0.001), () => {
      const p = fineLattice.toVar();
      const broad = broadLattice.toVar();
      const macro = periodicFbm2(broad).toVar();
      const grain = periodicNoise(p.mul(8).add(31.7));

      // --- 1. DESERT SAND ---
      If(sandAmount.greaterThan(0.001), () => {
        // Natural wind meander + drift pockets so fine ripples fork, curve, and dissolve organically.
        const warp = periodicNoise(p.mul(0.5).add(17.3), PATTERN_PERIOD / 2).sub(0.5);
        const bend = periodicNoise(p.div(4).add(41.9), PATTERN_PERIOD / 4).sub(0.5);
        const driftMask = smoothstep(0.18, 0.82, periodicNoise(p.div(4).add(63.1), PATTERN_PERIOD / 4)).mul(0.62).add(0.38);
        const sheetMask = smoothstep(0.20, 0.80, periodicNoise(broad.div(2).add(19.7), PATTERN_PERIOD / 2)).mul(0.55).add(0.45);
        const forkBlend = smoothstep(0.32, 0.68, periodicNoise(p.div(8).add(7.3), PATTERN_PERIOD / 8));

        // Fine wind ripples (~0.22 m, delicate walking-distance relief out to ~28 m).
        const phaseA = p.x.mul(dune.x).add(p.y.mul(dune.y)).mul(Math.PI * 2)
          .add(bend.mul(2.8)).add(warp.mul(1.35));
        const phaseB = p.x.mul(dune.x).add(p.y.mul(dune.y.add(1))).mul(Math.PI * 2)
          .add(bend.mul(2.4)).sub(warp.mul(1.15));
        const fineFade = oneMinus(smoothstep(0.6, 2.3, finePhaseFw))
          .mul(oneMinus(smoothstep(8, 28, cameraDistance)));
        const fineA = duneProfileAndSlope(phaseA, dune.w);
        const fineB = duneProfileAndSlope(phaseB, dune.w.mul(0.85));
        const fineAmp = dune.z.min(1.25).mul(fineFade).mul(driftMask).mul(oneMinus(crustFlat));
        const rippleVal = mix(fineA.x, fineB.x, forkBlend.mul(0.45)).mul(fineAmp);

        // Mid-scale wind-swept sand waves (~5.4 m, sinuous sheets bridging 6..135 m).
        const wavePhase = broad.dot(waveVec).mul(Math.PI * 2).add(bend.mul(2.1)).add(macro.sub(0.5).mul(1.65));
        const waveFade = oneMinus(smoothstep(0.65, 2.4, wavePhaseFw))
          .mul(smoothstep(4, 18, cameraDistance).mul(0.55).add(0.45))
          .mul(oneMinus(smoothstep(85, 165, cameraDistance)));
        const wavePS = duneProfileAndSlope(wavePhase, dune.w.mul(0.65));
        const waveAmp = dune.z.min(1.15).mul(waveFade).mul(sheetMask).mul(oneMinus(crustFlat.mul(0.6)));
        const waveVal = wavePS.x.mul(waveAmp);

        // Broad sweeping erg swells (~22 m, graceful curved dune lines from the air).
        const swellPhase = broad.dot(swellVec).mul(Math.PI * 2).add(macro.sub(0.5).mul(2.25)).add(bend.mul(0.95));
        const swellFade = oneMinus(smoothstep(0.65, 2.4, swellPhaseFw))
          .mul(smoothstep(18, 52, cameraDistance))
          .mul(oneMinus(smoothstep(230, 420, cameraDistance)));
        const swellPS = duneProfileAndSlope(swellPhase, dune.w.mul(0.58));
        const swellAmp = dune.z.min(1.1).mul(swellFade).mul(sheetMask);
        const swellVal = swellPS.x.mul(swellAmp);

        // Far sweeping dune ridges (~56 m, 50..880 m) for subtle macro desert topography.
        const ridgePhase = broad.dot(ridgeVec).mul(Math.PI * 2).add(macro.sub(0.5).mul(2.35));
        const ridgeFade = oneMinus(smoothstep(0.65, 2.4, ridgePhaseFw))
          .mul(smoothstep(48, 125, cameraDistance))
          .mul(oneMinus(smoothstep(580, 920, cameraDistance)));
        const ridgePS = duneProfileAndSlope(ridgePhase, dune.w.mul(0.5));
        const ridgeAmp = smoothstep(0.22, 0.68, macro).mul(ridgeFade);
        const ridgeVal = ridgePS.x.mul(ridgeAmp);

        // Rich desert mineral palette: sun-bleached warm ivory crests vs golden-ochre troughs.
        const sandDark = pigment('#b4966a');
        const sandLight = pigment('#e5cfa8');
        const sandMean = mix(sandDark, sandLight, 0.5);
        const grainSpeckle = microGrain.z.sub(0.5).mul(0.095).mul(oneMinus(smoothstep(18, 70, cameraDistance)));
        const crestFactor = rippleVal.mul(0.45).add(waveVal.mul(0.4)).add(swellVal.mul(0.45)).add(ridgeVal.mul(0.45)).clamp(-1, 1);
        const leeTint = mix(pigment('#c9a676'), pigment('#f0dec0'), crestFactor.mul(0.5).add(0.5)).div(pigment('#dcc29b'));
        const selfShade = float(1).add(rippleVal.mul(0.036)).add(waveVal.mul(0.034)).add(swellVal.mul(0.038)).add(ridgeVal.mul(0.05));

        const sandTint = mix(sandDark, sandLight, macro).div(sandMean)
          .mul(leeTint)
          .mul(selfShade)
          .mul(grainSpeckle.add(1));

        const distFade = oneMinus(smoothstep(180, 380, cameraDistance));
        const farSand = mix(vec3(1), sandTint, distFade).mul(ridgeVal.mul(0.05).add(1));
        colorOut.assign(mix(colorOut, farSand, sandAmount));
      });

      // --- 2. COLD DESERT / MINERAL STEPPE ---
      If(mineralAmount.greaterThan(0.001), () => {
        const mineralMean = mix(pigment('#787b76'), pigment('#b6b7a5'), 0.5);
        const midReach = smoothstep(12, 35, cameraDistance).mul(oneMinus(smoothstep(380, 560, cameraDistance)));
        const panWarp = vec2(
          periodicNoise(p.div(8).add(13.1), PATTERN_PERIOD / 8).add(periodicNoise(p.div(2).add(71.3), PATTERN_PERIOD / 2).mul(0.35)),
          periodicNoise(p.div(8).add(57.9), PATTERN_PERIOD / 8).add(periodicNoise(p.div(2).add(29.4), PATTERN_PERIOD / 2).mul(0.35)),
        ).sub(0.675).mul(7);
        const q = p.add(panWarp);
        const stones = smoothstep(0.44, 0.56, periodicNoise(q.div(2).add(51.7), PATTERN_PERIOD / 2)).mul(0.3)
          .add(smoothstep(0.42, 0.58, periodicNoise(q.div(4).add(87.3), PATTERN_PERIOD / 4)).mul(0.4))
          .add(smoothstep(0.36, 0.64, periodicNoise(q.div(16).add(23.9), PATTERN_PERIOD / 16)).mul(0.3));
        const mineral = mix(pigment('#787b76'), pigment('#b6b7a5'), macro).div(mineralMean)
          .mul(grain.sub(0.5).mul(0.18).mul(reach).add(1))
          .mul(stones.sub(0.5).mul(0.5).mul(midReach).add(1));
        const mineralTint = mix(vec3(1), mineral, oneMinus(smoothstep(160, 320, cameraDistance)));
        colorOut.assign(mix(colorOut, mineralTint, mineralAmount));
        mineralHeight.assign(
          smoothstep(0.58, 0.8, grain).mul(0.006).mul(reach)
            .add(stones.mul(0.05).mul(midReach))
            .mul(mineralAmount),
        );
      });
    });

    return vec4(colorOut, mineralHeight);
  })().toVar('aridColorHeight');

  // Separate lightweight evaluation for analytic sand slope + roughness offset so color & normal stay decoupled and clean.
  const sandSlopeRough = Fn(() => {
    const out = vec3(0, 0, 0).toVar();
    If(sandAmount.greaterThan(0.001), () => {
      const p = fineLattice.toVar();
      const broad = broadLattice.toVar();
      const macro = periodicFbm2(broad).toVar();
      const warp = periodicNoise(p.mul(0.5).add(17.3), PATTERN_PERIOD / 2).sub(0.5);
      const bend = periodicNoise(p.div(4).add(41.9), PATTERN_PERIOD / 4).sub(0.5);
      const driftMask = smoothstep(0.18, 0.82, periodicNoise(p.div(4).add(63.1), PATTERN_PERIOD / 4)).mul(0.62).add(0.38);
      const sheetMask = smoothstep(0.20, 0.80, periodicNoise(broad.div(2).add(19.7), PATTERN_PERIOD / 2)).mul(0.55).add(0.45);
      const forkBlend = smoothstep(0.32, 0.68, periodicNoise(p.div(8).add(7.3), PATTERN_PERIOD / 8));
      const crossDir = vec2(windDir.y.negate(), windDir.x);

      const phaseA = p.x.mul(dune.x).add(p.y.mul(dune.y)).mul(Math.PI * 2)
        .add(bend.mul(2.8)).add(warp.mul(1.35));
      const phaseB = p.x.mul(dune.x).add(p.y.mul(dune.y.add(1))).mul(Math.PI * 2)
        .add(bend.mul(2.4)).sub(warp.mul(1.15));
      const fineFade = oneMinus(smoothstep(0.6, 2.3, finePhaseFw))
        .mul(oneMinus(smoothstep(8, 28, cameraDistance)));
      const fineA = duneProfileAndSlope(phaseA, dune.w);
      const fineB = duneProfileAndSlope(phaseB, dune.w.mul(0.85));
      const fineAmp = dune.z.min(1.25).mul(fineFade).mul(driftMask).mul(oneMinus(crustFlat));
      const fineSlopeMag = mix(fineA.y, fineB.y, forkBlend.mul(0.45))
        .mul(fineAmp).mul(0.042).mul(fineFreqScale.clamp(1, 6).div(4.5));

      const wavePhase = broad.dot(waveVec).mul(Math.PI * 2).add(bend.mul(2.1)).add(macro.sub(0.5).mul(1.65));
      const waveFade = oneMinus(smoothstep(0.65, 2.4, wavePhaseFw))
        .mul(smoothstep(4, 18, cameraDistance).mul(0.55).add(0.45))
        .mul(oneMinus(smoothstep(85, 165, cameraDistance)));
      const wavePS = duneProfileAndSlope(wavePhase, dune.w.mul(0.65));
      const waveAmp = dune.z.min(1.15).mul(waveFade).mul(sheetMask).mul(oneMinus(crustFlat.mul(0.6)));
      const waveSlopeMag = wavePS.y.mul(waveAmp).mul(0.044);

      const swellPhase = broad.dot(swellVec).mul(Math.PI * 2).add(macro.sub(0.5).mul(2.25)).add(bend.mul(0.95));
      const swellFade = oneMinus(smoothstep(0.65, 2.4, swellPhaseFw))
        .mul(smoothstep(18, 52, cameraDistance))
        .mul(oneMinus(smoothstep(230, 420, cameraDistance)));
      const swellPS = duneProfileAndSlope(swellPhase, dune.w.mul(0.58));
      const swellAmp = dune.z.min(1.1).mul(swellFade).mul(sheetMask);
      const swellSlopeMag = swellPS.y.mul(swellAmp).mul(0.052);

      const ridgePhase = broad.dot(ridgeVec).mul(Math.PI * 2).add(macro.sub(0.5).mul(2.35));
      const ridgeFade = oneMinus(smoothstep(0.65, 2.4, ridgePhaseFw))
        .mul(smoothstep(48, 125, cameraDistance))
        .mul(oneMinus(smoothstep(580, 920, cameraDistance)));
      const ridgePS = duneProfileAndSlope(ridgePhase, dune.w.mul(0.5));
      const ridgeAmp = smoothstep(0.22, 0.68, macro).mul(ridgeFade);
      const ridgeSlopeMag = ridgePS.y.mul(ridgeAmp).mul(0.062);

      const totalWindSlope = fineSlopeMag.add(waveSlopeMag).add(swellSlopeMag).add(ridgeSlopeMag);
      const crossSlope = bend.mul(0.025).add(warp.mul(0.02)).mul(fineFade).mul(oneMinus(crustFlat));
      const worldSlope = windDir.mul(totalWindSlope).add(crossDir.mul(crossSlope)).add(microGrain.xy.mul(0.58));
      const crest = mix(fineA.x, fineB.x, forkBlend.mul(0.45)).mul(fineAmp).mul(0.5)
        .add(wavePS.x.mul(waveAmp).mul(0.45)).clamp(-1, 1);
      const roughOffset = crest.mul(-0.07).mul(oneMinus(crustFlat)).add(microGrain.z.sub(0.5).mul(0.05));
      out.assign(vec3(worldSlope.x.mul(sandAmount), worldSlope.y.mul(sandAmount), roughOffset.mul(sandAmount)));
    });
    return out;
  })().toVar('aridSandSlopeRough');

  const perturbViewNormal = (normal) => {
    const viewSlope = cameraViewMatrix.mul(vec4(sandSlopeRough.x.negate(), 0, sandSlopeRough.y.negate(), 0)).xyz;
    const withSand = normalize(normal.add(viewSlope));
    const mineralRelief = heightRelief(withSand, evaluated.a);
    return mix(withSand, mineralRelief, mineralAmount).normalize();
  };

  // Build world-locked sunlit quartz glints & grazing silica sheen for loose desert sand.
  const localMeters = hasDetailCoords ? vec2(terrainUv.x, terrainUv.y).mul(chunkWorldSize) : localXZ;
  const originMeters = hasDetailCoords
    ? vec2(chunkCenter.x.sub(chunkWorldSize * 0.5), chunkCenter.y.negate().sub(chunkWorldSize * 0.5)).round()
    : vec2(0, 0);
  const worldPerturbedNormal = baseNormal
    ? normalize(cameraWorldMatrix.mul(vec4(perturbViewNormal(baseNormal), 0)).xyz)
    : normalize(vec3(sandSlopeRough.x.negate(), float(1), sandSlopeRough.y.negate()));
  const sunResponse = sun
    ? createSandOpticalResponse({
      localMeters,
      originMeters,
      worldNormal: worldPerturbedNormal,
      sun,
      sandWeight: looseSand,
      sparkleMask: microGrain.w,
      glintGain: 1.0,
      sheenGain: 1.0,
    })
    : vec3(0);

  return {
    apply(color, roughness, normal) {
      const targetRoughness = mix(
        mix(roughness, float(0.9), mineralAmount),
        clamp(float(0.89).add(sandSlopeRough.z), 0.76, 0.97),
        sandAmount,
      );
      return {
        // Mean-preserving gains retain the shared CPU far-color palette.
        color: color.mul(evaluated.rgb),
        roughness: targetRoughness,
        normal: perturbViewNormal(normal),
      };
    },
    amount: active,
    sandWeight: looseSand,
    sunResponse,
    height: evaluated.a,
  };
}
