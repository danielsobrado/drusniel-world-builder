/**
 * Windblown sand a sandstorm leaves on desert ground, 0..1
 * (docs/plans/desert-sand-field-2026-11-22.md). It builds while the storm blows
 * and blows away slowly once it has passed; the sand field decides where it
 * lies. Pure: no three.js; main writes `value` into `stormSandCoverUniform`.
 */

export class SandCover {
  value = 0;
  /** QA: `{ value }` held instead of integrating (an aftermath at fixed time). */
  frozen = null;

  /** @param {{ buildSeconds: number, fadeSeconds: number }} config resolved `weatherEffects.sandField` */
  constructor(config) {
    this.config = config;
  }

  /**
   * @param {number} dt seconds
   * @param {number} sand the sandstorm blowing now (above 1 is a QA gain)
   */
  update(dt, sand) {
    if (this.frozen) return this.hold();
    if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(sand)) return this.value;
    const goal = Math.max(0, Math.min(1, sand));
    if (this.value < goal) this.value = Math.min(goal, this.value + dt / this.config.buildSeconds);
    else this.value = Math.max(goal, this.value - dt / this.config.fadeSeconds);
    return this.value;
  }

  /** Steady state for this storm at once: snapped storms (QA captures). */
  snap(sand) {
    if (this.frozen) return this.hold();
    if (Number.isFinite(sand)) this.value = Math.max(0, Math.min(1, sand));
    return this.value;
  }

  hold() {
    this.value = Math.max(0, Math.min(1, Number(this.frozen.value) || 0));
    return this.value;
  }
}
