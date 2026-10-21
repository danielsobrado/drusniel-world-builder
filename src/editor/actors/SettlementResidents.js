import { ResidentAssets } from './ResidentAssets.js';
import { NpcSystem } from './NpcSystem.js';
import { residentManifest, nearbySettlements } from './ResidentManifest.js';
import { rectContains } from '../world/settlements/SettlementGeometry.js';
import { gatheringSpots } from '../world/settlements/SettlementGathering.js';
import { settlementPreparationFor } from '../world/settlements/SettlementPreparation.js';
import { SettlementSamplingPreparation } from '../world/settlements/SettlementSamplingPreparation.js';

/** Cosmetic residents project existing burg populations, without authoring entities. */
export class SettlementResidents {
  constructor({ scene, terrainView, roster, settings, baseUrl, loader = null, onInstalled, populationProvider = null }) {
    Object.assign(this, { terrainView, settings, populationProvider });
    const assets = new ResidentAssets({ renderer: terrainView.renderer, roster, baseUrl, loader });
    this.npcs = new NpcSystem({ scene, terrainView, assets, onInstalled,
      canStand: (x, z) => this.canStand(x, z) });
    this.manifests = new Map(); this.generator = null; this.nextRefresh = 0;
    this.sampling = new SettlementSamplingPreparation(terrainView.worldStore);
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
        const entry = field.findById?.(settlement.id) ?? field.entries.find(candidate => candidate.settlement === settlement);
        const spots = entry ? gatheringSpots(settlement, field.ensurePlan(entry).plan, field.tileSize) : null;
        const manifest = residentManifest(settlement, { tileSize: this.terrainView.worldStore.tileSize,
          worldSeed: this.generator.worldSeed ?? this.generator.seed ?? 1, settings: this.settings, population, spots });
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
  prepareSampling(focus, shouldYield) {
    const generator = this.terrainView.worldStore.generator;
    if (!this.settings.enabled) return;
    if (this.terrainView.worldStore.chunkWorker) {
      const field = settlementPreparationFor(this.terrainView.worldStore).field(generator);
      if (!field) return;
      const tileSize = field.tileSize, radius = this.settings.radiusMeters / tileSize;
      const x = focus.x / tileSize, z = -focus.z / tileSize, wander = this.settings.wanderRadius / tileSize;
      const bounds = { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius };
      for (const { entry } of field.entriesNear(x, z, radius)) {
        const reach = entry.reachCells + wander;
        bounds.minX = Math.min(bounds.minX, entry.settlement.cellX - reach);
        bounds.maxX = Math.max(bounds.maxX, entry.settlement.cellX + reach);
        bounds.minZ = Math.min(bounds.minZ, entry.settlement.cellZ - reach);
        bounds.maxZ = Math.max(bounds.maxZ, entry.settlement.cellZ + reach);
      }
      // Pending model loads and rebases may still place the previous manifest.
      for (const record of this.npcs.desired.values()) {
        const cellX = record.x / tileSize, cellZ = -record.z / tileSize, reach = record.wander / tileSize;
        bounds.minX = Math.min(bounds.minX, cellX - reach); bounds.maxX = Math.max(bounds.maxX, cellX + reach);
        bounds.minZ = Math.min(bounds.minZ, cellZ - reach); bounds.maxZ = Math.max(bounds.maxZ, cellZ + reach);
      }
      const size = this.terrainView.worldStore.chunkSize;
      bounds.minX = Math.floor(bounds.minX / size) * size; bounds.maxX = Math.ceil(bounds.maxX / size) * size;
      bounds.minZ = Math.floor(bounds.minZ / size) * size; bounds.maxZ = Math.ceil(bounds.maxZ / size) * size;
      if (!this.sampling.prepare(bounds, shouldYield)) return false;
    }
    return true;
  }
  update(dt, camera, focus, timestamp, budget = null) {
    if (!this.settings.enabled) return;
    const generator = this.terrainView.worldStore.generator;
    if (this.generator !== generator) { this.generator = generator; this.npcs.clear(); this.manifests.clear(); this.nextRefresh = 0; }
    const prepare = () => this.prepareSampling(focus, budget?.shouldYield);
    if (!(budget?.runner ?? (run => run()))(prepare)) return;
    if (timestamp >= this.nextRefresh) { this.nextRefresh = timestamp + this.settings.refreshSeconds * 1000; this.refresh(focus); }
    this.npcs.update(dt, camera);
  }
  shiftWorld() { this.npcs.shiftWorld(); }
  dispose() { this.sampling.dispose(); this.manifests.clear(); this.npcs.dispose(); }
}
