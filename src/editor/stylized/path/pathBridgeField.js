import { staticWaterAt } from '../../water/StaticWaterSample.js';
import { WATER_BODY_ID_BOG } from '../../water/WaterConstants.js';
import {
  naturalTrailFieldAt,
  naturalTrailGradientAt,
  normalizeNaturalTrailConfig,
} from '../naturalTrailMath.js';

export const BRIDGE_CELL_METERS = 32;
export const MIN_WATER_SPAN_METERS = 1.4;
export const MAX_WATER_SPAN_METERS = 48;
export const ABUTMENT_METERS = 2.0;
export const DECK_CLEARANCE_METERS = 0.42;

const MAX_TERRAIN_BANK_DELTA = 14;
const CONTOUR_GRID_STEP_METERS = 3.5;
const ROUTE_SCAN_STEP_METERS = 2.0;
const TRACE_STEP_METERS = 1.2;

function hasSurfaceWater(sample) {
  return Boolean(
    sample
    && sample.coverage > 0.25
    && sample.surfaceHeight > sample.bedHeight + 0.02,
  );
}

/**
 * Builds deterministic height/water queries for bridge placement.
 * Falls back to `generator.sampleWater` for bog pools because `TerrainWaterQueries`
 * suppresses non-water tile ids outside rivers.
 */
export function createBridgeTerrainSampler(terrainView) {
  const worldStore = terrainView?.worldStore;
  const generator = worldStore?.generator ?? null;
  const tileSize = generator?.tileSize ?? worldStore?.tileSize ?? 1;
  return {
    tileSize,
    sampleHeight(worldX, worldZ) {
      if (typeof terrainView?.getCanonicalHeight === 'function') {
        return terrainView.getCanonicalHeight(worldX, worldZ);
      }
      if (typeof generator?.sampleHeight === 'function') {
        return generator.sampleHeight(worldX / tileSize, -worldZ / tileSize);
      }
      return 0;
    },
    sampleWater(worldX, worldZ) {
      const primary = staticWaterAt(terrainView, worldX, worldZ);
      if (hasSurfaceWater(primary)) return primary;
      if (typeof generator?.sampleWater === 'function') {
        const bog = generator.sampleWater(worldX / tileSize, -worldZ / tileSize);
        if (bog?.bodyId === WATER_BODY_ID_BOG && hasSurfaceWater(bog)) return bog;
      }
      return null;
    },
  };
}

/** Canonical elevation of the bridge deck centerline at normalized t in [0, 1]. */
export function bridgeDeckElevationAtT(bridge, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const linear = bridge.deckA + (bridge.deckB - bridge.deckA) * clamped;
  return linear + bridge.archRise * 4 * clamped * (1 - clamped);
}

/** Walkable world Y on top of `bridge` at `(worldX, worldZ)`, or null when off-deck. */
export function bridgeDeckHeightAt(bridge, worldX, worldZ) {
  const dx = worldX - bridge.startX;
  const dz = worldZ - bridge.startZ;
  const along = dx * bridge.dirX + dz * bridge.dirZ;
  if (along < -0.25 || along > bridge.length + 0.25) return null;
  const lateral = Math.abs(dx * bridge.perpX + dz * bridge.perpZ);
  if (lateral > bridge.halfWidth + 0.08) return null;
  return bridgeDeckElevationAtT(bridge, along / bridge.length);
}

