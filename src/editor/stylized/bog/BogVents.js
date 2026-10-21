/**
 * Swamp-gas vents: fixed spots on bog islands where gas catches now and again.
 *
 * The world is cut into `cellMeters` cells; a deterministic share of them hold
 * one vent each, at a hashed point inside the cell, kept only where the ground
 * is bog and dry (an island, not a pool). Vents within `reach` of the focus
 * burn in turns — a flame of a few seconds, then a pause of several — through
 * the VFX system's `bogGasFlame` recipe, so they cost one particle draw and a
 * virtual light, never a scene light (CLAUDE.md).
 */

const DEFAULTS = Object.freeze({ cellMeters: 36, share: 0.16, reach: 75, burn: [3.5, 7], pause: [3, 11], maxBurning: 3 });

function hash(x, z, salt) {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ Math.imul(salt | 0, 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 15), 0x297a2d39);
  value ^= value >>> 13;
  return (value >>> 0) / 0xffffffff;
}

export class BogVents {
  /**
   * @param {object} options
   * @param {{ play(id: string, ctx: object): boolean }} options.vfx
   * @param {(x: number, z: number) => boolean} options.isVentGround canonical metres → dry bog?
   * @param {() => { x: number, z: number }} options.origin floating origin (canonical of render 0,0)
   * @param {number} [options.seed]
   */
  constructor({ vfx, isVentGround, origin, seed = 0, settings = {} }) {
    this.vfx = vfx;
    this.isVentGround = isVentGround;
    this.origin = origin;
    this.seed = seed | 0;
    this.settings = { ...DEFAULTS, ...settings };
    this.vents = new Map();
    this.time = 0;
    this.scanTimer = 0;
    this.lastTimestamp = null;
  }

  /** The vent in a cell, or null: deterministic in the cell and seed. */
  ventIn(cellX, cellZ) {
    if (hash(cellX, cellZ, this.seed + 1) >= this.settings.share) return null;
    const size = this.settings.cellMeters;
    const x = (cellX + 0.15 + 0.7 * hash(cellX, cellZ, this.seed + 2)) * size;
    const z = (cellZ + 0.15 + 0.7 * hash(cellX, cellZ, this.seed + 3)) * size;
    return this.isVentGround(x, z) ? { x, z } : null;
  }

  scan(focus) {
    const { cellMeters, reach } = this.settings;
    const kept = new Map();
    const minX = Math.floor((focus.x - reach) / cellMeters);
    const maxX = Math.floor((focus.x + reach) / cellMeters);
    const minZ = Math.floor((focus.z - reach) / cellMeters);
    const maxZ = Math.floor((focus.z + reach) / cellMeters);
    for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        const key = `${cellX}:${cellZ}`;
        const existing = this.vents.get(key);
        const vent = existing ?? this.ventIn(cellX, cellZ);
        if (!vent || Math.hypot(vent.x - focus.x, vent.z - focus.z) > reach) continue;
        // A newly found vent waits a hashed share of a pause, so they never all light at once.
        if (!existing) vent.nextAt = this.time + hash(cellX, cellZ, this.seed + 4) * this.settings.pause[1];
        vent.key = key;
        kept.set(key, vent);
      }
    }
    this.vents = kept;
  }

  /** `update` from a frame timestamp, so callers need not carry a delta. */
  tick(timestampMs, focus) {
    const delta = this.lastTimestamp == null ? 0 : Math.min(0.1, Math.max(0, (timestampMs - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestampMs;
    this.update(delta, focus);
  }

  /**
   * @param {number} deltaSeconds
   * @param {{ x: number, z: number }} focus canonical metres
   */
  update(deltaSeconds, focus) {
    this.time += Math.max(0, deltaSeconds);
    this.scanTimer -= deltaSeconds;
    if (this.scanTimer <= 0) {
      this.scanTimer = 1;
      this.scan(focus);
    }
    const { burn, pause, maxBurning } = this.settings;
    let burning = 0;
    for (const vent of this.vents.values()) if (vent.burningUntil > this.time) burning += 1;
    for (const vent of this.vents.values()) {
      if (burning >= maxBurning || vent.nextAt > this.time || vent.burningUntil > this.time) continue;
      const roll = hash(Math.floor(this.time), vent.key.length + Math.floor(vent.x), this.seed + 5);
      const duration = burn[0] + (burn[1] - burn[0]) * roll;
      const origin = this.origin();
      if (!this.vfx.play('bogGasFlame', { target: { x: vent.x - origin.x, y: 0, z: vent.z - origin.z }, duration })) continue;
      vent.burningUntil = this.time + duration;
      vent.nextAt = vent.burningUntil + pause[0] + (pause[1] - pause[0]) * (1 - roll);
      burning += 1;
    }
  }
}

/**
 * Vents over the streamed world: dry bog cells (the water domain's bog tiles,
 * with no water over them) in canonical metres, played through `vfx`.
 */
export function createBogVents({ vfx, terrainView, tileIds, seed = 0 }) {
  const store = terrainView.worldStore;
  const bogTiles = new Set(tileIds);
  return new BogVents({
    vfx,
    seed,
    origin: () => terrainView.floatingOrigin.getState(),
    isVentGround: (x, z) => {
      const cellX = Math.floor(x / store.tileSize);
      const cellZ = Math.floor(-z / store.tileSize);
      if (!bogTiles.has(store.getTile(cellX, cellZ))) return false;
      return !(store.generator?.sampleWater?.(cellX + 0.5, cellZ + 0.5)?.coverage > 0);
    },
  });
}
