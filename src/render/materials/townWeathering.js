import { float, mix, normalGeometry, normalize, smoothstep, vec2, vec3 } from 'three/tsl';
import { NOISE, SIGNED_GAIN, planarNoise, triplanarNoise } from '../../editor/locations/materials/locationNoise.js';
import { triplanarWeights } from '../../editor/locations/materials/LocationShading.js';
import { mossGrowth } from '../../editor/stylized/surfaceCoatings/MossGrowthMask.js';

/**
 * The weather a town's buildings have stood in, shared by both town renderers
 * (SettlementView's workshop houses and the medieval kit), so a street reads
 * as one place whichever draws it.
 *
 * Weathered the way the terrain's boulders are (rockWeathering.js): moss where
 * rain settles, dust on what faces the sky, a soft damp foot, faint runs. The
 * dust is each surface's own colour bleached by the sun, not one shared tint,
 * so a rose-rendered town and a slate-and-granite one stay themselves.
 *
 * Every field is read from the shared world-noise texture (locationNoise.js),
 * projected in the building's own frame, in place of 3D Perlin per pixel. On
 * top of the old look: rain drips, thin dark runs from each ledge, and hairline
 * cracks in stone and render.
 */

export const WEATHER_MOSS = Object.freeze([0.30, 0.39, 0.14]);
export const WEATHER_DAMP = Object.freeze([0.31, 0.27, 0.21]);
/** How far sun-bleached dust lifts a surface toward pale, and how much of its hue it keeps. */
const DUST_LIFT = 0.42;
const DUST_HUE_KEEP = 0.7;
/**
 * Moss patch thresholds on the signed patch field, from no potential to full.
 * A stone ledge (0.48) grows patches over about the area the old fixed band
 * tinted, each fully moss rather than half-green.
 */
const MOSS_GROWTH = Object.freeze({ sparse: 0.6, dense: -0.1, edge: 0.12 });
/** How far a joint or crevice lowers the bar for moss: it grows into the mortar first. */
const MOSS_CREVICE_BIAS = 0.3;

/** Per material family: how much of each the surface takes. */
export const WEATHER_FAMILIES = Object.freeze({
  stone: Object.freeze({ moss: 0.48, streaks: 0.65, damp: 0.75, dust: 0.34, cracks: 0.45, wash: 0.35 }),
  plaster: Object.freeze({ moss: 0.14, streaks: 0.5, damp: 0.65, dust: 0.28, cracks: 0.7, wash: 1 }),
  mortar: Object.freeze({ moss: 0.26, streaks: 0.45, damp: 0.75, dust: 0.32, cracks: 0.35, wash: 0.5 }),
  timber: Object.freeze({ moss: 0.18, streaks: 0.35, damp: 0.55, dust: 0.24, cracks: 0, wash: 0.3 }),
  roof: Object.freeze({ moss: 0.38, streaks: 0, damp: 0, dust: 0.32, cracks: 0, wash: 0.45 }),
});

/**
 * The weathered surface, with moss returned as its own layer (mask, colour and
 * cushion/tuft fields for MossCoat) for the caller to coat over `color`.
 *
 * @param {import('three/tsl').Node} colour linear albedo (vec3)
 * @param {object} options
 * @param {import('three/tsl').Node} options.place position in metres, stable per building
 *   (not render space, which re-centres with the floating origin)
 * @param {import('three/tsl').Node} options.up world normal's y
 * @param {?import('three/tsl').Node} [options.height] metres above the building's ground,
 *   or null where it is not known (no damp band then)
 * @param {{ moss: number|Node, streaks: number|Node, damp: number|Node, dust?: number|Node, cracks?: number|Node, wash?: number|Node }} options.family amounts, 0..1
 * @param {?import('three/tsl').Node} [options.crevice] 0..1 joints and crevices from the surface's
 *   own normal map, where it has one; moss takes hold there first
 * @returns {{ color, moss: { mask, color, pillow, tuft } }} weathered albedo without moss, and the moss layer
 */
