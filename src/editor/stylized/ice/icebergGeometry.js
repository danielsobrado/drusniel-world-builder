import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  sculptPositionKeyedRelief,
  subdivideGeometryRedGreen,
} from '../shared/meshDetailRefine.js';

const DETAIL = 30;
const SUB_DETAIL = 12;
const BELOW_WATER = 0.45;

function lattice(x, y, z, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.3) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const edge = (a, b, c) => lattice(ix + a, iy + b, iz + c, seed);
  const row = (b, c) => edge(0, b, c) + (edge(1, b, c) - edge(0, b, c)) * u;
  const plane = (c) => row(0, c) + (row(1, c) - row(0, c)) * v;
  return plane(0) + (plane(1) - plane(0)) * w;
}

/** Sharp crests, for the shattered faces of calved ice. */
export function ridgedNoise3(x, y, z, seed) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    const n = 1 - Math.abs(valueNoise(x * frequency, y * frequency, z * frequency, seed + octave) * 2 - 1);
    sum += n * n * amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function prepareWeldedSphere(radius, detail) {
  const raw = new THREE.IcosahedronGeometry(radius, detail);
  raw.deleteAttribute('uv');
  raw.deleteAttribute('normal');
  const merged = mergeVertices(raw, 1e-4);
  raw.dispose();
  return merged;
}

function createKeel(radius = 0.92, depth = BELOW_WATER, seed = 13) {
  const geom = prepareWeldedSphere(1, SUB_DETAIL);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = ridgedNoise3(x * 2.3, y * 1.9, z * 2.3, seed);
    // Gentle submerged shelf collar flaring slightly near y = 0 for smooth sea-to-glacier transition.
    const collar = Math.exp(-Math.pow(y * 3.5, 2)) * 0.16;
    const r = radius * (0.86 + n * 0.24 + collar);
    const wy = y > 0 ? y * 0.09 : y * depth * (0.85 + n * 0.3);
    pos.setXYZ(i, x * r, wy, z * r);
  }
  return geom;
}

/** Ring of fractured brash-ice floes resting along the waterline so cliffs blend naturally into sea ice. */
function createWaterlineBrashCollar(count = 8, radius = 0.88, seed = 401) {
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + (seed % 7) * 0.15;
    const dist = radius * (0.88 + 0.16 * Math.sin(i * 2.3 + seed));
    parts.push(createIceShard({
      offsetX: Math.cos(angle) * dist,
      offsetZ: Math.sin(angle) * dist,
      radiusX: 0.16 + (i % 3) * 0.04,
      radiusZ: 0.14 + (i % 2) * 0.04,
      height: 0.14 + (i % 3) * 0.05,
      baseY: -0.09,
      tiltX: Math.sin(angle) * 0.22,
      tiltZ: -Math.cos(angle) * 0.22,
      yaw: angle,
      taper: 0.28,
      flutes: 5,
      seed: seed + i * 11,
    }));
  }
  return parts;
}

function createIceShard({
  radiusX = 0.28,
  radiusZ = 0.24,
  height = 0.7,
  baseY = -0.18,
  offsetX = 0,
  offsetZ = 0,
  tiltX = 0,
  tiltZ = 0,
  yaw = 0,
  taper = 0.65,
  flutes = 5,
  seed = 31,
}) {
  const geom = prepareWeldedSphere(1, SUB_DETAIL);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const theta = Math.atan2(z, x);
    const flute = Math.abs(Math.sin(theta * flutes * 0.5 + seed));
    const crack = ridgedNoise3(x * 2.4, y * 2.0, z * 2.4, seed);
    const hNorm = (y + 1) * 0.5;
    const widthProfile = Math.max(0.06, 1 - taper * Math.pow(hNorm, 1.35)) * (0.82 + flute * 0.24 + crack * 0.18);
    const wy = y > 0 ? Math.pow(y, 0.85) * height : y * 0.22;
    pos.setXYZ(i, x * radiusX * widthProfile, wy, z * radiusZ * widthProfile);
  }
  geom.rotateX(tiltX);
  geom.rotateZ(tiltZ);
  geom.rotateY(yaw);
  geom.translate(offsetX, baseY, offsetZ);
  return geom;
}

