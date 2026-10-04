import { Box3, Matrix4, Vector3 } from 'three';

const TECHNICAL_NODE = /^(?:COLLIDER|UCX_|UBX_|UCP_)/i;

/** Imported objects stay opaque assets. No workshop components are inferred from meshes. */
export function createGodsEndAssetParts(scene, asset) {
  scene.updateMatrixWorld(true);
  const roots = asset.rootNames.length
    ? asset.rootNames.map((name) => {
      const node = scene.getObjectByName(name);
      if (!node) throw new Error(`Gods’ End asset is missing ${name}: ${asset.path}.`);
      return node;
    }) : [scene];
  const meshes = new Set();
  const visit = (node) => {
    if (TECHNICAL_NODE.test(node.name)) return;
    if (node.isMesh) meshes.add(node);
    for (const child of node.children) visit(child);
  };
  roots.forEach(visit);
  const bounds = new Box3();
  const geometries = new Map();
  for (const mesh of meshes) {
    if (mesh.isInstancedMesh) throw new Error(`Gods’ End asset ${asset.path} is a scene input, not a placeable object.`);
    const geometry = mesh.geometry.clone();
    // Birds can be placed in their authored pose; their animated source is preserved in the library.
    if (mesh.isSkinnedMesh) {
      mesh.skeleton.update();
      const positions = geometry.getAttribute('position');
      const point = new Vector3();
      for (let index = 0; index < positions.count; index++) {
        mesh.getVertexPosition(index, point);
        positions.setXYZ(index, point.x, point.y, point.z);
      }
      geometry.deleteAttribute('skinIndex');
      geometry.deleteAttribute('skinWeight');
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    geometries.set(mesh, geometry);
  }
  if (bounds.isEmpty()) throw new Error(`Gods’ End asset is empty: ${asset.path}.`);
  const center = bounds.getCenter(new Vector3());
  const normalize = new Matrix4().makeScale(asset.scale, asset.scale, asset.scale)
    .multiply(new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
  return [...meshes].map((mesh) => {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      // The reference-counted scene cache owns donor materials and their textures.
      material.userData.sharedSurface = true;
    }
    return { geometry: geometries.get(mesh), material: mesh.material,
      matrix: normalize.clone().multiply(mesh.matrixWorld) };
  });
}
