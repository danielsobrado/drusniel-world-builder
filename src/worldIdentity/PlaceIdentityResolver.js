import {
  AZGAAR_CULTURE_SOURCE_MAP,
  ENVIRONMENTAL_OVERLAYS,
  LOCAL_CULTURE_BRANCHES,
  LORE_REALM_CATALOG,
  STATE_NAME_TO_LORE_REALM,
  ZURALDI_BURG_NAMES,
  ZURALDI_PROVINCE_IDS,
  ZURALDI_PROVINCE_NAMES,
  resolveCultureEntry,
} from './VisualIdentityCatalog.js';

/**
 * Deterministic, worker-safe PlaceIdentity resolver.
 *
 * Resolves immutable Azgaar culture IDs, state/province context, local culture
 * branches, physical geography/hydrology/biome, settlement class, and economic
 * roles into a serializable `PlaceIdentity` without conflating culture, ancestry,
 * polity, faith, biome, or district.
 */

const WETLAND_BIOMES = new Set([12]);
const FOREST_BIOMES = new Set([5, 6, 7, 8, 9]);
const HIGHLAND_BIOMES = new Set([9, 10, 11]);
const COLD_BIOMES = new Set([2, 9, 10, 11]);

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function classifySettlementRank(population) {
  const pop = Number.isFinite(Number(population)) ? Number(population) : 0;
  if (pop < 0.6) return { classId: 'hamlet', rank: 0 };
  if (pop < 2.5) return { classId: 'village', rank: 1 };
  if (pop < 10) return { classId: 'town', rank: 2 };
  if (pop < 40) return { classId: 'city', rank: 3 };
  return { classId: 'metropolis', rank: 4 };
}

/**
 * Resolve the canonical lore realm and state crosswalk from burg/state/province/culture inputs.
 */
export function resolveRealmCrosswalk({
  settlement = {},
  cultureEntry,
  stateName = null,
  provinceName = null,
  provinceId = null,
}) {
  const explicitRealm = normalizeText(settlement.loreRealm);
  const rawStateName = stateName ?? settlement.stateName ?? settlement.state ?? null;
  const normState = normalizeText(rawStateName);
  const normProvince = normalizeText(provinceName ?? settlement.provinceName);
  const normBurg = normalizeText(settlement.name);
  const numProvince = Number.isFinite(Number(provinceId ?? settlement.province))
    ? Number(provinceId ?? settlement.province)
    : null;

  const isZuraldiProvince = (numProvince !== null && ZURALDI_PROVINCE_IDS.includes(numProvince))
    || ZURALDI_PROVINCE_NAMES.includes(normProvince)
    || ZURALDI_BURG_NAMES.includes(normBurg);

  // Zuraldarr autonomy inside Lumeshire state
  if (
    explicitRealm === 'zuraldi'
    || cultureEntry.key === 'zuraldarr'
    || (isZuraldiProvince && (cultureEntry.key === 'zuraldarr' || normState === 'lumeshire' || !normState))
  ) {
    const realm = LORE_REALM_CATALOG.zuraldi;
    return {
      loreRealm: 'zuraldi',
      realmEntry: realm,
      azgaarStateName: typeof rawStateName === 'string' && rawStateName.trim() ? rawStateName.trim() : 'Lumeshire',
      mappingConfidence: realm.mappingConfidence,
    };
  }

  if (explicitRealm && LORE_REALM_CATALOG[explicitRealm]) {
    const realm = LORE_REALM_CATALOG[explicitRealm];
    return {
      loreRealm: explicitRealm,
      realmEntry: realm,
      azgaarStateName: typeof rawStateName === 'string' && rawStateName.trim()
        ? rawStateName.trim()
        : realm.azgaarStateNames[0],
      mappingConfidence: realm.mappingConfidence,
    };
  }

  const mappedRealmKey = STATE_NAME_TO_LORE_REALM[normState] ?? cultureEntry.defaultRealm ?? 'lumeshire';
  const realm = LORE_REALM_CATALOG[mappedRealmKey] ?? LORE_REALM_CATALOG.lumeshire;
  const preservedStateName = typeof rawStateName === 'string' && rawStateName.trim()
    ? rawStateName.trim()
    : realm.azgaarStateNames[0];

  return {
    loreRealm: realm.id,
    realmEntry: realm,
    azgaarStateName: preservedStateName,
    mappingConfidence: realm.mappingConfidence,
  };
}

