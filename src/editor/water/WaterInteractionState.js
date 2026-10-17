export const WATER_INTERACTION_CAPACITY = 8;
export const WATER_INTERACTION_LIFETIME = 2.4;

/** Bounded transient presentation state, in canonical coordinates. */
export class WaterInteractionState {
  constructor() { this.impulses = []; this.previous = null; this.lastEmission = -Infinity; }
  emit(position, water, seconds, strength = .5) {
    if (!water?.waterBodyId || !water.waterKind || !Number.isFinite(seconds)) return;
    if (this.impulses.length === WATER_INTERACTION_CAPACITY) this.impulses.shift();
    this.impulses.push({ x: position.x, z: position.z, bodyId: water.waterBodyId, kind: water.waterKind,
      started: seconds, strength: Math.min(1, Math.max(0, strength)) });
    this.lastEmission = seconds;
  }
  event(event, position) {
    if (event.type === 'water-enter') this.emit(position, event.current, event.timestamp / 1000, .8);
    if (event.type === 'water-surface') this.emit(position, event.current, event.timestamp / 1000, .4);
    if (event.type === 'water-body-change' || event.type === 'water-exit') this.previous = null;
  }
  update(seconds, position, water, enabled = true) {
    this.impulses = this.impulses.filter(impulse => seconds - impulse.started < WATER_INTERACTION_LIFETIME && seconds >= impulse.started);
    const wet = enabled && water?.waterBodyId && water.waterState !== 'dry' && !water.headSubmerged;
    if (wet && this.previous?.bodyId === water.waterBodyId) {
      const distance = Math.hypot(position.x - this.previous.x, position.z - this.previous.z);
      const elapsed = seconds - this.previous.seconds;
      // Teleports and paused frames must not become a full-speed wake.
      if (elapsed > 0 && elapsed < .3 && distance < 8) {
        this.travelled += distance;
        if (this.travelled >= .65 && seconds - this.lastEmission >= .22) {
          this.emit(position, water, seconds, water.waterState === 'wading' ? .3 : .5);
          this.travelled = 0;
        }
      } else this.travelled = 0;
    } else this.travelled = 0;
    this.previous = wet ? { x: position.x, z: position.z, bodyId: water.waterBodyId, seconds } : null;
    return this.impulses;
  }
  clear() { this.impulses.length = 0; this.previous = null; this.travelled = 0; }
}
