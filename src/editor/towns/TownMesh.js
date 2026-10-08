import * as THREE from 'three/webgpu';

import { TOWN_LOD_NEAR } from './TownLod.js';
import { townLook } from './TownMaterialPalette.js';
import { TownModuleInstances, composePlacement, seedColour } from './TownModuleInstances.js';

const DOOR_MODULE = 'Door_Leaf';
// A far level costs a second set of draws, so only modules the far kit makes
// meaningfully lighter get one.
const FAR_SAVING = 0.8;

function triangles(geometry) {
  if (!geometry) return 0;
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
}

function simplerFar(near, far) {
  if (!far || !near.opaque) return null;
  return triangles(far.opaque) > triangles(near.opaque) * FAR_SAVING ? null : far;
}

/**
 * One town's draw objects, positioned relative to the burg anchor: per kit
 * module, InstancedMeshes of its merged geometry with the town's shared
 * material, at two levels of detail (TownModuleInstances). `setLod` draws the
 * whole town with the full kit (0) or the light far kit (1); `cullInteriors`
 * keeps floors, stairs and furniture to the viewer's surroundings. Door leaves
 * are their own instanced mesh so a door can swing without touching anything
 * else.
 */
export class TownMesh {
  constructor({ assets, palette, layout, climate = {} }) {
    this.layout = layout;
    this.group = new THREE.Group();
    this.group.name = `Town ${layout.name || layout.settlementId}`;
    this.doorMeshes = [];
    this.instanceCount = 0;
    this.look = townLook(layout, climate);
    this.lod = TOWN_LOD_NEAR;
    this.interiorCentre = null;
    this.modules = [];
    const kit = palette.kitMaterial(this.look);
    const glass = palette.glassMaterial();
    const createMesh = (geometry, kind, count) => this.instanced(geometry, kind === 'glass' ? glass : kit,
      count, kind === 'glass');
    for (const [module, values] of layout.parts) {
      const near = assets.modules.get(module);
      if (!near) continue;
      const instances = new TownModuleInstances({
        module,
        values,
        seeds: layout.partSeeds?.get(module) ?? null,
        near,
        far: simplerFar(near, assets.farModules.get(module)),
        interior: assets.isInterior(module),
        createMesh,
      });
      for (const mesh of instances.meshes) this.group.add(mesh);
      this.instanceCount += instances.count;
      this.modules.push(instances);
    }
    this.buildDoors(assets, kit);
  }

  setLod(lod) {
    this.lod = lod;
    for (const instances of this.modules) instances.setLod(lod);
  }

  /** Draw interior modules only within `radius` of the town-local point (x, z). */
  cullInteriors(x, z, radius) {
    this.interiorCentre = { x, z };
    for (const instances of this.modules) instances.cull(x, z, radius);
  }

  instanced(geometry, material, count, glass) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = !glass;
    mesh.receiveShadow = !glass;
    if (glass) mesh.renderOrder = 2;
    return mesh;
  }

  buildDoors(assets, kit) {
    const doors = this.layout.doors;
    const geometry = assets.modules.get(DOOR_MODULE)?.opaque;
    if (!doors.length || !geometry) return;
    const mesh = this.instanced(geometry, kit, doors.length, false);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const colours = new Float32Array(doors.length * 3);
    const rgb = [0, 0, 0];
    for (let i = 0; i < doors.length; i += 1) colours.set(seedColour(0.5, rgb), i * 3);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
    this.doorMeshes.push(mesh);
    doors.forEach((_, index) => this.writeDoor(index, 0));
    mesh.name = DOOR_MODULE;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.instanceCount += doors.length;
  }

  writeDoor(index, angle) {
    const door = this.layout.doors[index];
    const matrix = composePlacement(door.hinge[0], door.hinge[1], door.hinge[2], door.yaw + angle);
    for (const mesh of this.doorMeshes) {
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Swing door `index` to `angle` radians (0 = shut, positive opens inward). */
  setDoorAngle(index, angle) {
    this.writeDoor(index, angle);
  }

  setOrigin(origin) {
    this.group.position.set(this.layout.anchor.x - origin.x, 0, this.layout.anchor.z - origin.z);
    this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.group.removeFromParent();
    for (const child of this.group.children) child.dispose?.();
    this.group.clear();
  }
}
