import {
  clamp, color, float, fwidth, max, mix, mx_noise_float, normalize, smoothstep, texture, time, vec2, vec3,
} from 'three/tsl';
import { bumpNormal, geometryNormal, viewDirection } from '../LocationShading.js';
import { NOISE, locationNoise, planarNoise } from '../locationNoise.js';
import { iceSparkle } from './IceSparkle.js';

/** Snow texture repeats per metre. */
const SNOW_SCALE = 0.4;
/** Height of wind ridges in the snow, metres. */
const SASTRUGI_HEIGHT = 0.06;
/** Depth of the ruts in trodden snow, metres. */
const RUT_DEPTH = 0.025;
/** Grain of the snow's broken edge, noise cycles per metre. */
const EDGE_GRAIN = 2.6;
/** Narrowest the snow's edge is drawn, in units of its cover; wider than before so transitions read soft & natural. */
const EDGE_MIN = 0.045;
/** How far into its cover the snow takes to reach its full depth: the lip at its edge. */
const LIP_SPREAD = 0.16;
/** Frost crystals per metre. */
const FROST_GRAIN = 40;
/** How far frost prefers the rims between scallops to their hollows. */
const FROST_RIM = 0.12;
/** Faces are crusted only once they turn toward the sky: cliffs keep their blue. */
const CRUST_FROM = 0.2, CRUST_TO = 0.8;

/**
 * Sun and wind rot exposed glacier ice into a porous white crust: on what faces
 * the sky, worst on the scallop rims and along the bubbly layers, never on a face
 * in shelter.
 */
export function weatheringCrust({ profile, occlusion, sky, hollow, firn }) {
  return smoothstep(CRUST_FROM, CRUST_TO, geometryNormal.y).mul(sky).mul(smoothstep(0.5, 0.9, occlusion))
    .mul(hollow.mul(-0.6).add(0.9).add(firn.mul(0.4))).mul(profile.crust);
}

/**
 * What lies on the ice: hoar frost, frosted drift skirts, and wind-packed snow.
 *
 * Replaces the previous sharp cel-shaded dark-blue outline around snow edges with
 * a soft crystalline hoarfrost transition skirt + restrained lip contact shading,
 * and upgrades frost/snow glints to anti-aliased `iceSparkle` micro-facets.
 */
