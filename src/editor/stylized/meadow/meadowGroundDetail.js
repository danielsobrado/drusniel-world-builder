import { Fn, If, mix, oneMinus, smoothstep, vec2, vec3 } from 'three/tsl';
import { periodicFbm2, periodicNoise } from '../PeriodicNoiseNodes.js';

/** Moss: the turf's root pigment, cooler and deeper. */
const MOSS_TINT = [0.74, 0.9, 0.78];
/** Fallen blades catch a little more light than the litter they lie in. */
const STREAK_LIFT = 1.18;
/** Exposed soil keeps some of the turf's pigment: humus, not a sand patch. */
const SOIL_ROOT_SHARE = 0.45;

/**
 * The ground between meadow stems, at walking distance (meadowGroundDetailConfig.js).
 *
 * Three scales on the slot's `fine` transition lattice (1.3 cells/m), so the
 * pattern is exact at planet scale and seamless across chunks: two-octave
 * 0.8/0.4 m cushions split the turf into litter drifts and moss hollows, ~0.4 m
 * pockets open bare soil, and anisotropic centimetre streaks lay fallen blades
 * into the litter near the eye. Integer multiples of the lattice keep every
 * octave periodic. It runs on every near terrain pixel, so it is kept to five
 * value-noise octaves (twenty integer hashes), and none past `fadeEnd`.
 * All of it fades back to the plain turf by `fadeEnd`, so the mid-distance bake
 * — painted from the plain root pigment — still meets it.
 *
 * @param {object} options
 * @param {object} options.color vec3 ground colour so far
 * @param {object} options.root vec3 the biome's meadow root pigment
 * @param {object} options.soil vec3 bare-earth colour
 * @param {object} options.coverage 0..1 where the meadow's turf is
 * @param {object} options.litter vec4 per tile: linear litter colour + amount
 * @param {object} options.amounts vec4 per tile: moss, soil, streaks
 * @param {object} options.settings resolveMeadowGroundDetail()
 */
export function applyMeadowGroundDetail({
  color, root, soil, coverage, cameraDistance, patterns, localXZ, litter, amounts, settings,
}) {
  const reach = oneMinus(smoothstep(settings.fadeStart, settings.fadeEnd, cameraDistance))
    .mul(coverage).mul(settings.strength);
  const fineReach = oneMinus(smoothstep(settings.fineEnd * 0.5, settings.fineEnd, cameraDistance));
  return Fn(() => {
    const out = color.toVar();
    If(reach.greaterThan(0.002), () => {
      const p = patterns.latticePoint('fine', localXZ).toVar();
      const cluster = periodicFbm2(p.add(vec2(17.3, 4.1))).toVar();
      const pocket = periodicNoise(p.mul(2).add(vec2(41.9, 13.7)));
      const litterMask = smoothstep(0.5, 0.7, cluster).mul(litter.a).mul(0.55);
      const mossMask = smoothstep(0.5, 0.7, oneMinus(cluster)).mul(amounts.x).mul(0.6);
      // Cushion-broken edges, so a pocket reads as worn earth rather than a decal.
      const soilMask = smoothstep(0.68, 0.88, pocket.add(cluster.sub(0.5).mul(0.35))).mul(amounts.y).mul(0.75);
      const detailed = mix(out, litter.rgb, litterMask).toVar();
      detailed.assign(mix(detailed, root.mul(vec3(...MOSS_TINT)), mossMask));
      detailed.assign(mix(detailed, mix(soil, root, SOIL_ROOT_SHARE), soilMask));
      If(fineReach.greaterThan(0.002), () => {
        // Two streak directions, chosen by the cushions, so blades do not all lie one way.
        const along = periodicNoise(vec2(p.x.mul(20).add(p.y.mul(7)), p.y.mul(3).sub(p.x)));
        const across = periodicNoise(vec2(p.y.mul(19).sub(p.x.mul(6)), p.x.mul(3).add(p.y.mul(2))));
        const strands = mix(along, across, smoothstep(0.35, 0.65, cluster)).toVar();
        const streak = smoothstep(0.6, 0.78, strands).mul(amounts.z).mul(fineReach).mul(0.6);
        detailed.assign(mix(detailed, litter.rgb.mul(STREAK_LIFT), streak));
        detailed.assign(detailed.mul(strands.sub(0.5).mul(0.14).mul(fineReach).add(1)));
      });
      out.assign(mix(out, detailed, reach));
    });
    return out;
  })();
}
