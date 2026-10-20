import {
  ENVIRONMENTAL_OVERLAYS,
  LORE_REALM_CATALOG,
} from './VisualIdentityCatalog.js';
import {
  getAssetCandidate,
  isAssetPhysicallyEligible,
  listAssetsByOverlay,
  resolveRuntimeAsset,
} from './AssetRegistry.js';
import { resolvePlaceIdentity } from './PlaceIdentityResolver.js';

/**
 * Deterministic, worker-safe SceneRecipe resolver.
 *
 * Translates a `PlaceIdentity` into concrete layout, architectural, landmark,
 * district, dressing, and resident instructions consumed by both the procedural
 * settlement planner (`src/editor/world/settlements/`) and the kit town builder
 * (`src/editor/towns/`).
 */

const REGIONAL_ZONE_MIX = Object.freeze({
  lumeshire: Object.freeze({
    core: Object.freeze([['townhouse', 5], ['shop', 3], ['bakery', 1]]),
    mid: Object.freeze([['house', 4], ['townhouse', 3], ['shop', 1]]),
    edge: Object.freeze([['house', 4], ['farmhouse', 2]]),
  }),
  zuraldi: Object.freeze({
    core: Object.freeze([['hall', 1], ['house', 4], ['warehouse', 2], ['tavern', 1]]),
    mid: Object.freeze([['farmhouse', 4], ['house', 4], ['barn', 2]]),
    edge: Object.freeze([['farmhouse', 4], ['barn', 3]]),
  }),
  stonehold: Object.freeze({
    core: Object.freeze([['smithy', 3], ['warehouse', 3], ['townhouse', 3], ['hall', 1]]),
    mid: Object.freeze([['townhouse', 4], ['smithy', 2], ['warehouse', 2], ['house', 2]]),
    edge: Object.freeze([['house', 4], ['warehouse', 2], ['smithy', 1]]),
  }),
  grukmar: Object.freeze({
    core: Object.freeze([['shop', 3], ['tavern', 2], ['smithy', 2], ['house', 4]]),
    mid: Object.freeze([['house', 6], ['smithy', 2], ['warehouse', 2]]),
    edge: Object.freeze([['house', 5], ['barn', 2]]),
  }),
  contia: Object.freeze({
    core: Object.freeze([['townhouse', 5], ['shop', 3], ['hall', 2]]),
    mid: Object.freeze([['townhouse', 4], ['house', 3], ['shop', 2]]),
    edge: Object.freeze([['house', 5], ['farmhouse', 1]]),
  }),
  frostgard: Object.freeze({
    core: Object.freeze([['hall', 2], ['tavern', 2], ['smithy', 2], ['house', 4]]),
    mid: Object.freeze([['farmhouse', 4], ['house', 4], ['barn', 2]]),
    edge: Object.freeze([['farmhouse', 5], ['barn', 2]]),
  }),
  elenoria: Object.freeze({
    core: Object.freeze([['hall', 2], ['chapel', 2], ['shop', 2], ['house', 4]]),
    mid: Object.freeze([['house', 5], ['bakery', 2], ['shop', 1]]),
    edge: Object.freeze([['house', 6]]),
  }),
  umbrakor: Object.freeze({
    core: Object.freeze([['townhouse', 5], ['shop', 2], ['warehouse', 2], ['keep', 1]]),
    mid: Object.freeze([['townhouse', 4], ['warehouse', 2], ['house', 3]]),
    edge: Object.freeze([['house', 4], ['barn', 2]]),
  }),
  wyrmreach: Object.freeze({
    core: Object.freeze([['tavern', 2], ['warehouse', 2], ['shop', 1], ['house', 4]]),
    mid: Object.freeze([['house', 5], ['warehouse', 1]]),
    edge: Object.freeze([['house', 6]]),
  }),
});

