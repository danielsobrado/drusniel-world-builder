/**
 * Snow a storm leaves on the ground, 0..1 (docs/plans/storm-weather-plan-2026-11-08.md
 * §5.2). It builds up under `stormFrame.snow` over minutes and melts slowly once
 * the fall stops — but only outside snow country, where snow lies for good.
 * Pure: no three.js; main writes `value` into `stormSnowCoverUniform`.
 */

export const DEFAULT_SNOW_COVER = Object.freeze({
  /** Seconds of full snowfall to whiten bare ground. */
  buildSeconds: 360,
  /** Seconds for full storm snow to melt once the fall stops. */
  meltSeconds: 600,
  /** Snow share (StormState frame) at or above which nothing melts. */
  holdShare: 0.3,
  /** Seconds to hand the snow field from its build pattern to its melt pattern. */
  meltPhaseSeconds: 60,
});

export function resolveSnowCoverConfig(source = {}) {
  const config = { ...DEFAULT_SNOW_COVER, ...source };
  for (const key of Object.keys(DEFAULT_SNOW_COVER)) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) {
      throw new Error(`Invalid editor configuration: stylizedSurface.snowCover.${key} must be a positive number.`);
    }
  }
  return Object.freeze(config);
}

export class SnowCover {
  value = 0;
  /** 0 building or holding � 1 thawing: which pattern the snow field draws (storm-snow-field plan). */
  melting = 0;
  /** QA: `{ value, melting }` held instead of integrating, for a thaw at fixed time. */
  frozen = null;

  constructor(config = DEFAULT_SNOW_COVER) {
    this.config = config;
  }

  /**
   * @param {number} dt seconds
   * @param {number} snow this frame's snowfall (StormState frame `snow`; above 1 is a QA gain)
   * @param {number} snowShare the climate's share of snow; at `holdShare` and above, snow stays
   */
  update(dt, snow, snowShare = 0) {
    if (this.frozen) return this.hold();
    if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(snow)) return this.value;
    const goal = Math.max(0, Math.min(1, snow));
    const thawing = this.value > goal && snowShare < this.config.holdShare;
    if (this.value < goal) this.value = Math.min(goal, this.value + dt / this.config.buildSeconds);
    else if (thawing) this.value = Math.max(goal, this.value - dt / this.config.meltSeconds);
    const step = dt / this.config.meltPhaseSeconds;
    this.melting = thawing ? Math.min(1, this.melting + step) : Math.max(0, this.melting - step);
    return this.value;
  }

  /** Steady state for this snowfall at once: snapped storms (QA captures). */
  snap(snow) {
    if (this.frozen) return this.hold();
    if (Number.isFinite(snow)) this.value = Math.max(0, Math.min(1, snow));
    this.melting = 0;
    return this.value;
  }

  hold() {
    this.value = Math.max(0, Math.min(1, Number(this.frozen.value) || 0));
    this.melting = Math.max(0, Math.min(1, Number(this.frozen.melting) || 0));
    return this.value;
  }
}
