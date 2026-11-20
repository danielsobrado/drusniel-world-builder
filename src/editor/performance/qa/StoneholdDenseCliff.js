import { SphereGeometry } from 'three/webgpu';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export const DENSE_CLIFF = 'Dense_Cliff';

// All three meshes sample the same shape. Fine strata and fractures are actual displacement.
export function createDenseCliff(segments) {
  const geometry = new SphereGeometry(1, segments, segments);
  const positions = geometry.attributes.position;
  const noise = new ImprovedNoise();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const layers = 0.06 * Math.sin(36 * y + 3 * noise.noise(3 * x, 5 * y, 3 * z));
    const joints = -0.12 * Math.abs(noise.noise(11 * x, 3 * y, 11 * z));
    const chips = 0.027 * noise.noise(46 * x, 35 * y, 46 * z);
    const radius = 1 + 0.25 * noise.noise(4 * x, 3 * y, 4 * z) + layers + joints + chips;
    positions.setXYZ(i, 13 * x * radius, 9 + 8.8 * y * radius, 8 * z * radius);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