function createIcicleTooth({ x, y, z, radius = 0.045, length = 0.18, tiltX = 0, tiltZ = 0 }) {
  const cone = new THREE.ConeGeometry(radius, length, 6, 3);
  cone.deleteAttribute('uv');
  cone.deleteAttribute('normal');
  cone.rotateX(Math.PI + tiltX);
  cone.rotateZ(tiltZ);
  cone.translate(x, y - length * 0.5, z);
  return cone;
}

function sculptTabularMesa() {
  const parts = [];
  const main = prepareWeldedSphere(1, DETAIL);
  const pos = main.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const crack = ridgedNoise3(x * 2.2, y * 2.4, z * 2.2, 11);
    const strata = Math.floor((y + 0.5) * 7) / 7;
    const strataStep = (strata - y) * 0.07;
    // Wave-cut basal undercut right along the sea line.
    const notch = 1 - 0.14 * Math.exp(-Math.pow((y - 0.02) * 8.5, 2));
    const radius = (0.94 + (crack - 0.45) * 0.26 + strataStep) * notch;
    const waist = y > 0 ? 1 - 0.11 * y * y : 1;
    const crown = Math.min(y * 0.95, 0.44 + (crack - 0.45) * 0.12);
    const wy = y > 0 ? crown : y * radius * BELOW_WATER;
    pos.setXYZ(i, x * radius * waist, wy, z * radius * waist);
  }
  parts.push(main);
  // Calved apron blocks hugging the waterline.
  const apronSpecs = [
    { offsetX: 0.76, offsetZ: 0.34, radiusX: 0.22, radiusZ: 0.19, height: 0.26, tiltX: 0.28, yaw: 0.5, taper: 0.25, seed: 101 },
    { offsetX: -0.72, offsetZ: -0.44, radiusX: 0.24, radiusZ: 0.18, height: 0.22, tiltZ: -0.22, yaw: 1.9, taper: 0.22, seed: 107 },
    { offsetX: 0.24, offsetZ: -0.8, radiusX: 0.2, radiusZ: 0.17, height: 0.29, tiltX: -0.34, yaw: 2.7, taper: 0.3, seed: 113 },
    { offsetX: -0.58, offsetZ: 0.62, radiusX: 0.18, radiusZ: 0.16, height: 0.19, tiltZ: 0.26, yaw: 0.9, taper: 0.2, seed: 127 },
  ];
  for (const spec of apronSpecs) parts.push(createIceShard({ ...spec, baseY: -0.1 }));
  return parts;
}

function sculptCathedralPinnacle() {
  const parts = [
    createIceShard({
      radiusX: 0.68,
      radiusZ: 0.62,
      height: 1.12,
      baseY: -0.14,
      taper: 0.84,
      flutes: 7,
      seed: 47,
    }),
    createKeel(0.82, BELOW_WATER, 49),
  ];
  const buttressSpecs = [
    { angle: 0.2, dist: 0.44, radiusX: 0.3, radiusZ: 0.26, height: 0.74, tiltX: 0.18, tiltZ: -0.12, seed: 53 },
    { angle: 2.35, dist: 0.48, radiusX: 0.32, radiusZ: 0.24, height: 0.62, tiltX: -0.15, tiltZ: 0.2, seed: 59 },
    { angle: 4.3, dist: 0.45, radiusX: 0.28, radiusZ: 0.27, height: 0.68, tiltX: 0.14, tiltZ: 0.18, seed: 61 },
    { angle: 1.2, dist: 0.62, radiusX: 0.22, radiusZ: 0.19, height: 0.38, tiltX: 0.32, tiltZ: -0.1, seed: 67 },
    { angle: 3.4, dist: 0.64, radiusX: 0.21, radiusZ: 0.2, height: 0.34, tiltX: -0.25, tiltZ: 0.22, seed: 71 },
  ];
  for (const b of buttressSpecs) {
    parts.push(createIceShard({
      radiusX: b.radiusX,
      radiusZ: b.radiusZ,
      height: b.height,
      baseY: -0.12,
      offsetX: Math.cos(b.angle) * b.dist,
      offsetZ: Math.sin(b.angle) * b.dist,
      tiltX: b.tiltX,
      tiltZ: b.tiltZ,
      yaw: b.angle,
      taper: 0.72,
      flutes: 5,
      seed: b.seed,
    }));
  }
  return parts;
}

