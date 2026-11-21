import { cellKey } from '../world/WorldCoordinates.js';
import {
  WATER_BODY_ID_PROCEDURAL_OCEAN,
  WATER_KIND_NONE,
  WATER_KIND_OCEAN,
  WATER_KIND_RIVER,
  WATER_SAMPLE_FLAG_INCOMPLETE_BED,
} from './WaterConstants.js';
import { createWaterNavigationSample } from './WaterNavigation.js';
import { createNoWaterSample, createWaterSample } from './WaterSample.js';
import { getSeaDiffractionConfig, seaSurfaceOffset } from './seaState.js';
import { seaExposure } from './WaterAppearance.js';
import { createSeaDiffractionSampler } from './SeaDiffraction.js';
import { WaterDistanceField } from './WaterDistanceField.js';

const WATER_TILE_ID = 0;
const oceanExposureCache = new WeakMap();
const editedShoreCache = new WeakMap();

function editedShoreDistance(world, x, z, original) {
  const model = world.generator.waterTerrainModel;
  const overrides = world.tileOverrides;
  if (!model?.oceanDistance || !overrides?.size || !overrides.entriesInRect) return original;
  const { blockSize, maxDistanceCells, cacheLimit } = model.oceanDistance;
  let entry = editedShoreCache.get(world);
  if (entry?.model !== model || entry.overrides !== overrides || entry.version !== overrides.version) {
    const isOcean = (cx, cz, tile) => {
      if (tile === undefined) return model.isOceanCell(cx, cz);
      return tile === WATER_TILE_ID && (model.isOceanCell(cx, cz) || !model.sampleWaterSurface(cx + .5, cz + .5));
    };
    const field = new WaterDistanceField({ blockSize, maxDistanceCells, cacheLimit,
      isWaterCell: (cx, cz) => isOcean(cx, cz, overrides.getAt(cx, cz)) });
    entry = { model, overrides, version: overrides.version, blocks: new Map(), field, isOcean };
    editedShoreCache.set(world, entry);
  }
  const minX = Math.floor(x / blockSize) * blockSize;
  const minZ = Math.floor(z / blockSize) * blockSize;
  const key = cellKey(minX, minZ);
  if (!entry.blocks.has(key)) {
    const reach = maxDistanceCells + 2;
    const affected = overrides.entriesInRect(minX - reach, minX + blockSize - 1 + reach,
      minZ - reach, minZ + blockSize - 1 + reach)
      .some(([cx, cz, tile]) => entry.isOcean(cx, cz, tile) !== model.isOceanCell(cx, cz));
    entry.blocks.set(key, affected);
    if (entry.blocks.size > cacheLimit) entry.blocks.delete(entry.blocks.keys().next().value);
  }
  return entry.blocks.get(key) ? entry.field.sample(x, z) * model.config.cellSizeMeters : original;
}

/** CPU gameplay uses the same directional shelter field as streamed water pages. */
export function sampleWorldStoreSeaExposure(world, worldX, worldZ, shoreDistance) {
  const settings = getSeaDiffractionConfig();
  const baseline = seaExposure(shoreDistance);
  if (!settings?.enabled || shoreDistance >= settings.offshoreFadeEndMeters) return baseline;
  const revision = world.revision ?? 0;
  const { baseTerrainRevision, generator } = world;
  let entry = oceanExposureCache.get(world);
  if (!entry || entry.revision !== revision || entry.baseTerrainRevision !== baseTerrainRevision
      || entry.generator !== generator || entry.settings !== settings) {
    entry = { revision, baseTerrainRevision, generator, settings, sample: createSeaDiffractionSampler({
      sampleWater: (cellX, cellZ) => sampleWorldStoreWaterSurface(world, cellX, cellZ),
      tileSizeMeters: world.tileSize, settings,
    }) };
    oceanExposureCache.set(world, entry);
  }
  return baseline * entry.sample(worldX / world.tileSize, -worldZ / world.tileSize, shoreDistance);
}

function assertWorldStore(worldStore) {
  if (!worldStore?.generator
      || typeof worldStore.generator.sampleWater !== 'function'
      || typeof worldStore.sampleHeight !== 'function'
      || typeof worldStore.getTile !== 'function') {
    throw new Error('The active world store does not implement water-domain queries.');
  }
}

