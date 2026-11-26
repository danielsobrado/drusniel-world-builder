import { createSeaDetailNodes } from './SeaDetailShading.js';
import { createSeaSurfNodes, createSeaFoamPattern } from './SeaSurfNodes.js';
import { createSeaShelterNode } from './SeaDiffractionNodes.js';
import { resolveSeaSurf } from '../water/SeaSurf.js';
import { erodeFoamLace } from './CoastalFoamPatterns.js';
import {
  abs,
  clamp,
  dot,
  float,
  max,
  min,
  mix,
  normalize,
  oneMinus,
  positionWorld,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  vec2,
  vec3,
} from 'three/tsl';
import { createSeaSwellNodes } from '../water/SeaSwell.js';
import { seaStateUniforms } from '../water/seaState.js';
import { rainRoughness } from './RainRippleShading.js';
import { composeOffshoreDetail, offshoreFftWeight } from '../water/fft/OceanFftBlendNodes.js';
import { resolveOffshoreFft } from '../water/fft/OceanFftConfig.js';
import { createOceanSwellNodes } from './OceanSwellNodes.js';

/** Nearshore normals follow the rendered depth contours and amplitude envelope. */
function displacedSurfaceSlope() {
  const normal = positionWorld.dFdx().cross(positionWorld.dFdy()).toVar('seaDisplacedNormal');
  const vertical = normal.y.abs().max(1e-8).mul(select(normal.y.lessThan(0), -1, 1));
  return vec2(normal.x, normal.z).negate().div(vertical);
}

/**
 * The open-sea swell on a water chunk: how far the sheet rises and falls, and
 * how that reads on an unlit material: `normal` tilts the reflection, which at
 * the grazing angles a sea is mostly seen at is what makes waves visible;
 * slopes turned toward the sun brighten and those turned away darken; crests
 * lift the existing water colour; and steep crests break into whitecaps,
 * more of them in a storm.
 *
 * Only sea water swells. The water field has no kind channel, so the sea is
 * water standing at the world's still-water level with no current: lakes sit
 * at their own level and rivers flow. The amplitude also falls to zero in the
 * shallows (`sea.shallowDepth`, and never more than `sea.depthRatio` of the
 * depth), so the waterline itself stays where the terrain puts it.
 *
 * Evaluated per vertex and interpolated: the shortest component is 7.5 m, over
 * a 2 m grid.
 */
/**
 * How much of the water here is sea, 0..1. The water field has no kind channel,
 * so the sea is water standing at the world's still-water level with no current:
 * lakes sit at their own level and rivers flow. Needs no swell, so it holds with
 * the swell switched off too.
 */
export function seaWaterMask({ surfaceWorldHeight, currentStrength }) {
  return oneMinus(smoothstep(0.05, 0.3, abs(surfaceWorldHeight.sub(seaStateUniforms.seaLevel))))
    .mul(oneMinus(clamp(currentStrength.mul(4), 0, 1)));
}

