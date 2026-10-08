import * as THREE from 'three/webgpu';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';

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
    for (const [index, point] of [a, b, c].entries()) {
      this.positions.push(...point);
      this.colors.push(...color);
      this.uvs.push(...(uvs?.[index] ?? [point[0], point[2] + point[1]]));
      this.normals.push(...(normals?.[index] ?? flat));
    }
  }

  quad(a, b, c, d, color, uvs, normals) {
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
    for (const face of [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
    ]) {
      this.quad(...face.map((i) => p[i]), color);
    }
  }

  beam(a, b, width, depth = width, color = [1, 1, 1]) {
    const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const length = direction.length();
    if (length < 0.001) return;
    const geometry = new THREE.BoxGeometry(width, length, depth);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(matrix);
    const position = geometry.getAttribute('position'),
      index = geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      this.triangle(
        ...[0, 1, 2].map((offset) => {
          const k = index.getX(i + offset);
          return [position.getX(k), position.getY(k), position.getZ(k)];
        }),
        color,
      );
    }
    geometry.dispose();
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
