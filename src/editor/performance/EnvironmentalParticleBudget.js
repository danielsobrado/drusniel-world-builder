import { PerfCounters } from './qa/PerfCounters.js';

const LAYERS = Object.freeze(['precipitation', 'dust', 'splash', 'waterfall', 'ambient']);
const clampCount = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function particlePrefix(count, factor, minimum = 0) {
  const requested = clampCount(count);
  return Math.min(requested, Math.max(Math.min(requested, clampCount(minimum)), Math.floor(requested * Math.max(0, Math.min(1, factor)))));
}

/** Reserve protected particles, then allocate optional capacity in priority order. */
export function allocateEnvironmentalParticles(requests, settings, pressured) {
  const limit = Math.floor(settings.particleBudget * (pressured ? settings.pressureFactor : 1));
  let reserved = 0, requested = 0;
  const factors = {};
  const rows = LAYERS.map(key => {
    const demand = requests[key] ?? {};
    const count = clampCount(demand.count);
    const minimum = Math.min(count, Math.max(clampCount(demand.protected), Math.ceil(count * settings.minimumShares[key])));
    reserved += minimum;
    requested += count;
    return { key, count, minimum };
  });
  let available = Math.max(0, limit - reserved);
  let admitted = reserved;
  for (const row of rows) {
    const extra = Math.min(available, row.count - row.minimum);
    available -= extra;
    admitted += extra;
    // Consumers reserve their protected contribution independently.
    const optional = row.count - clampCount(requests[row.key]?.protected);
    factors[row.key] = optional > 0 ? Math.min(1, Math.max(0, (row.minimum + extra - clampCount(requests[row.key]?.protected)) / optional)) : 1;
  }
  return { factors, requested, admitted, reserved, limit, overflow: Math.max(0, reserved - limit) };
}

/** One completed frame of demand feeds the next. Never sample reduced counts as demand. */
export class EnvironmentalParticleBudget {
  constructor(settings) {
    this.settings = settings;
    this.requests = {};
    this.factors = Object.fromEntries(LAYERS.map(key => [key, 1]));
    this.nextSample = -Infinity;
    this.pressured = false;
    this.recoverAt = 0;
  }

  beginFrame(now, pressure) {
    if (pressure) { this.pressured = true; this.recoverAt = now + this.settings.recoveryMs; }
    else if (now >= this.recoverAt) this.pressured = false;
    if (now >= this.nextSample || now < this.nextSample - this.settings.sampleMs) {
      const result = allocateEnvironmentalParticles(this.requests, this.settings, this.pressured);
      this.factors = result.factors;
      this.nextSample = now + this.settings.sampleMs;
      for (const key of ['requested', 'admitted', 'reserved', 'limit', 'overflow']) PerfCounters.set(`environmentParticles.${key}`, result[key]);
      for (const key of LAYERS) PerfCounters.set(`environmentParticles.factor.${key}`, this.factors[key]);
      PerfCounters.set('environmentParticles.pressured', Number(this.pressured));
    }
    this.requests = {};
  }

  request(key, count, protectedCount = 0) {
    if (!LAYERS.includes(key)) return 1;
    const demand = this.requests[key] ??= { count: 0, protected: 0 };
    const requested = clampCount(count);
    demand.count += requested;
    demand.protected += Math.min(requested, clampCount(protectedCount));
    return this.factors[key];
  }
}