function sculptDomedPressureBerg() {
  const parts = [];
  const dome = prepareWeldedSphere(1, DETAIL);
  const pos = dome.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const crack = ridgedNoise3(x * 2.0, y * 1.9, z * 2.0, 83);
    // Two crossing diagonal pressure ridges across the upper hemisphere.
    const ridgeA = y > 0 ? Math.exp(-Math.pow((x * 0.8 + z * 0.6) * 4.2, 2)) * 0.22 : 0;
    const ridgeB = y > 0 ? Math.exp(-Math.pow((x * -0.45 + z * 0.9 - 0.12) * 5.0, 2)) * 0.15 : 0;
    const radius = 0.92 + (crack - 0.45) * 0.3 + ridgeA * 0.35;
    const waist = y > 0 ? 1 - 0.32 * y * y : 1;
    const wy = y > 0
      ? Math.min(0.74, y * 0.66 + ridgeA + ridgeB + (crack - 0.45) * 0.14)
      : y * radius * BELOW_WATER;
    pos.setXYZ(i, x * radius * waist, wy, z * radius * waist);
  }
  parts.push(dome);
  parts.push(createIceShard({
    offsetX: 0.56, offsetZ: -0.35, radiusX: 0.28, radiusZ: 0.22, height: 0.36, baseY: -0.1, tiltZ: -0.35, yaw: 0.7, taper: 0.48, seed: 89,
  }));
  parts.push(createIceShard({
    offsetX: -0.6, offsetZ: 0.38, radiusX: 0.25, radiusZ: 0.24, height: 0.32, baseY: -0.1, tiltZ: 0.32, yaw: 2.1, taper: 0.45, seed: 97,
  }));
  return parts;
}

function sculptSeaArch() {
  const parts = [createKeel(0.95, BELOW_WATER, 131)];
  // Left and right piers flanking a true open tunnel along Z.
  parts.push(createIceShard({
    offsetX: -0.52, offsetZ: 0, radiusX: 0.34, radiusZ: 0.42, height: 0.86, baseY: -0.22, tiltZ: -0.14, taper: 0.46, flutes: 6, seed: 137,
  }));
  parts.push(createIceShard({
    offsetX: 0.52, offsetZ: 0, radiusX: 0.34, radiusZ: 0.4, height: 0.82, baseY: -0.22, tiltZ: 0.15, taper: 0.48, flutes: 6, seed: 139,
  }));
  // Vaulted crystalline arch bridge over the water gap.
  const arch = new THREE.TorusGeometry(0.46, 0.17, 14, 24, Math.PI);
  arch.deleteAttribute('uv');
  arch.deleteAttribute('normal');
  const weldedArch = mergeVertices(arch, 1e-4);
  arch.dispose();
  const pos = weldedArch.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = ridgedNoise3(x * 3.1, y * 3.1, z * 3.1, 149);
    const scaleXZ = 0.86 + n * 0.34;
    pos.setXYZ(i, x * 1.05, y * 0.82 + 0.36 + (n - 0.5) * 0.08, z * scaleXZ * 1.35);
  }
  parts.push(weldedArch);
  // Crest serac spires & hanging arch icicles.
  parts.push(createIceShard({
    offsetX: -0.16, offsetZ: 0.03, radiusX: 0.18, radiusZ: 0.16, height: 0.38, baseY: 0.62, tiltZ: 0.12, taper: 0.78, seed: 151,
  }));
  parts.push(createIceShard({
    offsetX: 0.2, offsetZ: -0.04, radiusX: 0.16, radiusZ: 0.15, height: 0.34, baseY: 0.6, tiltZ: -0.14, taper: 0.76, seed: 157,
  }));
  const teeth = [
    { x: -0.2, y: 0.6, z: 0.08, radius: 0.038, length: 0.17 },
    { x: 0.0, y: 0.66, z: -0.06, radius: 0.044, length: 0.2 },
    { x: 0.21, y: 0.59, z: 0.05, radius: 0.036, length: 0.16 },
    { x: -0.09, y: 0.63, z: -0.1, radius: 0.032, length: 0.14 },
  ];
  for (const tooth of teeth) parts.push(createIcicleTooth(tooth));
  return parts;
}

