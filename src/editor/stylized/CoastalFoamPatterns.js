import { clamp, float, max, mix, oneMinus, pow, smoothstep, vec2 } from 'three/tsl';
import { periodicFbm2 } from './PeriodicNoiseNodes.js';

/**
 * Shared multi-scale cellular bubble-lace pattern and density-driven threshold
 * erosion for coastal beach swash, nearshore breaking surf, shoreline webbing,
 * offshore whitecaps, and rock-impact wakes.
 *
 * Uses the already-packed `WORLD_NOISE_LAYERS.water` tileable texture channels
 * (`R`: `!vein/vein-13` organic bubble-lace veins, `G`: `!voronoi/voronoi-10`
 * cellular bubble walls, `B`: `perlin/perlin-05` smooth warp/clump field) so
 * neither the terrain material nor the water material spends an extra sampler.
 */

const MEDIUM_DRIFT = Object.freeze([0.014, -0.009]);
const FINE_DRIFT = Object.freeze([-0.023, 0.017]);
const FINE_WARP_STRENGTH = 0.14;

/**
 * Sample two counter-drifting, organically warped scales of cellular sea-foam
 * lace using a planet-precision lattice point from `PatternOrigins`.
 *
 * @param {object} options
 * @param {((uv: object) => object) | null} options.waterNoise `(uv) => vec3` (R vein, G voronoi, B perlin)
 * @param {object} options.point vec2 node in lattice cells (512-cell wrap)
 * @param {object} options.clock float node in seconds
 * @param {number} [options.cells=4] lattice cells per medium tile repeat (should divide 512)
 * @param {((uv: object) => object) | null} [options.laceField=null] legacy scalar fallback
 * @returns {{ laceHeight: object, frothDetail: object, organicWarp: object, uvFootprint: object }}
 */
export function sampleCoastalFoamPattern({
  waterNoise = null,
  point,
  clock,
  cells = 4,
  laceField = null,
}) {
  const driftA = vec2(clock.mul(MEDIUM_DRIFT[0]).mod(64), clock.mul(MEDIUM_DRIFT[1]).mod(64));
  const driftB = vec2(clock.mul(FINE_DRIFT[0]).mod(64), clock.mul(FINE_DRIFT[1]).mod(64));
  const uvA = point.div(cells).add(driftA);
  // True UV tile-footprint derivative: mipmaps filter sub-texel detail cleanly
  // without prematurely flattening crisp veins into grey fog at mid-distances.
  const uvFootprint = uvA.dFdx().length().add(uvA.dFdy().length()).toVar();

  if (waterNoise) {
    const tapA = waterNoise(uvA).toVar();
    const warp = vec2(tapA.b.sub(0.5), tapA.g.sub(0.5)).mul(FINE_WARP_STRENGTH);
    // Fine bubble lace rotated 90 deg and counter-drifting at half the tile span.
    const uvB = vec2(point.y.negate(), point.x).div(cells * 0.5).add(driftB).add(warp);
    const tapB = waterNoise(uvB).toVar();

    const veinWeb = mix(tapA.r, tapB.r, 0.46);
    const cellNet = max(tapA.g, tapB.g);
    const clump = tapA.b;
    // High on interconnected bubble walls, deep dark windows inside open cells.
    const laceHeight = clamp(
      veinWeb.mul(0.62).add(cellNet.mul(0.26)).add(clump.mul(0.18)).sub(0.03),
      0,
      1,
    ).toVar();
    const frothDetail = clamp(tapB.r.mul(0.65).add(tapB.g.mul(0.35)), 0, 1).toVar();
    const organicWarp = clump.sub(0.5).mul(2).toVar();
    return { laceHeight, frothDetail, organicWarp, uvFootprint };
  }

  if (laceField) {
    const tapA = laceField(uvA);
    const uvB = vec2(point.y.negate(), point.x).div(cells * 0.5).add(driftB);
    const tapB = laceField(uvB);
    const laceHeight = clamp(mix(tapA, tapB, 0.45), 0, 1).toVar();
    return {
      laceHeight,
      frothDetail: tapB,
      organicWarp: tapA.sub(0.5).mul(2),
      uvFootprint,
    };
  }

  // Procedural fallback for tests / headless paths without loaded noise atlas.
  const coarse = periodicFbm2(point.add(driftA.mul(cells)));
  const fine = periodicFbm2(vec2(point.y.negate(), point.x).mul(2).add(driftB.mul(cells)));
  const laceHeight = clamp(mix(coarse, fine, 0.42), 0, 1).toVar();
  return {
    laceHeight,
    frothDetail: fine,
    organicWarp: coarse.sub(0.5).mul(2),
    uvFootprint,
  };
}

/**
 * Density-driven threshold erosion: high density yields dense, creamy, aerated
 * froth with tiny pinholes; medium density opens into crisp interconnected
 * bubble-lace webs; low density dissolves into fine white bubble threads and
 * flecks before vanishing cleanly — never fading into muddy grey fog.
 *
 * @param {object} options
 * @param {object} options.density float node in [0, 1]
 * @param {object} options.laceHeight float node in [0, 1]
 * @param {object} options.frothDetail float node in [0, 1]
 * @param {object} options.uvFootprint float node from `sampleCoastalFoamPattern`
 * @param {number} [options.edgeMin=0.075] close-up crisp edge softness
 * @param {number} [options.edgeMax=0.24] far-distance anti-aliased edge softness
 * @param {number} [options.bodyFloor=0.45] density where solid aerated body starts
 * @param {number} [options.bodyStrength=0.32] solid aerated under-body weight
 * @returns {{ coverage: object, thickness: object }}
 */
export function erodeFoamLace({
  density,
  laceHeight,
  frothDetail,
  uvFootprint,
  edgeMin = 0.075,
  edgeMax = 0.24,
  bodyFloor = 0.45,
  bodyStrength = 0.32,
}) {
  const d = clamp(density, 0, 1);
  const softness = clamp(uvFootprint.mul(1.1).add(edgeMin), edgeMin, edgeMax);
  // As density drops, threshold climbs so open bubble windows widen instead of
  // turning the entire patch into semi-transparent grey mist.
  const threshold = oneMinus(pow(max(d, 1e-4), 0.78)).mul(0.92).add(0.08);
  const web = smoothstep(threshold.sub(softness), threshold.add(softness), laceHeight);
  const presence = smoothstep(0.025, 0.14, d);
  const body = smoothstep(bodyFloor, 0.96, d)
    .mul(mix(float(0.66), float(1.0), frothDetail))
    .mul(bodyStrength);
  const coverage = max(web.mul(presence), body).clamp(0, 1);
  // Thin lacy edges stay airy; thick wave lips and breaking crests read solid and bright.
  const thickness = clamp(d.mul(0.65).add(frothDetail.mul(0.35)), 0, 1).mul(coverage);
  return { coverage, thickness };
}
