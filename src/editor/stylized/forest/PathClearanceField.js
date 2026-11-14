import { TileDistanceField } from './TileDistanceField.js';
import {
  naturalTrailFieldAt,
  naturalTrailGradientBound,
  naturalTrailMaskAt,
  normalizeNaturalTrailConfig,
} from '../naturalTrailMath.js';

const PROBE_DIRS = Object.freeze(
  Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    return Object.freeze({ x: Math.cos(angle), z: Math.sin(angle) });
  }),
);

function anyRingProbe(worldX, worldZ, maxRadius, step, predicate) {
  for (let ring = Math.min(maxRadius, step); ; ring = Math.min(maxRadius, ring + step)) {
    for (const dir of PROBE_DIRS) {
      if (predicate(worldX + dir.x * ring, worldZ + dir.z * ring)) return true;
    }
    if (ring >= maxRadius) break;
  }
  return false;
}

/**
 * Keeps trees, bushes and boulders off roads and their shoulders. Authored roads
 * are measured from the canonical tile map; deterministic natural trails use the
 * same continuous field as the materials. Neither depends on resident chunks.
 */
export class PathClearanceField {
  constructor({
    tileAt,
    tileSize,
    chunkSize,
    roadTileId = 13,
    clearCells = 3,
    naturalTrail = null,
    revisionProvider = null,
  }) {
    this.tileSize = Math.max(0.01, Number(tileSize) || 1);
    this.clearCells = Math.max(0, Number(clearCells) || 0);
    this.naturalTrail = normalizeNaturalTrailConfig(naturalTrail ?? {});
    this.field = new TileDistanceField({
      tileAt,
      tileSize,
      chunkSize,
      targetTileId: roadTileId,
      maxCells: this.clearCells,
      label: 'path',
      maxCachedChunks: 169,
      revisionProvider,
    });
    this.roadTileId = roadTileId;
    this.signature = [
      this.field.signature,
      'natural-trail',
      this.naturalTrail.enabled ? 1 : 0,
      this.naturalTrail.scale,
      this.naturalTrail.level,
      this.naturalTrail.width,
      this.naturalTrail.softness,
      this.naturalTrail.warp,
      this.naturalTrail.clearThreshold,
    ].join(':');
  }

  get enabled() {
    return this.clearCells > 0 || this.naturalTrail.enabled;
  }

  get stats() {
    return this.field.stats;
  }

  distanceAt(worldX, worldZ) {
    return this.field.cellDistanceAt(worldX, worldZ);
  }

  blocks(worldX, worldZ, radius = 0) {
    const r = Number.isFinite(radius) && radius > 0 ? radius : 0;
    if (this.clearCells > 0) {
      const roadAt = (x, z) => this.distanceAt(x, z) < this.clearCells;
      if (roadAt(worldX, worldZ)) return true;
      if (r > 0) {
        const roadStep = Math.max(this.tileSize, this.clearCells * this.tileSize * 0.7);
        if (anyRingProbe(worldX, worldZ, r, roadStep, roadAt)) return true;
      }
    }
    if (!this.naturalTrail.enabled) return false;
    const trailAt = (x, z) => (
      naturalTrailMaskAt(x, z, this.naturalTrail) >= this.naturalTrail.clearThreshold
    );
    if (trailAt(worldX, worldZ)) return true;
    if (r <= 0) return false;
    const maxDelta = (
      this.naturalTrail.width
      + this.naturalTrail.softness
      + r * this.naturalTrail.scale
    ) * naturalTrailGradientBound(this.naturalTrail) * 1.35;
    if (Math.abs(naturalTrailFieldAt(worldX, worldZ, this.naturalTrail) - this.naturalTrail.level) > maxDelta) {
      return false;
    }
    return anyRingProbe(worldX, worldZ, r, 1.25, trailAt);
  }

  /** Rejection predicate in the shape `createForestPlacementEvaluator` expects. */
  exclusion() {
    if (!this.enabled) return null;
    return (candidate) => this.blocks(candidate.x, candidate.z, candidate.radius ?? 0);
  }
}