function assertTerrainView(terrainView) {
  if (!terrainView?.floatingOrigin) {
    throw new Error('Terrain water queries require a floating origin.');
  }
  assertWorldStore(terrainView.worldStore);
}

function hasExplicitTileOverride(world, x, z) {
  return world.tileOverrides instanceof Map && world.tileOverrides.size > 0
    && (world.tileOverrides.hasAt ? world.tileOverrides.hasAt(x, z) : world.tileOverrides.has(cellKey(x, z)));
}

/** Effects needing a static contact plane, not depth or navigation. Preserves
 * painted water, erased rivers, lake levels and unresolved river-bed policy. */
export function sampleWorldStoreWaterSurface(world, cellX, cellZ) {
  assertWorldStore(world);
  if (typeof world.generator.sampleWaterSurface !== 'function') return sampleWorldStoreWater(world, cellX, cellZ);
  const x = Math.floor(cellX), z = Math.floor(cellZ), tile = world.getTile(x, z);
  const base = world.generator.sampleWaterSurface(cellX, cellZ);
  if (tile !== WATER_TILE_ID
      && (base?.kind !== WATER_KIND_RIVER || hasExplicitTileOverride(world, x, z))) return null;
  if (!base) return { kind: WATER_KIND_OCEAN, coverage: 1, surfaceHeight: world.generator.seaLevel, fall: 0 };
  const incomplete = base.kind === WATER_KIND_RIVER && (base.flags & WATER_SAMPLE_FLAG_INCOMPLETE_BED) !== 0;
  return { kind: base.kind, coverage: base.coverage, fall: base.fall ?? 0,
    surfaceHeight: incomplete ? Math.max(base.surfaceHeight, world.sampleHeight(cellX, cellZ)) : base.surfaceHeight };
}

/**
 * The water as the player meets it, in canonical space: flow turned to world
 * axes, and the open sea riding the same swell the water material draws.
 */
function toCanonicalWorldSample(sample, worldX, worldZ, worldStore) {
  if (sample.kind === WATER_KIND_NONE) return sample;
  const swell = sample.kind === WATER_KIND_OCEAN
    ? seaSurfaceOffset(worldX, worldZ, sample.depth, sample.shoreDistance,
      sampleWorldStoreSeaExposure(worldStore, worldX, worldZ, sample.shoreDistance))
    : 0;
  if (swell === 0 && sample.flowX === 0 && sample.flowZ === 0) return sample;
  return createWaterSample({
    kind: sample.kind,
    bodyId: sample.bodyId,
    coverage: sample.coverage,
    surfaceHeight: sample.surfaceHeight + swell,
    bedHeight: sample.bedHeight,
    shoreDistance: sample.shoreDistance,
    flowX: sample.flowX,
    flowZ: -sample.flowZ,
    fall: sample.fall,
    plunge: sample.plunge,
    flags: sample.flags,
  });
}

export function sampleWorldStoreWater(worldStore, cellX, cellZ) {
  assertWorldStore(worldStore);
  const tileX = Math.floor(cellX);
  const tileZ = Math.floor(cellZ);
  const tileId = worldStore.getTile(tileX, tileZ);
  const base = worldStore.generator.sampleWater(cellX, cellZ);
  const explicitTileOverride = hasExplicitTileOverride(worldStore, tileX, tileZ);
  const canUseBaseBed = worldStore.heightOverrides instanceof Map
    && (worldStore.heightOverrides.size === 0 || (worldStore.heightOverrides.hasAt
      && !worldStore.heightOverrides.hasAt(tileX, tileZ)
      && !worldStore.heightOverrides.hasAt(tileX + 1, tileZ)
      && !worldStore.heightOverrides.hasAt(tileX, tileZ + 1)
      && !worldStore.heightOverrides.hasAt(tileX + 1, tileZ + 1)));
  const bedHeight = canUseBaseBed
    ? base.bedHeight
    : worldStore.sampleHeight(cellX, cellZ);

  if (tileId !== WATER_TILE_ID
      && (base.kind !== WATER_KIND_RIVER || explicitTileOverride)) {
    return createNoWaterSample(bedHeight);
  }

  const addedWater = base.kind === WATER_KIND_NONE;
  const kind = addedWater ? WATER_KIND_OCEAN : base.kind;
  const incompleteRiver = kind === WATER_KIND_RIVER
    && (base.flags & WATER_SAMPLE_FLAG_INCOMPLETE_BED) !== 0;
  const surfaceHeight = addedWater
    ? worldStore.generator.seaLevel
    : incompleteRiver
      ? Math.max(base.surfaceHeight, bedHeight)
      : base.surfaceHeight;
  return createWaterSample({
    kind,
    bodyId: addedWater ? WATER_BODY_ID_PROCEDURAL_OCEAN : base.bodyId,
    coverage: addedWater ? 1 : base.coverage,
    surfaceHeight,
    bedHeight,
    shoreDistance: kind === WATER_KIND_OCEAN
      ? editedShoreDistance(worldStore, tileX, tileZ, addedWater ? 0 : base.shoreDistance) : base.shoreDistance,
    flowX: addedWater ? 0 : base.flowX,
    flowZ: addedWater ? 0 : base.flowZ,
    fall: addedWater ? 0 : base.fall,
    plunge: addedWater ? 0 : base.plunge,
    flags: base.flags,
  });
}