export function iceCover(surface, {
  point,
  profile,
  snowMaps,
  packMap = null,
  lightDir = vec3(0, 1, 0),
  frost,
  snow,
  trail,
  occlusion,
  sky,
  near,
  hollow,
}) {
  let { albedo, normal, roughness, wrap, bare } = surface;

  // Hoar frost grows as fine crystals, thickest on the rims; a light frost is a stipple, never a blot.
  const rimmed = frost.add(hollow.oneMinus().sub(0.5).mul(FROST_RIM));
  const grain = locationNoise(NOISE.grit, point.mul(FROST_GRAIN)).mul(0.15).mul(near);
  const frosted = smoothstep(0, 1, rimmed.add(grain)).mul(clamp(frost.mul(4), 0, 1));
  const frostGlint = packMap
    ? iceSparkle({ point, normal, packMap, lightDir, near, scale: 14, threshold: 0.74, strength: 0.95 })
    : smoothstep(0.5, 0.75, locationNoise(NOISE.pits, point.mul(46).add(viewDirection.mul(5)))).mul(near).mul(0.45);
  albedo = mix(albedo, color(profile.frostColor).mul(frostGlint.mul(0.65).add(1)), frosted.mul(0.85));
  roughness = mix(roughness, float(0.76), frosted);
  bare = bare.mul(frosted.oneMinus());

  const [slopeFrom, slopeTo] = profile.snowSlope;
  const { gather, breakup, lip, shadow } = profile.snowEdge;
  const cover = snow.mul(smoothstep(slopeFrom, slopeTo, geometryNormal.y));
  const settle = hollow.sub(0.5).add(occlusion.oneMinus()).mul(gather)
    .add(mx_noise_float(point.mul(0.7)).add(mx_noise_float(point.mul(EDGE_GRAIN)).mul(0.6)).mul(breakup));
  const edge = cover.add(settle.mul(cover.oneMinus().mul(cover).mul(4))).sub(0.5);
  const soft = max(fwidth(edge).mul(1.6), EDGE_MIN);
  const lying = smoothstep(soft.negate(), soft, edge);
  const packed = trail.mul(lying);

  // Soft frosted skirt just outside the snow drift replaces the harsh cartoon blue outline.
  const frostSkirt = smoothstep(-LIP_SPREAD * 1.4, 0, edge).mul(lying.oneMinus()).mul(smoothstep(0.05, 0.35, cover));
  albedo = mix(albedo, color(profile.frostColor).mul(0.92), frostSkirt.mul(0.32));
  roughness = mix(roughness, float(0.52), frostSkirt.mul(0.45));
  // Subtle natural lip contact shadow (much gentler than before so no dark cel border forms).
  albedo = albedo.mul(smoothstep(-LIP_SPREAD * 0.55, 0, edge).mul(lying.oneMinus()).mul(shadow * 0.28).oneMinus());

  // Sastrugi: ridges long down the wind and short across it.
  const [windX, windZ] = profile.wind;
  const down = point.x.mul(windX).add(point.z.mul(windZ)), cross = point.z.mul(windX).sub(point.x.mul(windZ));
  const ridges = mx_noise_float(vec3(cross.mul(1.5), down.mul(0.22), point.y.mul(0.4)))
    .add(mx_noise_float(vec3(cross.mul(4.1), down.mul(0.7), 3.3)).mul(0.35));
  const flow = down.sub(time.mul(profile.driftSpeed));
  const snakes = smoothstep(0.1, 0.55, planarNoise(NOISE.patch, vec2(cross.mul(0.3), flow.mul(0.07)))
    .add(planarNoise(NOISE.mottle, vec2(cross.mul(1.1), flow.mul(0.26).add(5.1))).mul(0.45))).mul(sky).mul(profile.drift);
  const uv = point.xz.mul(SNOW_SCALE);
  const tilt = texture(snowMaps.normal, uv).xy.mul(2).sub(1);
  const ruts = mx_noise_float(vec3(point.x.mul(5), point.y, point.z.mul(5))).mul(RUT_DEPTH);
  const relief = mix(ridges.mul(SASTRUGI_HEIGHT), ruts, packed).add(smoothstep(0, LIP_SPREAD, edge).mul(lip * 0.72));
  const snowNormal = normalize(bumpNormal(geometryNormal, relief, 1).add(vec3(tilt.x, 0, tilt.y).mul(0.45)));

  const snowGlint = packMap
    ? iceSparkle({ point, normal: snowNormal, packMap, lightDir, near, scale: 17, threshold: 0.78, strength: 1.25 })
    : smoothstep(0.62, 0.8, locationNoise(NOISE.grit, point.mul(55).add(viewDirection.mul(6)))).mul(near);
  const shelter = occlusion.mul(sky.mul(0.4).add(0.6));
  const snowAlbedo = texture(snowMaps.color, uv).rgb.mul(color(profile.snowColor))
    .mul(mix(color(profile.snowShade), vec3(1), shelter)).mul(mix(vec3(1), color(profile.trailColor), packed))
    .mul(snowGlint.mul(1.35).add(snakes.mul(0.3)).add(1));

  return {
    albedo: mix(albedo, snowAlbedo, lying),
    normal: normalize(mix(normal, snowNormal, lying)),
    roughness: mix(roughness, mix(float(0.92), float(0.58), packed), lying),
    wrap: mix(wrap, float(0.6), lying),
    bare: bare.mul(lying.oneMinus()),
    glint: max(frostGlint.mul(frosted), snowGlint.mul(lying)),
  };
}