/**
 * Resolve the local culture branch from `(loreRealm, cultureKey, settlement)`.
 */
export function resolveLocalCultureBranch({ loreRealm, cultureKey, settlement = {} }) {
  if (settlement.localBranch && LOCAL_CULTURE_BRANCHES[settlement.localBranch]) {
    const branch = LOCAL_CULTURE_BRANCHES[settlement.localBranch];
    // Rural-only branches (wyrmreach-draconic-remnant) never own a populated burg
    if (!branch.ruralOnly || !(Number(settlement.population) > 0)) {
      return branch;
    }
  }

  const candidates = Object.values(LOCAL_CULTURE_BRANCHES).filter(
    (b) => b.loreRealm === loreRealm && b.cultureKey === cultureKey && (!b.ruralOnly || !(Number(settlement.population) > 0)),
  );
  if (candidates.length > 0) return candidates[0];

  // If a burg in Wyrmreach was tagged with draconic-remnant seed (5), fall back to coastal/frontier local people
  if (loreRealm === 'wyrmreach' && cultureKey === 'draconic-remnant' && Number(settlement.population) > 0) {
    return LOCAL_CULTURE_BRANCHES['wyrmreach-orcs'];
  }

  // Fallback to any branch matching cultureKey, or the realm's default branch
  const byCulture = Object.values(LOCAL_CULTURE_BRANCHES).find(
    (b) => b.cultureKey === cultureKey && !b.ruralOnly,
  );
  if (byCulture) return byCulture;

  const realm = LORE_REALM_CATALOG[loreRealm] ?? LORE_REALM_CATALOG.lumeshire;
  return LOCAL_CULTURE_BRANCHES[realm.defaultLocalBranch] ?? LOCAL_CULTURE_BRANCHES['lumeshire-imperial'];
}

/**
 * Evaluate physical geography & site context to determine active environmental overlays.
 */
export function resolveSiteGeography(settlement = {}, geography = {}) {
  const biome = Number.isFinite(Number(geography.biome ?? settlement.biome))
    ? Number(geography.biome ?? settlement.biome)
    : null;
  const elevation = Number.isFinite(Number(geography.elevation ?? settlement.elevation))
    ? Number(geography.elevation ?? settlement.elevation)
    : 10;
  const slope = Number.isFinite(Number(geography.slope ?? settlement.slope))
    ? Number(geography.slope ?? settlement.slope)
    : 0;
  const snow = Number.isFinite(Number(geography.snow ?? settlement.snow))
    ? Number(geography.snow ?? settlement.snow)
    : (COLD_BIOMES.has(biome) ? 0.5 : 0);

  const burgType = normalizeText(settlement.type);
  const hasWaterAccess = Boolean(
    geography.hasWaterAccess
    ?? geography.isCoastal
    ?? geography.isRiverPort
    ?? settlement.port
    ?? (burgType === 'naval' || burgType === 'river' || burgType === 'lake'),
  );
  const isWetland = Boolean(
    geography.isWetland
    ?? settlement.isWetland
    ?? WETLAND_BIOMES.has(biome),
  );
  const isForest = Boolean(
    geography.isForest
    ?? settlement.isForest
    ?? FOREST_BIOMES.has(biome),
  );
  const isMountainPass = Boolean(
    geography.isMountainPass
    ?? settlement.isMountainPass
    ?? (slope >= 0.14 || elevation >= 28 || HIGHLAND_BIOMES.has(biome) || burgType === 'highland' || burgType === 'mining'),
  );
  const isUnderground = Boolean(
    geography.isUnderground
    ?? settlement.underground
    ?? settlement.isUnderground,
  );
  const hasRuinContext = Boolean(
    geography.hasRuinContext
    ?? settlement.ruin
    ?? settlement.hasRuinContext
    ?? settlement.riftProximity,
  );

  const activeOverlays = [];
  if (hasWaterAccess) activeOverlays.push('coast-harbor');
  if (isMountainPass && !isWetland) activeOverlays.push('mountain-pass');
  if (isForest && !isUnderground) activeOverlays.push('forest-canopy');
  if (isWetland && !isUnderground) activeOverlays.push('swamp-bog');
  if (isUnderground) activeOverlays.push('underground-cavern');
  if (hasRuinContext) activeOverlays.push('ruins-rift');

  return Object.freeze({
    biome,
    elevation,
    slope,
    snow,
    hasWaterAccess,
    isWetland,
    isForest,
    isMountainPass,
    isUnderground,
    hasRuinContext,
    activeOverlays: Object.freeze(activeOverlays),
  });
}