export function getCanonicalWater(terrainView, worldX, worldZ) {
  assertTerrainView(terrainView);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
    throw new Error('Canonical water coordinates must be finite.');
  }
  const tileSize = terrainView.worldStore.tileSize;
  return toCanonicalWorldSample(sampleWorldStoreWater(
    terrainView.worldStore,
    worldX / tileSize,
    -worldZ / tileSize,
  ), worldX, worldZ, terrainView.worldStore);
}

/**
 * The CPU inputs of the I.4 offshore FFT weight at a canonical point, the twin of the
 * streamed water pages (FFT caustics use it at the camera), or null off the sea.
 */
export function getCanonicalOffshoreGeography(terrainView, worldX, worldZ) {
  const water = getCanonicalWater(terrainView, worldX, worldZ);
  if (water.kind !== WATER_KIND_OCEAN) return null;
  return { shoreDistance: water.shoreDistance, oceanMask: 1, waterCoverage: water.coverage,
    exposure: sampleWorldStoreSeaExposure(terrainView.worldStore, worldX, worldZ, water.shoreDistance) };
}

export function getWorldWater(terrainView, renderX, renderZ) {
  assertTerrainView(terrainView);
  const canonical = terrainView.floatingOrigin.toCanonical(renderX, renderZ);
  return getCanonicalWater(terrainView, canonical.x, canonical.z);
}

export function getCanonicalWaterNavigation(terrainView, worldX, worldZ, config = {}) {
  return createWaterNavigationSample(getCanonicalWater(terrainView, worldX, worldZ), config);
}

export function getWorldWaterNavigation(terrainView, renderX, renderZ, config = {}) {
  return createWaterNavigationSample(getWorldWater(terrainView, renderX, renderZ), config);
}

export function installTerrainWaterQueries(terrainView) {
  assertTerrainView(terrainView);
  if (typeof terrainView.getCanonicalWater !== 'function') {
    Object.defineProperty(terrainView, 'getCanonicalWater', {
      configurable: false,
      enumerable: false,
      value(worldX, worldZ) {
        return getCanonicalWater(this, worldX, worldZ);
      },
      writable: false,
    });
  }
  if (typeof terrainView.getWorldWater !== 'function') {
    Object.defineProperty(terrainView, 'getWorldWater', {
      configurable: false,
      enumerable: false,
      value(renderX, renderZ) {
        return getWorldWater(this, renderX, renderZ);
      },
      writable: false,
    });
  }
  if (typeof terrainView.getCanonicalWaterNavigation !== 'function') {
    Object.defineProperty(terrainView, 'getCanonicalWaterNavigation', {
      configurable: false,
      enumerable: false,
      value(worldX, worldZ, config = {}) {
        return getCanonicalWaterNavigation(this, worldX, worldZ, config);
      },
      writable: false,
    });
  }
  if (typeof terrainView.getWorldWaterNavigation !== 'function') {
    Object.defineProperty(terrainView, 'getWorldWaterNavigation', {
      configurable: false,
      enumerable: false,
      value(renderX, renderZ, config = {}) {
        return getWorldWaterNavigation(this, renderX, renderZ, config);
      },
      writable: false,
    });
  }
  return terrainView;
}
