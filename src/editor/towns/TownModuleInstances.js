import * as THREE from 'three/webgpu';

import { TOWN_LOD_FAR, TOWN_LOD_NEAR, placementsWithin } from './TownLod.js';

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();

/** Matrix for a kit placement: position plus a yaw about +Y (shared scratch). */
export function composePlacement(x, y, z, yaw) {
  scratchPosition.set(x, y, z);
  scratchQuaternion.setFromAxisAngle(UP, yaw);
  return scratchMatrix.compose(scratchPosition, scratchQuaternion, ONE);
}

/**
 * A building seed in [0, 1) spread to three channels in [0.9, 1] for
 * instanceColor: TownKitMaterial reads them as render, timber and roof choices,
 * and three multiplies them in as a gentle per-building tone.
 */
export function seedColour(seed, out = [0, 0, 0]) {
  const channel = (k, o) => 0.9 + 0.1 * ((seed * k + o) % 1);
  out[0] = channel(1, 0);
  out[1] = channel(7.137, 0.31);
  out[2] = channel(13.71, 0.77);
  return out;
}

/**
 * Every placement of one kit module in a town: its opaque geometry with the
 * town material and its window glass, at two levels of detail.
 *
 * `setLod` shows the near or far meshes. A module the far kit does not lighten
 * has no far level and stays near. Interior modules (`interior`) have only near
 * meshes and draw just the placements within a radius of the viewer
 * (`cull`), compacted to the front of their buffers — the same draw count as
 * before, only fewer instances; a far town hides them entirely.
 */
export class TownModuleInstances {
  /**
   * @param {object} options
   * @param {string} options.module kit module name
   * @param {Float32Array} options.values packed [x, y, z, yaw] placements
   * @param {Float32Array|null} options.seeds per-placement building seeds
   * @param {{opaque, glass}} options.near near-kit geometry
   * @param {{opaque, glass}|null} options.far far-kit geometry, or null
   * @param {boolean} options.interior draw only near the viewer
   * @param {(geometry, kind, count) => THREE.InstancedMesh} options.createMesh kind: 'kit' | 'glass'
   */
  constructor({ module, values, seeds, near, far, interior = false, createMesh }) {
    this.values = values;
    this.count = values.length / 4;
    this.interior = interior;
    this.matrices = new Float32Array(this.count * 16);
    this.colours = new Float32Array(this.count * 3);
    const rgb = [0, 0, 0];
    for (let i = 0; i < this.count; i += 1) {
      composePlacement(values[i * 4], values[i * 4 + 1], values[i * 4 + 2], values[i * 4 + 3])
        .toArray(this.matrices, i * 16);
      this.colours.set(seedColour(seeds ? seeds[i] : 0.5, rgb), i * 3);
    }
    const build = (geometry, level) => {
      const list = [];
      if (geometry.opaque) list.push(this.mesh(createMesh(geometry.opaque, 'kit', this.count), module, level, true));
      for (const glass of geometry.glass) list.push(this.mesh(createMesh(glass, 'glass', this.count), module, level, false));
      return list;
    };
    this.nearMeshes = build(near, 'near');
    this.farMeshes = far && !interior ? build(far, 'far') : [];
    this.visibleIndices = interior ? new Uint32Array(this.count) : null;
    this.lod = TOWN_LOD_NEAR;
    this.setLod(TOWN_LOD_NEAR);
  }

  mesh(mesh, module, level, coloured) {
    mesh.name = `${module}:${level}`;
    mesh.instanceMatrix.array.set(this.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    if (coloured) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.colours), 3);
    }
    mesh.computeBoundingSphere();
    return mesh;
  }

  get meshes() {
    return [...this.nearMeshes, ...this.farMeshes];
  }

  setLod(lod) {
    this.lod = lod;
    const far = lod === TOWN_LOD_FAR && this.farMeshes.length > 0;
    for (const mesh of this.nearMeshes) mesh.visible = !far && !(this.interior && lod === TOWN_LOD_FAR) && mesh.count > 0;
    for (const mesh of this.farMeshes) mesh.visible = far;
  }

  /** Interior modules: draw only placements within `radius` of town-local (x, z). */
  cull(x, z, radius) {
    if (!this.interior) return;
    const count = placementsWithin(this.values, x, z, radius, this.visibleIndices);
    for (const mesh of this.nearMeshes) {
      const matrices = mesh.instanceMatrix.array;
      const colours = mesh.instanceColor?.array;
      for (let k = 0; k < count; k += 1) {
        const i = this.visibleIndices[k];
        matrices.set(this.matrices.subarray(i * 16, i * 16 + 16), k * 16);
        colours?.set(this.colours.subarray(i * 3, i * 3 + 3), k * 3);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.setLod(this.lod);
  }
}