/**
 * Derive economic roles from realm, culture, geography, and burg flags.
 */
function resolveEconomicRoles({ loreRealm, cultureKey, settlement, siteGeo, rank }) {
  const roles = new Set();
  if (siteGeo.hasWaterAccess) roles.add('harbor-trade');
  if (settlement.capital) roles.add('administration');
  if (settlement.citadel || settlement.walls) roles.add('defense');
  if (settlement.temple) roles.add('sacred');
  if (settlement.plaza || rank >= 1) roles.add('market');

  switch (loreRealm) {
    case 'lumeshire':
      roles.add('agriculture');
      roles.add('imperial-registry');
      if (rank >= 2) roles.add('chartered-trade');
      break;
    case 'zuraldi':
      roles.add('pass-caravan-trade');
      roles.add('highland-pastoral');
      roles.add('six-offices-council');
      break;
    case 'stonehold':
      roles.add('mining');
      roles.add('smelting-forge');
      roles.add('fortress-defense');
      break;
    case 'grukmar':
      roles.add('wetland-barter');
      roles.add('salvage-craft');
      roles.add('clan-confederacy');
      break;
    case 'contia':
      roles.add('scholarship');
      roles.add('mercantile-exchange');
      break;
    case 'frostgard':
      roles.add('winter-provisioning');
      roles.add('hearth-moot');
      if (siteGeo.hasWaterAccess) roles.add('ice-whaling');
      break;
    case 'elenoria':
      roles.add('grove-stewardship');
      roles.add('living-wood-craft');
      roles.add('botanical-distillery');
      break;
    case 'umbrakor':
      roles.add('cavern-cultivation');
      roles.add('house-dominion');
      roles.add('rift-warding');
      break;
    case 'wyrmreach':
      roles.add('frontier-waystation');
      if (siteGeo.hasRuinContext) roles.add('anomaly-survey');
      break;
    default:
      break;
  }

  if (cultureKey === 'vondari') roles.add('mining');
  if (cultureKey === 'zuraldarr') roles.add('highland-pastoral');
  if (cultureKey === 'goblin-peoples') roles.add('wetland-barter');

  return Object.freeze([...roles]);
}

/**
 * Resolve a complete, deterministic, frozen `PlaceIdentity` for a settlement or site.
 */
