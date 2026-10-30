import { drainJob } from '../world/settlements/SettlementArrayJobs.js';
import * as THREE from 'three/webgpu';

import { TOWN_LOD_DEFAULTS, TOWN_LOD_NEAR, TOWN_LOD_SPLIT } from './TownLod.js';
import { townLook } from './TownMaterialPalette.js';
import { isTownProp } from './TownPrefabCatalog.js';
import { TownModuleInstances } from './TownModuleInstances.js';

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
 * whole town with the full kit (0) or the light far kit (1); `split` draws a big
 * town near round the viewer and far beyond; `cullInteriors`
 * keeps floors, stairs and furniture to the viewer's surroundings. Door leaves
 * are their own instances so a door can swing without touching anything else.
 */
export class TownMesh {
  constructor({ assets, palette, layout, climate = {}, deferred = false }) {
    this.layout = layout;
    this.group = new THREE.Group();
    this.group.name = `Town ${layout.name || layout.settlementId}`;
    this.doors = null;
    this.instanceCount = 0;
    this.look = townLook(layout, climate);
    this.lod = TOWN_LOD_NEAR;
    this.interiorCentre = null;
    this.modules = [];
    this.preparation = this.prepare(assets, palette, layout);
    if (!deferred) { drainJob(this.preparation); this.preparation = null; }
  }

  *prepare(assets, palette, layout) {
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
        farReach: isTownProp(module) ? TOWN_LOD_DEFAULTS.propReach : Infinity,
        createMesh, deferred: true,
      });
      yield* this.adopt(instances);
    }
    yield* this.buildDoorsJob(assets, createMesh);
  }

  *adopt(instances) {
    this.pendingModule = instances;
    yield* instances.preparation;
    this.pendingModule = null;
    instances.preparation = null;
    for (const mesh of instances.meshes) this.group.add(mesh);
    this.instanceCount += instances.count;
    this.modules.push(instances);
  }

  setLod(lod) {
    this.lod = lod;
    for (const instances of this.modules) instances.setLod(lod);
  }

  /** A big town: near kit within `radius` of the town-local point (x, z), far kit beyond. */
  split(x, z, radius) {
    drainJob(this.splitJob(x, z, radius));
  }

  *splitJob(x, z, radius) {
    this.lod = TOWN_LOD_SPLIT;
    for (const instances of this.modules) { yield* instances.splitJob(x, z, radius); yield; }
    this.splitCentre = { x, z };
  }

  /** Draw interior modules only within `radius` of the town-local point (x, z). */
  cullInteriors(x, z, radius) {
    drainJob(this.cullInteriorsJob(x, z, radius));
  }

  *cullInteriorsJob(x, z, radius) {
    for (const instances of this.modules) { yield* instances.cullJob(x, z, radius); yield; }
    this.interiorCentre = { x, z };
  }

  instanced(geometry, material, count, glass) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    // Streamed draw preparation hides what it has not reached and only runs on
    // spare frame time: below its target FPS it hid whole towns. Every module
    // shares one kit material, so its first draw compiles once.
    mesh.userData.skipWarmup = true;
    mesh.castShadow = !glass;
    mesh.receiveShadow = !glass;
    if (glass) mesh.renderOrder = 2;
    return mesh;
  }

  *buildDoorsJob(assets, createMesh) {
    const { doors } = this.layout;
    const near = assets.modules.get(DOOR_MODULE);
    if (!doors.length || !near?.opaque) return;
    const values = new Float32Array(doors.length * 4);
    doors.forEach((door, i) => values.set([...door.hinge, door.yaw], i * 4));
    this.doors = new TownModuleInstances({
      module: DOOR_MODULE,
      values,
      seeds: null,
      near,
      far: simplerFar(near, assets.farModules.get(DOOR_MODULE)),
      farReach: TOWN_LOD_DEFAULTS.propReach,
      createMesh, deferred: true,
    });
    yield* this.adopt(this.doors);
  }

  /** Swing door `index` to `angle` radians (0 = shut, positive opens inward). */
  setDoorAngle(index, angle) {
    this.doors.setYaw(index, this.layout.doors[index].yaw + angle);
  }

  setOrigin(origin) {
    this.group.position.set(this.layout.anchor.x - origin.x, 0, this.layout.anchor.z - origin.z);
    this.group.updateMatrixWorld(true);
  }

  dispose() {
    for (const mesh of this.pendingModule?.meshes ?? []) mesh.dispose?.();
    this.pendingModule = null;
    this.group.removeFromParent();
    for (const child of this.group.children) child.dispose?.();
    this.group.clear();
  }
}
