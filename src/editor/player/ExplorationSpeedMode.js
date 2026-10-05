const SHIFT_CODES = new Set(['ShiftLeft', 'ShiftRight']);

/** Double-tap travel mode; derived physics settings never mutate authoring config. */
export class ExplorationSpeedMode {
  constructor(config, settings = {}, now = () => performance.now()) {
    this.enabled = settings.enabled ?? true;
    this.multiplier = settings.speedMultiplier ?? 3;
    this.windowMs = settings.doubleTapWindowMs ?? 300;
    this.now = now;
    this.normalConfig = config;
    this.fastConfig = { ...config, walkSpeed: config.walkSpeed * this.multiplier };
    this.active = false;
    this.resetGesture();
  }

  get config() { return this.active ? this.fastConfig : this.normalConfig; }

  setActive(active) {
    this.active = this.enabled && Boolean(active);
    this.resetGesture();
  }

  resetGesture() { this.lastTap = Number.NEGATIVE_INFINITY; }

  handleKeyDown(event) {
    if (!this.enabled || event.repeat || !SHIFT_CODES.has(event.code)) return false;
    const now = this.now();
    if (now - this.lastTap >= 0 && now - this.lastTap <= this.windowMs) {
      this.setActive(!this.active);
      return true;
    }
    this.lastTap = now;
    return false;
  }
}
