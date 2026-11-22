import { mix, smoothstep, vec3 } from 'three/tsl';
import { NOISE, lineNoise, locationNoise } from '../locationNoise.js';

/** How far the big folds reach, in noise units per metre: one fold every ~20 m. */
const FOLD_SCALE = 0.045;
/** Spread of the two-octave fractal the folds used to be, over one octave's. */
const FOLD_OCTAVES_GAIN = Math.sqrt(1.25);
/** Layer rates along the strata coordinate: blue/bubbly bands, firn sub-layers, hairline laminae. */
const BROAD = 0.5, FINE = 2.7, HAIR = 9.5;
/** Lenses of clear or aerated ice run `zoneSize` metres along the layers for every ~8 layers across them. */
const ZONE_ACROSS = 0.12;
/** Firn layers and hairline laminae, as a share of the band contrast: thin layers, faint lines. */
const FIRN_SHARE = 0.5, LAMINA_SHARE = 0.16;
/** Additional metres along the refracted ray for the secondary deeper strata parallax layer. */
const DEEP_STRATA_OFFSET = 1.15;

function sampleStrataAt(point, banding, near) {
  const fold = locationNoise(NOISE.fbm, point.mul(FOLD_SCALE)).mul(FOLD_OCTAVES_GAIN * banding.fold);
  const across = point.y.mul(banding.frequency).add(point.x.mul(banding.dip)).add(point.z.mul(banding.dip * 0.6)).add(fold);
  const layer = (rate, salt) => lineNoise(NOISE.patch, across.mul(rate), salt);
  const fine = layer(FINE, 7.3);
  const along = locationNoise(NOISE.mottle, vec3(point.x.mul(0.19), across.mul(0.6), point.z.mul(0.19))).mul(0.5).add(0.5);
  const lens = locationNoise(NOISE.broad, vec3(point.x.div(banding.zoneSize), across.mul(ZONE_ACROSS), point.z.div(banding.zoneSize)));
  const clearLens = smoothstep(-0.15, 0.15, lens);
  const band = layer(BROAD, 1.7).add(fine.mul(0.3)).mul(along.add(0.5));
  const firn = smoothstep(0.22, 0.32, fine).mul(along).mul(near);
  const laminae = smoothstep(0.2, 0.45, layer(HAIR, 2.9)).mul(along).mul(near);
  return {
    milk: clearLens.oneMinus().sub(0.5).mul(banding.zones)
      .add(band.add(firn.mul(FIRN_SHARE)).add(laminae.mul(LAMINA_SHARE)).mul(banding.strength)),
    firn,
    ash: smoothstep(0.36, 0.5, layer(1.15, 11.1)).mul(smoothstep(0.25, 0.7, along)),
  };
}

/**
 * Glacier foliation with 2-depth refracted parallax: samples the annual compressed
 * ice layers at a shallow depth and a deeper refracted point so bands shift organically
 * behind curved walls and pillars instead of reading like surface paint.
 *
 * @param {Node} point shallow refracted point inside the surface
 * @param {{ frequency: number, dip: number, fold: number, strength: number, zones: number, zoneSize: number }} banding
 * @param {Node} near 1 close to the camera, 0 where hairline detail would shimmer
 * @param {Node|null} [into] refracted view ray into the ice for secondary parallax depth
 */
export function iceStrata(point, banding, near, into = null) {
  const shallow = sampleStrataAt(point, banding, near);
  if (!into) return shallow;

  // Second refracted sample deeper into the glacier body gives subtle 3D depth parallax.
  const deepPoint = point.add(into.mul(DEEP_STRATA_OFFSET));
  const deepFold = locationNoise(NOISE.fbm, deepPoint.mul(FOLD_SCALE)).mul(FOLD_OCTAVES_GAIN * banding.fold);
  const deepAcross = deepPoint.y.mul(banding.frequency)
    .add(deepPoint.x.mul(banding.dip))
    .add(deepPoint.z.mul(banding.dip * 0.6))
    .add(deepFold);
  const deepBand = lineNoise(NOISE.patch, deepAcross.mul(BROAD), 4.3);
  const deepMilk = deepBand.mul(banding.strength * 0.62);

  return {
    milk: mix(shallow.milk, shallow.milk.mul(0.76).add(deepMilk.mul(0.38)), near.mul(0.72)),
    firn: shallow.firn,
    ash: shallow.ash,
  };
}
