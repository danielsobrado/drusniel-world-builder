import { drainJob } from '../world/settlements/SettlementArrayJobs.js';
import { townBoundsJob } from './TownBoundsJob.js';
import * as THREE from 'three/webgpu';
import { markAttributeSubrangeUpdated } from '../stylized/attributeUpload.js';

import { TOWN_LOD_FAR, TOWN_LOD_NEAR, TOWN_LOD_SPLIT, placementsWithin } from './TownLod.js';

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
 * Which placements a mesh set draws, each kept in its slot while it stays: one that
 * leaves hands its slot to the set's last placement, one that arrives takes the next.
 * A split town re-picked every few metres so changes, and uploads, only a few slots
 * instead of shifting the whole buffer behind the first change.
 */
class SlotSet {
  constructor(count) {
    this.slotOf = new Int32Array(count).fill(-1);
    this.placementAt = new Uint32Array(count);
    this.count = 0;
  }

  /** Make the set hold exactly the placements with `want[i]`; returns the slots that changed. */
  update(want) {
    const dirty = [];
    const { slotOf, placementAt } = this;
    for (let i = 0; i < slotOf.length; i += 1) {
      if (want[i] || slotOf[i] < 0) continue;
      const slot = slotOf[i];
      const last = --this.count;
      const moved = placementAt[last];
      placementAt[slot] = moved;
      slotOf[moved] = slot;
      slotOf[i] = -1;
      if (slot !== last) dirty.push(slot);
    }
    for (let i = 0; i < slotOf.length; i += 1) {
      if (!want[i] || slotOf[i] >= 0) continue;
      const slot = this.count++;
      placementAt[slot] = i;
      slotOf[i] = slot;
      dirty.push(slot);
    }
    return dirty;
  }
}

