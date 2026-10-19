import { disposeInstancedRenderers } from '../stylized/lod/StylizedLodRuntime.js';

function removeMeshes(view, meshes, lod) {
  if (lod) disposeInstancedRenderers(view.root, [meshes]);
  else for (const mesh of meshes) { view.root.remove(mesh); mesh.dispose?.(); }
}
export function cancelObjectCapacity(view, renderer) {
  const stage = renderer.stagedCapacity;
  if (!stage) return;
  removeMeshes(view, stage.objectMeshes, Boolean(renderer.lodSources));
  if (stage.newFoundation) { view.root.remove(stage.foundationMesh); stage.foundationMesh.dispose?.(); }
  renderer.stagedCapacity = null;
}

/** Warm replacement capacity while the complete previous publication stays live. */
export function prepareObjectCapacity(view, renderer, count, foundationCount, next) {
  const growObjects = count > renderer.capacity;
  const growFoundation = renderer.foundationGeometry && foundationCount > renderer.foundationCapacity;
  if (!growObjects && !growFoundation) { cancelObjectCapacity(view, renderer); return true; }
  let stage = renderer.stagedCapacity;
  if (stage && (count > stage.capacity || foundationCount > stage.foundationCapacity && renderer.foundationGeometry)) {
    cancelObjectCapacity(view, renderer); stage = null;
  }
  if (!stage) {
    stage = { ...renderer, stagedCapacity: null, objectMeshes: [], newFoundation: false };
    if (growObjects) {
      stage.capacity = 0; stage.meshes = [];
      if (renderer.lodSources) stage.lodMeshes = { near: [], coarse: [], shell: [] };
      view.ensureCapacity(stage, count);
      stage.objectMeshes = stage.lodMeshes ? Object.values(stage.lodMeshes).flat() : stage.meshes;
    }
    if (growFoundation) {
      stage.foundationMesh = null; stage.foundationCapacity = 0;
      view.ensureFoundationCapacity(stage, foundationCount); stage.newFoundation = true;
    }
    renderer.stagedCapacity = stage;
  }
  stage.next = next;
  const meshes = [...stage.objectMeshes, ...(stage.newFoundation ? [stage.foundationMesh] : [])];
  const preparation = view.terrainView.drawPreparation;
  if (preparation?.settings?.enabled && meshes.some(mesh => !preparation.prepared.has(mesh))) return false;
  if (stage.objectMeshes.length) {
    const old = renderer.lodMeshes ? Object.values(renderer.lodMeshes).flat() : renderer.meshes;
    removeMeshes(view, old, Boolean(renderer.lodSources));
    renderer.meshes = stage.meshes; renderer.lodMeshes = stage.lodMeshes; renderer.capacity = stage.capacity;
    if (renderer.lodSources) renderer.lodSignatures = { near: '', coarse: '', shell: '' };
  }
  if (stage.newFoundation) {
    if (renderer.foundationMesh) { view.root.remove(renderer.foundationMesh); renderer.foundationMesh.dispose?.(); }
    renderer.foundationMesh = stage.foundationMesh; renderer.foundationCapacity = stage.foundationCapacity;
  }
  renderer.stagedCapacity = null;
  return true;
}
