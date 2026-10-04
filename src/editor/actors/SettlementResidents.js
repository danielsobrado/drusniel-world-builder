import { ResidentAssets } from './ResidentAssets.js';
import { NpcSystem } from './NpcSystem.js';
import { residentManifest, nearbySettlements } from './ResidentManifest.js';
import { rectContains } from '../world/settlements/SettlementGeometry.js';

/** Cosmetic residents project existing burg populations, without authoring entities. */
export class SettlementResidents {
  constructor({ scene, terrainView, roster, settings, baseUrl, loader = null, onInstalled, populationProvider = null }) {
    Object.assign(this, { terrainView, settings, populationProvider });
    const assets = new ResidentAssets({ renderer: terrainView.renderer, roster, baseUrl, loader });
    this.npcs = new NpcSystem({ scene, terrainView, assets, onInstalled,
      canStand: (x, z) => this.canStand(x, z) });
    this.manifests = new Map(); this.generator = null; this.nextRefresh = 0;
  }
  canStand(x, z) {
    const field = this.generator?.ensureSettlementField?.();
    if (!field) return true;
    const cellX = x / field.tileSize, cellZ = -z / field.tileSize;
    for (const candidate of field.candidates(cellX, cellZ)) {
      const entry = field.ensurePlan(candidate), [localX, localZ] = field.local(entry, cellX, cellZ);
      for (const item of entry.index.grid.near(localX, localZ, 0)) {
        if (!item.street && rectContains(item.box, localX, localZ, 0.5)) return false;
      }
    }
    return true;
  }
  refresh(focus) {
    const field = this.generator?.ensureSettlementField?.();
    const records = [], currentKeys = new Set();
    for (const settlement of nearbySettlements(field, focus, this.settings.radiusMeters)) {
      const population = this.populationProvider?.(settlement.id) ?? settlement.population;
      const key = `${settlement.id}:${population}`;
      if (!this.manifests.has(key)) {
        const manifest = residentManifest(settlement, { tileSize: this.terrainView.worldStore.tileSize,
          worldSeed: this.generator.worldSeed ?? this.generator.seed ?? 1, settings: this.settings, population });
        for (const record of manifest) {
          if (this.canStand(record.x, record.z)) continue;
          record.x = (settlement.cellX + 0.5) * field.tileSize;
          record.z = -(settlement.cellZ + 0.5) * field.tileSize;
        }
        this.manifests.set(key, manifest);
      }
      currentKeys.add(key);
      records.push(...this.manifests.get(key).filter(record => Math.hypot(record.x - focus.x, record.z - focus.z) <= this.settings.radiusMeters));
      if (records.length >= this.settings.maxResidents) break;
    }
    // The cache follows residency too; travelling the whole world cannot grow it.
    for (const key of this.manifests.keys()) if (!currentKeys.has(key)) this.manifests.delete(key);
    this.npcs.setManifest(records.slice(0, this.settings.maxResidents));
  }
  update(dt, camera, focus, timestamp) {
    if (!this.settings.enabled) return;
    const generator = this.terrainView.worldStore.generator;
    if (this.generator !== generator) { this.generator = generator; this.npcs.clear(); this.manifests.clear(); this.nextRefresh = 0; }
    if (timestamp >= this.nextRefresh) { this.nextRefresh = timestamp + this.settings.refreshSeconds * 1000; this.refresh(focus); }
    this.npcs.update(dt, camera);
  }
  shiftWorld() { this.npcs.shiftWorld(); }
  dispose() { this.manifests.clear(); this.npcs.dispose(); }
}