function finalizeCrossing({ bankA, bankB, kind, halfWidth, sampler }) {
  const dx = bankB.x - bankA.x;
  const dz = bankB.z - bankA.z;
  const span = Math.hypot(dx, dz);
  if (!Number.isFinite(span) || span < MIN_WATER_SPAN_METERS || span > MAX_WATER_SPAN_METERS) {
    return null;
  }
  const dirX = dx / span;
  const dirZ = dz / span;
  const startX = bankA.x - dirX * ABUTMENT_METERS;
  const startZ = bankA.z - dirZ * ABUTMENT_METERS;
  const endX = bankB.x + dirX * ABUTMENT_METERS;
  const endZ = bankB.z + dirZ * ABUTMENT_METERS;
  if (
    sampler.sampleWater(startX, startZ)
    || sampler.sampleWater(endX, endZ)
    || sampler.sampleWater(bankA.x - dirX * 0.85, bankA.z - dirZ * 0.85)
    || sampler.sampleWater(bankB.x + dirX * 0.85, bankB.z + dirZ * 0.85)
  ) {
    return null;
  }

  const groundA = sampler.sampleHeight(startX, startZ);
  const groundB = sampler.sampleHeight(endX, endZ);
  if (!Number.isFinite(groundA) || !Number.isFinite(groundB)) return null;
  if (Math.abs(groundA - groundB) > MAX_TERRAIN_BANK_DELTA) return null;

  let wetCount = 0;
  let maxWaterSurface = -Infinity;
  let minBedY = Infinity;
  const samples = [];
  for (let i = 1; i <= 7; i += 1) {
    const f = i / 8;
    const wx = bankA.x + dx * f;
    const wz = bankA.z + dz * f;
    const water = sampler.sampleWater(wx, wz);
    if (!water) continue;
    wetCount += 1;
    maxWaterSurface = Math.max(maxWaterSurface, water.surfaceHeight);
    minBedY = Math.min(minBedY, water.bedHeight);
    samples.push({ f, surfaceHeight: water.surfaceHeight });
  }
  if (wetCount < 2 || !Number.isFinite(maxWaterSurface)) return null;

  const length = span + ABUTMENT_METERS * 2;
  const deckA = Math.max(groundA + 0.04, maxWaterSurface + 0.06);
  const deckB = Math.max(groundB + 0.04, maxWaterSurface + 0.06);
  const baseMid = (deckA + deckB) * 0.5;
  const naturalArch = Math.max(0.28, Math.min(1.6, length * 0.042));
  let archRise = Math.max(naturalArch, (maxWaterSurface + DECK_CLEARANCE_METERS) - baseMid);

  for (const s of samples) {
    const t = (ABUTMENT_METERS + s.f * span) / length;
    const parabolic = 4 * t * (1 - t);
    if (parabolic < 0.15) continue;
    const linear = deckA + (deckB - deckA) * t;
    const needed = (s.surfaceHeight + DECK_CLEARANCE_METERS * 0.85 - linear) / parabolic;
    if (needed > archRise) archRise = needed;
  }

  const piers = [];
  if (span >= 8.5) {
    const bentCount = Math.min(4, Math.max(1, Math.floor((span - 2.5) / 6.0)));
    for (let i = 1; i <= bentCount; i += 1) {
      const f = i / (bentCount + 1);
      const t = (ABUTMENT_METERS + f * span) / length;
      const px = startX + dirX * (t * length);
      const pz = startZ + dirZ * (t * length);
      const water = sampler.sampleWater(px, pz);
      const terrainH = sampler.sampleHeight(px, pz);
      const bedY = Number.isFinite(water?.bedHeight)
        ? Math.min(terrainH, water.bedHeight)
        : terrainH;
      piers.push({ t, bedY, waterY: water?.surfaceHeight ?? maxWaterSurface });
    }
  }

  return {
    kind,
    startX,
    startZ,
    endX,
    endZ,
    midX: (startX + endX) * 0.5,
    midZ: (startZ + endZ) * 0.5,
    dirX,
    dirZ,
    perpX: -dirZ,
    perpZ: dirX,
    length,
    span,
    halfWidth,
    groundA,
    groundB,
    deckA,
    deckB,
    archRise,
    waterSurface: maxWaterSurface,
    bedY: Number.isFinite(minBedY) ? minBedY : Math.min(groundA, groundB) - 0.6,
    piers,
  };
}

function routePointWorld(trails, route, along, tileSize) {
  const cell = trails.pointAt(route, along);
  return { x: cell.x * tileSize, z: -cell.z * tileSize };
}

function bisectWetEdge(sampleAt, insideT, outsideT, steps = 5) {
  let lo = insideT;
  let hi = outsideT;
  for (let i = 0; i < steps; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (sampleAt(mid).water) lo = mid;
    else hi = mid;
  }
  return sampleAt(hi).point;
}

