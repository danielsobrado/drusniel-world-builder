import { Matrix4, Sphere } from 'three/webgpu';
const matrix = new Matrix4(), sphere = new Sphere();

/** Local changes conservatively expand the last complete bounds. Full LOD
 * publications tighten them again. No unrelated instance matrices are read. */
export function extendInstanceBounds(mesh, rows) {
  if (!mesh.boundingSphere) { mesh.computeBoundingSphere(); return; }
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  for (const row of rows) {
    if (row >= mesh.count) continue;
    matrix.fromArray(mesh.instanceMatrix.array, row * 16);
    sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(matrix);
    mesh.boundingSphere.union(sphere);
  }
}
