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

/** Compute replacement bounds from the same float32, anchor-relative rows that
 * will be published. Never mutate the mesh's currently visible sphere. */
export function* prepareInstanceBounds(mesh, instances, count, rows, anchor, reach = 0) {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere?.();
  if (!mesh.geometry.boundingSphere) return null;
  const partial = rows && mesh.boundingSphere && !(reach > 0);
  const result = partial ? mesh.boundingSphere.clone() : new Sphere().makeEmpty();
  const transform = new Matrix4(), localSphere = new Sphere(), values = new Float32Array(16);
  const visits = partial ? rows.length : count;
  for (let visit = 0; visit < visits; visit++) {
    const index = partial ? rows[visit] : visit;
    if (index < count) {
      const source = instances[index].matrix.elements;
      values.set(source);
      values[12] = source[12] - (anchor?.x ?? 0);
      values[14] = source[14] - (anchor?.z ?? 0);
      transform.fromArray(values);
      localSphere.copy(mesh.geometry.boundingSphere).applyMatrix4(transform);
      result.union(localSphere);
    }
    if (visit % 64 === 63) yield;
  }
  if (reach > 0) result.radius += reach;
  return result;
}
