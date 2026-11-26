/** Keep the full authored step count until pressure, and recover after a quiet interval. */
export class FogStepAdmission {
  constructor(steps, settings) {
    this.steps = steps;
    this.settings = settings;
    this.reduced = Math.min(steps, Math.max(settings.fogMinimumSteps, Math.ceil(steps * settings.fogStepFactor)));
    this.recoverAt = -Infinity;
    this.last = -Infinity;
  }

  update(now, pressured) {
    if (now < this.last) this.recoverAt = -Infinity;
    this.last = now;
    if (pressured) this.recoverAt = now + this.settings.recoveryMs;
    return pressured || now < this.recoverAt ? this.reduced : this.steps;
  }
}
