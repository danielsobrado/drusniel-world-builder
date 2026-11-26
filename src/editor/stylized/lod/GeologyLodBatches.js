const FAR_SECTORS = 4;
const NEAR_SCALE_MULTIPLIER = 45;
const FAR_SCALE_MULTIPLIER = 55;
const MIN_NEAR_DISTANCE = 48;

export class GeologyLodBatches {
  constructor({ enabled = false, kinds, cellMeters }) {
    this.enabled = enabled;
    this.kinds = kinds;
    this.sectorMeters = cellMeters * 8;
    this.lastFocus = null;
    this.focus = null;
    this.tiers = new WeakMap();
  }

  get count() { return this.kinds * (this.enabled ? 1 + FAR_SECTORS : 1); }

  updateFocus(focus) {
    this.focus = focus;
    if (!this.enabled) return false;
    const previous = this.lastFocus;
    if (previous && Math.hypot(focus.x - previous.x, focus.z - previous.z) < this.sectorMeters / 32) return false;
    this.lastFocus = { x: focus.x, z: focus.z };
    return true;
  }

  isFarBatch(index) { return index >= this.kinds; }
  kind(index) { return index % this.kinds; }

  index(item) {
    if (!this.enabled || !this.focus) return item.kind;
    const distance = Math.hypot(item.x - this.focus.x, item.z - this.focus.z);
    const previousFar = this.tiers.get(item) === true;
    const multiplier = previousFar ? NEAR_SCALE_MULTIPLIER : FAR_SCALE_MULTIPLIER;
    const far = distance > Math.max(MIN_NEAR_DISTANCE, item.scale * Math.max(1, item.stretch ?? 1) * multiplier);
    this.tiers.set(item, far);
    if (!far) return item.kind;
    const x = Math.floor(item.x / this.sectorMeters) & 1;
    const z = Math.floor(item.z / this.sectorMeters) & 1;
    return (1 + x + z * 2) * this.kinds + item.kind;
  }
}
