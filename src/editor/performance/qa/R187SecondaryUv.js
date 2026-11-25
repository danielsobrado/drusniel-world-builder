import { unwrapUVs } from 'three/addons/utils/unwrapUVs.js';

/** Offline fixture. The returned geometry is owned by the caller. */
export function createSecondaryUvAtlas(source, options = {}) {
  if (!source.isMesh || source.isSkinnedMesh || source.isInstancedMesh || source.isBatchedMesh
    || source.morphTargetInfluences?.length) throw new TypeError('UV atlas fixture requires a static mesh.');
  if (source.geometry.hasAttribute('uv1')) throw new TypeError('Mesh already has a secondary UV channel.');
  const mesh = source.clone(false);
  source.updateWorldMatrix(true, false);
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = true;
  mesh.matrix.copy(source.matrixWorld);
  const input = source.geometry.clone();
  mesh.geometry = input;
  try {
    const atlas = unwrapUVs(mesh, { ...options, attribute: 'uv1', respectUVSeams: true });
    if (!atlas) throw new Error('Secondary UV charts did not fit in the requested atlas.');
    return { geometry: mesh.geometry, atlas };
  } finally {
    input.dispose();
  }
}
