import { mx_fractal_noise_float, mx_noise_float, smoothstep, vec3 } from 'three/tsl';

/** How far the big folds reach, in noise units per metre: one fold every ~20 m. */
const FOLD_SCALE = 0.045;
/** Layer rates along the strata coordinate: blue/bubbly bands, firn sub-layers, hairline laminae. */
const BROAD = 0.5, FINE = 2.7, HAIR = 9.5;
/** Lenses of clear or aerated ice run `zoneSize` metres along the layers for every ~8 layers across them. */
const ZONE_ACROSS = 0.12;
/** Firn layers and hairline laminae, as a share of the band contrast: thin layers, faint lines. */
const FIRN_SHARE = 0.5, LAMINA_SHARE = 0.15;

/**
 * Glacier foliation: the annual layers a glacier is built from, compressed,
 * tilted by flow and folded where it bends.
 *
 * Every layer is a function of one coordinate that runs across the strata, so
 * a band keeps its identity around a corner and through a pillar. Thicknesses
 * come from noise along that coordinate rather than a sine, because real
 * layers are never evenly spaced.
 *
 * The layers do not paint white: they say how much the ice scatters, at three
 * scales. Lenses tens of metres long are clear (dark, deep) or aerated (pale);
 * bands a metre or two thick alternate clear meltwater ice with bubbly ice from
 * compacted snow; thin firn layers and hairline laminae run through both.
 *
 * @param {Node} point where the ice is sampled (inside the surface, so layers refract)
 * @param {{ frequency: number, dip: number, fold: number, strength: number, zones: number, zoneSize: number }} banding
 *   layers per metre, tilt, fold amplitude, band contrast, lens contrast, lens length in metres
 * @param {Node} near 1 close to the camera, 0 where hairline detail would only shimmer
 * @returns {{ milk: Node, firn: Node, ash: Node }} milk: signed change to how much the ice scatters;
 *   firn 0..1 thin bubbly layers; ash 0..1 dirt layers
 */
export function iceStrata(point, banding, near) {
  const fold = mx_fractal_noise_float(point.mul(FOLD_SCALE), 2, 2, 0.5).mul(banding.fold);
  const across = point.y.mul(banding.frequency).add(point.x.mul(banding.dip)).add(point.z.mul(banding.dip * 0.6)).add(fold);
  const layer = (rate, salt) => mx_noise_float(vec3(across.mul(rate), salt, salt * 1.7));
  const fine = layer(FINE, 7.3);
  // No band is uniform along its length: it thins, clears and thickens again.
  const along = mx_noise_float(vec3(point.x.mul(0.19), across.mul(0.6), point.z.mul(0.19))).mul(0.5).add(0.5);
  const lens = mx_noise_float(vec3(point.x.div(banding.zoneSize), across.mul(ZONE_ACROSS), point.z.div(banding.zoneSize)));
  const clearLens = smoothstep(-0.15, 0.15, lens);
  const band = layer(BROAD, 1.7).add(fine.mul(0.3)).mul(along.add(0.5));
  // Firn layers are a few centimetres thick with a sharp edge: the top of the fine layering, not a soft blot.
  const firn = smoothstep(0.22, 0.32, fine).mul(along).mul(near);
  const laminae = smoothstep(0.2, 0.45, layer(HAIR, 2.9)).mul(along).mul(near);
  return {
    milk: clearLens.oneMinus().sub(0.5).mul(banding.zones)
      .add(band.add(firn.mul(FIRN_SHARE)).add(laminae.mul(LAMINA_SHARE)).mul(banding.strength)),
    firn,
    ash: smoothstep(0.36, 0.5, layer(1.15, 11.1)).mul(smoothstep(0.25, 0.7, along)),
  };
}