function findTrailRouteCrossings(minX, minZ, maxX, maxZ, sampler, trails) {
  if (!trails || typeof trails.nearbyRoutesInBounds !== 'function') return [];
  const tileSize = sampler.tileSize;
  const margin = MAX_WATER_SPAN_METERS * 0.55 + ABUTMENT_METERS;
  const centerCellX = ((minX + maxX) * 0.5) / tileSize;
  const centerCellZ = -((minZ + maxZ) * 0.5) / tileSize;
  const radiusCells = (BRIDGE_CELL_METERS * 0.75 + margin) / tileSize;
  const routes = trails.nearbyRoutesInBounds(centerCellX, centerCellZ, radiusCells);
  if (!routes?.length) return [];

  const bridges = [];
  for (const route of routes) {
    if (!route || !(route.length > MIN_WATER_SPAN_METERS)) continue;
    const sampleAt = (s) => {
      const clamped = Math.max(0, Math.min(route.length, s));
      const point = routePointWorld(trails, route, clamped, tileSize);
      return { point, water: sampler.sampleWater(point.x, point.z) };
    };

    let inWater = false;
    let entryS = 0;
    let dryPrevS = 0;
    for (let s = 0; s <= route.length; s += ROUTE_SCAN_STEP_METERS) {
      const point = routePointWorld(trails, route, s, tileSize);
      const nearBox = point.x >= minX - margin - MAX_WATER_SPAN_METERS
        && point.x <= maxX + margin + MAX_WATER_SPAN_METERS
        && point.z >= minZ - margin - MAX_WATER_SPAN_METERS
        && point.z <= maxZ + margin + MAX_WATER_SPAN_METERS;
      if (!nearBox && !inWater) {
        dryPrevS = s;
        continue;
      }
      const wet = Boolean(sampler.sampleWater(point.x, point.z));
      if (!inWater && wet) {
        if (s > 0) {
          inWater = true;
          entryS = s;
        }
      } else if (inWater && !wet) {
        const spanApprox = s - entryS;
        if (spanApprox <= MAX_WATER_SPAN_METERS + ROUTE_SCAN_STEP_METERS * 2) {
          const bankA = bisectWetEdge(sampleAt, entryS, dryPrevS);
          const bankB = bisectWetEdge(sampleAt, s - ROUTE_SCAN_STEP_METERS, s);
          const halfWidth = Math.max(1.4, Math.min(2.35, route.halfWidth || 1.75));
          const bridge = finalizeCrossing({ bankA, bankB, kind: 'road', halfWidth, sampler });
          if (bridge) bridges.push(bridge);
        }
        inWater = false;
        dryPrevS = s;
      } else if (!inWater) {
        dryPrevS = s;
      }
    }
  }
  return bridges;
}

function projectToContour(x, z, settings) {
  let px = x;
  let pz = z;
  for (let i = 0; i < 2; i += 1) {
    const d = naturalTrailFieldAt(px, pz, settings) - settings.level;
    if (Math.abs(d) < 1e-4) break;
    const g = naturalTrailGradientAt(px, pz, settings);
    const g2 = g.x * g.x + g.z * g.z;
    if (g2 < 1e-10) break;
    const step = Math.max(-2.5, Math.min(2.5, -d / g2));
    px += g.x * step;
    pz += g.z * step;
  }
  return { x: px, z: pz };
}

function traceContourToDryBank(seed, dirSign, settings, sampler) {
  let prev = { x: seed.x, z: seed.z };
  const maxSteps = Math.ceil((MAX_WATER_SPAN_METERS * 0.72) / TRACE_STEP_METERS);
  let lastSignX = dirSign;
  let lastSignZ = dirSign;

  const tangentAt = (px, pz, refDirX, refDirZ, initial = false) => {
    const g = naturalTrailGradientAt(px, pz, settings);
    const len = Math.hypot(g.x, g.z);
    if (len < 1e-6) return null;
    let tx = (-g.z / len) * (initial ? dirSign : 1);
    let tz = (g.x / len) * (initial ? dirSign : 1);
    if (!initial && tx * refDirX + tz * refDirZ < 0) {
      tx = -tx;
      tz = -tz;
    }
    return { x: tx, z: tz };
  };

  const t0 = tangentAt(prev.x, prev.z, 0, 0, true);
  if (!t0) return null;
  lastSignX = t0.x;
  lastSignZ = t0.z;

  for (let step = 0; step < maxSteps; step += 1) {
    const tan = tangentAt(prev.x, prev.z, lastSignX, lastSignZ, false);
    if (!tan) return null;
    lastSignX = tan.x;
    lastSignZ = tan.z;
    const next = projectToContour(
      prev.x + tan.x * TRACE_STEP_METERS,
      prev.z + tan.z * TRACE_STEP_METERS,
      settings,
    );
    if (!sampler.sampleWater(next.x, next.z)) {
      let wet = prev;
      let dry = next;
      for (let i = 0; i < 4; i += 1) {
        const mid = projectToContour((wet.x + dry.x) * 0.5, (wet.z + dry.z) * 0.5, settings);
        if (sampler.sampleWater(mid.x, mid.z)) wet = mid;
        else dry = mid;
      }
      return dry;
    }
    prev = next;
  }
  return null;
}

