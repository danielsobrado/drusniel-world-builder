const RUN_STAMINA_DRAIN_PER_S = 0.08;
const STAMINA_REGEN_PER_S = 0.12;
const BOOST_ENERGY_DRAIN_PER_S = 0.1;
const ENERGY_REGEN_PER_S = 0.06;
const MANA_REGEN_PER_S = 0.05;
const LIFE_REGEN_PER_S = 0.01;
/** Mana per millisecond of cast: a 2 s spell costs a fifth of the bar. */
const MANA_PER_CAST_MS = 1 / 10000;
const SAFE_FALL_M = 6;
const LIFE_PER_FALL_M = 0.04;

const RECOVERED_LEVEL = 0.2;
const XP_PER_LEVEL = 100;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * The player's life, mana, stamina and energy as 0..1 levels, plus event-driven
 * progression state. Listeners hear only whole-percent changes, so a full or idle
 * player costs the HUD nothing. Spent stamina or energy stays locked until it
 * recovers, so the bar cannot flicker the run on and off at empty.
 */
export class PlayerVitals {
  constructor() {
    this.levels = { life: 1, mana: 1, stamina: 1, energy: 1 };
    this.published = { ...this.levels };
    this.regenerating = { life: false, mana: false, stamina: false, energy: false };
    this.publishedRegen = { ...this.regenerating };
    this.listeners = new Set();
    this.xpListeners = new Set();
    this.fallPeakY = null;
    this.spent = { stamina: false, energy: false };
    this.publishedSpent = { ...this.spent };
    this.lastDamageAtMs = 0;
    this.xp = { level: 1, progress: 0, total: 0, lastGain: 0, lastGainAt: 0 };
  }

  get canRun() {
    return !this.spent.stamina;
  }

  get canBoost() {
    return !this.spent.energy;
  }

  get dead() {
    return this.levels.life <= 0;
  }

  /** Back to full, for a respawn. */
  revive() {
    for (const id of Object.keys(this.levels)) {
      this.levels[id] = 1;
      this.regenerating[id] = false;
    }
    this.spent = { stamina: false, energy: false };
    this.fallPeakY = null;
    this.publish();
  }

  /** @param {(levels: Record<string, number>, meta?: object) => void} listener @returns {() => void} */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.levels, { regenerating: this.regenerating, spent: this.spent });
    return () => this.listeners.delete(listener);
  }

  /** @param {(xp: object) => void} listener @returns {() => void} */
  subscribeExperience(listener) {
    this.xpListeners.add(listener);
    listener(this.xp);
    return () => this.xpListeners.delete(listener);
  }

  canCast(castMs) {
    return this.levels.mana >= castMs * MANA_PER_CAST_MS;
  }

  spendCast(castMs) {
    this.adjust('mana', -castMs * MANA_PER_CAST_MS);
    this.publish();
  }

  applyDamage(amount, nowMs = performance.now()) {
    if (!(amount > 0)) return;
    this.adjust('life', -amount);
    this.lastDamageAtMs = nowMs;
    this.publish();
  }

  gainExperience(amount, nowMs = performance.now()) {
    if (!(amount > 0)) return;
    const total = this.xp.total + amount;
    const level = 1 + Math.floor(total / XP_PER_LEVEL);
    const progress = (total % XP_PER_LEVEL) / XP_PER_LEVEL;
    this.xp = Object.freeze({ level, progress, total, lastGain: amount, lastGainAt: nowMs });
    for (const listener of this.xpListeners) listener(this.xp);
  }

  /**
   * One walking frame.
   * @param {number} deltaSeconds
   * @param {{ running: boolean, moving: boolean, explorationBoost: boolean, grounded: boolean, footY: number, waterDepth?: number, harnessActive?: boolean }} status
   */
  update(deltaSeconds, status) {
    // Scripted perf walks must neither change the bars nor be stopped by them.
    if (status.harnessActive) return;
    const prevLife = this.levels.life;
    const staminaDelta = (status.running && status.moving ? -RUN_STAMINA_DRAIN_PER_S : STAMINA_REGEN_PER_S) * deltaSeconds;
    const energyDelta = (status.explorationBoost ? -BOOST_ENERGY_DRAIN_PER_S : ENERGY_REGEN_PER_S) * deltaSeconds;
    const manaDelta = MANA_REGEN_PER_S * deltaSeconds;
    const lifeDelta = LIFE_REGEN_PER_S * deltaSeconds;

    this.regenerating.life = this.levels.life < 1 && lifeDelta > 0;
    this.regenerating.mana = this.levels.mana < 1 && manaDelta > 0;
    this.regenerating.stamina = this.levels.stamina < 1 && staminaDelta > 0;
    this.regenerating.energy = this.levels.energy < 1 && energyDelta > 0;

    this.adjust('mana', manaDelta);
    this.adjust('life', lifeDelta);
    this.adjust('stamina', staminaDelta);
    this.adjust('energy', energyDelta);
    this.trackFall(status);
    if (this.levels.life < prevLife) {
      this.lastDamageAtMs = performance.now();
    }
    for (const id of Object.keys(this.spent)) {
      if (this.levels[id] <= 0) this.spent[id] = true;
      else if (this.levels[id] >= RECOVERED_LEVEL) this.spent[id] = false;
    }
    this.publish();
  }

  trackFall({ grounded, footY, waterDepth = 0 }) {
    if (!grounded) {
      this.fallPeakY = Math.max(this.fallPeakY ?? footY, footY);
      return;
    }
    if (this.fallPeakY === null) return;
    const drop = this.fallPeakY - footY - SAFE_FALL_M;
    this.fallPeakY = null;
    // Water breaks the fall.
    if (drop > 0 && waterDepth <= 0) this.adjust('life', -drop * LIFE_PER_FALL_M);
  }

  adjust(id, delta) {
    this.levels[id] = clamp01(this.levels[id] + delta);
  }

  publish() {
    let changed = false;
    for (const id of Object.keys(this.levels)) {
      if (Math.round(this.levels[id] * 100) !== Math.round(this.published[id] * 100)) {
        this.published[id] = this.levels[id];
        changed = true;
      }
      if (this.regenerating[id] !== this.publishedRegen[id]) {
        this.publishedRegen[id] = this.regenerating[id];
        changed = true;
      }
    }
    for (const id of Object.keys(this.spent)) {
      if (this.spent[id] !== this.publishedSpent[id]) {
        this.publishedSpent[id] = this.spent[id];
        changed = true;
      }
    }
    if (!changed) return;
    const meta = { regenerating: { ...this.regenerating }, spent: { ...this.spent } };
    for (const listener of this.listeners) listener(this.levels, meta);
  }
}
