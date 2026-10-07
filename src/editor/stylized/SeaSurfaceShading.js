import { createSeaDetailNodes } from './SeaDetailShading.js';
import { createSeaSurfNodes } from './SeaSurfNodes.js';
import { resolveSeaSurf } from '../water/SeaSurf.js';
import {
  abs,
  clamp,
  dot,
  float,
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
import { createSeaFoamNoise } from './SeaSurfNodes.js';

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
 * lift toward the highlight colour; and steep crests break into whitecaps,
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
  waterCoverage,
  currentStrength,
  time,
  phaseOrigin,
  sunDirection,
  config,
}) {
  const { storm } = seaStateUniforms;
  // Metres from the chunk centre on canonical axes, matching the chunk's world position.
  const localXZ = vec2(
    terrainUv.x.sub(0.5).mul(chunkWorldSize),
    float(0.5).sub(terrainUv.y).mul(chunkWorldSize),
  );
  const sharpness = float(config.choppiness * 0.075).mul(storm.mul(0.5).add(1));
  const swell = createSeaSwellNodes({ localXZ, phaseOrigin, time, sharpness });
  const seaMask = seaWaterMask({ surfaceWorldHeight, currentStrength });
  const offshore = float(config.amplitude).mul(storm.mul(config.stormScale - 1).add(1));
  const amplitude = min(offshore, waterDepth.mul(config.depthRatio))
    .mul(smoothstep(0, config.shallowDepth, waterDepth))
    .mul(seaMask)
    .mul(waterCoverage)
    .toVarying('seaSwellAmplitude');
  // Share of full offshore height, so crests and whitecaps fade in the shallows.
  const strength = amplitude.div(offshore.max(1e-4));

  const detail = patternXZ ? createSeaDetailNodes({
    patternXZ, time, choppiness: config.choppiness, strength, patterns, localXZ,
    phases: swell.phases, amplitude, settings: config.detail,
  }) : null;
  const surf = createSeaSurfNodes({ swell, waterDepth, localXZ, patterns, time, laceTexture: detail?.map,
    settings: resolveSeaSurf(config.surf) });
  const height = (surf?.height ?? swell.height).toVarying('seaSwellHeight');
  const swellSlope = swell.slope.mul(amplitude).toVarying('seaSwellSlope');
  const slope = surf ? mix(displacedSurfaceSlope(), swellSlope, surf.offshore) : swellSlope;
  const surfaceSlope = detail ? slope.add(detail.slope) : slope;
  const normal = normalize(vec3(surfaceSlope.x.negate(), 1, surfaceSlope.y.negate()));
  const sun = normalize(sunDirection);
  const lit = dot(normal, sun).sub(sun.y);
  const crest = smoothstep(0.3, 0.95, height).mul(strength);
  // Whitecaps break into streaks along the crests. The breakup is built from the
  // swell's own phases, which are exact at any distance from the world origin:
  // a noise of canonical coordinates degrades into a regular lattice at
  // planet scale in float32.
  const [, , p2, p3, p4] = swell.phases;
  const breakup = smoothstep(0.25, 0.85, sin(p3.mul(3.3).add(p2.mul(1.7)))
    .mul(sin(p4.mul(2.1).sub(p2.mul(0.9))))
    .mul(0.5)
    .add(0.5))
    .toVarying('seaWhitecapBreakup');
  const threshold = mix(
    float(config.whitecapThreshold),
    float(config.stormWhitecapThreshold),
    storm,
  );

  return {
    displacement: height.mul(amplitude),
    release: detail?.release,
    normal,
    foamNoise: detail?.map ? createSeaFoamNoise(detail.map, patterns, localXZ, time) : float(1),
    glint(viewDirection) {
      const roughness = float(0.055).add(storm.mul(0.09))
        .add(sqrt(detail?.variance ?? float(0)).mul(0.16)).clamp(0.05, 0.48);
      const specular = dot(sun.negate().reflect(normal), viewDirection).max(0);
      const exponent = mix(float(190), float(18), smoothstep(0.05, 0.48, roughness));
      return pow(specular, exponent).mul(1.55)
        .add(pow(specular, mix(float(24), float(8), roughness)).mul(0.12));
    },
    // How much of this water is sea, 0..1: at sea level and without a current.
    mask: seaMask,
    surfFoam: surf?.foam.mul(seaMask),
    shade(color, highlight) {
      const shaded = color.mul(float(1).add(lit.mul(config.slopeShading)));
      return mix(shaded, highlight, crest.mul(config.crestLift));
    },
    whitecap() {
      return smoothstep(threshold, 1, height).mul(strength).mul(breakup);
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
