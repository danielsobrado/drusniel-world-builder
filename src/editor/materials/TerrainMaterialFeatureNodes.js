import {
  Fn,
  If,
  abs,
  clamp,
  dot,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  oneMinus,
  sin,
  smoothstep,
  vec2,
} from 'three/tsl';
import { periodicFbm2, periodicVoronoiDistances } from '../stylized/PeriodicNoiseNodes.js';

const HASH_VECTOR = Object.freeze([127.1, 311.7]);
const HASH_SCALE = 43758.5453;
const HASH_OFFSET_A = 17.31;
const HASH_OFFSET_B = 43.79;
const HASH_OFFSET_C = 89.17;

/** Metres across one dried-ground plate between cracks. */
const CRACK_PLATE_METERS = 2.4;
/** Metres over which crack patches (where the ground has dried out) vary. */
const CRACK_PATCH_METERS = 21;

function hashCell(cell, seed) {
  return fract(
    sin(dot(cell.add(vec2(seed, seed * 0.618)), vec2(...HASH_VECTOR))).mul(HASH_SCALE),
  );
}

function valueNoise(planarMeters, scaleMeters, seed) {
  const coordinate = planarMeters.div(scaleMeters);
  const cell = floor(coordinate);
  const local = fract(coordinate);
  const blend = local.mul(local).mul(local.mul(-2).add(3));
  const a = hashCell(cell, seed);
  const b = hashCell(cell.add(vec2(1, 0)), seed);
  const c = hashCell(cell.add(vec2(0, 1)), seed);
  const d = hashCell(cell.add(vec2(1, 1)), seed);
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

/**
 * The surface features' pattern frames, one lattice per scale, for the slot's
 * terrain PatternOrigins (createTerrainTransitionPatterns). Canonical
 * positions reach millions of metres on an imported map, where float32 cannot
 * hash a cell: the old `sin`-hash noise collapsed into a regular grid there,
 * and its crack contours traced that grid as interlocking tiles. Slot-relative
 * lattice coordinates (PatternOrigins) stay exact at any distance.
 */
export function terrainFeaturePatternFrames(features) {
  const patch = features?.patchScaleMeters ?? 13;
  const detail = features?.detailScaleMeters ?? 3.2;
  return Object.freeze({
    featurePatchA: { scale: 1 / patch },
    featurePatchB: { scale: 1 / (patch * 0.73) },
    featureStreak: { scale: 1 / (detail * 1.7) },
    crackPlates: { scale: 1 / CRACK_PLATE_METERS },
    crackPatches: { scale: 1 / CRACK_PATCH_METERS },
  });
}

/** Second-nearest minus nearest Voronoi distance: 0 on a cell edge. */
function voronoiEdgeDistance(position) {
  const distances = periodicVoronoiDistances(position, float(0), float(0));
  let nearest = distances[0];
  let second = float(1e4);
  for (let index = 1; index < distances.length; index += 1) {
    second = min(max(nearest, distances[index]), second);
    nearest = min(nearest, distances[index]);
  }
  return second.sub(nearest);
}

/**
 * The feature noise fields. With `patterns` and `localXZ` they read the slot's
 * planet-safe lattices and cracks follow a Voronoi plate network; without them
 * (single-mesh fixtures), the legacy canonical-position value noise.
 */
function featureFields({ worldXZ, localXZ, patterns, features }) {
  if (patterns && localXZ) {
    const at = (name) => patterns.latticePoint(name, localXZ);
    return {
      patchA: periodicFbm2(at('featurePatchA')),
      patchB: periodicFbm2(at('featurePatchB').add(vec2(19, 7))),
      streak: periodicFbm2(at('featureStreak').add(vec2(41, 23))),
      // Plates crack along their edges, and only where a broad patch of the
      // ground has dried out — a network in places, not a tiling everywhere.
      crackLine: () => oneMinus(smoothstep(0.02, 0.09, voronoiEdgeDistance(at('crackPlates'))))
        .mul(smoothstep(0.5, 0.68, periodicFbm2(at('crackPatches').add(vec2(5, 61))))),
    };
  }
  const fine = valueNoise(worldXZ, features.detailScaleMeters, features.seedOffset + HASH_OFFSET_B);
  return {
    patchA: valueNoise(worldXZ, features.patchScaleMeters, features.seedOffset),
    patchB: valueNoise(worldXZ, features.patchScaleMeters * 0.73, features.seedOffset + HASH_OFFSET_A),
    streak: valueNoise(
      vec2(worldXZ.x.mul(0.42), worldXZ.y),
      features.detailScaleMeters * 1.7,
      features.seedOffset + HASH_OFFSET_C,
    ),
    crackLine: () => smoothstep(0.88, 0.97, oneMinus(abs(fine.mul(2).sub(1)))),
  };
}

/**
 * Crack lines cost a Voronoi neighbourhood per pixel, so they are built only
 * inside a branch where cracks can show: dry, flat, bare ground up close.
 */
function gatedCracks(base, crackLine) {
  return Fn(() => {
    const cracks = float(0).toVar();
    If(base.greaterThan(0.001), () => {
      cracks.assign(base.mul(crackLine()));
    });
    return cracks;
  })();
}

export function createTerrainMaterialFeatureMasks({
  worldXZ,
  localXZ = null,
  patterns = null,
  cameraDistance = null,
  materialWeights,
  terrainShape,
  wetness,
  canopy,
  shoreline,
  features,
}) {
  if (!features?.enabled) {
    const zero = materialWeights.r.mul(0);
    return { lichen: zero, litter: zero, cracks: zero, mineral: zero };
  }

  const fields = featureFields({ worldXZ, localXZ, patterns, features });
  const curvature = clamp(terrainShape.g.mul(8).add(0.5), 0, 1);
  const concavity = smoothstep(0.52, 0.82, curvature);
  const flat = oneMinus(smoothstep(0.18, 0.48, terrainShape.r));
  const steep = smoothstep(0.24, 0.62, terrainShape.r);
  const dry = oneMinus(wetness);
  const shelteredWet = wetness.mul(mix(0.35, 1, canopy)).mul(mix(0.55, 1, concavity));
  // Hairline cracks only read up close; further out they alias into a pattern.
  const crackReach = cameraDistance
    ? oneMinus(smoothstep(features.crackFadeStartDistance ?? 18, features.crackFadeEndDistance ?? 45, cameraDistance))
    : float(1);

  return {
    lichen: materialWeights.b
      .mul(shelteredWet)
      .mul(smoothstep(0.60, 0.84, fields.patchA)),
    litter: max(materialWeights.r, materialWeights.g.mul(0.45))
      .mul(canopy)
      .mul(oneMinus(wetness.mul(0.45)))
      .mul(smoothstep(0.58, 0.82, fields.patchB)),
    cracks: gatedCracks(materialWeights.g.mul(dry).mul(oneMinus(smoothstep(.05, .55, shoreline)))
      .mul(flat).mul(crackReach), fields.crackLine),
    mineral: materialWeights.b
      .mul(max(wetness, shoreline.mul(0.7)))
      .mul(steep)
      .mul(smoothstep(0.68, 0.88, fields.streak)),
  };
}
