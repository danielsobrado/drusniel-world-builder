import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ridgedNoise3 } from '../ice/icebergGeometry.js';

const DETAIL = 10;

/**
 * Each alpine rock kind combines asymmetric geological cleavage planes,
 * chipped plane-intersection bevels, secondary fracture V-cracks, stepped
 * bedding strata, multi-scale ridged fracture relief, and a flared basal
 * footing so outcrops break naturally out of snowfields and mountain slopes.
 */
const KINDS = Object.freeze([
  Object.freeze({
    // Stratified granite outcrop: broad terraced shelves & diagonal fracture seam.
    size: [1.08, 0.78, 0.82],
    shatter: 0.44,
    strataFreq: 4.6,
    strataDepth: 0.09,
    strataTilt: [0.16, -0.11],
    baseFlare: 0.26,
    cleaveSmooth: 0.14,
    chipDepth: 0.045,
    lobeShift: [0.14, 0.06, -0.10],
    seed: 19,
    planes: [
      [0.72, 0.56, 0.41, 0.85],
      [-0.68, 0.48, 0.55, 0.87],
      [0.24, 0.88, -0.41, 0.83],
      [-0.35, 0.32, -0.88, 0.85],
      [0.86, 0.22, -0.46, 0.88],
      [-0.22, 0.94, 0.26, 0.86],
    ],
    cracks: [
      [0.84, 0.42, -0.34, 0.08, 0.065, 0.09],
      [-0.25, 0.92, 0.30, -0.12, 0.055, 0.075],
    ],
  }),
  Object.freeze({
    // Cleft alpine crag: stout broad-shouldered ridge with sharp angled shear faces.
    size: [0.84, 1.06, 0.72],
    shatter: 0.50,
    strataFreq: 5.5,
    strataDepth: 0.075,
    strataTilt: [-0.28, 0.14],
    baseFlare: 0.30,
    cleaveSmooth: 0.12,
    chipDepth: 0.055,
    lobeShift: [-0.12, 0.10, 0.08],
    seed: 61,
    planes: [
      [0.82, 0.42, 0.39, 0.83],
      [-0.78, 0.46, -0.42, 0.83],
      [0.18, 0.76, -0.62, 0.87],
      [-0.32, 0.68, 0.66, 0.85],
      [0.44, 0.84, 0.32, 0.90],
      [-0.88, 0.18, 0.44, 0.88],
    ],
    cracks: [
      [0.32, 0.22, 0.92, 0.04, 0.06, 0.105],
      [-0.76, 0.58, -0.29, 0.18, 0.05, 0.07],
    ],
  }),
  Object.freeze({
    // Tilted glacial erratic slab: wide low stepped mass with snow-holding upper crown.
    size: [1.22, 0.58, 0.88],
    shatter: 0.38,
    strataFreq: 4.2,
    strataDepth: 0.10,
    strataTilt: [0.22, 0.18],
    baseFlare: 0.22,
    cleaveSmooth: 0.15,
    chipDepth: 0.042,
    lobeShift: [0.10, -0.04, 0.14],
    seed: 101,
    planes: [
      [0.28, 0.92, 0.26, 0.77],
      [-0.74, 0.54, 0.40, 0.86],
      [0.76, 0.44, -0.48, 0.86],
      [-0.22, 0.62, -0.75, 0.85],
      [0.15, 0.95, -0.27, 0.82],
    ],
    cracks: [
      [0.90, 0.34, 0.28, -0.10, 0.06, 0.085],
      [-0.38, 0.88, -0.28, 0.14, 0.05, 0.07],
    ],
  }),
  Object.freeze({
    // Frost-shattered boulder massif: blocky angular cleavage with deep crevice steps.
    size: [0.96, 0.88, 0.92],
    shatter: 0.54,
    strataFreq: 5.2,
    strataDepth: 0.08,
    strataTilt: [-0.15, -0.22],
    baseFlare: 0.28,
    cleaveSmooth: 0.12,
    chipDepth: 0.052,
    lobeShift: [-0.08, 0.05, -0.12],
    seed: 149,
    planes: [
      [0.78, 0.52, -0.35, 0.84],
      [-0.66, 0.64, 0.39, 0.83],
      [0.34, 0.46, 0.82, 0.85],
      [-0.45, 0.38, -0.81, 0.85],
      [0.12, 0.96, -0.25, 0.81],
      [0.88, -0.14, 0.45, 0.90],
    ],
    cracks: [
      [0.54, 0.72, 0.44, -0.05, 0.06, 0.10],
      [-0.86, 0.30, 0.41, 0.12, 0.05, 0.08],
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
 * Reusable procedural fractured rock mesh kernel: asymmetric mass lobes,
 * planar geological cleavage, chipped edge bevels along plane intersections,
 * secondary V-notched fracture cracks, stepped bedding strata, and flared footing.
 */
export function createFracturedRockGeometry(spec, detail = DETAIL) {
  const {
    size,
    shatter,
    strataFreq,
    strataDepth,
    strataTilt,
    baseFlare,
    cleaveSmooth = 0.14,
    chipDepth = 0.045,
    lobeShift = [0, 0, 0],
    seed,
    planes,
    cracks = [],
  } = spec;
  const sphere = new THREE.IcosahedronGeometry(1, detail);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere, 1e-4);
  sphere.dispose();

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // 0. Asymmetric mass lobe breaks up spherical symmetry before planar cleavage.
    const lobeBias = 1 + (x * lobeShift[0] + y * lobeShift[1] + z * lobeShift[2]);

    // 1. Angular fracture cleavage + chipped edge bevel where two planes meet.
    let radius = 1.06 * lobeBias;
    let closestR = 10;
    let secondR = 10;
    for (let p = 0; p < planes.length; p += 1) {
      const [nx, ny, nz, dist] = planes[p];
      const proj = x * nx + y * ny + z * nz;
      if (proj > 0.10) {
        const planeR = dist / Math.max(0.26, proj);
        if (planeR < closestR) {
          secondR = closestR;
          closestR = planeR;
        } else if (planeR < secondR) {
          secondR = planeR;
        }
        radius = smoothMin(radius, planeR, cleaveSmooth);
      }
    }

    // 2. Multi-scale ridged fracture relief (primary block ridges + chipped micro-facets).
    const primary = ridgedNoise3(x * 1.65, y * 1.55, z * 1.65, seed);
    const fine = ridgedNoise3(x * 4.1 + 4.1, y * 4.1 - 2.7, z * 4.1 + 1.9, seed + 37);
    radius += (primary - 0.46) * shatter + (fine - 0.45) * (shatter * 0.30);

    // Chipped edges along intersections of adjacent cleavage planes.
    if (chipDepth > 0 && secondR < 2.5) {
      const seamProximity = Math.exp(-Math.pow((secondR - closestR) / 0.11, 2));
      const chipNoise = Math.max(0, fine - 0.38);
      radius -= seamProximity * chipNoise * chipDepth * 2.2;
    }

    // 3. Secondary geological fracture cracks (sharp recessed V-grooves that catch shadows & snow).
    for (let c = 0; c < cracks.length; c += 1) {
      const [cx, cy, cz, offset, width, depth] = cracks[c];
      const d = (x * cx + y * cy + z * cz) - offset + (primary - 0.5) * 0.12;
      const groove = Math.exp(-Math.pow(d / width, 2));
      radius -= groove * depth;
    }

    // 4. Geological bedding strata: warped horizontal shelves that catch windblown snow.
    const bedCoord = y + x * strataTilt[0] + z * strataTilt[1] + (primary - 0.5) * 0.20;
    const bedPhase = bedCoord * strataFreq;
    const bedStep = (Math.floor(bedPhase) + smoothstep(0.16, 0.84, bedPhase - Math.floor(bedPhase))) / strataFreq;
    const shelfDelta = (bedStep - bedCoord) * strataDepth * 4.2;
    radius += shelfDelta;

    // 5. Broaden basal footing below y = 0 so rocks root naturally into snow & scree.
    const baseWeight = smoothstep(0.15, -0.58, y);
    const talusRib = 0.85 + 0.32 * ridgedNoise3(x * 2.4, 0.2, z * 2.4, seed + 73);
    const flare = 1 + baseWeight * baseFlare * talusRib;

    // Gently flatten overly pointed crowns so volumetric snow caps settle naturally on top.
    const crownTaper = y > 0.35 ? 1 - 0.10 * (y - 0.35) : 1;

    const rXZ = Math.max(0.40, radius * flare);
    const rY = Math.max(0.40, radius * crownTaper);
    positions.setXYZ(i, x * rXZ * size[0], y * rY * size[1], z * rXZ * size[2]);
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A closed unit-scale alpine rock with fractured cleavage planes, secondary cracks,
 * chipped edges, stepped bedding ledges, and a flared basal footing (grounded by AlpineRockView).
 */
export function createAlpineRockGeometry(kind, lowDetail = false) {
  const spec = KINDS[kind] ?? KINDS[0];
  return createFracturedRockGeometry(spec, lowDetail ? 4 : DETAIL);
}
