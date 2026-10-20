import { ASSET_CANDIDATE_LIST } from './AssetRegistryData.js';
export { ASSET_CANDIDATE_LIST };
import {
  CULTURE_KEY_TO_SOURCE_ID,
  ENVIRONMENTAL_OVERLAYS,
  LORE_PROVENANCE_VALUES,
  LORE_REALM_CATALOG,
} from './VisualIdentityCatalog.js';

export const MODEL_STATUS_VALUES = Object.freeze([
  'planned',
  'reference-approved',
  'modeling',
  'review',
  'ready',
  'fallback',
  'missing',
]);

export const ASSET_CLASS_VALUES = Object.freeze([
  'civic',
  'sacred',
  'agriculture',
  'trade',
  'defense',
  'infrastructure',
  'residence',
  'prop',
  'military',
  'industry',
  'coastal',
  'ruin',
  'shared-environment',
]);

export const ASSET_REGISTRY = Object.freeze(
  Object.fromEntries(ASSET_CANDIDATE_LIST.map((asset) => [asset.id, asset])),
);

const warnedFallbackAssetIds = new Set();
const recordedFallbackAssetIds = new Set();

export function resetAssetFallbackWarnings() {
  warnedFallbackAssetIds.clear();
  recordedFallbackAssetIds.clear();
}

export function getAssetFallbackWarnings() {
  return Object.freeze([...recordedFallbackAssetIds]);
}

export {
  getAssetFallbackWarnings as getFallbackWarnings,
  resetAssetFallbackWarnings as resetFallbackWarnings,
};

export function getAssetCandidate(assetId) {
  return ASSET_REGISTRY[assetId] ?? null;
}

export function listAssetsByRegion(regionDossier, { priority = null } = {}) {
  return ASSET_CANDIDATE_LIST.filter(
    (asset) => asset.regionDossier === regionDossier && (!priority || asset.priority === priority),
  );
}

export function listAssetsByOverlay(areaOverlay) {
  return ASSET_CANDIDATE_LIST.filter((asset) => asset.areaOverlay === areaOverlay);
}

/**
 * Check whether an asset satisfies physical/geographic placement constraints.
 */
export function isAssetPhysicallyEligible(assetOrId, siteContext = {}) {
  const asset = typeof assetOrId === 'string' ? getAssetCandidate(assetOrId) : assetOrId;
  if (!asset) return false;
  const c = asset.constraints ?? {};
  if (c.requiresWaterAccess && !siteContext.hasWaterAccess) return false;
  if (c.requiresWetland && !siteContext.isWetland) return false;
  if (c.requiresSlope && !(siteContext.slope >= 0.14 || siteContext.isMountainPass)) return false;
  if (c.requiresForest && !siteContext.isForest) return false;
  if (c.requiresUnderground && !siteContext.isUnderground) return false;
  if (c.forbidsSky && !siteContext.isUnderground) return false;
  if (c.requiresRuinContext && !siteContext.hasRuinContext) return false;
  return true;
}

/**
 * Resolve an asset ID for runtime placement.
 *
 * Never claims `planned`, `missing`, `reference-approved`, `modeling`, or `review`
 * assets have final GLBs ready. Until `modelStatus === 'ready'` and `runtimeGlb`
 * is present, returns `{ resolution: 'fallback', fallback: asset.fallback, ... }`
 * and logs at most once per asset ID when `warnOnFallback` is enabled.
 */
export function resolveRuntimeAsset(assetId, { warnOnFallback = false, logger = console } = {}) {
  const asset = getAssetCandidate(assetId);
  if (!asset) {
    recordedFallbackAssetIds.add(assetId);
    if (warnOnFallback && !warnedFallbackAssetIds.has(assetId)) {
      warnedFallbackAssetIds.add(assetId);
      logger?.warn?.(`[AssetRegistry] Unknown asset ID "${assetId}"; using generic house fallback.`);
    }
    return Object.freeze({
      assetId,
      known: false,
      modelStatus: 'missing',
      loreStatus: 'design-proposal',
      resolution: 'fallback',
      runtimeGlb: null,
      fallback: Object.freeze({
        kind: 'building',
        settlementKind: 'house',
        settlementVariant: 0,
        kitPrefab: 'Tudor_House_Small',
        kitProp: null,
        footprint: Object.freeze([8, 6, 5.5]),
      }),
    });
  }

  const isReady = asset.modelStatus === 'ready' && typeof asset.runtimeGlb === 'string' && asset.runtimeGlb.length > 0;
  if (!isReady) {
    recordedFallbackAssetIds.add(asset.id);
    if (warnOnFallback && !warnedFallbackAssetIds.has(asset.id)) {
      warnedFallbackAssetIds.add(asset.id);
      logger?.warn?.(
        `[AssetRegistry] Asset "${asset.id}" has modelStatus="${asset.modelStatus}"; using procedural/kit fallback (${asset.fallback.settlementKind}).`,
      );
    }
  }

  return Object.freeze({
    assetId: asset.id,
    known: true,
    assetClass: asset.assetClass,
    priority: asset.priority,
    modelStatus: asset.modelStatus,
    loreStatus: asset.loreStatus,
    resolution: isReady ? 'ready-glb' : 'fallback',
    runtimeGlb: isReady ? asset.runtimeGlb : null,
    fallback: asset.fallback,
    constraints: asset.constraints,
  });
}

/**
 * Summarize asset production readiness across the entire catalog.
 */
