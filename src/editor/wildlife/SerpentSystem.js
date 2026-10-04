import { Vector3 } from 'three';
import { hash32 } from '../stylized/scatterMath.js';
import { GiantSerpent } from './GiantSerpent.js';
import { SerpentSkins } from './SerpentSkins.js';
import { resolveSerpentSettings } from './serpentSpecies.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

/** Canonical habitat anchors, local float trails, and hysteretic residency. */
export class SerpentSystem {
  constructor({ scene, terrainView, settings, onInstalled }) {
    Object.assign(this, { scene, terrainView, settings, onInstalled });
    this.entries = new Map(); this.skins = null; this.nextRefresh = 0; this.generator = null;
    this.playerLocal = new Vector3();
  }
  candidates(focus) {
    const { regionSize, loadRadius, spawnChance, tileIds } = this.settings;
    const generator = this.terrainView.worldStore.generator;
    const result = this.settings.entries.map((entry, index) => ({ id: `authored:${index}`, ...entry }));
    const radius = Math.ceil(loadRadius / regionSize), cx = Math.floor(focus.x / regionSize), cz = Math.floor(focus.z / regionSize);
    for (let x = cx - radius; x <= cx + radius; x++) for (let z = cz - radius; z <= cz + radius; z++) {
      const seed = hash32((generator.seed ?? generator.worldSeed ?? 1) ^ Math.imul(x, 73856093) ^ Math.imul(z, 19349663));
      if (seed / 0xffffffff >= spawnChance) continue;
      const home = [(x + 0.2 + (seed & 255) / 425) * regionSize, (z + 0.2 + ((seed >>> 8) & 255) / 425) * regionSize];
      const tile = this.terrainView.worldStore.getTile(Math.floor(home[0] / this.terrainView.worldStore.tileSize),
        Math.floor(-home[1] / this.terrainView.worldStore.tileSize));
      if (!tileIds.includes(tile)) continue;
      result.push({ id: `habitat:${x}:${z}`, home, seed, species: ['reticulated', 'anaconda', 'cobra'][seed % 3] });
    }
    return result.filter(entry => Array.isArray(entry.home) && entry.home.length === 2
      && entry.home.every(Number.isFinite) && Math.hypot(entry.home[0] - focus.x, entry.home[1] - focus.z) <= loadRadius)
      .sort((a, b) => Math.hypot(a.home[0] - focus.x, a.home[1] - focus.z) - Math.hypot(b.home[0] - focus.x, b.home[1] - focus.z));
  }
  refresh(focus) {
    for (const [id, entry] of this.entries) {
      if (Math.hypot(entry.home[0] - focus.x, entry.home[1] - focus.z) > this.settings.unloadRadius) this.remove(id, entry);
    }
    for (const record of this.candidates(focus)) {
      if (this.entries.size >= this.settings.maxResident) break;
      if (this.entries.has(record.id)) continue;
      const settings = resolveSerpentSettings({ ...record, home: [0, 0] }, this.settings);
      if (!settings.enabled) continue;
      const home = record.home;
      this.skins ??= new SerpentSkins();
      const skin = this.skins.acquire(settings);
      if (!skin) continue;
      const terrain = {
        sampleHeight: (x, z) => this.terrainView.getCanonicalHeight(home[0] + x, home[1] + z),
        habitatCost: (x, z) => {
          const water = this.terrainView.getCanonicalWater?.(home[0] + x, home[1] + z);
          return water?.coverage > 0.5 && water.surfaceHeight > terrain.sampleHeight(x, z) + 0.2 ? 20 : 0;
        },
      };
      const serpent = new GiantSerpent({ scene: this.scene, terrain, config: {}, settings,
        tileTexture: skin.tile, patternTexture: skin.pattern });
      const entry = { home, serpent, skin }; this.entries.set(record.id, entry); this.place(entry);
      this.onInstalled?.(serpent.root);
      // Initial geometry is deferred to one resident per refresh.
      break;
    }
  }
  place(entry) {
    const render = this.terrainView.floatingOrigin.toRender(...entry.home);
    entry.serpent.root.position.set(render.x, 0, render.z); entry.serpent.root.updateMatrixWorld(true);
  }
  update(dt, camera, focus, player = null, timestamp = performance.now()) {
    if (!this.settings.enabled) return;
    if (this.generator !== this.terrainView.worldStore.generator) { this.clear(); this.generator = this.terrainView.worldStore.generator; this.nextRefresh = 0; }
    if (timestamp >= this.nextRefresh) { this.nextRefresh = timestamp + 1000; this.refresh(focus); }
    for (const entry of this.entries.values()) {
      this.place(entry);
      const local = player ? this.playerLocal.copy(player).sub(entry.serpent.root.position) : null;
      entry.serpent.update(dt, camera, local);
    }
    PerfCounters.set('residentSerpentCount', this.entries.size);
  }
  shiftWorld() { for (const entry of this.entries.values()) this.place(entry); }
  remove(id, entry) { entry.serpent.dispose(); entry.skin.release(); this.entries.delete(id); }
  clear() { for (const [id, entry] of this.entries) this.remove(id, entry); }
  dispose() { this.clear(); this.skins?.dispose(); }
}
