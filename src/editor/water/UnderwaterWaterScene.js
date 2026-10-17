import { PerfCounters } from '../performance/qa/PerfCounters.js';

/** The optical medium already refracts its beauty/depth inputs. Its scene must
 * use the existing plain surface variant instead of copying that scene again. */
export class UnderwaterWaterScene {
  constructor(waterSlots) {
    this.waterSlots = typeof waterSlots === 'function' ? waterSlots : () => waterSlots;
    this.restore = [];
  }

  render(draw) {
    const restore = this.restore;
    let visible = 0;
    try {
      for (const slot of this.waterSlots()) {
        if (!slot.mesh?.visible || !slot.material) continue;
        visible++;
        if (slot.mesh.material === slot.material) continue;
        restore.push(slot.mesh, slot.mesh.material);
        slot.mesh.material = slot.material;
      }
      PerfCounters.set('waterOpticsPlainWaterMeshes', visible);
      return draw();
    } finally {
      for (let index = restore.length - 2; index >= 0; index -= 2) restore[index].material = restore[index + 1];
      restore.length = 0;
    }
  }
}
