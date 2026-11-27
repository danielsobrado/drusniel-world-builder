import { groundGeometry } from './StylizedPrototypeBake.js';
import { createFracturedRockGeometry } from './alpine/alpineRockGeometry.js';

/**
 * Procedural fractured mountain-rock prototypes for `StylizedRockView` in snow
 * and alpine biomes (tundra = 10, glacier = 11).
 *
 * Replaces low-poly flat-shaded donor GLB wedges with geological cleavage-planed
 * granite/slate blocks, cleft outcrops, erratic slabs, and frost-shattered scree
 * fragments. Uses smooth vertex normals across high-detail fractured facets
 * (zero low-poly flat-shading creases) and omits UVs to stay well inside WebGPU's
 * 8-vertex-buffer pipeline limit.
 */

const NEAR_DETAIL = 5;
const PROXY_DETAIL = 3;

/** Tile IDs that favour procedural fractured alpine rock silhouettes. */
export const ALPINE_BOULDER_TILE_IDS = Object.freeze([10, 11]);

/** Relative selection weight over global donor rocks in snow biomes (~85% fractured). */
export const ALPINE_BOULDER_WEIGHT = 6;

const ALPINE_BOULDER_SPECS = Object.freeze([
  Object.freeze({
    id: 'alpine-granite-block',
    family: 'granite',
    scale: 1.05,
    size: [1.14, 0.82, 0.88],
    shatter: 0.44,
    strataFreq: 4.5,
    strataDepth: 0.09,
    strataTilt: [0.18, -0.10],
    baseFlare: 0.28,
    cleaveSmooth: 0.13,
    chipDepth: 0.05,
    lobeShift: [0.15, 0.05, -0.11],
    seed: 211,
    planes: [
      [0.74, 0.54, 0.40, 0.84],
      [-0.70, 0.46, 0.55, 0.86],
      [0.20, 0.90, -0.39, 0.82],
      [-0.36, 0.30, -0.88, 0.84],
      [0.86, 0.20, -0.47, 0.88],
    ],
    cracks: [
      [0.82, 0.44, -0.36, 0.06, 0.065, 0.095],
      [-0.22, 0.94, 0.26, -0.10, 0.055, 0.075],
    ],
  }),
  Object.freeze({
    id: 'alpine-slate-crag',
    family: 'slate',
    scale: 1.02,
    size: [0.92, 1.08, 0.78],
    shatter: 0.50,
    strataFreq: 5.8,
    strataDepth: 0.085,
    strataTilt: [-0.26, 0.16],
    baseFlare: 0.32,
    cleaveSmooth: 0.11,
    chipDepth: 0.058,
    lobeShift: [-0.13, 0.10, 0.09],
    seed: 313,
    planes: [
      [0.84, 0.40, 0.37, 0.82],
      [-0.78, 0.44, -0.44, 0.83],
      [0.16, 0.78, -0.60, 0.86],
      [-0.34, 0.66, 0.67, 0.84],
      [0.40, 0.86, 0.31, 0.88],
    ],
    cracks: [
      [0.28, 0.24, 0.93, 0.05, 0.06, 0.105],
      [-0.78, 0.56, -0.27, 0.16, 0.05, 0.075],
    ],
  }),
  Object.freeze({
    id: 'alpine-erratic-slab',
    family: 'granite',
    scale: 1.12,
    size: [1.26, 0.62, 0.94],
    shatter: 0.38,
    strataFreq: 4.0,
    strataDepth: 0.10,
    strataTilt: [0.22, 0.18],
    baseFlare: 0.24,
    cleaveSmooth: 0.14,
    chipDepth: 0.045,
    lobeShift: [0.11, -0.05, 0.13],
    seed: 419,
    planes: [
      [0.26, 0.93, 0.25, 0.76],
      [-0.74, 0.54, 0.40, 0.86],
      [0.76, 0.42, -0.49, 0.86],
      [-0.20, 0.62, -0.76, 0.84],
    ],
    cracks: [
      [0.90, 0.34, 0.28, -0.08, 0.06, 0.085],
      [-0.36, 0.89, -0.27, 0.12, 0.05, 0.07],
    ],
  }),
  Object.freeze({
    id: 'alpine-scree-block',
    family: 'shattered',
    scale: 0.86,
    size: [1.04, 0.70, 0.80],
    shatter: 0.56,
    strataFreq: 5.0,
    strataDepth: 0.075,
    strataTilt: [-0.14, -0.24],
    baseFlare: 0.26,
    cleaveSmooth: 0.10,
    chipDepth: 0.06,
    lobeShift: [-0.10, 0.04, -0.14],
    seed: 521,
    planes: [
      [0.78, 0.50, -0.37, 0.83],
      [-0.66, 0.62, 0.42, 0.82],
      [0.32, 0.48, 0.82, 0.84],
      [-0.46, 0.38, -0.80, 0.84],
      [0.10, 0.97, -0.22, 0.80],
    ],
    cracks: [
      [0.54, 0.72, 0.44, -0.04, 0.055, 0.095],
    ],
  }),
]);

/**
 * Builds ground-pivoted near + proxy fractured rock prototype geometries scaled
 * to `StylizedRockView`'s metre-sized boulder envelope.
 */
export function buildFracturedAlpineRockPrototypes() {
  return ALPINE_BOULDER_SPECS.map((spec) => {
    const geometry = createFracturedRockGeometry(spec, NEAR_DETAIL);
    geometry.scale(spec.scale, spec.scale, spec.scale);
    groundGeometry(geometry);

    const proxyGeometry = createFracturedRockGeometry(spec, PROXY_DETAIL);
    proxyGeometry.scale(spec.scale, spec.scale, spec.scale);
    groundGeometry(proxyGeometry);

    return {
      id: spec.id,
      family: spec.family,
      geometry,
      proxyGeometry,
      tileIds: ALPINE_BOULDER_TILE_IDS,
      weight: ALPINE_BOULDER_WEIGHT,
    };
  });
}
