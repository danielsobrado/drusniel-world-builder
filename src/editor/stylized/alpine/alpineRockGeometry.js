import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ridgedNoise3 } from '../ice/icebergGeometry.js';

const DETAIL = 10;

/**
 * Each alpine rock kind combines geological cleavage planes, stepped bedding
 * strata, multi-scale ridged fracture relief, and a flared basal footing so
 * outcrops break naturally out of snowfields and mountain slopes.
 */
const KINDS = Object.freeze([
  Object.freeze({
    // Stratified granite outcrop: broad terraced shelves that catch drifted snow.
    size: [1.08, 0.78, 0.82],
    shatter: 0.42,
    strataFreq: 4.5,
    strataDepth: 0.085,
    strataTilt: [0.16, -0.11],
    baseFlare: 0.24,
    seed: 19,
    planes: [
      [0.72, 0.56, 0.41, 0.86],
      [-0.68, 0.48, 0.55, 0.88],
      [0.24, 0.88, -0.41, 0.84],
      [-0.35, 0.32, -0.88, 0.86],
      [0.86, 0.22, -0.46, 0.90],
    ],
  }),
  Object.freeze({
    // Cleft alpine crag: stout broad-shouldered ridge with sharp angled shear faces.
    size: [0.84, 1.06, 0.72],
    shatter: 0.48,
    strataFreq: 5.5,
    strataDepth: 0.07,
    strataTilt: [-0.28, 0.14],
    baseFlare: 0.28,
    seed: 61,
    planes: [
      [0.82, 0.42, 0.39, 0.84],
      [-0.78, 0.46, -0.42, 0.84],
      [0.18, 0.76, -0.62, 0.88],
      [-0.32, 0.68, 0.66, 0.86],
      [0.44, 0.84, 0.32, 0.92],
    ],
  }),
  Object.freeze({
    // Tilted glacial erratic slab: wide low stepped mass with snow-holding upper crown.
    size: [1.22, 0.58, 0.88],
    shatter: 0.36,
    strataFreq: 4.0,
    strataDepth: 0.095,
    strataTilt: [0.22, 0.18],
    baseFlare: 0.20,
    seed: 101,
    planes: [
      [0.28, 0.92, 0.26, 0.78],
      [-0.74, 0.54, 0.40, 0.88],
      [0.76, 0.44, -0.48, 0.88],
      [-0.22, 0.62, -0.75, 0.86],
    ],
  }),
  Object.freeze({
    // Frost-shattered boulder massif: blocky angular cleavage with deep crevice steps.
    size: [0.96, 0.88, 0.92],
    shatter: 0.52,
    strataFreq: 5.0,
    strataDepth: 0.075,
    strataTilt: [-0.15, -0.22],
    baseFlare: 0.26,
    seed: 149,
    planes: [
      [0.78, 0.52, -0.35, 0.85],
      [-0.66, 0.64, 0.39, 0.84],
      [0.34, 0.46, 0.82, 0.86],
      [-0.45, 0.38, -0.81, 0.86],
      [0.12, 0.96, -0.25, 0.82],
    ],
  }),
]);

function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * A closed unit-scale alpine rock with fractured cleavage planes, stepped
 * bedding ledges, and a flared basal footing (grounded by AlpineRockView).
 */
export function createAlpineRockGeometry(kind) {
  const spec = KINDS[kind] ?? KINDS[0];
  const { size, shatter, strataFreq, strataDepth, strataTilt, baseFlare, seed, planes } = spec;
  const sphere = new THREE.IcosahedronGeometry(1, DETAIL);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere, 1e-4);
  sphere.dispose();

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // 1. Angular fracture cleavage: soft-min clipping against tilted rock planes.
    let radius = 1.06;
    for (let p = 0; p < planes.length; p += 1) {
      const [nx, ny, nz, dist] = planes[p];
      const proj = x * nx + y * ny + z * nz;
      if (proj > 0.12) {
        const planeR = dist / Math.max(0.28, proj);
        radius = smoothMin(radius, planeR, 0.22);
      }
    }

    // 2. Multi-scale ridged fracture relief (primary block ridges + secondary angular detail).
    const primary = ridgedNoise3(x * 1.65, y * 1.55, z * 1.65, seed);
    const fine = ridgedNoise3(x * 3.8 + 4.1, y * 3.8 - 2.7, z * 3.8 + 1.9, seed + 37);
    radius += (primary - 0.46) * shatter + (fine - 0.45) * (shatter * 0.28);

    // 3. Geological bedding strata: warped horizontal shelves that catch windblown snow.
    const bedCoord = y + x * strataTilt[0] + z * strataTilt[1] + (primary - 0.5) * 0.22;
    const bedPhase = bedCoord * strataFreq;
    const bedStep = (Math.floor(bedPhase) + smoothstep(0.18, 0.82, bedPhase - Math.floor(bedPhase))) / strataFreq;
    const shelfDelta = (bedStep - bedCoord) * strataDepth * 4.2;
    radius += shelfDelta;

    // 4. Broaden basal footing below y = 0 so rocks root naturally into snow & scree.
    const baseWeight = smoothstep(0.15, -0.58, y);
    const talusRib = 0.85 + 0.3 * ridgedNoise3(x * 2.4, 0.2, z * 2.4, seed + 73);
    const flare = 1 + baseWeight * baseFlare * talusRib;

    // Slightly flatten overly pointed crowns so snow caps settle convincingly on top.
    const crownTaper = y > 0.35 ? 1 - 0.08 * (y - 0.35) : 1;

    const rXZ = Math.max(0.42, radius * flare);
    const rY = Math.max(0.42, radius * crownTaper);
    positions.setXYZ(i, x * rXZ * size[0], y * rY * size[1], z * rXZ * size[2]);
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