export function createSeaSurfaceNodes({
  terrainUv,
  patternXZ = null,
  patterns = null,
  chunkWorldSize,
  surfaceWorldHeight,
  waterDepth,
  shoreDistance = float(0),
  waterCoverage,
  currentStrength,
  time,
  phaseOrigin,
  sunDirection,
  config,
  oceanMask = null,
  exposure = float(1),
  // Slope of the ripple field (water/rippleFieldNode.js), world x/z.
  ripple = null,
  // Offshore FFT (PR I.4): { binding, origin, settings } or null. Only with a real
  // ocean mask: lakes at sea level never receive it.
  oceanFft = null,
  // Long swell (PR I.6): this chunk's four vec4 mode phase origins, or null. Real
  // wave height; only with a real ocean mask, like the FFT normals.
  oceanSwellOrigin = null,
  // Shared tileable `WORLD_NOISE_LAYERS.water` `(uv) => vec3` (R vein, G voronoi, B perlin).
  waterNoise = null,
}) {
  const { storm } = seaStateUniforms;
  // Metres from the chunk centre on canonical axes, matching the chunk's world position.
  const localXZ = vec2(
    terrainUv.x.sub(0.5).mul(chunkWorldSize),
    float(0.5).sub(terrainUv.y).mul(chunkWorldSize),
  );
  const sharpness = float(config.choppiness * 0.075).mul(storm.mul(0.5).add(1));
  const swell = createSeaSwellNodes({ localXZ, phaseOrigin, time, sharpness });
  const seaMask = oceanMask ?? seaWaterMask({ surfaceWorldHeight, currentStrength });
  const offshore = float(config.amplitude).mul(storm.mul(config.stormScale - 1).add(1));
  const amplitude = min(offshore, waterDepth.mul(config.depthRatio))
    .mul(smoothstep(0, config.shallowDepth, waterDepth))
    .mul(seaMask)
    .mul(waterCoverage)
    .mul(exposure)
    .toVarying('seaSwellAmplitude');
  const detail = patternXZ ? createSeaDetailNodes({
    // Wind ripples survive in sheltered shallows even when large swell cannot.
    // Reusing the displacement envelope erased all surface structure there.
    patternXZ, time, choppiness: config.choppiness,
    strength: smoothstep(.04, .5, waterDepth).mul(mix(float(.35), float(1), exposure)), patterns, localXZ,
    phases: swell.phases, amplitude, settings: config.detail,
  }) : null;
  const surf = createSeaSurfNodes({
    swell, waterDepth, shoreDistance, localXZ, patterns, time,
    settings: resolveSeaSurf(config.surf),
    offshoreAmplitude: offshore, legacyAmplitude: amplitude,
    exposure, seaMask, waterCoverage,
    waterNoise,
  });
  const shelter = config.surf?.diffraction?.enabled
    ? createSeaShelterNode(exposure, shoreDistance) : float(1);
  const strength = (surf?.amplitude ?? amplitude).div(offshore.max(1e-4));
  const height = (surf?.height ?? swell.height).toVarying('seaSwellHeight');
  const geometry = oceanSwellOrigin && oceanMask ? resolveOffshoreFft(config.offshoreFft) : null;
  const longSwell = geometry?.enabled && geometry.geometry.enabled ? (() => {
    const nodes = createOceanSwellNodes({ localXZ, origin: oceanSwellOrigin });
    // Same geography as the FFT normals, never the GPU's availability: the CPU twin can't see it.
    const weight = offshoreFftWeight({ waterDepth, shoreDistance, exposure, oceanMask, waterCoverage,
      available: float(1), blend: geometry.blend });
    return { height: nodes.height.mul(weight), slope: nodes.slope.mul(weight) };
  })() : null;
  const swellSlope = (longSwell ? swell.slope.mul(amplitude).add(longSwell.slope) : swell.slope.mul(amplitude))
    .toVarying('seaSwellSlope');
  const slope = surf ? mix(displacedSurfaceSlope(), swellSlope, surf.offshore) : swellSlope;
  // Wind chop: a storm roughly doubles the short waves riding the swell.
  const stormGain = storm.mul(1.2).add(1);
  const offshoreDetail = detail && oceanFft && oceanMask ? composeOffshoreDetail({
    detail, stormGain, fft: { ...oceanFft, localXZ },
    weight: offshoreFftWeight({ waterDepth, shoreDistance, exposure, oceanMask, waterCoverage,
      available: oceanFft.binding.available, blend: oceanFft.settings.blend }),
  }) : null;
  const detailed = offshoreDetail ? slope.add(offshoreDetail.slope)
    : detail ? slope.add(detail.slope.mul(stormGain)) : slope;
  const surfaceSlope = ripple ? detailed.add(ripple) : detailed;
  const normal = normalize(vec3(surfaceSlope.x.negate(), 1, surfaceSlope.y.negate()));
  const sun = normalize(sunDirection);
  const lit = dot(normal, sun).sub(sun.y);
  const crest = smoothstep(0.3, 0.95, height).mul(strength);
  // Whitecaps share the surf's bounded world field, independently of the
  // periodic normal texture. Chunk-local coordinates preserve planet precision.
  const foamPattern = surf?.foamPattern
    ?? (patterns ? createSeaFoamPattern(patterns, localXZ, time, waterNoise) : null);
  const foamNoise = foamPattern?.laceHeight ?? float(1);
  // Evaluate breakup per fragment. The old sub-4 m vertex sine pattern aliased
  // against the 2 m water grid and repeated along every carrier crest.
  const breakup = smoothstep(0.25, 0.85, foamNoise);
  const threshold = mix(
    float(config.whitecapThreshold),
    float(config.stormWhitecapThreshold),
    storm,
  );
  const roughness = float(0.055).add(storm.mul(0.09)).add(rainRoughness(seaStateUniforms.rain))
    .add(sqrt(offshoreDetail?.variance ?? detail?.variance ?? float(0)).mul(0.16)).clamp(0.05, 0.48);

  return {
    displacement: longSwell ? (surf?.displacement ?? height.mul(amplitude)).add(longSwell.height)
      : surf?.displacement ?? height.mul(amplitude),
    shelter,
    release: detail?.release,
    normal,
    foamNoise,
    foamPattern,
    subsurfaceFoam: surf?.subsurfaceFoam?.mul(seaMask) ?? float(0),
    roughness,
    glint(viewDirection) {
      const specular = dot(sun.negate().reflect(normal), viewDirection).max(0);
      const exponent = mix(float(190), float(18), smoothstep(0.05, 0.48, roughness));
      return pow(specular, exponent).mul(1.55)
        .add(pow(specular, mix(float(24), float(8), roughness)).mul(0.12));
    },
    // How much of this water is sea, 0..1: at sea level and without a current.
    mask: seaMask,
    surfFoam: surf?.foam.mul(seaMask),
    shade(color) {
      const shaded = color.mul(float(1).add(lit.mul(config.slopeShading)));
      // A lit crest retains the water's chroma. Blending every carrier peak
      // toward white painted broad, repeating foam-like stamps on calm water.
      return shaded.mul(float(1).add(crest.mul(config.crestLift)));
    },
    whitecap() {
      const crestDensity = smoothstep(threshold, 1, height).mul(strength);
      // Past a gale the wind tears foam off breaking wave crests and stretches
      // wispy spume trails along the swell — never tiling a flat grid over troughs.
      const gale = smoothstep(0.35, 1, storm);
      if (foamPattern) {
        const crestWave = smoothstep(0.18, 0.88, height);
        const swellBreakup = patterns
          ? sin(patterns.wavePhase('surfAlong', localXZ).mul(0.85)).mul(0.25).add(0.75)
          : float(0.85);
        const streakDensity = gale.mul(crestWave).mul(swellBreakup)
          .mul(smoothstep(0.6, 2.5, waterDepth)).mul(seaMask).mul(0.52);
        const capDensity = max(crestDensity.mul(0.78), streakDensity);
        // Feathery wind-whipped edges so distant offshore whitecaps never look like cutouts.
        const capFade = smoothstep(0.05, 0.45, capDensity);
        return erodeFoamLace({
          density: capDensity,
          laceHeight: foamPattern.laceHeight,
          frothDetail: foamPattern.frothDetail,
          uvFootprint: foamPattern.uvFootprint,
          edgeMin: 0.14,
          edgeMax: 0.32,
          bodyFloor: 0.68,
          bodyStrength: 0.18,
        }).coverage.mul(capFade);
      }
      const crestCap = crestDensity.mul(breakup);
      const streaks = smoothstep(mix(float(0.78), float(0.5), gale), 0.95, foamNoise)
        .mul(gale).mul(smoothstep(0.6, 2.5, waterDepth)).mul(seaMask).mul(0.7);
      return max(crestCap, streaks);
    },
    /**
     * The standing foam line where the sea meets the beach: a laced band over
     * the first metre or two from the shore, wider and denser in a storm. The
     * swash front only draws a thin moving wire; this is what reads from afar.
     * Measured in metres, not depth, and organically warped so the 2 m water
     * field grid never prints a sawtooth contour along diagonal beaches.
     */
    shoreLine(shoreDistance) {
      const warpedShore = foamPattern
        ? max(shoreDistance.add(foamPattern.organicWarp.mul(0.45)), 0)
        : shoreDistance;
      // Starts just past the waterline fade (0.2 m), so the sheet does not thin it away.
      const band = smoothstep(0.05, 0.16, waterDepth)
        .mul(oneMinus(smoothstep(0.42, storm.mul(1.9).add(1.75), warpedShore)));
      // Keep peak storm density below solid saturation so cellular lace breathes through.
      const density = band.mul(storm.mul(0.22).add(0.54)).mul(seaMask).mul(shelter).clamp(0, 0.76);
      if (foamPattern) {
        return erodeFoamLace({
          density,
          laceHeight: foamPattern.laceHeight,
          frothDetail: foamPattern.frothDetail,
          uvFootprint: foamPattern.uvFootprint,
          edgeMin: 0.095,
          edgeMax: 0.25,
          bodyFloor: 0.62,
          bodyStrength: 0.20,
        }).coverage;
      }
      return density.mul(smoothstep(0.45, 0.75, foamNoise));
    },
    /**
     * Light coming through a crest, after grass-test's crest transmission.
     *
     * A wave seen edge-on with the sun beyond it glows: the crest has to be high,
     * the view has to be grazing — look straight down and you are looking at the
     * water, not through it — and the light has to be behind the wave rather than
     * bouncing off it. Squaring the grazing term concentrates it in the last few
     * degrees, which is where it happens on a real sea.
     *
     * Returned as an amount rather than a colour, so the material mixes its own.
     */
    transmissionAmount(viewDirection) {
      const grazing = oneMinus(abs(dot(normal, viewDirection)));
      const backlit = clamp(dot(viewDirection, sun.negate()), 0, 1);
      return crest
        .mul(grazing.mul(grazing))
        .mul(backlit)
        .mul(config.crestTransmission ?? 0);
    },
  };
}