function sculptCrevassedSeracCluster() {
  const parts = [createKeel(0.92, BELOW_WATER, 163)];
  const monoliths = [
    { offsetX: 0.0, offsetZ: 0.04, radiusX: 0.3, radiusZ: 0.26, height: 0.94, tiltX: 0.12, tiltZ: -0.09, yaw: 0.3, taper: 0.68, seed: 167 },
    { offsetX: -0.44, offsetZ: 0.22, radiusX: 0.26, radiusZ: 0.23, height: 0.78, tiltX: -0.18, tiltZ: 0.24, yaw: 1.1, taper: 0.72, seed: 173 },
    { offsetX: 0.42, offsetZ: -0.18, radiusX: 0.27, radiusZ: 0.22, height: 0.84, tiltX: 0.16, tiltZ: -0.22, yaw: 2.0, taper: 0.74, seed: 179 },
    { offsetX: -0.24, offsetZ: -0.46, radiusX: 0.25, radiusZ: 0.22, height: 0.68, tiltX: -0.26, tiltZ: -0.12, yaw: 2.9, taper: 0.66, seed: 181 },
    { offsetX: 0.36, offsetZ: 0.44, radiusX: 0.23, radiusZ: 0.2, height: 0.62, tiltX: 0.24, tiltZ: 0.14, yaw: 0.8, taper: 0.7, seed: 191 },
    { offsetX: -0.64, offsetZ: -0.22, radiusX: 0.2, radiusZ: 0.18, height: 0.44, tiltX: -0.14, tiltZ: 0.34, yaw: 1.7, taper: 0.58, seed: 193 },
    { offsetX: 0.64, offsetZ: 0.12, radiusX: 0.19, radiusZ: 0.17, height: 0.41, tiltX: 0.14, tiltZ: -0.35, yaw: 2.6, taper: 0.56, seed: 197 },
  ];
  for (const m of monoliths) parts.push(createIceShard({ ...m, baseY: -0.16, flutes: 6 }));
  return parts;
}

function sculptOverturnedBlueSlab() {
  const parts = [createKeel(0.88, BELOW_WATER, 199)];
  const slab = prepareWeldedSphere(1, DETAIL);
  const pos = slab.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Scalloped meltwater ablation dimples on +z face; sheared fracture plane on -z.
    const scallops = z > -0.1
      ? Math.abs(Math.sin(x * 11 + y * 5) * Math.sin(y * 12 - x * 4)) * 0.09
      : 0;
    const crack = ridgedNoise3(x * 2.5, y * 2.1, z * 2.5, 211);
    const flatShear = z < -0.15 ? -0.28 + crack * 0.08 : z * (0.48 - scallops) + (crack - 0.5) * 0.12;
    const heightEnvelope = y > 0 ? Math.min(0.95, y * 1.05) : y * 0.28;
    const taper = y > 0 ? 1 - 0.34 * Math.pow(y, 1.4) : 1;
    pos.setXYZ(i, x * 0.88 * taper, heightEnvelope, flatShear);
  }
  slab.rotateX(0.46);
  slab.rotateZ(-0.22);
  slab.translate(0, 0.02, 0);
  parts.push(slab);
  parts.push(createIceShard({
    offsetX: -0.58, offsetZ: 0.42, radiusX: 0.24, radiusZ: 0.2, height: 0.38, baseY: -0.12, tiltX: 0.28, tiltZ: 0.3, taper: 0.42, seed: 223,
  }));
  return parts;
}

