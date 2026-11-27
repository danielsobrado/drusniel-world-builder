import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { initialComputeDraw } from '../../render/preparation/InitialInstancePreparation.js';

function distanceFromSphere(sphere, centre, anchor) {
  if (!sphere || !Number.isFinite(sphere.radius) || sphere.radius < 0
      || !Number.isFinite(centre?.x) || !Number.isFinite(centre?.z)) return 0;
  const distance = Math.hypot(centre.x + sphere.center.x - anchor.x,
    centre.z + sphere.center.z - anchor.z) - sphere.radius;
  return Number.isFinite(distance) ? Math.max(0, distance) : 0;
}

function instanceDistance(mesh, centre, anchor) {
  return mesh.count === 0 ? Infinity : distanceFromSphere(mesh.boundingSphere, centre, anchor);
}

/** Enumerate published, CPU-authoritative town buffers without touching kit ownership. */
export function collectLocationTownAttributes(surface, renderer, anchor, settings) {
  const manager = renderer._attributes, backend = renderer.backend;
  if (!settings.surfaceTownReclamationEnabled || !manager?.has || !manager?.delete
      || !manager?.update || !backend?.getBufferAttribute) return [];
  const terrain = surface.terrainView, pending = terrain.drawPreparation?.pending;
  const entries = [];
  const add = (attribute, type, distance, blocked) => {
    if (!attribute?.isBufferAttribute || attribute.isInterleavedBufferAttribute
        || attribute.isIndirectStorageBufferAttribute || attribute.normalized
        || backend.getBufferAttribute(attribute) !== attribute) return;
    if (type === AttributeType.STORAGE) {
      if (!attribute.isStorageInstancedBufferAttribute || attribute.itemSize !== 16
          || !(attribute.array instanceof Float32Array)) return;
    } else if (attribute.isStorageBufferAttribute || attribute.isStorageInstancedBufferAttribute) return;
    else if (type === AttributeType.INDEX) {
      if (attribute.itemSize !== 1 || !(attribute.array instanceof Uint16Array || attribute.array instanceof Uint32Array)) return;
    } else if (!(attribute.array instanceof Float32Array) || ![1, 2, 3, 4].includes(attribute.itemSize)) return;
    const size = attribute.array.byteLength;
    if (!size || size > settings.surfaceRestoreBytesPerFrame) return;
    entries.push({ resource: attribute, kind: 'town', attributeType: type, size, distance,
      protected: Boolean(blocked || distance <= settings.surfaceTownProtectMeters) });
  };
  const validMesh = mesh => mesh?.parent && mesh.geometry && !mesh.geometry.indirect && !initialComputeDraw(mesh);
  const instances = (mesh, centre, blocked, procedural = false) => {
    if (!validMesh(mesh) || !mesh.isInstancedMesh) return;
    const distance = instanceDistance(mesh, centre, anchor);
    const protect = blocked || pending?.has(mesh);
    add(mesh.instanceMatrix, AttributeType.STORAGE, distance, protect);
    if (procedural) {
      for (const name of ['instanceDither', 'instanceBiomeLook']) {
        add(mesh.geometry.getAttribute(name), AttributeType.VERTEX, distance, protect);
      }
    }
  };
  const staticMesh = (mesh, centre, blocked) => {
    if (!validMesh(mesh) || !mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh
        || Object.keys(mesh.geometry.morphAttributes ?? {}).length) return;
    const distance = distanceFromSphere(mesh.geometry.boundingSphere, centre, anchor);
    const protect = blocked || pending?.has(mesh);
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      if (!attribute.isInstancedBufferAttribute) add(attribute, AttributeType.VERTEX, distance, protect);
    }
    add(mesh.geometry.index, AttributeType.INDEX, distance, protect);
  };
  for (const town of terrain.townRuntime?.streamer.towns.values() ?? []) {
    if (!town.mesh?.group?.parent) continue;
    const blocked = town.selectionJob || town.mesh.preparation || town.mesh.pendingModule;
    for (const module of town.mesh.modules) for (const mesh of module.meshes) {
      if (mesh.parent !== town.mesh.group) continue;
      instances(mesh, town.layout.anchor, blocked || module === town.mesh.doors || module.preparation);
    }
  }

  const view = terrain.settlementView;
  if (!view || view.disposed) return entries;
  const pool = view.pool;
  const blocked = view.selectionJob || pool?.compiling || pool?.uncompiled?.length || pool?.unrevealed?.length
    || pool?.publications?.pending?.size;
  for (const rows of view.rows.values()) {
    if (rows.entry.state !== 'ready') continue;
    for (const band of ['near', 'far']) {
      const tier = rows.published[band]?.tier;
      if (!tier || tier !== rows.entry[band] || tier.publication) continue;
      const centre = rows.tiers.get(tier);
      for (const mesh of tier.meshes) {
        if (mesh.parent === view.root) instances(mesh, centre, blocked, true);
      }
    }
  }
  for (const site of view.sites.values()) {
    if (site.disposed || !site.pavingReady || !site.paving.parent) continue;
    for (const mesh of site.surfaceResidencyMeshes ?? []) {
      if (mesh.parent === site.paving) staticMesh(mesh, site.centre, site.installJob || site.job);
    }
  }
  for (const town of view.skyline?.towns.values() ?? []) {
    if (town.mesh.parent === view.skyline.root) staticMesh(town.mesh, town.centre, false);
  }
  return entries;
}
