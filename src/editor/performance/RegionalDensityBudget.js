/** Hysteresis preserves near gameplay geometry; only the far-card reach can shrink. */
export class RegionalDensityBudget {
  constructor(settings) {
    this.settings = settings;
    this.pressured = false;
    this.nextSample = 0;
  }

  update(now, { triangles = 0, draws = 0, townInstances = 0, vegetationInstances = 0 } = {}) {
    if (now >= this.nextSample) {
      this.nextSample = now + this.settings.sampleIntervalMs;
      const workload = Math.max(triangles / this.settings.triangleBudget, draws / this.settings.drawBudget,
        townInstances > 0 && vegetationInstances > 0 ? townInstances / this.settings.townInstanceBudget : 0);
      this.pressured = this.pressured ? workload > this.settings.recoveryRatio : workload > 1;
    }
    return this.pressured ? this.settings.farGrassPressure : 1;
  }
}
