import {
  clamp, color, float, fwidth, max, mix, mx_noise_float, normalize, smoothstep, texture, time, vec2, vec3,
} from 'three/tsl';
import { bumpNormal, geometryNormal, viewDirection } from '../LocationShading.js';
import { NOISE, locationNoise, planarNoise } from '../locationNoise.js';

/** Snow texture repeats per metre. */
const SNOW_SCALE = 0.4;
/** Height of wind ridges in the snow, metres. */
const SASTRUGI_HEIGHT = 0.06;
/** Depth of the ruts in trodden snow, metres. */
const RUT_DEPTH = 0.025;
/** Grain of the snow's broken edge, noise cycles per metre. */
const EDGE_GRAIN = 2.6;
/** Narrowest the snow's edge is drawn, in units of its cover; it widens with distance so it never crawls. */
const EDGE_MIN = 0.02;
/** How far into its cover the snow takes to reach its full depth: the lip at its edge. */
const LIP_SPREAD = 0.12;
/** Frost crystals per metre. */
const FROST_GRAIN = 40;
/** How far frost prefers the rims between scallops to their hollows. */
const FROST_RIM = 0.12;
/** Faces are crusted only once they turn toward the sky: cliffs keep their blue. */
const CRUST_FROM = 0.2, CRUST_TO = 0.8;

/**
 * Sun and wind rot exposed glacier ice into a porous white crust: on what faces
 * the sky, worst on the scallop rims and along the bubbly layers, never on a face
 * in shelter. It is returned as a change in how much the ice scatters, not as a
 * coat of white, so the crust stays ice and blue still shows through it.
 *
 * @param {object} options
 * @param {object} options.profile resolved `iceProfiles` entry
 * @param {Node} options.occlusion baked ambient occlusion, 1 in the open
 * @param {Node} options.sky 1 where the surface is open to the sky
 * @param {Node} options.hollow 1 at the bottom of a scallop, 0 on its rim
 * @param {Node} options.firn 0..1 thin bubbly layers
 * @returns {Node} 0..1 added to the ice's scatter
 */
export function weatheringCrust({ profile, occlusion, sky, hollow, firn }) {
  return smoothstep(CRUST_FROM, CRUST_TO, geometryNormal.y).mul(sky).mul(smoothstep(0.5, 0.9, occlusion))
    .mul(hollow.mul(-0.6).add(0.9).add(firn.mul(0.4))).mul(profile.crust);
}

/**
 * What lies on the ice: hoar frost, then snow. Both are applied over an already
 * shaded-ready surface and return the same fields.
 *
 * Snow is a layer, not a tint. It lies where a face turns up and the sky can
 * reach, settles first in the scallop hollows and the cracks, and stops at a
 * crisp, broken edge with a lip of its own thickness: the rim catches the light
 * and drops a shadow on the ice beside it. It hides the ice's relief and layers
 * entirely. Wind cuts ridges into it, it goes blue where the sky cannot reach,
 * single crystals flash as the view moves, and under an open sky loose snow
 * snakes across it down the wind. Where it has been walked and sledged it is
 * packed, greyer and glazed.
 *
 * @param {{ albedo: Node, normal: Node, roughness: Node, wrap: Node, bare: Node }} surface
 *   `bare` is the share of the surface that is still open ice
 * @param {object} options
 * @param {Node} options.point world position
 * @param {object} options.profile resolved `iceProfiles` entry
 * @param {{ color: Texture, normal: Texture }} options.snowMaps
 * @param {Node} options.frost 0..1 frost amount (mask plus profile)
 * @param {Node} options.snow 0..1 snow amount (mask plus profile)
 * @param {Node} options.trail 0..1 how trodden the snow is
 * @param {Node} options.occlusion baked ambient occlusion, 1 in the open
 * @param {Node} options.sky 1 where the surface is open to the sky
 * @param {Node} options.near 1 close to the camera, 0 where fine detail would only shimmer
 * @param {Node} options.hollow 1 at the bottom of a scallop, 0 on its rim
 */