export function resolvePlaceIdentity(settlement = {}, { geography = {}, stateName = null, provinceName = null, provinceId = null } = {}) {
  const rawCulture = settlement.culture ?? settlement.cultureKey ?? 3;
  const baseCultureEntry = resolveCultureEntry(rawCulture) ?? AZGAAR_CULTURE_SOURCE_MAP[3];

  const crosswalk = resolveRealmCrosswalk({
    settlement,
    cultureEntry: baseCultureEntry,
    stateName,
    provinceName,
    provinceId,
  });

  // If settlement did not specify a culture but specified a loreRealm, align culture with the realm's primary culture
  const effectiveCultureEntry = (settlement.culture == null && settlement.cultureKey == null)
    ? (resolveCultureEntry(crosswalk.realmEntry.primaryCultures[0]) ?? baseCultureEntry)
    : baseCultureEntry;

  const branch = resolveLocalCultureBranch({
    loreRealm: crosswalk.loreRealm,
    cultureKey: effectiveCultureEntry.key,
    settlement,
  });

  // Ensure rural-only draconic-remnant burgs in Wyrmreach adopt the resolved branch's cultureKey
  const finalCultureEntry = resolveCultureEntry(branch.cultureKey) ?? effectiveCultureEntry;
  const { classId, rank } = classifySettlementRank(settlement.population);

  // Merge realm-implied physical hints when caller didn't pass explicit terrain samples
  const impliedGeo = { ...geography };
  if (crosswalk.loreRealm === 'zuraldi' && impliedGeo.slope === undefined && impliedGeo.isMountainPass === undefined) {
    impliedGeo.isMountainPass = true;
    impliedGeo.slope = 0.2;
  }
  if (crosswalk.loreRealm === 'stonehold' && impliedGeo.slope === undefined && impliedGeo.isMountainPass === undefined) {
    impliedGeo.isMountainPass = true;
    impliedGeo.slope = 0.22;
  }
  if (crosswalk.loreRealm === 'grukmar' && impliedGeo.isWetland === undefined) {
    impliedGeo.isWetland = finalCultureEntry.key === 'goblin-peoples' || settlement.isWetland !== false;
  }
  if (crosswalk.loreRealm === 'elenoria' && impliedGeo.isForest === undefined) {
    impliedGeo.isForest = true;
  }
  if (crosswalk.loreRealm === 'umbrakor' && impliedGeo.isUnderground === undefined && settlement.underground !== false) {
    impliedGeo.isUnderground = Boolean(settlement.underground ?? true);
  }
  if (crosswalk.loreRealm === 'wyrmreach' && impliedGeo.hasRuinContext === undefined && !settlement.port) {
    impliedGeo.hasRuinContext = Boolean(settlement.ruin ?? true);
  }

  const siteGeo = resolveSiteGeography(settlement, impliedGeo);
  const economicRoles = resolveEconomicRoles({
    loreRealm: crosswalk.loreRealm,
    cultureKey: finalCultureEntry.key,
    settlement,
    siteGeo,
    rank,
  });

  const wealthTier = settlement.capital
    ? 'imperial-capital'
    : (rank >= 3 || settlement.citadel ? 'prosperous' : (crosswalk.loreRealm === 'wyrmreach' ? 'frontier-austere' : 'modest'));

  const isMultiPeople = crosswalk.loreRealm === 'grukmar'
    || branch.provinceContext === 'mixed-majority'
    || branch.provinceContext === 'plural-frontier';

  return Object.freeze({
    settlementId: Number.isFinite(Number(settlement.id)) ? Number(settlement.id) : 0,
    settlementName: String(settlement.name ?? ''),
    azgaarCultureId: finalCultureEntry.sourceId,
    azgaarCultureName: finalCultureEntry.sourceName,
    cultureKey: finalCultureEntry.key,
    cultureDisplayName: finalCultureEntry.displayName,
    cultureTargetType: finalCultureEntry.targetType,
    primaryAncestry: finalCultureEntry.primaryAncestry,
    localBranch: branch.id,
    localBranchSummary: branch.summary,
    provinceContext: branch.provinceContext,
    isMultiPeople,
    constituentPeoples: crosswalk.loreRealm === 'grukmar'
      ? Object.freeze(['goblin-peoples', 'orc-peoples', 'rakhnid-broods'])
      : Object.freeze([finalCultureEntry.key, ...crosswalk.realmEntry.secondaryCultures]),
    loreRealm: crosswalk.loreRealm,
    loreRealmDisplayName: crosswalk.realmEntry.displayName,
    azgaarStateName: crosswalk.azgaarStateName,
    mappingConfidence: crosswalk.mappingConfidence,
    loreStatus: crosswalk.realmEntry.loreStatus,
    loreSource: crosswalk.realmEntry.loreSource,
    faith: crosswalk.realmEntry.faith,
    polityForm: crosswalk.realmEntry.polityForm,
    settlementClass: classId,
    rank,
    wealthTier,
    economicRoles,
    geography: siteGeo,
    activeOverlays: siteGeo.activeOverlays,
  });
}

export { ENVIRONMENTAL_OVERLAYS };
