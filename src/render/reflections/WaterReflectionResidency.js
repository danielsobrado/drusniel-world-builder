/** Canonical-space wet-slot index, updated by the water publication pass. */
export class WaterReflectionResidency {
  constructor(cellSize) {
    this.cellSize = Math.max(1, cellSize);
    this.cells = new Map();
    this.entries = new Map();
  }

  key(x, z) { return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`; }

  remove(slot) {
    const previous = this.entries.get(slot);
    if (!previous) return;
    const cell = this.cells.get(previous.key);
    cell.delete(slot);
    if (!cell.size) this.cells.delete(previous.key);
    this.entries.delete(slot);
  }

  update(slot) {
    const descriptor = slot.terrainSlot.descriptor;
    if (!descriptor || !slot.mesh.visible || !slot.hasWaterCoverage) {
      this.remove(slot);
      return;
    }
    const x = descriptor.centerWorldX, z = descriptor.centerWorldZ;
    const previous = this.entries.get(slot);
    if (previous?.x === x && previous.z === z) return;
    this.remove(slot);
    const key = this.key(x, z);
    let cell = this.cells.get(key);
    if (!cell) this.cells.set(key, cell = new Set());
    cell.add(slot);
    this.entries.set(slot, { x, z, key });
  }

  hasNearby(x, z, radius) {
    const r2 = radius * radius, size = this.cellSize;
    for (let cx = Math.floor((x - radius) / size); cx <= Math.floor((x + radius) / size); cx++) {
      for (let cz = Math.floor((z - radius) / size); cz <= Math.floor((z + radius) / size); cz++) {
        const cell = this.cells.get(`${cx}:${cz}`);
        if (!cell) continue;
        for (const slot of cell) {
          const entry = this.entries.get(slot);
          if ((entry.x - x) ** 2 + (entry.z - z) ** 2 < r2) return true;
        }
      }
    }
    return false;
  }

  get slots() { return this.entries.keys(); }
  clear() { this.cells.clear(); this.entries.clear(); }
}

/** Keep only the closest candidates; ties retain source iteration order. */
export function nearestWaterSlots(slots, x, z, limit, output = []) {
  output.length = 0;
  const distances = [];
  for (const slot of slots) {
    const d = slot.terrainSlot.descriptor;
    if (!d) continue;
    const distance = (d.centerWorldX - x) ** 2 + (d.centerWorldZ - z) ** 2;
    let i = distances.length;
    while (i > 0 && distance < distances[i - 1]) i--;
    if (i >= limit) continue;
    distances.splice(i, 0, distance); output.splice(i, 0, slot);
    if (output.length > limit) { distances.pop(); output.pop(); }
  }
  return output;
}