const REGIONAL_DISTRICT_MIX = Object.freeze({
  lumeshire: Object.freeze({
    civic: Object.freeze([['hall', 2], ['chapel', 2], ['townhouse', 4]]),
    market: Object.freeze([['shop', 4], ['warehouse', 3], ['bakery', 2], ['tavern', 1]]),
    craft: Object.freeze([['smithy', 2], ['bakery', 2], ['shop', 3], ['house', 3]]),
    wealthy: Object.freeze([['townhouse', 6], ['shop', 1]]),
    quay: Object.freeze([['warehouse', 4], ['shop', 2], ['tavern', 1], ['house', 1]]),
  }),
  zuraldi: Object.freeze({
    civic: Object.freeze([['hall', 2], ['house', 4], ['tavern', 1]]),
    passTrade: Object.freeze([['warehouse', 4], ['tavern', 2], ['smithy', 1], ['house', 2]]),
    pastoral: Object.freeze([['farmhouse', 5], ['barn', 4], ['bakery', 1]]),
    craft: Object.freeze([['bakery', 2], ['smithy', 2], ['warehouse', 2], ['house', 3]]),
    wealthy: Object.freeze([['farmhouse', 4], ['hall', 1], ['house', 2]]),
    quay: Object.freeze([['warehouse', 3], ['house', 3]]),
  }),
  stonehold: Object.freeze({
    forgeheart: Object.freeze([['smithy', 5], ['warehouse', 3], ['tower', 1]]),
    mining: Object.freeze([['warehouse', 5], ['smithy', 3], ['townhouse', 2]]),
    craft: Object.freeze([['smithy', 4], ['warehouse', 3], ['townhouse', 2]]),
    wealthy: Object.freeze([['townhouse', 5], ['hall', 2]]),
    quay: Object.freeze([['warehouse', 5], ['smithy', 2]]),
  }),
  grukmar: Object.freeze({
    goblinWetland: Object.freeze([['house', 5], ['shop', 3], ['tavern', 2]]),
    orcUpland: Object.freeze([['hall', 2], ['smithy', 3], ['warehouse', 2], ['house', 3]]),
    salvageTrade: Object.freeze([['shop', 3], ['smithy', 3], ['warehouse', 2], ['tavern', 1]]),
    craft: Object.freeze([['smithy', 3], ['bakery', 2], ['shop', 2], ['house', 3]]),
    wealthy: Object.freeze([['hall', 2], ['house', 4]]),
    quay: Object.freeze([['warehouse', 3], ['shop', 3], ['tavern', 2], ['house', 2]]),
  }),
});

function resolveLandmarksForIdentity(identity, realmEntry, warnOnFallback = false) {
  const siteContext = identity.geography;
  const resolved = [];
  const forbidden = new Set();

  // Collect forbidden assets from inactive overlays
  for (const [overlayId, overlay] of Object.entries(ENVIRONMENTAL_OVERLAYS)) {
    if (!identity.activeOverlays.includes(overlayId)) {
      for (const assetId of overlay.forbiddenWhenAbsent) {
        forbidden.add(assetId);
      }
    }
  }

  // Zuraldarr autonomy never uses Imperial cathedral/grid dominance
  if (identity.loreRealm === 'zuraldi') {
    forbidden.add('lumeshire/parish-church');
    forbidden.add('lumeshire/imperial-registry-hall');
  }

  // Underground caverns never place open-sky surface roof structures or surface farms
  if (siteContext.isUnderground) {
    forbidden.add('lumeshire/parish-church');
    forbidden.add('contian/observatory-instrument-tower');
    forbidden.add('elenoria/bough-council-pavilion');
  }

  // Candidate regional assets: P0 first, then P1
  const candidateIds = [...realmEntry.mandatoryLandmarks, ...realmEntry.propPool];
  for (const assetId of candidateIds) {
    const asset = getAssetCandidate(assetId);
    if (!asset) continue;
    if (!isAssetPhysicallyEligible(asset, siteContext)) {
      forbidden.add(assetId);
      continue;
    }
    const runtime = resolveRuntimeAsset(assetId, { warnOnFallback });
    const zone = asset.assetClass === 'civic' || asset.assetClass === 'sacred' || asset.assetClass === 'trade'
      ? 'core'
      : (asset.assetClass === 'defense' || asset.assetClass === 'infrastructure' || asset.assetClass === 'coastal' ? 'edge' : 'mid');
    resolved.push(Object.freeze({
      assetId,
      assetClass: asset.assetClass,
      priority: asset.priority,
      zone,
      runtime,
    }));
  }

  // Shared environmental overlay modules for active overlays
  const overlayModules = [];
  for (const overlayId of identity.activeOverlays) {
    for (const asset of listAssetsByOverlay(overlayId)) {
      if (!isAssetPhysicallyEligible(asset, siteContext)) {
        forbidden.add(asset.id);
        continue;
      }
      overlayModules.push(Object.freeze({
        assetId: asset.id,
        areaOverlay: overlayId,
        runtime: resolveRuntimeAsset(asset.id, { warnOnFallback }),
      }));
    }
  }

  return {
    landmarks: Object.freeze(resolved.filter((item) => item.runtime.fallback.kind === 'building')),
    regionalProps: Object.freeze(resolved.filter((item) => item.runtime.fallback.kind === 'prop')),
    overlayModules: Object.freeze(overlayModules),
    forbiddenAssets: Object.freeze([...forbidden]),
  };
}

