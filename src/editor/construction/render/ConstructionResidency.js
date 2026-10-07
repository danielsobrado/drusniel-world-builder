import { ConstructionSpatialIndex } from '../ConstructionSpatialIndex.js';

/** Canonical records stay in the store; only camera-local render entries are materialized. */
export class ConstructionResidency {
  constructor({ store, floatingOrigin, radius = 512, chunkWorldSize = 128 }) {
    this.store = store;
    this.floatingOrigin = floatingOrigin;
    this.radius = radius;
    this.index = new ConstructionSpatialIndex({ chunkWorldSize });
    this.focus = { x: 0, z: 0 };
    this.candidates = new Set();
  }
  update(record) {
    if (record.path.type === 'cubicBezier') this.index.update(record);
    else this.index.remove(record.id);
  }
  remove(id) { this.index.remove(id); }
  reset() {
    this.index.clear();
    for (const record of this.store.list()) this.update(record);
  }
  query(camera, pins = []) {
    if (camera) {
      const origin = this.floatingOrigin.getState();
      this.focus.x = camera.position.x + origin.x;
      this.focus.z = camera.position.z + origin.z;
    }
    const { x, z } = this.focus;
    const radius = this.radius;
    this.index.idsForBounds({ minX: x - radius, maxX: x + radius,
      minZ: z - radius, maxZ: z + radius }, 0, this.candidates);
    for (const id of pins) if (id && this.store.get(id)) this.candidates.add(id);
    return this.candidates;
  }
}
