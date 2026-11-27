import { emitAudio } from '../../_clod_shims/audio.js';

const STORAGE_KEY = 'drusniel.discovered.v1';
const CHECK_INTERVAL_MS = 500;
const REVISIT_COOLDOWN_MS = 90000;
const REGION_DWELL_MS = 8000;

export function classifyBurg(burg) {
  if (!burg) return 'Settlement';
  if (burg.capital) return 'Royal capital';
  if (burg.port) return 'Harbour settlement';
  const pop = Number(burg.population ?? 0);
  if (pop >= 8) return 'Walled city';
  if (pop >= 2.5) return 'Market town';
  return 'Frontier settlement';
}

function readDiscovered(storage) {
  try {
    const raw = JSON.parse(storage?.getItem?.(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function writeDiscovered(storage, set) {
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Private windows keep discoveries for the current session.
  }
}

/**
 * Polls at 500ms intervals while walking to detect entry into instanced sites,
 * Azgaar settlements, or named wilderness regions and triggers cinematic
 * discovery / arrival banners without any per-frame DOM or GC overhead.
 */
export class LocationDiscoveryTracker {
  constructor({
    getFocusCanonical = () => null,
    getActiveSite = () => null,
    getNearestSettlement = () => null,
    describeRegion = () => null,
    tileSize = 1,
    onNotify = () => {},
    storage = globalThis.localStorage ?? null,
  } = {}) {
    Object.assign(this, {
      getFocusCanonical,
      getActiveSite,
      getNearestSettlement,
      describeRegion,
      tileSize,
      onNotify,
      storage,
    });
    this.discovered = readDiscovered(storage);
    this.lastSeenAt = new Map();
    this.nextCheckAt = 0;
    this.currentPlaceId = null;
    this.pendingRegion = null;
    this.pendingRegionSince = 0;
  }

  reset() {
    this.currentPlaceId = null;
    this.pendingRegion = null;
    this.pendingRegionSince = 0;
  }

  update(nowMs = performance.now()) {
    if (nowMs < this.nextCheckAt) return;
    this.nextCheckAt = nowMs + CHECK_INTERVAL_MS;

    const candidate = this.resolveCandidate(nowMs);
    if (!candidate) {
      this.currentPlaceId = null;
      return;
    }
    if (candidate.id === this.currentPlaceId) return;
    this.currentPlaceId = candidate.id;

    const isFirstDiscovery = !this.discovered.has(candidate.id);
    if (isFirstDiscovery) {
      this.discovered.add(candidate.id);
      writeDiscovered(this.storage, this.discovered);
      this.lastSeenAt.set(candidate.id, nowMs);
      emitAudio('ui.location.discovered', { volume: 0.45 });
      this.onNotify({
        kind: 'location-discovered',
        eyebrow: 'NEW LOCATION DISCOVERED',
        title: candidate.title,
        region: candidate.region,
        subtitle: candidate.subtitle,
      });
      return;
    }

    const lastVisit = this.lastSeenAt.get(candidate.id) ?? -Infinity;
    if (nowMs - lastVisit >= REVISIT_COOLDOWN_MS) {
      this.lastSeenAt.set(candidate.id, nowMs);
      this.onNotify({
        kind: 'location-entered',
        eyebrow: '',
        title: candidate.title,
        region: candidate.region,
        subtitle: candidate.subtitle,
      });
    }
  }

  resolveCandidate(nowMs) {
    const site = this.getActiveSite?.();
    if (site?.id && site?.title) {
      return {
        id: `site:${site.id}`,
        title: site.title,
        region: site.region ?? '',
        subtitle: site.subtitle ?? 'Instanced delve',
      };
    }

    const pos = this.getFocusCanonical?.();
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    const cellX = Math.floor(pos.x / this.tileSize);
    const cellZ = Math.floor(-pos.z / this.tileSize);
    const region = this.describeRegion?.(cellX, cellZ) ?? '';

    const nearest = this.getNearestSettlement?.(pos);
    if (nearest?.settlement) {
      const enterRadius = Math.max((nearest.radius ?? 60) * 1.35, 95);
      if (nearest.distance <= enterRadius) {
        this.pendingRegion = null;
        return {
          id: `burg:${nearest.settlement.id ?? nearest.settlement.name}`,
          title: nearest.settlement.name,
          region,
          subtitle: classifyBurg(nearest.settlement),
        };
      }
    }

    if (region) {
      const regionId = `region:${region}`;
      if (this.currentPlaceId === regionId) return { id: regionId, title: region, region: '', subtitle: 'Territory' };
      if (this.pendingRegion !== regionId) {
        this.pendingRegion = regionId;
        this.pendingRegionSince = nowMs;
        return null;
      }
      if (nowMs - this.pendingRegionSince >= REGION_DWELL_MS) {
        return { id: regionId, title: region, region: '', subtitle: 'Territory' };
      }
    }

    return null;
  }
}