/**
 * Every placement of one kit module in a town: its opaque geometry with the
 * town material and its window glass, at two levels of detail.
 *
 * `setLod` shows the near or far meshes. A module the far kit does not lighten
 * has no far level and stays near. Interior modules (`interior`) have only near
 * meshes and draw just the placements within a radius of the viewer
 * (`cull`), compacted to the front of their buffers — the same draw count as
 * before, only fewer instances; a far town hides them entirely. A big town draws
 * split (`split`): the near meshes hold the placements round the viewer and the far
 * meshes the rest, each compacted the same way.
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
  constructor({ module, values, seeds, near, far, interior = false, createMesh, deferred = false }) {
    this.values = values;
    this.count = values.length / 4;
    this.interior = interior;
    this.matrices = new Float32Array(this.count * 16);
    this.colours = new Float32Array(this.count * 3);
    this.nearMeshes = []; this.farMeshes = [];
    this.preparation = this.prepare({ module, seeds, near, far, interior, createMesh });
    if (!deferred) { drainJob(this.preparation); this.preparation = null; }
  }

  *prepare({ module, seeds, near, far, interior, createMesh }) {
    const values = this.values;
    const rgb = [0, 0, 0];
    for (let i = 0; i < this.count; i += 1) {
      composePlacement(values[i * 4], values[i * 4 + 1], values[i * 4 + 2], values[i * 4 + 3])
        .toArray(this.matrices, i * 16);
      this.colours.set(seedColour(seeds ? seeds[i] : 0.5, rgb), i * 3);
      if (i % 64 === 63) yield;
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
    // Interior culling: what the near meshes last held. Split drawing: stable slots.
    this.shown = new Map();
    this.nearSlots = null; this.farSlots = null; this.wantNear = null;
    this.lod = TOWN_LOD_NEAR;
    for (const mesh of this.meshes) yield* townBoundsJob(mesh);
    this.setLod(TOWN_LOD_NEAR);
  }

  mesh(mesh, module, level, coloured) {
    mesh.name = `${module}:${level}`;
    mesh.instanceMatrix.array.set(this.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    if (coloured) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.colours), 3);
    }
    return mesh;
  }

  get meshes() {
    return [...this.nearMeshes, ...this.farMeshes];
  }

  setLod(lod) {
    this.lod = lod;
    if (lod === TOWN_LOD_SPLIT && this.farMeshes.length > 0) {
      for (const mesh of this.meshes) mesh.visible = mesh.count > 0;
      return;
    }
    const far = lod === TOWN_LOD_FAR && this.farMeshes.length > 0;
    for (const mesh of this.nearMeshes) mesh.visible = !far && !(this.interior && lod === TOWN_LOD_FAR) && mesh.count > 0;
    for (const mesh of this.farMeshes) mesh.visible = far;
  }

  /**
   * Copy the placements `indices[0..count)` to the front of every mesh in `meshes`,
   * uploading only the range that changed since this set was last written.
   */
  writeSubset(meshes, indices, count) {
    const previous = this.shown.get(meshes) ?? { indices: new Uint32Array(this.count).fill(0xffffffff), count: -1 };
    let first = count, last = -1;
    for (let k = 0; k < count; k++) {
      if (previous.indices[k] === indices[k] && k < previous.count) continue;
      first = Math.min(first, k); last = k;
    }
    for (const mesh of meshes) {
      const matrices = mesh.instanceMatrix.array;
      const colours = mesh.instanceColor?.array;
      for (let k = first; k <= last; k += 1) {
        const i = indices[k];
        matrices.set(this.matrices.subarray(i * 16, i * 16 + 16), k * 16);
        colours?.set(this.colours.subarray(i * 3, i * 3 + 3), k * 3);
      }
      mesh.count = count;
      markAttributeSubrangeUpdated(mesh.instanceMatrix, first, last);
      markAttributeSubrangeUpdated(mesh.instanceColor, first, last);
    }
    previous.indices.set(indices.subarray(0, count));
    previous.count = count;
    this.shown.set(meshes, previous);
  }

  /**
   * Big towns: near meshes draw the placements within `radius` of town-local (x, z),
   * far meshes the rest. A module without a far level, or an interior one, keeps its
   * own behaviour (all near; interiors use `cull`).
   */
  split(x, z, radius) {
    if (this.interior || this.farMeshes.length === 0) return;
    this.nearSlots ??= new SlotSet(this.count);
    this.farSlots ??= new SlotSet(this.count);
    this.wantNear ??= new Uint8Array(this.count);
    const radiusSq = radius * radius;
    const values = this.values;
    for (let i = 0; i < this.count; i += 1) {
      const dx = values[i * 4] - x;
      const dz = values[i * 4 + 2] - z;
      this.wantNear[i] = dx * dx + dz * dz <= radiusSq ? 1 : 0;
    }
    this.writeSlots(this.nearMeshes, this.nearSlots, this.nearSlots.update(this.wantNear));
    for (let i = 0; i < this.count; i += 1) this.wantNear[i] ^= 1;
    this.writeSlots(this.farMeshes, this.farSlots, this.farSlots.update(this.wantNear));
    this.setLod(TOWN_LOD_SPLIT);
  }

  /** Write the changed slots of a slot set into its meshes, uploading each run of them. */
  writeSlots(meshes, slots, dirty) {
    const live = dirty.filter((slot) => slot < slots.count).sort((a, b) => a - b);
    for (const mesh of meshes) {
      const matrices = mesh.instanceMatrix.array;
      const colours = mesh.instanceColor?.array;
      for (const slot of live) {
        const i = slots.placementAt[slot];
        matrices.set(this.matrices.subarray(i * 16, i * 16 + 16), slot * 16);
        colours?.set(this.colours.subarray(i * 3, i * 3 + 3), slot * 3);
      }
      mesh.count = slots.count;
      for (let start = 0; start < live.length;) {
        let end = start;
        while (end + 1 < live.length && live[end + 1] === live[end] + 1) end += 1;
        markAttributeSubrangeUpdated(mesh.instanceMatrix, live[start], live[end]);
        markAttributeSubrangeUpdated(mesh.instanceColor, live[start], live[end]);
        start = end + 1;
      }
    }
  }

  /** Interior modules: draw only placements within `radius` of town-local (x, z). */
  cull(x, z, radius) {
    if (!this.interior) return;
    const count = placementsWithin(this.values, x, z, radius, this.visibleIndices);
    this.writeSubset(this.nearMeshes, this.visibleIndices, count);
    this.setLod(this.lod);
  }
}
