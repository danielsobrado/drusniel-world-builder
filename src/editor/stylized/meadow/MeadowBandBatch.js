import * as THREE from 'three/webgpu';
import { markAttributeSubrangeUpdated } from '../attributeUpload.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';

export const MEADOW_TILES_PER_PAGE = 4;
const INSTANCE_ATTRIBUTES = Object.freeze([
  ['instancePosition', 'position', 4],
  ['instanceRotation', 'rotation', 2],
  ['instanceData', 'data', 4],
]);

/**
 * A persistent small GPU page containing only completed, populated stems.
 * Membership changes repack at most four tiles. Unchanged tile ranges remain
 * resident; unused capacity never enters the draw. Stem ranks, local positions,
 * wind data and publication fades are copied together without resampling.
 */
export class MeadowBandBatch {
  constructor({ scene, template, material, name, renderOrder = 0 }) {
    this.stride = Math.max(1, template.instanceCount);
    this.slotCapacity = MEADOW_TILES_PER_PAGE;
    this.slots = new Map();
    this.present = new Set();
    this.geometry = new THREE.InstancedBufferGeometry();
    for (const name of ['position', 'uv', 'bladeSide']) {
      this.geometry.setAttribute(name, template.getAttribute(name));
    }
    this.geometry.index = template.index;
    this.geometry.instanceCount = 0;
    const capacity = this.slotCapacity * this.stride;
    for (const [name, , width] of [...INSTANCE_ATTRIBUTES, ['instanceTile', null, 4]]) {
      this.geometry.setAttribute(name,
        new THREE.InstancedBufferAttribute(new Float32Array(capacity * width), width));
    }
    PerfCounters.inc('meadowBufferAllocationBytes', capacity * 14 * 4);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = name;
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  markRange(name, start, count) {
    const bytes = markAttributeSubrangeUpdated(
      this.geometry.getAttribute(name), start, start + count - 1,
    );
    PerfCounters.inc('meadowAttributeBytesUploaded', bytes);
  }

  writeTile(start, tile, count, writeSource) {
    if (writeSource) {
      for (const [name, source, width] of INSTANCE_ATTRIBUTES) {
        this.geometry.getAttribute(name).array.set(
          tile.output[source].subarray(0, count * width), start * width,
        );
        this.markRange(name, start, count);
      }
    }
    const origins = this.geometry.getAttribute('instanceTile').array;
    for (let i = start; i < start + count; i += 1) {
      origins[i * 4] = tile.renderX;
      origins[i * 4 + 1] = tile.renderZ;
      origins[i * 4 + 2] = tile.revealTime ?? -1;
      origins[i * 4 + 3] = tile.revealRank ?? 16777216;
    }
    this.markRange('instanceTile', start, count);
  }

  update(tiles) {
    this.present.clear();
    for (const tile of tiles) this.present.add(tile);
    for (const tile of this.slots.keys()) {
      if (!this.present.has(tile)) this.slots.delete(tile);
    }
    let start = 0;
    for (const tile of tiles) {
      const count = Math.min(tile.output.count, this.stride);
      let slot = this.slots.get(tile);
      const writeSource = !slot || slot.start !== start || slot.count !== count
        || slot.buildId !== tile.buildId;
      if (writeSource || slot.renderX !== tile.renderX || slot.renderZ !== tile.renderZ) {
        this.writeTile(start, tile, count, writeSource);
      }
      if (!slot) {
        slot = {};
        this.slots.set(tile, slot);
      }
      slot.start = start;
      slot.count = count;
      slot.buildId = tile.buildId;
      slot.renderX = tile.renderX;
      slot.renderZ = tile.renderZ;
      start += count;
    }
    this.geometry.instanceCount = start;
    this.mesh.visible = start > 0;
    return start;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
  }
}