export function summarizeAssetBacklog() {
  const byStatus = {
    planned: 0,
    'reference-approved': 0,
    modeling: 0,
    review: 0,
    ready: 0,
    fallback: 0,
  };
  const byPriority = { P0: 0, P1: 0 };
  const byRegion = {};
  const byOverlay = {};

  for (const asset of ASSET_CANDIDATE_LIST) {
    const statusKey = asset.modelStatus === 'missing' ? 'planned' : asset.modelStatus;
    byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;
    byPriority[asset.priority] = (byPriority[asset.priority] ?? 0) + 1;
    if (asset.regionDossier) {
      byRegion[asset.regionDossier] = (byRegion[asset.regionDossier] ?? 0) + 1;
    }
    if (asset.areaOverlay) {
      byOverlay[asset.areaOverlay] = (byOverlay[asset.areaOverlay] ?? 0) + 1;
    }
  }

  return Object.freeze({
    totalAssets: ASSET_CANDIDATE_LIST.length,
    byStatus: Object.freeze(byStatus),
    byPriority: Object.freeze(byPriority),
    byRegion: Object.freeze(byRegion),
    byOverlay: Object.freeze(byOverlay),
  });
}

/**
 * Validate the asset registry schema, references, fallbacks, and parity with
 * `docs/asset-bible/proposed-config/asset-candidates.proposed.yaml` when passed.
 */
export function validateAssetRegistry(proposedCandidates = null) {
  const errors = [];
  const seenIds = new Set();

  for (const asset of ASSET_CANDIDATE_LIST) {
    if (!asset.id || typeof asset.id !== 'string') {
      errors.push('Asset missing string id');
      continue;
    }
    if (seenIds.has(asset.id)) {
      errors.push(`Duplicate asset id: ${asset.id}`);
    }
    seenIds.add(asset.id);

    if (!ASSET_CLASS_VALUES.includes(asset.assetClass)) {
      errors.push(`Asset ${asset.id} has invalid assetClass: ${asset.assetClass}`);
    }
    if (!['P0', 'P1'].includes(asset.priority)) {
      errors.push(`Asset ${asset.id} has invalid priority: ${asset.priority}`);
    }
    if (!LORE_PROVENANCE_VALUES.includes(asset.loreStatus)) {
      errors.push(`Asset ${asset.id} has invalid loreStatus: ${asset.loreStatus}`);
    }
    if (!MODEL_STATUS_VALUES.includes(asset.modelStatus)) {
      errors.push(`Asset ${asset.id} has invalid modelStatus: ${asset.modelStatus}`);
    }
    if (asset.regionDossier) {
      const realmKey = asset.regionDossier === 'contian' ? 'contia' : asset.regionDossier;
      if (!LORE_REALM_CATALOG[realmKey]) {
        errors.push(`Asset ${asset.id} references unknown regionDossier: ${asset.regionDossier}`);
      }
      if (!Array.isArray(asset.eligibleCultureSeeds) || asset.eligibleCultureSeeds.length === 0) {
        errors.push(`Regional asset ${asset.id} must declare eligibleCultureSeeds`);
      } else {
        for (const seed of asset.eligibleCultureSeeds) {
          if (CULTURE_KEY_TO_SOURCE_ID[seed] === undefined) {
            errors.push(`Asset ${asset.id} references unknown culture seed: ${seed}`);
          }
        }
      }
    } else if (asset.areaOverlay) {
      if (!ENVIRONMENTAL_OVERLAYS[asset.areaOverlay]) {
        errors.push(`Asset ${asset.id} references unknown areaOverlay: ${asset.areaOverlay}`);
      }
    } else {
      errors.push(`Asset ${asset.id} must declare either regionDossier or areaOverlay`);
    }

    if (!asset.fallback || typeof asset.fallback.settlementKind !== 'string') {
      errors.push(`Asset ${asset.id} is missing a valid runtime fallback`);
    }
  }

  for (const realm of Object.values(LORE_REALM_CATALOG)) {
    for (const landmarkId of realm.mandatoryLandmarks) {
      if (!ASSET_REGISTRY[landmarkId]) {
        errors.push(`Realm ${realm.id} mandatoryLandmark "${landmarkId}" is missing from ASSET_REGISTRY`);
      }
    }
    for (const propId of realm.propPool) {
      if (!ASSET_REGISTRY[propId]) {
        errors.push(`Realm ${realm.id} propPool item "${propId}" is missing from ASSET_REGISTRY`);
      }
    }
  }

  for (const overlay of Object.values(ENVIRONMENTAL_OVERLAYS)) {
    for (const sharedId of overlay.sharedAssets) {
      if (!ASSET_REGISTRY[sharedId]) {
        errors.push(`Overlay ${overlay.id} sharedAsset "${sharedId}" is missing from ASSET_REGISTRY`);
      }
    }
  }

  if (Array.isArray(proposedCandidates)) {
    for (const proposed of proposedCandidates) {
      const registered = ASSET_REGISTRY[proposed.id];
      if (!registered) {
        errors.push(`Proposed candidate "${proposed.id}" is missing from ASSET_REGISTRY`);
        continue;
      }
      if (registered.assetClass !== proposed.assetClass) {
        errors.push(`Asset "${proposed.id}" assetClass mismatch: ${registered.assetClass} vs ${proposed.assetClass}`);
      }
      if (registered.priority !== proposed.priority) {
        errors.push(`Asset "${proposed.id}" priority mismatch: ${registered.priority} vs ${proposed.priority}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
