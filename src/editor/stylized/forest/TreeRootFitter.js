import { fitRootGround, resolveRootSettings } from './treeRootFit.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';

export function prototypeRootReach(parts, rootHeight) {
  let reach = 0;
  for (const part of parts) {
    if (part.kind !== 'trunk') continue;
    const position = part.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) <= rootHeight) reach = Math.max(reach, Math.hypot(position.getX(i), position.getZ(i)));
    }
  }
  return reach;
}

/** Placement-time only: the immutable manifest holds each fitted root plane. */
export class TreeRootFitter {
  constructor({ parts, sampleHeight, settings, resolvePrototypeIndex }) {
    this.settings = resolveRootSettings(settings);
    this.sampleHeight = sampleHeight;
    this.resolvePrototypeIndex = resolvePrototypeIndex;
    this.reach = parts.map(prototype => prototypeRootReach(prototype, this.settings.rootHeight));
  }
  fit(placement) {
    if (!this.settings.enabled) return placement;
    const index = this.resolvePrototypeIndex?.(placement) ?? placement.prototypeIndex;
    const scale = placement.heightScale ?? placement.scale;
    const reach = (this.reach[index] ?? 0) * scale * (placement.trunkScale ?? 1);
    if (!(reach > 0)) return placement;
    const rootFit = fitRootGround(this.sampleHeight, placement.x, placement.z, reach, this.settings);
    if (!Object.values(rootFit).every(Number.isFinite)) return placement;
    if (!placement.planted && rootFit.overhang > this.settings.maxOverhang) {
      PerfCounters.inc('treeRootPlacementsRejected');
      return null;
    }
    PerfCounters.inc('treeRootsFitted');
    return Object.freeze({ ...placement, rootFit: Object.freeze({ ...rootFit,
      conformHeight: this.settings.conformHeight }) });
  }
}
