import { Matrix4, Vector3 } from 'three/webgpu';
import { markAttributeSubrangeUpdated } from '../stylized/attributeUpload.js';
import { prepareObjectCapacity, cancelObjectCapacity } from './ObjectCapacityPublication.js';
const scratch = new Matrix4();
function writeMatrices(mesh, matrices) {
  const previousCount = mesh.count;
  mesh.count = matrices.length; mesh.visible = matrices.length > 0;
  const attribute = mesh.instanceMatrix;
  let first = Infinity, last = -1;
  for (let row = 0; row < matrices.length; row++) {
    const elements = matrices[row].elements;
    for (let i = 0; i < 16; i++) {
      if (attribute.array[row * 16 + i] === Math.fround(elements[i])) continue;
      attribute.array.set(elements, row * 16);
      first = Math.min(first, row); last = row; break;
    }
  }
  markAttributeSubrangeUpdated(attribute, first, last);
  if (last >= 0 || previousCount !== mesh.count) mesh.computeBoundingSphere();
}

/** Reuse exact placement products and LOD history for unchanged resident objects. */
export function* prepareObjectInstances(view, renderer, objects, invalidation = null) {
  const origin = invalidation?.origin ?? view.terrainView.floatingOrigin.getState();
  const previous = renderer.placementRecords ?? new Map();
  const next = new Map();
  let changed = previous.size !== objects.length;
  let prepared = 0;
  for (const object of objects) {
    const signature = JSON.stringify(object);
    let record = previous.get(object.id);
    if (!record || record.signature !== signature || record.originX !== origin.x || record.originZ !== origin.z
        || (invalidation ? invalidation.all || invalidation.dirty.has(object.id)
          : view.allPlacementsDirty || view.dirtyPlacements.has(object.id))) {
      const placement = view.resolvePlacement(object);
      const matrix = view.createObjectMatrix(object, placement.surface);
      record = { object, signature, placement, matrix, originX: origin.x, originZ: origin.z,
        worldPosition: new Vector3(matrix.elements[12], matrix.elements[13] + renderer.worldHeight / 2, matrix.elements[14]),
        worldHeight: renderer.worldHeight,
        foundationMatrix: placement.surface.foundationDepth > 0.03
          ? view.createFoundationMatrix(placement.bounds, placement.surface) : null };
      changed = true;
      if (++prepared % 16 === 0) yield;
    }
    next.set(object.id, record);
  }
  if (!changed && renderer.placementRecords) return null;
  return next;
}

export function publishObjectInstances(view, renderer, next) {
  const records = [...next.values()];
  const foundations = records.filter(record => record.foundationMatrix);
  if (!prepareObjectCapacity(view, renderer, next.size, foundations.length, next)) return false;
  renderer.placementRecords = next;
  view.ensureCapacity(renderer, next.size);
  if (renderer.lodSources) {
    renderer.lodPlacements = records;
    renderer.lodController.seed(records);
    renderer.lodController.invalidate();
    renderer.lodSignatures = { near: '', coarse: '', shell: '' };
    if (records.length === 0) {
      renderer.lodController.clear();
      for (const meshes of Object.values(renderer.lodMeshes)) for (const mesh of meshes) {
        mesh.count = 0; mesh.visible = false; mesh.userData.objectIds = [];
      }
    }
  } else {
    for (let part = 0; part < renderer.parts.length; part++) {
      const mesh = renderer.meshes[part];
      const instances = records.map(record => scratch.clone().multiplyMatrices(record.matrix, renderer.parts[part].matrix));
      writeMatrices(mesh, instances);
      mesh.userData.objectIds = records.map(record => record.object.id);
    }
  }
  view.ensureFoundationCapacity(renderer, foundations.length);
  if (renderer.foundationMesh) {
    writeMatrices(renderer.foundationMesh, foundations.map(record => record.foundationMatrix));
    renderer.foundationMesh.userData.objectIds = foundations.map(record => record.object.id);
  }
  return true;
}

export function updateObjectInstances(view, renderer, objects) {
  const job = prepareObjectInstances(view, renderer, objects);
  for (;;) {
    const step = job.next();
    if (step.done) {
      if (!step.value) { cancelObjectCapacity(view, renderer); return false; }
      const published = publishObjectInstances(view, renderer, step.value);
      if (!published) view.pendingObjectUpdates.set(renderer.definition.key, { renderer, next: step.value });
      return published;
    }
  }
}
