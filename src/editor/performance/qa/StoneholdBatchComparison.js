import { BatchedMesh, Group, Matrix4, Mesh } from 'three/webgpu';

/** Identical heterogeneous kit placements in the separate-draw and BatchedMesh arms. */
export function createBatchComparison({ geometries, material, copies, columns, spacingX, spacingZ, batched }) {
  const vertices = geometries.reduce((total, geometry) => total + geometry.attributes.position.count, 0);
  const indices = geometries.reduce((total, geometry) => total + geometry.index.count, 0);
  const root = batched ? new BatchedMesh(copies, vertices, indices, material) : new Group();
  root.userData.logicalIds = [];
  try {
    const ids = batched ? geometries.map(geometry => root.addGeometry(geometry)) : [];
    const transform = new Matrix4();
    for (let i = 0; i < copies; i += 1) {
      const x = (i % columns) * spacingX;
      const z = Math.floor(i / columns) * spacingZ;
      const geometryIndex = i % geometries.length;
      if (batched) {
        const id = root.addInstance(ids[geometryIndex]);
        root.setMatrixAt(id, transform.makeTranslation(x, 0, z));
        root.userData.logicalIds[id] = i;
      } else {
        const mesh = new Mesh(geometries[geometryIndex], material);
        mesh.position.set(x, 0, z);
        mesh.userData.logicalId = i;
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
      }
    }
    if (batched) {
      root.computeBoundingBox();
      root.computeBoundingSphere();
      root.castShadow = root.receiveShadow = true;
    }
    return root;
  } catch (error) {
    root.dispose?.();
    throw error;
  }
}

export function batchComparisonId(hit) {
  return hit?.object.userData.logicalIds?.[hit.batchId] ?? hit?.object.userData.logicalId;
}
