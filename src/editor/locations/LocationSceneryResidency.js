import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { initialComputeDraw } from '../../render/preparation/InitialInstancePreparation.js';

const SCATTER_ATTRIBUTES = ['instanceDither', 'instancePlantRoot', 'instanceSurface', 'instanceBiomeLook',
  'instanceMorphology', 'instanceLeafTint', 'instanceRootPlane'];
const IMPOSTOR_ATTRIBUTES = ['instanceTransform', 'instanceImpostorParams', 'instanceImpostorAppearance'];

function scatterDistance(mesh, anchor, instanceAnchor) {
  if (mesh.count === 0) return Infinity;
  const sphere = mesh.boundingSphere;
  if (!sphere || !Number.isFinite(sphere.radius) || sphere.radius < 0
      || !Number.isFinite(instanceAnchor?.x) || !Number.isFinite(instanceAnchor?.z)) return 0;
  const distance = Math.hypot(sphere.center.x + instanceAnchor.x - anchor.x,
    sphere.center.z + instanceAnchor.z - anchor.z) - sphere.radius;
  return Number.isFinite(distance) ? Math.max(0, distance) : 0;
}

function impostorDistance(batch, anchor, protectMeters) {
  let distance = Infinity;
  for (const record of batch.records) {
    const d = Math.hypot(record.x - anchor.x, record.z - anchor.z) - record.radius;
    if (!Number.isFinite(d) || record.radius < 0) return 0;
    distance = Math.min(distance, Math.max(0, d));
    if (distance <= protectMeters) break;
  }
  return distance;
}

/** Enumerate only the CPU-written instance data of known surface owners. */
export function collectLocationSceneryAttributes(surface, renderer, anchor, settings) {
  const manager = renderer._attributes, backend = renderer.backend;
  if (!settings.surfaceSceneryReclamationEnabled || !manager?.has || !manager?.delete
      || !manager?.update || !backend?.getBufferAttribute) return [];
  const pending = surface.terrainView.drawPreparation?.pending;
  const entries = [];
  const add = (attribute, distance, blocked, storage = false) => {
    if (!attribute?.isInstancedBufferAttribute && !attribute?.isStorageInstancedBufferAttribute) return;
    if (attribute.isInterleavedBufferAttribute || attribute.isIndirectStorageBufferAttribute
        || attribute.normalized || attribute.meshPerAttribute !== 1 || !(attribute.array instanceof Float32Array)
        || backend.getBufferAttribute(attribute) !== attribute) return;
    if (storage ? !attribute.isStorageInstancedBufferAttribute || attribute.itemSize !== 16
      : attribute.isStorageBufferAttribute || attribute.isStorageInstancedBufferAttribute || ![3, 4].includes(attribute.itemSize)) return;
    const size = attribute.array.byteLength;
    if (!size || size > settings.surfaceRestoreBytesPerFrame) return;
    entries.push({ resource: attribute, kind: 'scenery', attributeType: storage ? AttributeType.STORAGE : AttributeType.VERTEX,
      size, distance, protected: Boolean(blocked || distance <= settings.surfaceSceneryProtectMeters) });
  };
  const tree = surface.treeView, rock = surface.rockView, bush = surface.bushView;
  for (const [view, pools] of [
    [tree, [tree?.renderers, tree?.proxyRenderers, tree?.fallbackImpostorRenderers, tree?.clusterRenderers, tree?.understoryRenderers]],
    [rock, [rock?.meshes, rock?.proxyMeshes, rock?.snowCapMeshes]],
    [bush, [bush?.meshes, bush?.proxyMeshes]],
  ]) {
    if (!view) continue;
    const blocked = view.stagedRebuild || view.pendingRebuild || view.pendingLodRebuild;
    for (const pool of pools) for (const parts of pool ?? []) for (const mesh of parts ?? []) {
      if (!mesh.isInstancedMesh || mesh.parent !== view.root || mesh.geometry?.indirect || initialComputeDraw(mesh)) continue;
      const distance = scatterDistance(mesh, anchor, view.instanceAnchor);
      const protect = blocked || pending?.has(mesh);
      add(mesh.instanceMatrix, distance, protect, true);
      for (const name of SCATTER_ATTRIBUTES) add(mesh.geometry.getAttribute(name), distance, protect);
    }
  }
  for (const owner of tree?.impostorBatches ?? []) {
    if (!owner) continue;
    for (const batch of [owner.mode === 'cpu' ? owner.batch : null, owner.auxiliary]) {
      if (!batch?.mesh?.parent || !Array.isArray(batch.records) || !batch.geometry?.isInstancedBufferGeometry
          || batch.geometry.indirect || initialComputeDraw(batch.mesh)) continue;
      const distance = impostorDistance(batch, anchor, settings.surfaceSceneryProtectMeters);
      const blocked = tree.stagedRebuild || tree.pendingLodRebuild || pending?.has(batch.mesh);
      for (const name of IMPOSTOR_ATTRIBUTES) add(batch.geometry.getAttribute(name), distance, blocked);
    }
  }
  return entries;
}