function findEdgeCrossing(x0, z0, d0, x1, z1, d1, settings) {
  let ax = x0, az = z0, da = d0;
  let bx = x1, bz = z1;
  for (let i = 0; i < 4; i += 1) {
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    const dm = naturalTrailFieldAt(mx, mz, settings) - settings.level;
    if ((da <= 0 && dm <= 0) || (da >= 0 && dm >= 0)) {
      ax = mx;
      az = mz;
      da = dm;
    } else {
      bx = mx;
      bz = mz;
    }
  }
  return { x: (ax + bx) * 0.5, z: (az + bz) * 0.5 };
}

function findNaturalTrailCrossings(minX, minZ, maxX, maxZ, sampler, naturalTrailConfig) {
  const settings = normalizeNaturalTrailConfig(naturalTrailConfig ?? {});
  if (!settings.enabled) return [];

  const margin = MAX_WATER_SPAN_METERS * 0.55 + 4;
  const xStart = minX - margin;
  const zStart = minZ - margin;
  const cols = Math.ceil((BRIDGE_CELL_METERS + margin * 2) / CONTOUR_GRID_STEP_METERS) + 1;
  const rows = cols;
  const deltas = new Float64Array(cols * rows);

  for (let iz = 0; iz < rows; iz += 1) {
    const z = zStart + iz * CONTOUR_GRID_STEP_METERS;
    for (let ix = 0; ix < cols; ix += 1) {
      const x = xStart + ix * CONTOUR_GRID_STEP_METERS;
      deltas[iz * cols + ix] = naturalTrailFieldAt(x, z, settings) - settings.level;
    }
  }

  const bridges = [];
  const trySeed = (ax, az, da, bx, bz, db) => {
    if ((da > 0 && db > 0) || (da < 0 && db < 0)) return;
    const seed = findEdgeCrossing(ax, az, da, bx, bz, db, settings);
    if (!sampler.sampleWater(seed.x, seed.z)) return;
    const bankA = traceContourToDryBank(seed, -1, settings, sampler);
    if (!bankA) return;
    const bankB = traceContourToDryBank(seed, 1, settings, sampler);
    if (!bankB) return;
    const bridge = finalizeCrossing({
      bankA,
      bankB,
      kind: 'trail',
      halfWidth: 1.25,
      sampler,
    });
    if (bridge) bridges.push(bridge);
  };

  for (let iz = 0; iz < rows; iz += 1) {
    const z = zStart + iz * CONTOUR_GRID_STEP_METERS;
    for (let ix = 0; ix < cols; ix += 1) {
      const x = xStart + ix * CONTOUR_GRID_STEP_METERS;
      const d = deltas[iz * cols + ix];
      if (ix + 1 < cols) {
        trySeed(x, z, d, x + CONTOUR_GRID_STEP_METERS, z, deltas[iz * cols + ix + 1]);
      }
      if (iz + 1 < rows) {
        trySeed(x, z, d, x, z + CONTOUR_GRID_STEP_METERS, deltas[(iz + 1) * cols + ix]);
      }
    }
  }
  return bridges;
}

/**
 * Resolves all deterministic bridges owned by bridge cell `(cellX, cellZ)`.
 * Ownership belongs solely to the cell containing the bridge midpoint, ensuring
 * bridges straddling boundaries never duplicate or clip across cells.
 */
export function bridgesInCell(cellX, cellZ, sampler, { naturalTrail = null, trails = null } = {}) {
  const minX = cellX * BRIDGE_CELL_METERS;
  const minZ = cellZ * BRIDGE_CELL_METERS;
  const maxX = minX + BRIDGE_CELL_METERS;
  const maxZ = minZ + BRIDGE_CELL_METERS;

  const candidates = [
    ...findTrailRouteCrossings(minX, minZ, maxX, maxZ, sampler, trails),
    ...findNaturalTrailCrossings(minX, minZ, maxX, maxZ, sampler, naturalTrail),
  ];

  const accepted = [];
  for (const bridge of candidates) {
    const ownerX = Math.floor(bridge.midX / BRIDGE_CELL_METERS);
    const ownerZ = Math.floor(bridge.midZ / BRIDGE_CELL_METERS);
    if (ownerX !== cellX || ownerZ !== cellZ) continue;
    const minSpacing = Math.max(4.5, bridge.span * 0.45);
    const duplicate = accepted.some(
      (existing) => Math.hypot(existing.midX - bridge.midX, existing.midZ - bridge.midZ) < minSpacing,
    );
    if (!duplicate) accepted.push(bridge);
  }
  return accepted;
}
