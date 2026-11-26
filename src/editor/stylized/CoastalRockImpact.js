import { WATER_KIND_OCEAN } from '../water/WaterConstants.js';
import { staticWaterAt } from '../water/StaticWaterSample.js';
import { waterVisualClock } from '../water/WaterVisualClock.js';
import { seaStateUniforms } from '../water/seaState.js';
import { sampleWorldStoreSeaExposure } from '../water/TerrainWaterQueries.js';
import { resolveSeaSurf } from '../water/SeaSurf.js';
import {
  impactContactPoint, impactIntensity, impactWaveSample, impactClamp,
} from '../water/CoastalRockImpactMath.js';
import {
  coastalRockImpactEnabled, resolveCoastalRockImpactConfig,
} from '../water/CoastalRockImpactConfig.js';
import { CoastalRockImpactField } from '../water/CoastalRockImpactField.js';
import { CoastalImpactSpray } from './CoastalImpactSpray.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

const PROBE_DIRECTIONS = Object.freeze([
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707],
]);

export class CoastalRockImpact {
  constructor({ terrainView, rockView, config }) {
    this.terrainView = terrainView;
    this.rockView = rockView;
    this.settings = resolveCoastalRockImpactConfig(config.water?.coast?.rockImpact);
    this.qualityTier = config.water?.qualityTier ?? 'high';
    this.enabled = coastalRockImpactEnabled(this.settings, this.qualityTier)
      && Boolean(config.water?.sea?.enabled);
    this.sea = config.water?.sea;
    this.surf = resolveSeaSurf(this.sea?.surf);
    this.sites = [];
    this.history = new Map();
    this.placements = null;
    this.scanAt = -Infinity;
    this.scanRevision = null;
    this.scanX = NaN;
    this.scanZ = NaN;
    this.lastTime = null;
    this.eventCount = 0;
    this.dropped = 0;
    this.disposed = false;
    if (!this.enabled) return;
    this.field = new CoastalRockImpactField(terrainView.floatingOrigin, this.settings);
    if (this.settings.spray.enabled) {
      this.spray = new CoastalImpactSpray({
        scene: terrainView.scene, floatingOrigin: terrainView.floatingOrigin,
        settings: this.settings.spray, qualityTier: this.qualityTier,
        compact: config.enhancements?.coastalSprayCompaction === true,
        alphaCutoff: config.enhancements?.environmentalFragmentAdmission ? config.enhancements.environmentalFragmentBudget.transparentAlphaCutoff : 0,
      });
    }
  }

  candidate(placement) {
    const radius = Math.max(0.2, (this.rockView.prototypeFootprints[placement.prototypeIndex] ?? 1)
      * placement.scale * 0.5);
    const prototypeHeight = this.rockView.prototypeHeights[placement.prototypeIndex] ?? 1;
    const burial = Math.max(0, this.rockView.config.rocks?.burial ?? 0) * prototypeHeight * placement.scale;
    const bottom = placement.height - burial;
    const top = placement.height + prototypeHeight * placement.scale - burial;
    let selected = null;
    let selectedOffset = [0, 0];
    for (const [unitX, unitZ] of PROBE_DIRECTIONS) {
      const offsetX = unitX * (radius + this.settings.contactReachMeters * 0.4);
      const offsetZ = unitZ * (radius + this.settings.contactReachMeters * 0.4);
      const sampled = staticWaterAt(this.terrainView, placement.x + offsetX, placement.z + offsetZ);
      if (!sampled || sampled.kind !== WATER_KIND_OCEAN || sampled.coverage < 0.5) continue;
      if (!selected || (sampled.shoreDistance ?? 0) > (selected.shoreDistance ?? 0)
        || (selectedOffset[0] === 0 && selectedOffset[1] === 0 && unitX !== 0)) {
        selected = sampled;
        selectedOffset = [offsetX, offsetZ];
      }
    }
    if (!selected || !Number.isFinite(selected.surfaceHeight)
      || top <= selected.surfaceHeight + this.settings.exposedHeightThresholdMeters
      || bottom > selected.surfaceHeight + this.settings.referenceWaveHeightMeters * 2) return null;
    const directionX = -selectedOffset[0], directionZ = -selectedOffset[1];
    const length = Math.hypot(directionX, directionZ);
    return {
      id: String(placement.stableId),
      x: placement.x, z: placement.z,
      bottom, top, radius, water: selected,
      exposure: sampleWorldStoreSeaExposure(
        this.terrainView.worldStore,
        placement.x + selectedOffset[0], placement.z + selectedOffset[1],
        selected.shoreDistance ?? 0,
      ),
      directionX: length > 0.001 ? directionX / length : 1,
      directionZ: length > 0.001 ? directionZ / length : 0,
    };
  }

