import * as THREE from 'three/webgpu';
import { ridgedNoise3 } from './icebergGeometry.js';

export const GLACIER_SERAC_KINDS = 4;

/** Deterministic fractured glacier serac & blue-ice pressure-ridge archetypes (base at y = 0). */
const ARCHETYPES = Object.freeze([
  { kind: 'fin', radius: 0.62, height: 1.55, sides: 10, leanX: 0.36, leanZ: 0.14, shatter: 0.38, seed: 31 },
  { kind: 'cluster', radius: 0.58, height: 1.35, sides: 10, leanX: -0.22, leanZ: 0.24, shatter: 0.34, seed: 73 },
  { kind: 'serac', radius: 0.88, height: 1.22, sides: 12, leanX: 0.24, leanZ: -0.18, shatter: 0.44, seed: 113 },
  { kind: 'slab', radius: 0.85, height: 0.88, sides: 10, leanX: -0.34, leanZ: -0.14, shatter: 0.42, seed: 167 },
]);

/** Builds a chiseled multi-ring glacial ice serac with `seracHeight01` attribute (0 base .. 1 tip). */
function buildSinglePrism({ radius, height, sides, leanX, leanZ, shatter, seed, offsetX = 0, offsetZ = 0, scale = 1, lowDetail = false }) {
  const rings = lowDetail ? 3 : 7;
  if (lowDetail) sides = Math.max(5, Math.floor(sides * 0.6));
  const positions = [];
  const height01s = [];
  const indices = [];

  for (let r = 0; r <= rings; r += 1) {
    const t = r / rings;
    // Stratified glacial cleavage shelves + crisp sheared crest instead of a uniform smooth cone.
    const shelf = Math.sin(t * Math.PI * 3 + seed) * 0.06 * (1 - t);
    const profile = (t < 0.72
      ? 1 - t * 0.34
      : Math.max(0.08, (1 - t) / 0.28 * 0.76)) + shelf;
    const y = t * height * scale;
    const shiftX = offsetX + leanX * t * t * height * scale;
    const shiftZ = offsetZ + leanZ * t * t * height * scale;
    for (let s = 0; s < sides; s += 1) {
      // Irregular angular spacing produces natural fractured glacial cleavage planes.
      const jitterAng = (ridgedNoise3(s * 0.73, seed * 0.19, 1.3, seed) - 0.5) * (Math.PI / sides) * 0.55;
      const ang = (s / sides) * Math.PI * 2 + seed * 0.17 + jitterAng;
      const cx = Math.cos(ang);
      const cz = Math.sin(ang);
      const n = ridgedNoise3(cx * 1.7 + t * 1.1, t * 2.6, cz * 1.7, seed);
      const rad = radius * scale * profile * (1 + (n - 0.45) * shatter);
      positions.push(shiftX + cx * rad, y, shiftZ + cz * rad);
      height01s.push(t);
    }
  }
  const tipIndex = positions.length / 3;
  positions.push(offsetX + leanX * height * scale, height * scale * 1.04, offsetZ + leanZ * height * scale);
  height01s.push(1);

  for (let r = 0; r < rings; r += 1) {
    const row = r * sides;
    const next = (r + 1) * sides;
    for (let s = 0; s < sides; s += 1) {
      const sn = (s + 1) % sides;
      indices.push(row + s, row + sn, next + s);
      indices.push(row + sn, next + sn, next + s);
    }
  }
  const topRow = rings * sides;
  for (let s = 0; s < sides; s += 1) {
    indices.push(topRow + s, topRow + ((s + 1) % sides), tipIndex);
  }
  return { positions, height01s, indices };
}

export function createGlacierSeracGeometry(kind, lowDetail = false) {
  const spec = { ...ARCHETYPES[kind % ARCHETYPES.length], lowDetail };
  const parts = [buildSinglePrism(spec)];
  // Secondary companion shards make clusters and fins read as natural fractured glacier formations.
  if (spec.kind === 'cluster' || spec.kind === 'fin') {
    parts.push(buildSinglePrism({
      ...spec,
      radius: spec.radius * 0.62,
      height: spec.height * 0.72,
      leanX: -spec.leanX * 0.8,
      leanZ: spec.leanZ * 1.3 + 0.15,
      seed: spec.seed + 29,
      offsetX: 0.48 * spec.radius,
      offsetZ: -0.32 * spec.radius,
    }));
    parts.push(buildSinglePrism({
      ...spec,
      radius: spec.radius * 0.48,
      height: spec.height * 0.54,
      leanX: spec.leanX * 0.5 - 0.18,
      leanZ: -spec.leanZ * 1.1,
      seed: spec.seed + 53,
      offsetX: -0.44 * spec.radius,
      offsetZ: 0.36 * spec.radius,
    }));
  }

  let vertCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertCount += part.positions.length / 3;
    indexCount += part.indices.length;
  }
  const positions = new Float32Array(vertCount * 3);
  const height01s = new Float32Array(vertCount);
  const indices = new Uint32Array(indexCount);
  let vOff = 0;
  let iOff = 0;
  for (const part of parts) {
    positions.set(part.positions, vOff * 3);
    height01s.set(part.height01s, vOff);
    for (let i = 0; i < part.indices.length; i += 1) {
      indices[iOff + i] = part.indices[i] + vOff;
    }
    vOff += part.positions.length / 3;
    iOff += part.indices.length;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seracHeight01', new THREE.BufferAttribute(height01s, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
