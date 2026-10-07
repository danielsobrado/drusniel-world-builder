import { ConstructionSpatialIndex } from '../ConstructionSpatialIndex.js';

/** Long constructions query module bounds rather than scanning their entire plan on camera motion. */
export class ConstructionModuleResidency {
  constructor(modules, chunkWorldSize = 128) {
    this.index = new ConstructionSpatialIndex({ chunkWorldSize });
    this.modules = new Map();
    this.candidates = new Set();
    for (const module of modules) {
      this.modules.set(module.id, module);
      this.index.updateBounds(module.id, module.bounds);
    }
  }
  query(focus, radius) {
    const { x, z } = focus;
    const size = this.index.chunkWorldSize;
    const key = [Math.floor((x - radius) / size), Math.floor((x + radius) / size),
      Math.floor((z - radius) / size), Math.floor((z + radius) / size)].join(':');
    this.changed = key !== this.key;
    if (!this.changed) return this.result;
    this.key = key;
    this.index.idsForBounds({ minX: x - radius, maxX: x + radius,
      minZ: z - radius, maxZ: z + radius }, 0, this.candidates);
    this.result = [...this.candidates].map(id => this.modules.get(id));
    return this.result;
  }
}