  refresh(camera, time) {
    const canonical = this.terrainView.floatingOrigin.toCanonical(camera.position.x, camera.position.z);
    const rockPlacements = this.rockView.getPlacements();
    const moved = Math.hypot(canonical.x - this.scanX, canonical.z - this.scanZ);
    const revision = `${this.terrainView.worldStore.baseTerrainRevision}:${this.terrainView.worldStore.revision}`;
    if (this.placements === rockPlacements && this.scanRevision === revision
      && time - this.scanAt < 1 && moved < 8) return;
    if (this.scanRevision !== null && this.scanRevision !== revision) {
      this.history.clear();
      this.field?.reset();
      this.spray?.reset();
    }
    this.scanRevision = revision;
    this.scanAt = time;
    this.scanX = canonical.x;
    this.scanZ = canonical.z;
    this.placements = rockPlacements;
    const r2 = this.settings.activationDistanceMeters ** 2;
    const candidates = [];
    for (const placement of rockPlacements) {
      const distance2 = (placement.x - canonical.x) ** 2 + (placement.z - canonical.z) ** 2;
      if (distance2 <= r2) candidates.push({ placement, distance2 });
    }
    candidates.sort((a, b) => a.distance2 - b.distance2);
    this.sites = [];
    for (const { placement } of candidates.slice(0, this.settings.maximumCandidates)) {
      const site = this.candidate(placement);
      if (site) this.sites.push(site);
      if (this.sites.length >= this.settings.maximumActiveSites) break;
    }
    const activeIds = new Set(this.sites.map(site => site.id));
    for (const key of this.history.keys()) if (!activeIds.has(key)) this.history.delete(key);
    PerfCounters.set('coastalRockEligible', this.sites.length);
    PerfCounters.set('coastalRockActiveSites', this.sites.length);
  }

  update(camera) {
    if (!this.enabled || this.disposed || !camera) return;
    const time = waterVisualClock.value;
    if (!Number.isFinite(time)) return;
    const jumped = this.lastTime !== null && (time < this.lastTime || time - this.lastTime > 0.75);
    this.lastTime = time;
    if (jumped) {
      this.history.clear();
      this.field.reset();
      this.spray?.reset();
    }
    this.refresh(camera, time);
    this.spray?.beginFrame(time);
    if (this.sites.length === 0) {
      if (this.field.enabled) this.field.reset();
      this.field.disable();
      this.spray?.update(time);
      return;
    }
    this.field.center(camera);
    this.field.tick(time);
    const storm = impactClamp(seaStateUniforms.storm.value);
    const cameraWorld = this.terrainView.floatingOrigin.toCanonical(camera.position.x, camera.position.z);
    let emittedThisFrame = 0;
    for (const site of this.sites) {
      const wave = impactWaveSample(site.x, site.z, site.water, time, this.surf, this.sea,
        storm, site.exposure);
      const last = this.history.get(site.id);
      if (!last || jumped) {
        this.history.set(site.id, { crest: wave.crest, time });
        continue;
      }
      if (wave.crest <= last.crest || time - last.time < this.settings.minimumIntervalSeconds) continue;
      last.crest = wave.crest;
      last.time = time;
      const level = site.water.surfaceHeight;
      const reach = impactClamp(
        (wave.height + 0.4 - (site.bottom - level)) / Math.max(0.25, wave.height),
      );
      const intensity = impactIntensity({
        height: wave.height, breaking: wave.breaking,
        exposed: site.top - level, reachable: reach,
      }, this.settings);
      if (intensity < this.settings.minimumImpactIntensity) continue;
      const contact = impactContactPoint(site, site.directionX, site.directionZ);
      const event = {
        rockId: site.id, crestId: wave.crest,
        x: site.x, z: site.z, radius: site.radius,
        directionX: contact.directionX, directionZ: contact.directionZ,
        contactX: contact.x, contactZ: contact.z,
        contactY: Math.min(site.top - 0.05, Math.max(level, site.bottom)),
        intensity,
      };
      this.field.stamp(event);
      this.eventCount++;
      const distance = Math.hypot(site.x - cameraWorld.x, site.z - cameraWorld.z);
      if (distance <= this.settings.fullEffectDistanceMeters) {
        emittedThisFrame += this.spray?.emit(event, time) ?? 0;
      }
    }
    this.spray?.update(time);
    PerfCounters.set('coastalRockImpacts', this.eventCount);
    PerfCounters.set('coastalRockDroplets', this.spray?.live ?? 0);
    PerfCounters.set('coastalRockFieldBytes', this.field.data.byteLength);
    PerfCounters.set('coastalRockSprayEmitted', emittedThisFrame);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.field?.dispose();
    this.spray?.dispose();
    this.history.clear();
    this.sites = [];
  }
}
