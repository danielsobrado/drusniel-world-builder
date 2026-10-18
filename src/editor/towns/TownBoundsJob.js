import { Matrix4, Sphere } from 'three/webgpu';
/** Exact InstancedMesh bounding sphere, with a scheduling boundary every 64 rows. */
export function* townBoundsJob(mesh) {
  mesh.geometry.computeBoundingSphere();
  const sphere = new Sphere(), matrix = new Matrix4();
  mesh.boundingSphere = new Sphere().makeEmpty();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(matrix);
    mesh.boundingSphere.union(sphere);
    if (i % 64 === 63) yield;
  }
}
