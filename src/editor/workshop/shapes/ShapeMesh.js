import * as THREE from 'three/webgpu';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';
import { shapeFaceUvs } from './ShapeUv.js';

const BOX_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];

export function shapeRandom(seed, entityId, domain, key) {
  let hash = (seed ^ 2166136261) >>> 0;
  for (const char of `${entityId}:${domain}:${key}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash / 4294967296;
}

/** One buffer per material region, including all repeated pieces. No scene objects per piece. */
export class ShapeMesh {
  constructor() {
    this.positions = [];
    this.colors = [];
    this.uvs = [];
    this.normals = [];
  }

  triangle(a, b, c, color = [1, 1, 1], uvs, normals) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const length = Math.hypot(...normal);
    if (length < tolerance.length * tolerance.length) return;
    const flat = normal.map((v) => v / length);
    if (!uvs) {
      const edge = Math.hypot(...ab) || 1, ux = ab[0] / edge, uy = ab[1] / edge, uz = ab[2] / edge;
      const vx = flat[1] * uz - flat[2] * uy, vy = flat[2] * ux - flat[0] * uz, vz = flat[0] * uy - flat[1] * ux;
      this.uvs.push(0, 0, edge, 0, ac[0] * ux + ac[1] * uy + ac[2] * uz, ac[0] * vx + ac[1] * vy + ac[2] * vz);
    }
    for (const [index, point] of [a, b, c].entries()) {
      this.positions.push(...point);
      this.colors.push(...color);
      if (uvs) this.uvs.push(...uvs[index]);
      this.normals.push(...(normals?.[index] ?? flat));
    }
  }

  quad(a, b, c, d, color, uvs, normals) {
    uvs ??= shapeFaceUvs([a, b, c, d]);
    this.triangle(a, b, c, color, uvs && [uvs[0], uvs[1], uvs[2]], normals && [normals[0], normals[1], normals[2]]);
    this.triangle(a, c, d, color, uvs && [uvs[0], uvs[2], uvs[3]], normals && [normals[0], normals[2], normals[3]]);
  }

  box(center, size, color = [1, 1, 1]) {
    const [x, y, z] = center,
      [w, h, d] = size.map((v) => v / 2);
    const p = [
      [x - w, y - h, z - d],
      [x + w, y - h, z - d],
      [x + w, y + h, z - d],
      [x - w, y + h, z - d],
      [x - w, y - h, z + d],
      [x + w, y - h, z + d],
      [x + w, y + h, z + d],
      [x - w, y + h, z + d],
    ];
    for (const face of BOX_FACES) {
      this.quad(...face.map((i) => p[i]), color);
    }
  }

  beam(a, b, width, depth = width, color = [1, 1, 1]) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.001) return;
    // Rotate the local Y axis onto the member without allocating a temporary geometry.
    let qx = dz / length, qz = -dx / length, qw = 1 + dy / length;
    if (qw < 1e-8) { qx = 0; qz = 1; qw = 0; }
    const ql = Math.hypot(qx, qz, qw); qx /= ql; qz /= ql; qw /= ql;
    const u = [1 - 2 * qz * qz, 2 * qz * qw, 2 * qx * qz];
    const v = [dx / length, dy / length, dz / length];
    const w = [2 * qx * qz, -2 * qx * qw, 1 - 2 * qx * qx];
    const local = [[-1, 0, -1], [1, 0, -1], [1, 1, -1], [-1, 1, -1],
      [-1, 0, 1], [1, 0, 1], [1, 1, 1], [-1, 1, 1]];
    const points = local.map(([x, y, z]) => a.map((n, k) => n + u[k] * x * width / 2 + v[k] * y * length + w[k] * z * depth / 2));
    for (const [i, face] of BOX_FACES.entries()) {
      const uv = face.map(index => {
        const [x, y, z] = local[index];
        return i < 2 ? [(x + 1) * width / 2, y * length] : i < 4
          ? [(z + 1) * depth / 2, y * length] : [(x + 1) * width / 2, (z + 1) * depth / 2];
      });
      this.quad(...face.map(index => points[index]), color, uv);
    }
  }

  geometry() {
    if (!this.positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