function sculptMeltCanyonMassif() {
  const parts = [];
  const massif = prepareWeldedSphere(1, DETAIL);
  const pos = massif.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const crack = ridgedNoise3(x * 2.3, y * 2.3, z * 2.3, 229);
    // Diagonal meltwater gorge sliced across the upper crown.
    const gorgeCoord = Math.abs(x * 0.72 - z * 0.69);
    const gorgeMask = y > 0 ? smoothstep(0.05, 0.38, gorgeCoord) : 1;
    const gorgeDepth = y > 0 ? (1 - gorgeMask) * 0.56 : 0;
    const shelfTier = Math.floor((y + 0.3) * 6) / 6;
    const radius = 0.96 + (crack - 0.45) * 0.25 + (shelfTier - y) * 0.06;
    const waist = y > 0 ? 1 - 0.2 * y * y : 1;
    const crown = Math.min(y * 0.94, 0.62 + (crack - 0.45) * 0.14) - gorgeDepth;
    const wy = y > 0 ? Math.max(-0.08, crown) : y * radius * BELOW_WATER;
    pos.setXYZ(i, x * radius * waist, wy, z * radius * waist);
  }
  parts.push(massif);
  parts.push(createIceShard({
    offsetX: 0.45, offsetZ: 0.42, radiusX: 0.22, radiusZ: 0.22, height: 0.52, baseY: 0.14, tiltZ: -0.18, taper: 0.68, seed: 233,
  }));
  parts.push(createIceShard({
    offsetX: -0.48, offsetZ: -0.4, radiusX: 0.24, radiusZ: 0.21, height: 0.58, baseY: 0.12, tiltZ: 0.16, taper: 0.7, seed: 239,
  }));
  return parts;
}

function sculptTwinHornedSaddle() {
  const parts = [createKeel(0.94, BELOW_WATER, 241)];
  // Central saddle base
  parts.push(createIceShard({
    offsetX: 0, offsetZ: 0, radiusX: 0.76, radiusZ: 0.56, height: 0.42, baseY: -0.14, taper: 0.28, flutes: 6, seed: 251,
  }));
  // Two curved horn spires cradling a central cirque
  parts.push(createIceShard({
    offsetX: -0.46, offsetZ: 0.04, radiusX: 0.31, radiusZ: 0.29, height: 1.04, baseY: -0.1, tiltZ: -0.24, tiltX: 0.08, taper: 0.8, flutes: 7, seed: 257,
  }));
  parts.push(createIceShard({
    offsetX: 0.48, offsetZ: -0.05, radiusX: 0.29, radiusZ: 0.27, height: 0.92, baseY: -0.1, tiltZ: 0.22, tiltX: -0.06, taper: 0.78, flutes: 7, seed: 263,
  }));
  // Secondary crescent flank fins
  parts.push(createIceShard({
    offsetX: -0.74, offsetZ: -0.22, radiusX: 0.2, radiusZ: 0.22, height: 0.48, baseY: -0.1, tiltZ: -0.36, taper: 0.62, seed: 269,
  }));
  parts.push(createIceShard({
    offsetX: 0.72, offsetZ: 0.24, radiusX: 0.19, radiusZ: 0.21, height: 0.45, baseY: -0.1, tiltZ: 0.34, taper: 0.62, seed: 271,
  }));
  return parts;
}

const SCULPTORS = Object.freeze([
  sculptTabularMesa,
  sculptCathedralPinnacle,
  sculptDomedPressureBerg,
  sculptSeaArch,
  sculptCrevassedSeracCluster,
  sculptOverturnedBlueSlab,
  sculptMeltCanyonMassif,
  sculptTwinHornedSaddle,
]);

/**
 * A unit-radius glacier berg, sea level at y = 0: distinct high-detail sculpted
 * archetypes (tabular mesa, cathedral pinnacle, pressure dome, vaulted sea arch,
 * crevassed serac cluster, overturned blue-ice slab, melt-canyon massif, and
 * twin-horned saddle). Generated parametrically so it costs nothing in worlds
 * without cold seas.
 *
 * @param {number} kind index into SCULPTORS (0..7)
 */
export function createIcebergGeometry(kind) {
  const sculptor = SCULPTORS[kind] ?? SCULPTORS[0];
  const parts = sculptor();
  parts.push(...createWaterlineBrashCollar(7 + (kind % 3), 0.9, 300 + kind * 37));
  let merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) {
    for (const part of parts) part.dispose();
  }
  merged = subdivideGeometryRedGreen(merged, 15400, { maxTris: 30000 });
  sculptPositionKeyedRelief(merged, {
    amplitude: 0.0085,
    freq: 10.5,
    seed: 307 + kind * 41,
    groundY: -0.04,
    groundFade: false,
  });
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
