import { Fn, If, mix, oneMinus, smoothstep, vec2, vec3 } from 'three/tsl';
import { periodicFbm2, periodicNoise } from '../PeriodicNoiseNodes.js';
import { MEADOW_DETAIL_MEAN, MEADOW_MOSS_TINT, MEADOW_SOIL_ROOT_SHARE } from './meadowGroundMean.js';

/** Moss: the turf's root pigment, cooler and deeper. */
const MOSS_TINT = MEADOW_MOSS_TINT;
/** Fallen blades catch a little more light than the litter they lie in. */
const STREAK_LIFT = 1.18;
/** Exposed soil keeps some of the turf's pigment: humus, not a sand patch. */
const SOIL_ROOT_SHARE = MEADOW_SOIL_ROOT_SHARE;

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
 * Detail is mean-normalized and fades to the shared litter/soil substrate by
 * `fadeEnd`, matching the CPU mid-distance bake without a brightness ring.
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
      // Detail changes local structure, not its mean as the camera moves.
      // The substrate mean already lives in the shared near/far ground palette.
      const mean = mix(out, litter.rgb, litter.a.mul(MEADOW_DETAIL_MEAN.litter)).toVar();
      mean.assign(mix(mean, root.mul(vec3(...MOSS_TINT)), amounts.x.mul(MEADOW_DETAIL_MEAN.moss)));
      mean.assign(mix(mean, mix(soil, root, SOIL_ROOT_SHARE), amounts.y.mul(MEADOW_DETAIL_MEAN.soil)));
      If(fineReach.greaterThan(0.002), () => {
        // Two streak directions, chosen by the cushions, so blades do not all lie one way.
        const along = periodicNoise(vec2(p.x.mul(20).add(p.y.mul(7)), p.y.mul(3).sub(p.x)));
        const across = periodicNoise(vec2(p.y.mul(19).sub(p.x.mul(6)), p.x.mul(3).add(p.y.mul(2))));
        const strands = mix(along, across, smoothstep(0.35, 0.65, cluster)).toVar();
        const streak = smoothstep(0.6, 0.78, strands).mul(amounts.z).mul(fineReach).mul(0.6);
        detailed.assign(mix(detailed, litter.rgb.mul(STREAK_LIFT), streak));
        detailed.assign(detailed.mul(strands.sub(0.5).mul(0.14).mul(fineReach).add(1)));
        mean.assign(mix(mean, litter.rgb.mul(STREAK_LIFT), amounts.z.mul(fineReach).mul(MEADOW_DETAIL_MEAN.streaks)));
      });
      out.assign(out.mul(mix(vec3(1), detailed.div(mean.max(vec3(0.002))).clamp(0.55, 1.65), reach)));
    });
    return out;
  })();
}
