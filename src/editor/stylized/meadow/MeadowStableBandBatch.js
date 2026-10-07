import * as THREE from 'three/webgpu';
import { markAttributeSubrangeUpdated } from '../attributeUpload.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';

const INITIAL_TILES = 32;
const EMPTY_POSITION = 1e7;
const SOURCE_ATTRIBUTES = [
  ['instancePosition', 'position', 4],
  ['instanceRotation', 'rotation', 2],
  ['instanceData', 'data', 4],
];

/**
 * Sparse families keep one draw and stable tile ranges. Small rejected tails
 * are cheaper than repeatedly copying their neighbors or adding many draws.
 * Only populated data and retired positions upload; origin shifts never resend
 * stem data. Dense families instead use packed pages to avoid large empty draws.
 */
export class MeadowStableBandBatch {
  constructor({ scene, template, material, name, renderOrder = 0 }) {
    this.template = template;
    this.stride = Math.max(1, template.instanceCount);
    this.slots = new Map();
    this.present = new Set();
    this.free = [];
    this.freeSet = new Set();
    this.used = 0;
    this.geometry = this.createGeometry(INITIAL_TILES);
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

  createGeometry(tileCapacity) {
    this.slotCapacity = tileCapacity;
    const count = tileCapacity * this.stride;
    const geometry = new THREE.InstancedBufferGeometry();
    for (const name of ['position', 'uv', 'bladeSide']) {
      geometry.setAttribute(name, this.template.getAttribute(name));
    }
    geometry.index = this.template.index;
    geometry.instanceCount = 0;
    for (const [name, , width] of [...SOURCE_ATTRIBUTES, ['instanceTile', null, 4]]) {
      geometry.setAttribute(name,
        new THREE.InstancedBufferAttribute(new Float32Array(count * width), width));
    }
    const positions = geometry.getAttribute('instancePosition').array;
    for (let i = 0; i < count; i += 1) {
      positions[i * 4] = EMPTY_POSITION;
      positions[i * 4 + 2] = EMPTY_POSITION;
    }
    PerfCounters.inc('meadowBufferAllocationBytes', count * 14 * 4);
    return geometry;
  }

  grow() {
    // The renderer caches geometry bindings: replace the geometry rather than
    // replacing attributes in place. First use uploads the complete new arrays.
    const previous = this.geometry;
    this.geometry = this.createGeometry(this.slotCapacity * 2);
    for (const [name] of [...SOURCE_ATTRIBUTES, ['instanceTile']]) {
      this.geometry.getAttribute(name).array.set(previous.getAttribute(name).array);
    }
    this.mesh.geometry = this.geometry;
    previous.dispose();
  }

  markRange(name, start, count) {
    PerfCounters.inc('meadowAttributeBytesUploaded', markAttributeSubrangeUpdated(
      this.geometry.getAttribute(name), start, start + count - 1,
    ));
  }

  retire(start, count) {
    const positions = this.geometry.getAttribute('instancePosition').array;
    for (let i = start; i < start + count; i += 1) {
      positions[i * 4] = EMPTY_POSITION;
      positions[i * 4 + 1] = 0;
      positions[i * 4 + 2] = EMPTY_POSITION;
      positions[i * 4 + 3] = 0;
    }
    this.markRange('instancePosition', start, count);
  }

  write(slot, tile, count, writeSource) {
    const start = slot.index * this.stride;
    if (writeSource) {
      for (const [name, source, width] of SOURCE_ATTRIBUTES) {
        this.geometry.getAttribute(name).array.set(
          tile.output[source].subarray(0, count * width), start * width,
        );
        this.markRange(name, start, count);
      }
      if (slot.count > count) this.retire(start + count, slot.count - count);
    }
    const origins = this.geometry.getAttribute('instanceTile').array;
    for (let i = start; i < start + count; i += 1) {
      origins[i * 4] = tile.renderX;
      origins[i * 4 + 1] = tile.renderZ;
      origins[i * 4 + 2] = tile.revealTime ?? -1;
      origins[i * 4 + 3] = tile.revealRank ?? 16777216;
    }
    this.markRange('instanceTile', start, count);
    Object.assign(slot, { count, buildId: tile.buildId, renderX: tile.renderX, renderZ: tile.renderZ });
  }

  update(tiles) {
    this.present.clear();
    for (const tile of tiles) this.present.add(tile);
    for (const [tile, slot] of this.slots) {
      if (this.present.has(tile)) continue;
      this.retire(slot.index * this.stride, slot.count);
      this.free.push(slot.index);
      this.freeSet.add(slot.index);
      this.slots.delete(tile);
    }
    let stems = 0;
    for (const tile of tiles) {
      let slot = this.slots.get(tile);
      if (!slot) {
        let index;
        while (this.free.length && index === undefined) {
          const candidate = this.free.pop();
          if (this.freeSet.delete(candidate) && candidate < this.used) index = candidate;
        }
        if (index === undefined) {
          if (this.used === this.slotCapacity) this.grow();
          index = this.used++;
        }
        slot = { index, count: 0, buildId: -1 };
        this.slots.set(tile, slot);
      }
      const count = Math.min(tile.output.count, this.stride);
      const writeSource = slot.buildId !== tile.buildId || slot.count !== count;
      if (writeSource || slot.renderX !== tile.renderX || slot.renderZ !== tile.renderZ) {
        this.write(slot, tile, count, writeSource);
      }
      stems += count;
    }
    while (this.used > 0 && this.freeSet.delete(this.used - 1)) this.used -= 1;
    if (this.free.length > this.freeSet.size * 2 + 64) this.free = [...this.freeSet];
    this.geometry.instanceCount = this.used * this.stride;
    this.mesh.visible = this.slots.size > 0;
    return stems;
  }

  get meshes() { return [this.mesh]; }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.slots.clear();
  }
}