export function weatherTownLayers(colour, { place, up, height = null, family, crevice = null }) {
  // `place` is in the building's own frame, so the projection follows its normal, not the world's.
  const blend = triplanarWeights(normalize(normalGeometry));
  const patch = triplanarNoise(NOISE.patch, place.mul(0.6), blend).sub(0.5).mul(SIGNED_GAIN);
  const facing = smoothstep(0.35, 0.85, up);
  const mossField = crevice ? patch.add(crevice.mul(MOSS_CREVICE_BIAS)) : patch;
  const moss = mossGrowth({ field: mossField, potential: facing.mul(family.moss), ...MOSS_GROWTH });
  // Runs: noise stretched along the fall line on the two wall planes, on faces near vertical.
  const wall = (kind, across, down) => {
    const tap = (u) => planarNoise(kind, vec2(u.mul(across), place.y.mul(down)));
    return tap(place.z).mul(blend.x).add(tap(place.x).mul(blend.z)).div(blend.x.add(blend.z).max(1e-3));
  };
  const vertical = float(1).sub(up.abs()).clamp(0, 1);
  const streak = smoothstep(0.05, 0.55, wall(NOISE.fbm, 2.4, 0.16)).mul(vertical).mul(family.streaks).mul(0.14);
  // Drips: thin dark lines a hand apart, broken along their fall, where rain runs off a ledge.
  const drips = smoothstep(0.32, 0.62, wall(NOISE.grit, 0.9, 0.035)).mul(smoothstep(-0.1, 0.3, patch))
    .mul(vertical).mul(family.streaks).mul(0.22);
  // Hairline cracks in stone and render, thinning out where the surface is sound.
  const crackLine = smoothstep(0.3, 0.1, triplanarNoise(NOISE.cracks, place.mul(0.42), blend));
  const cracks = crackLine.mul(smoothstep(-0.2, 0.25, patch)).mul(vertical.mul(0.6).add(0.4))
    .mul(family.cracks ?? 0).mul(0.5);
  // Uneven limewash and coat: blotches a metre across and a finer cloud within
  // them, so a rendered panel reads as hand-laid rather than one flat paint.
  const fineCoat = triplanarNoise(NOISE.fbm, place.mul(3.1), blend);
  const coat = triplanarNoise(NOISE.mottle, place.mul(0.9), blend).sub(0.5)
    .add(fineCoat.sub(0.5).mul(0.6));
  const wash = coat.mul(family.wash ?? 0).mul(0.42).add(1);
  let weathered = colour.mul(wash).mul(float(1).sub(streak).sub(drips).sub(cracks).max(0.3));
  if (height) {
    const foot = float(1).sub(smoothstep(0, 1.15, height)).pow(1.6);
    const damp = foot.mul(patch.mul(0.25).add(0.75)).mul(family.damp).mul(0.42);
    weathered = mix(weathered, vec3(...WEATHER_DAMP).mul(colour.dot(vec3(0.3, 0.55, 0.15)).mul(1.35).add(0.42)), damp);
  }
  const dustAmount = family.dust ?? 0.28;
  const dustMask = smoothstep(0.15, 0.88, up).mul(patch.mul(0.25).add(0.75)).mul(dustAmount);
  const luma = colour.dot(vec3(0.3, 0.55, 0.15));
  const bleached = mix(vec3(luma), colour, DUST_HUE_KEEP).mul(1 - DUST_LIFT).add(DUST_LIFT * 0.62);
  weathered = mix(weathered, bleached, dustMask.clamp(0, 0.45));
  return {
    color: weathered,
    moss: {
      mask: moss,
      color: vec3(...WEATHER_MOSS).mul(luma.mul(0.9).add(0.55)),
      // The coat's fine fBm makes the cushions; the grit, a few millimetres a texel, the tufts.
      pillow: fineCoat,
      tuft: triplanarNoise(NOISE.grit, place.mul(20), blend),
    },
  };
}

/** Trodden grime on paving: how dark a patch gets, and the earth it darkens toward. */
export const TREAD_GRIME = Object.freeze({ depth: 0.34, earth: [0.66, 0.59, 0.49], tone: 0.90 });

/**
 * A lived-in street's paving: never as pale as its photograph, and darkened
 * in broad patches where feet, carts and rain leave dirt. It also hides the
 * tile repeat. `coords` is a 2D position in metres (or texture tiles) that is
 * stable on the ground.
 */
export function treadPaving(colour, coords) {
  const grime = smoothstep(0.05, 0.65, planarNoise(NOISE.mottle, coords.mul(0.27).add(9.2))).mul(TREAD_GRIME.depth);
  // Stone by stone the setts are not one tone: some worn pale, some stained.
  const tone = planarNoise(NOISE.grit, coords.mul(1.7)).mul(0.22).add(1);
  const worn = colour.mul(TREAD_GRIME.tone).mul(tone);
  return mix(worn, worn.mul(vec3(...TREAD_GRIME.earth)), grime);
}
