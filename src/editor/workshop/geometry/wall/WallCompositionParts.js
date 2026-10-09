import * as THREE from 'three/webgpu';
import { buildWallMeshData } from './WallBuilder.js';

export function semanticWallPlanMap(plans, composition) {
  if (!Array.isArray(plans)) throw new Error('Workshop wall plans must be an array.');
  const ids = new Set(composition.primitives.filter(({ kind }) => kind === 'wall').map(({ id }) => id));
  const result = new Map();
  for (const plan of plans) {
    if (!plan?.wallId || !Array.isArray(plan.sections)) throw new Error('Workshop wall plan is invalid.');
    if (!ids.has(plan.wallId)) throw new Error(`Workshop wall plan ${plan.wallId} has no matching composition wall.`);
    if (result.has(plan.wallId)) throw new Error(`Duplicate workshop wall plan: ${plan.wallId}.`);
    result.set(plan.wallId, plan);
  }
  return result;
}

function geometryForRegion(mesh, groups) {
  const remap = new Map(), positions = [], normals = [], uvs = [], indices = [];
  for (const group of groups) for (let i = group.start; i < group.start + group.count; i++) {
    const source = mesh.indices[i];
    let index = remap.get(source);
    if (index === undefined) {
      index = remap.size; remap.set(source, index);
      positions.push(...mesh.positions.slice(source * 3, source * 3 + 3));
      normals.push(...mesh.normals.slice(source * 3, source * 3 + 3));
      uvs.push(...mesh.uvs.slice(source * 2, source * 2 + 2));
    }
    indices.push(index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Tessellation changes buffer sizes, never the number of per-surface render parts. */
export function createSemanticWallParts(primitive, material, plan, annotate) {
  const mesh = buildWallMeshData(plan), regions = new Map(), parts = [], created = [];
  for (const group of mesh.groups) {
    if (!regions.has(group.regionId)) regions.set(group.regionId, []);
    regions.get(group.regionId).push(group);
  }
  try {
    for (const [id, groups] of regions) {
      const geometry = geometryForRegion(mesh, groups); created.push(geometry);
      annotate(geometry, primitive);
      geometry.userData.workshopWallPlanId = plan.wallId;
      geometry.userData.workshopSurfaceId = id;
      const domain = plan.surfaceDomains.find((d) => d.id === id);
      const side = domain?.side ?? (id.endsWith('cap-start') ? 'cap-start' : 'cap-end');
      parts.push({ geometry, material, matrix: new THREE.Matrix4(), materialRegion: {
        id, componentId: primitive.id, primitiveId: primitive.id,
        label: `Wall ${side}`, family: groups[0].family, connected: true,
      } });
    }
    return parts;
  } catch (error) {
    for (const geometry of created) geometry.dispose();
    throw error;
  }
}