/**
 * Resolve multi-people sub-districts when a settlement hosts distinct constituent peoples
 * (most prominently Grukmar's goblin wetland stilt/boardwalk districts vs orc upland clan halls).
 */
function resolveMultiPeopleDistricts(identity) {
  if (identity.loreRealm === 'grukmar') {
    return Object.freeze([
      Object.freeze({
        id: 'goblin-wetland-ward',
        cultureKey: 'goblin-peoples',
        localBranch: 'grukmar-goblins',
        terrainPreference: 'wetland-lowland',
        kitFamily: 'Goblin',
        foundationType: 'braced-bog-stilts',
        signatureAssets: Object.freeze([
          'grukmar/bog-stilt-dwelling',
          'grukmar/raised-marsh-boardwalk',
          'grukmar/wetland-barter-market',
          'grukmar/goblin-boat-landing',
        ]),
      }),
      Object.freeze({
        id: 'orc-upland-ward',
        cultureKey: 'orc-peoples',
        localBranch: 'grukmar-orcs',
        terrainPreference: 'dry-upland-ridge',
        kitFamily: 'Nordic',
        foundationType: 'earthfast-stone-and-timber',
        signatureAssets: Object.freeze([
          'grukmar/clan-assembly-hall',
          'grukmar/ridge-palisade-gate',
          'grukmar/salvage-smithy',
          'grukmar/orc-haul-wagon',
        ]),
      }),
      Object.freeze({
        id: 'shared-salvage-barter-yard',
        cultureKey: 'grukmar-confederacy',
        localBranch: identity.localBranch,
        terrainPreference: 'causeway-margin',
        kitFamily: 'Goblin',
        foundationType: 'corduroy-log-causeway',
        signatureAssets: Object.freeze([
          'grukmar/wetland-barter-market',
          'grukmar/salvage-smithy',
          'grukmar/treaty-totem-post',
        ]),
      }),
    ]);
  }
  if (identity.loreRealm === 'frostgard') {
    return Object.freeze([
      Object.freeze({
        id: 'norths-hearth-ward',
        cultureKey: 'norths',
        localBranch: 'frostgard-norths',
        terrainPreference: 'sheltered-hollow',
        kitFamily: 'Nordic',
        foundationType: 'earth-bermed-sill',
        signatureAssets: Object.freeze(['frostgard/hearth-longhall', 'frostgard/turf-roofed-smithy']),
      }),
      Object.freeze({
        id: 'jotunn-moot-ward',
        cultureKey: 'jotunn',
        localBranch: 'frostgard-jotunn',
        terrainPreference: 'glacial-ridge',
        kitFamily: 'Nordic',
        foundationType: 'megalithic-boulder-ring',
        signatureAssets: Object.freeze(['frostgard/jotunn-stone-moot-ring', 'frostgard/windbreak-beacon-tower']),
      }),
    ]);
  }
  return Object.freeze([]);
}

/**
 * Resolve a complete, deterministic, worker-safe `SceneRecipe` from a `PlaceIdentity` or settlement object.
 */