export function iceCover(surface, { point, profile, snowMaps, frost, snow, trail, occlusion, sky, near, hollow }) {
  let { albedo, normal, roughness, wrap, bare } = surface;

  // Hoar frost grows as fine crystals, thickest on the rims; a light frost is a stipple, never a blot.
  const rimmed = frost.add(hollow.oneMinus().sub(0.5).mul(FROST_RIM));
  // The grain is centimetres across and soft: thresholded hard at a coarser scale it reads as camouflage.
  const grain = locationNoise(NOISE.grit, point.mul(FROST_GRAIN)).mul(0.15).mul(near);
  const frosted = smoothstep(0, 1, rimmed.add(grain)).mul(clamp(frost.mul(4), 0, 1));
  const glitter = smoothstep(0.5, 0.75, locationNoise(NOISE.pits, point.mul(46).add(viewDirection.mul(5)))).mul(near);
  albedo = mix(albedo, color(profile.frostColor).mul(glitter.mul(0.3).add(1)), frosted.mul(0.85));
  roughness = mix(roughness, float(0.78), frosted);
  bare = bare.mul(frosted.oneMinus());

  const [slopeFrom, slopeTo] = profile.snowSlope;
  const { gather, breakup, lip, shadow } = profile.snowEdge;
  const cover = snow.mul(smoothstep(slopeFrom, slopeTo, geometryNormal.y));
  // Procedural, like the ridges and ruts: the edge's slope lights the lip through bumpNormal, and 8-bit noise would band it.
  const settle = hollow.sub(0.5).add(occlusion.oneMinus()).mul(gather)
    .add(mx_noise_float(point.mul(0.7)).add(mx_noise_float(point.mul(EDGE_GRAIN)).mul(0.6)).mul(breakup));
  // Only the edge moves: bare ice stays bare and a full cover stays whole.
  const edge = cover.add(settle.mul(cover.oneMinus().mul(cover).mul(4))).sub(0.5);
  const soft = max(fwidth(edge), EDGE_MIN);
  const lying = smoothstep(soft.negate(), soft, edge);
  const packed = trail.mul(lying);
  albedo = albedo.mul(smoothstep(-LIP_SPREAD, 0, edge).mul(lying.oneMinus()).mul(shadow).oneMinus());

  // Sastrugi: ridges long down the wind and short across it.
  const [windX, windZ] = profile.wind;
  const down = point.x.mul(windX).add(point.z.mul(windZ)), cross = point.z.mul(windX).sub(point.x.mul(windZ));
  const ridges = mx_noise_float(vec3(cross.mul(1.5), down.mul(0.22), point.y.mul(0.4)))
    .add(mx_noise_float(vec3(cross.mul(4.1), down.mul(0.7), 3.3)).mul(0.35));
  // Spindrift: loose snow on the move, snaking over the surface down the wind.
  const flow = down.sub(time.mul(profile.driftSpeed));
  const snakes = smoothstep(0.1, 0.55, planarNoise(NOISE.patch, vec2(cross.mul(0.3), flow.mul(0.07)))
    .add(planarNoise(NOISE.mottle, vec2(cross.mul(1.1), flow.mul(0.26).add(5.1))).mul(0.45))).mul(sky).mul(profile.drift);
  const uv = point.xz.mul(SNOW_SCALE);
  const tilt = texture(snowMaps.normal, uv).xy.mul(2).sub(1);
  // Packed snow loses its wind ridges and takes the ruts of what packed it.
  const ruts = mx_noise_float(vec3(point.x.mul(5), point.y, point.z.mul(5))).mul(RUT_DEPTH);
  const relief = mix(ridges.mul(SASTRUGI_HEIGHT), ruts, packed).add(smoothstep(0, LIP_SPREAD, edge).mul(lip));
  const snowNormal = normalize(bumpNormal(geometryNormal, relief, 1).add(vec3(tilt.x, 0, tilt.y).mul(0.45)));
  const sparkle = smoothstep(0.62, 0.8, locationNoise(NOISE.grit, point.mul(55).add(viewDirection.mul(6)))).mul(near);
  // Snow the sky cannot see is lit by the blue bounce of the ice around it.
  const shelter = occlusion.mul(sky.mul(0.4).add(0.6));
  const snowAlbedo = texture(snowMaps.color, uv).rgb.mul(color(profile.snowColor))
    .mul(mix(color(profile.snowShade), vec3(1), shelter)).mul(mix(vec3(1), color(profile.trailColor), packed))
    .mul(sparkle.mul(1.4).add(snakes.mul(0.3)).add(1));

  return {
    albedo: mix(albedo, snowAlbedo, lying),
    normal: normalize(mix(normal, snowNormal, lying)),
    roughness: mix(roughness, mix(float(0.92), float(0.6), packed), lying),
    wrap: mix(wrap, float(0.6), lying),
    bare: bare.mul(lying.oneMinus()),
  };
}