export function resolveSceneRecipe(settlementOrIdentity, options = {}) {
  const identity = settlementOrIdentity?.loreRealm && settlementOrIdentity?.cultureKey && settlementOrIdentity?.geography
    ? settlementOrIdentity
    : resolvePlaceIdentity(settlementOrIdentity, options);

  const realmEntry = LORE_REALM_CATALOG[identity.loreRealm] ?? LORE_REALM_CATALOG.lumeshire;
  const baseArch = realmEntry.architectureGrammar;

  // Adapt kitFamily and foundationType when a minority localBranch or environmental overlay applies
  let kitFamily = baseArch.kitFamily;
  let settlementStyleKey = baseArch.settlementStyleKey;
  let foundationType = baseArch.foundationType;

  if (identity.cultureKey === 'goblin-peoples' || identity.cultureKey === 'rakhnid-broods') {
    kitFamily = 'Goblin';
    settlementStyleKey = identity.geography.isWetland ? 'swamp-thatch' : 'timber-thatch';
  } else if (identity.cultureKey === 'orc-peoples' && identity.loreRealm === 'grukmar' && !identity.geography.isWetland) {
    kitFamily = 'Nordic';
    settlementStyleKey = 'granite-slate';
    foundationType = 'earthfast-stone-and-timber';
  }

  if (identity.activeOverlays.includes('swamp-bog') && foundationType !== 'bog-stilt-or-earthfast') {
    foundationType = 'braced-timber-stilts-and-corduroy-causeway';
  } else if (identity.activeOverlays.includes('mountain-pass') && foundationType === 'ashlar-plinth') {
    foundationType = 'stepped-retaining-terrace';
  } else if (identity.activeOverlays.includes('underground-cavern')) {
    foundationType = 'rock-cut-shelf-and-arch-bracket';
  }

  const { landmarks, regionalProps, overlayModules, forbiddenAssets } = resolveLandmarksForIdentity(
    identity,
    realmEntry,
    Boolean(options.warnOnFallback),
  );

  const zoneMix = REGIONAL_ZONE_MIX[identity.loreRealm] ?? REGIONAL_ZONE_MIX.lumeshire;
  const districtMix = REGIONAL_DISTRICT_MIX[identity.loreRealm] ?? REGIONAL_DISTRICT_MIX.lumeshire;
  const multiPeopleDistricts = resolveMultiPeopleDistricts(identity);

  // Street network parameters driven by regional streetGrammar & terrain
  const streetConfig = Object.freeze({
    grammar: baseArch.streetGrammar,
    drift: baseArch.streetGrammar === 'axial-imperial-grid'
      ? 0.08
      : (baseArch.streetGrammar === 'contour-switchback-terrace' ? 0.34 : 0.22),
    ringCount: baseArch.streetGrammar === 'sparse-waystation-trail'
      ? 0
      : (identity.rank >= 3 ? 2 : (identity.rank >= 2 ? 1 : 0)),
    hasImperialSquare: identity.loreRealm === 'lumeshire' || identity.loreRealm === 'contia',
    hasCouncilTerrace: identity.loreRealm === 'zuraldi' || identity.loreRealm === 'frostgard',
    hasForgeCourt: identity.loreRealm === 'stonehold',
    hasBoardwalkNetwork: identity.activeOverlays.includes('swamp-bog') || identity.loreRealm === 'grukmar',
    suppressSurfaceFarms: Boolean(identity.geography.isUnderground || identity.loreRealm === 'wyrmreach'),
  });

  return Object.freeze({
    recipeId: `${identity.loreRealm}:${identity.localBranch}:${identity.settlementClass}:${identity.activeOverlays.join('+') || 'inland'}`,
    identity,
    architecture: Object.freeze({
      ...baseArch,
      settlementStyleKey,
      kitFamily,
      foundationType,
    }),
    streetConfig,
    zoneMix,
    districtMix,
    multiPeopleDistricts,
    mandatoryLandmarks: landmarks,
    regionalProps,
    overlayModules,
    forbiddenAssets,
    residentProfessions: realmEntry.residentProfessions,
  });
}
