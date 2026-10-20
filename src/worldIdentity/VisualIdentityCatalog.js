/**
 * Canonical Drusniel Visual Identity Catalog.
 *
 * Bridges immutable Azgaar source IDs (`config/cultures.yaml`), Eldara state and
 * province contexts (`docs/reference/eldara-local-cultures-populations.md`),
 * narrative lore realms (`docs/asset-bible/00-lore-and-map-crosswalk.md`), and
 * environmental overlays (`docs/asset-bible/areas/*.md`) into worker-safe,
 * deterministic architectural and settlement grammars.
 *
 * Pure data and pure functions; safe in terrain workers, main thread, and Node.
 */

export const LORE_PROVENANCE_VALUES = Object.freeze([
  'published',
  'repo-authored',
  'design-proposal',
]);

export const MAPPING_CONFIDENCE_VALUES = Object.freeze([
  'direct-name',
  'culture-and-geography',
  'requires-confirmation',
  'direct-name-architecture-uncertain',
]);

export const PROVINCE_CONTEXT_VALUES = Object.freeze([
  'strong-majority',
  'mixed-majority',
  'plural-frontier',
  'enclave',
]);

/**
 * Immutable Azgaar culture IDs (0..13) mapped to `config/cultures.yaml` canonical
 * culture or cultural-seed keys.
 */
export const AZGAAR_CULTURE_SOURCE_MAP = Object.freeze({
  0: Object.freeze({
    sourceId: 0,
    sourceName: 'Wildlands',
    targetType: 'none',
    key: 'none',
    displayName: 'Uninhabited / Wildlands',
    primaryAncestry: 'none',
    defaultRealm: 'wyrmreach',
    settlementStyleKey: 'granite-slate',
    kitFamily: 'Nordic',
  }),
  1: Object.freeze({
    sourceId: 1,
    sourceName: 'Eldoria',
    targetType: 'culture',
    key: 'elenori',
    displayName: 'Elenori High Elven',
    primaryAncestry: 'elven',
    defaultRealm: 'elenoria',
    regionalSphere: 'western-elven-sphere',
    settlementStyleKey: 'limestone-slate',
    kitFamily: 'Med',
  }),
  2: Object.freeze({
    sourceId: 2,
    sourceName: 'Mercian',
    targetType: 'seed',
    key: 'serpent-peoples',
    displayName: 'Serpent Peoples',
    primaryAncestry: 'serpentfolk',
    defaultRealm: 'contia',
    regionalSphere: 'serpentine-basin-sphere',
    settlementStyleKey: 'sandstone-terracotta',
    kitFamily: 'Med',
  }),
  3: Object.freeze({
    sourceId: 3,
    sourceName: 'Kentland',
    targetType: 'culture',
    key: 'lumish',
    displayName: 'Lumish Imperial',
    primaryAncestry: 'human',
    defaultRealm: 'lumeshire',
    settlementStyleKey: 'limestone-slate',
    kitFamily: 'Tudor',
  }),
  4: Object.freeze({
    sourceId: 4,
    sourceName: 'Yotunn',
    targetType: 'seed',
    key: 'jotunn',
    displayName: 'Jotunn Frost-Giant Kin',
    primaryAncestry: 'giantkin',
    defaultRealm: 'frostgard',
    regionalSphere: 'northern-frost-sphere',
    settlementStyleKey: 'granite-slate',
    kitFamily: 'Nordic',
  }),
  5: Object.freeze({
    sourceId: 5,
    sourceName: 'Enlandic',
    targetType: 'seed',
    key: 'draconic-remnant',
    displayName: 'Draconic Remnant',
    primaryAncestry: 'draconic',
    defaultRealm: 'wyrmreach',
    regionalSphere: 'draconic-highland-sphere',
    settlementStyleKey: 'granite-slate',
    kitFamily: 'Nordic',
  }),
  6: Object.freeze({
    sourceId: 6,
    sourceName: 'Valarans',
    targetType: 'culture',
    key: 'zuraldarr',
    displayName: 'Zuraldarr Highlanders',
    primaryAncestry: 'human',
    defaultRealm: 'zuraldi',
    settlementStyleKey: 'granite-slate',
    kitFamily: 'Nordic',
  }),
  7: Object.freeze({
    sourceId: 7,
    sourceName: 'Norheim',
    targetType: 'culture',
    key: 'norths',
    displayName: 'Norths of Frostgard',
    primaryAncestry: 'human',
    defaultRealm: 'frostgard',
    regionalSphere: 'northern-frost-sphere',
    settlementStyleKey: 'granite-slate',
    kitFamily: 'Nordic',
  }),
  8: Object.freeze({
    sourceId: 8,
    sourceName: 'Darkhold',
    targetType: 'culture',
    key: 'umbra-kori',
    displayName: "Umbra'kori Dominion",
    primaryAncestry: 'dark-elven',
    defaultRealm: 'umbrakor',
    settlementStyleKey: 'granite-slate',
    kitFamily: 'Med',
  }),
  9: Object.freeze({
    sourceId: 9,
    sourceName: 'Uruk',
    targetType: 'seed',
    key: 'orc-peoples',
    displayName: 'Orcish Clans',
    primaryAncestry: 'orc',
    defaultRealm: 'grukmar',
    settlementStyleKey: 'granite-slate',
    kitFamily: 'Nordic',
  }),
  10: Object.freeze({
    sourceId: 10,
    sourceName: 'Durinheim',
    targetType: 'culture',
    key: 'vondari',
    displayName: 'Vondari Mountain-Folk',
    primaryAncestry: 'dwarven',
    defaultRealm: 'stonehold',
    regionalSphere: 'eastern-dwarven-sphere',
    settlementStyleKey: 'granite-slate',
    kitFamily: 'Nordic',
  }),
  11: Object.freeze({
    sourceId: 11,
    sourceName: 'Schwarzlicht',
    targetType: 'culture',
    key: 'contian',
    displayName: 'Contian League',
    primaryAncestry: 'human',
    defaultRealm: 'contia',
    settlementStyleKey: 'limestone-terracotta',
    kitFamily: 'Med',
  }),
  12: Object.freeze({
    sourceId: 12,
    sourceName: 'Rakhnid',
    targetType: 'seed',
    key: 'rakhnid-broods',
    displayName: 'Rakhnid Broods',
    primaryAncestry: 'arachnid',
    defaultRealm: 'grukmar',
    settlementStyleKey: 'timber-thatch',
    kitFamily: 'Goblin',
  }),
  13: Object.freeze({
    sourceId: 13,
    sourceName: 'Darkspire',
    targetType: 'seed',
    key: 'goblin-peoples',
    displayName: 'Goblin Peoples',
    primaryAncestry: 'goblin',
    defaultRealm: 'grukmar',
    regionalSphere: 'goblin-march-sphere',
    settlementStyleKey: 'swamp-thatch',
    kitFamily: 'Goblin',
  }),
});

export const CULTURE_KEY_TO_SOURCE_ID = Object.freeze(
  Object.fromEntries(Object.values(AZGAAR_CULTURE_SOURCE_MAP).map((entry) => [entry.key, entry.sourceId])),
);

/**
 * Zuraldarr upland provinces and autonomous burgs within the Lumeshire Azgaar state
 * (`docs/reference/eldara-local-cultures-populations.md` & `00-lore-and-map-crosswalk.md`).
 */
export const ZURALDI_PROVINCE_IDS = Object.freeze([34, 75, 124, 125, 131]);
export const ZURALDI_PROVINCE_NAMES = Object.freeze(['persbury', 'westclesia', 'pyreaz', 'hatbury', 'zuraldi']);
export const ZURALDI_BURG_NAMES = Object.freeze(['lexabusur']);

/**
 * Nine canonical regional dossiers + Eldara state mappings.
 */
export const LORE_REALM_CATALOG = Object.freeze({
  lumeshire: Object.freeze({
    id: 'lumeshire',
    displayName: 'Lumeshirean Divine Empire',
    azgaarStateNames: Object.freeze(['Lumeshire']),
    mappingConfidence: 'direct-name',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/the-resilient-defense-of-the-lumeshirean-divine-empire/',
    primaryCultures: Object.freeze(['lumish']),
    secondaryCultures: Object.freeze(['zuraldarr', 'orc-peoples', 'goblin-peoples']),
    defaultLocalBranch: 'lumeshire-imperial',
    faith: 'Church of Lumina',
    polityForm: 'divine-empire',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'limestone-slate',
      kitFamily: 'Tudor',
      kitSkin: 'imperial',
      wallMaterial: 'dressed-cream-limestone-and-oak-frame',
      roofMaterial: 'blue-gray-slate',
      roofForm: 'steep-axial-gable-with-clerestory',
      roofPitch: 42,
      roofOverhang: 0.35,
      irregularity: 0.1,
      weathering: 0.22,
      foundationType: 'ashlar-plinth',
      streetGrammar: 'axial-imperial-grid',
      dressingPreference: 'old-market',
      silhouetteSummary: 'Orderly axial market square, arcaded registry hall, twin-lancet parish church, buttressed granary, and disciplined timber-framed rowhouses.',
    }),
    mandatoryLandmarks: Object.freeze([
      'lumeshire/imperial-registry-hall',
      'lumeshire/parish-church',
      'lumeshire/granary',
      'lumeshire/fortified-market-hall',
      'lumeshire/border-watchtower',
      'lumeshire/toll-bridge-gate',
    ]),
    propPool: Object.freeze([
      'lumeshire/wagon-grain-stall',
      'lumeshire/road-mile-marker',
      'lumeshire/communal-bake-oven',
      'lumeshire/barracks-supply-shed',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'imperial-magistrate', title: 'Imperial Registry Magistrate', visualKind: 'paladin', district: 'civic', role: 'administration' }),
      Object.freeze({ id: 'lumina-cleric', title: 'Parish Cleric of Lumina', visualKind: 'paladin', district: 'sacred', role: 'sacred' }),
      Object.freeze({ id: 'grain-reeve', title: 'Imperial Tithe & Grain Reeve', visualKind: 'villager', district: 'market', role: 'agriculture' }),
      Object.freeze({ id: 'chartered-burgher', title: 'Chartered Guild Merchant', visualKind: 'villager', district: 'market', role: 'trade' }),
      Object.freeze({ id: 'border-pikeman', title: 'Imperial Border Warden', visualKind: 'paladin', district: 'garrison', role: 'military' }),
      Object.freeze({ id: 'guild-baker', title: 'Communal Oven Baker', visualKind: 'villager', district: 'craft', role: 'craft' }),
    ]),
  }),

  zuraldi: Object.freeze({
    id: 'zuraldi',
    displayName: 'Zuraldi Highland Autonomy',
    azgaarStateNames: Object.freeze(['Lumeshire']),
    mappingConfidence: 'culture-and-geography',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/the-zuraldarr/',
    primaryCultures: Object.freeze(['zuraldarr']),
    secondaryCultures: Object.freeze(['lumish', 'orc-peoples']),
    defaultLocalBranch: 'lumeshire-zuraldarr',
    faith: 'Six Ancestor-Gods & Druidic Groves',
    polityForm: 'autonomous-highland-six-offices',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'granite-slate',
      kitFamily: 'Nordic',
      kitSkin: 'plains',
      wallMaterial: 'dry-laid-mountain-granite-and-larch-beams',
      roofMaterial: 'heavy-split-shale-slabs',
      roofForm: 'low-wind-resistant-hipped-gable',
      roofPitch: 32,
      roofOverhang: 0.48,
      irregularity: 0.22,
      weathering: 0.42,
      foundationType: 'stepped-dry-stone-terrace',
      streetGrammar: 'contour-switchback-terrace',
      dressingPreference: 'river-stone',
      silhouetteSummary: 'Slope-following gray-stone terraces, six-pillar council hall, carved ancestor monolith, caravan unloading shelves, and cattle enclosures without Imperial cathedral grids.',
    }),
    mandatoryLandmarks: Object.freeze([
      'zuraldi/six-offices-council-hall',
      'zuraldi/ancestor-monolith',
      'zuraldi/terraced-stone-farmstead',
      'zuraldi/ridge-watchhouse',
      'zuraldi/caravan-unloading-shelf',
      'zuraldi/switchback-bridge',
    ]),
    propPool: Object.freeze([
      'zuraldi/cattle-yard',
      'zuraldi/highland-cheese-smokehouse',
      'zuraldi/druid-grove-altar',
      'zuraldi/matriarch-table',
      'zuraldi/stone-pass-cairn',
      'zuraldi/mountain-pony-pack-cart',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'six-offices-speaker', title: 'Speaker of the Six Offices', visualKind: 'paladin', district: 'civic', role: 'administration' }),
      Object.freeze({ id: 'grove-druid', title: 'Highland Grove Keeper', visualKind: 'villager', district: 'sacred', role: 'sacred' }),
      Object.freeze({ id: 'pass-warden', title: 'Mountain Pass Warden', visualKind: 'paladin', district: 'garrison', role: 'defense' }),
      Object.freeze({ id: 'caravan-drover', title: 'Highland Pony Caravan Drover', visualKind: 'villager', district: 'market', role: 'trade' }),
      Object.freeze({ id: 'cattle-matriarch', title: 'Terrace Herd Matriarch', visualKind: 'villager', district: 'agricultural', role: 'pastoral' }),
      Object.freeze({ id: 'smokehouse-curer', title: 'Upland Cheese & Meat Curer', visualKind: 'villager', district: 'craft', role: 'craft' }),
    ]),
  }),

  stonehold: Object.freeze({
    id: 'stonehold',
    displayName: 'Mountain Kingdom of Stonehold',
    azgaarStateNames: Object.freeze(['Ironpeak', 'Stonehold', 'Glimmerhold']),
    mappingConfidence: 'requires-confirmation',
    mappingNote: 'Working crosswalk maps Stonehold lore to Azgaar state Ironpeak (Durinheim/vondari majority); preserve both loreRealm=stonehold and azgaarStateName=Ironpeak.',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/forge-and-fire-the-mountain-kingdom-of-stoneholds-stand-against-chaos/',
    primaryCultures: Object.freeze(['vondari']),
    secondaryCultures: Object.freeze(['orc-peoples', 'umbra-kori']),
    defaultLocalBranch: 'ironpeak-vondari',
    faith: 'Forgeheart & Ancestral Craft Reverence',
    polityForm: 'fortified-mountain-hold-monarchy',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'granite-slate',
      kitFamily: 'Nordic',
      kitSkin: 'frost',
      wallMaterial: 'interlocking-ashlar-basalt-and-iron-bands',
      roofMaterial: 'stepped-stone-corbel-and-slate',
      roofForm: 'buttressed-gabled-vault-with-flues',
      roofPitch: 36,
      roofOverhang: 0.25,
      irregularity: 0.08,
      weathering: 0.35,
      foundationType: 'heavy-cyclopean-plinth',
      streetGrammar: 'fortified-forge-axis',
      dressingPreference: 'dark-quarter',
      silhouetteSummary: 'Heavy trapezoidal mountain gate, twin-chimney forgeheart workshops, vertical smelter towers, ore-lift headframes, ore-cart rail tracks, and terraced stone worker rows.',
    }),
    mandatoryLandmarks: Object.freeze([
      'stonehold/fortress-mountain-gate',
      'stonehold/forgeheart-workshop',
      'stonehold/smelter-tower',
      'stonehold/ore-lift-headframe',
      'stonehold/ore-cart-track',
      'stonehold/vault-council-hall',
    ]),
    propPool: Object.freeze([
      'stonehold/terraced-stone-worker-home',
      'stonehold/basalt-viaduct',
      'stonehold/sealed-shaft-barricade',
      'stonehold/mine-ventilation-stack',
      'stonehold/ore-assay-bench',
      'stonehold/stonehold-ward-block',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'deep-warden', title: 'Sealed-Shaft Gate Warden', visualKind: 'paladin', district: 'garrison', role: 'defense' }),
      Object.freeze({ id: 'forgeheart-master', title: 'Forgeheart Master Smith', visualKind: 'villager', district: 'industrial', role: 'industry' }),
      Object.freeze({ id: 'ore-assayer', title: 'Guild Ore Assayer & Hoist Engineer', visualKind: 'villager', district: 'industrial', role: 'mining' }),
      Object.freeze({ id: 'vault-councillor', title: 'Vault Council Elder', visualKind: 'paladin', district: 'civic', role: 'administration' }),
      Object.freeze({ id: 'contract-hauler', title: 'Ironpeak Contract Ore Hauler', visualKind: 'villager', district: 'market', role: 'logistics' }),
      Object.freeze({ id: 'tunnel-mason', title: 'Basalt Viaduct Mason', visualKind: 'villager', district: 'craft', role: 'craft' }),
    ]),
  }),

  grukmar: Object.freeze({
    id: 'grukmar',
    displayName: 'Grukmar Confederacy & Bog Marches',
    azgaarStateNames: Object.freeze(['Grukmar']),
    mappingConfidence: 'direct-name',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/from-ashes-to-empire-the-rise-of-grukmar/',
    primaryCultures: Object.freeze(['goblin-peoples', 'orc-peoples', 'rakhnid-broods']),
    secondaryCultures: Object.freeze(['umbra-kori', 'jotunn']),
    defaultLocalBranch: 'grukmar-goblins',
    faith: 'Bog Spirit Pacts, Clan Totems & Brood Webs',
    polityForm: 'multi-people-martial-trade-confederacy',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'swamp-thatch',
      kitFamily: 'Goblin',
      kitSkin: 'marsh',
      wallMaterial: 'charred-bog-cypress-lashings-and-upland-rubble',
      roofMaterial: 'layered-marsh-reed-thatch-and-tarred-plank',
      roofForm: 'steep-shed-and-pitched-stilt-canopy',
      roofPitch: 46,
      roofOverhang: 0.55,
      irregularity: 0.34,
      weathering: 0.55,
      foundationType: 'bog-stilt-or-earthfast',
      streetGrammar: 'wetland-boardwalk-and-upland-ring',
      dressingPreference: 'mossy-lanes',
      silhouetteSummary: 'Dual ecological grammar: goblin stilt dwellings, raised boardwalks, and skiff barter markets over wetlands paired with orc upland timber-and-stone clan assembly halls and salvage trade yards.',
    }),
    mandatoryLandmarks: Object.freeze([
      'grukmar/bog-stilt-dwelling',
      'grukmar/clan-assembly-hall',
      'grukmar/raised-marsh-boardwalk',
      'grukmar/wetland-barter-market',
      'grukmar/salvage-smithy',
      'grukmar/ridge-palisade-gate',
    ]),
    propPool: Object.freeze([
      'grukmar/marsh-watch-tower',
      'grukmar/peat-kiln-shed',
      'grukmar/goblin-boat-landing',
      'grukmar/orc-haul-wagon',
      'grukmar/reed-drying-frame',
      'grukmar/treaty-totem-post',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'clan-warchief', title: 'Confederacy Clan Envoy', visualKind: 'paladin', district: 'civic', role: 'administration' }),
      Object.freeze({ id: 'bog-skiff-factor', title: 'Goblin Marsh Barter Factor', visualKind: 'villager', district: 'market', role: 'trade' }),
      Object.freeze({ id: 'salvage-ironsmith', title: 'Salvage & Bog-Iron Smith', visualKind: 'villager', district: 'industrial', role: 'craft' }),
      Object.freeze({ id: 'ridge-outpost-guard', title: 'Palisade Ridge Guard', visualKind: 'paladin', district: 'garrison', role: 'defense' }),
      Object.freeze({ id: 'peat-cutter', title: 'Wetland Reed & Peat Cutter', visualKind: 'villager', district: 'agricultural', role: 'gathering' }),
      Object.freeze({ id: 'totem-mediator', title: 'Treaty-Post Shaman', visualKind: 'villager', district: 'sacred', role: 'sacred' }),
    ]),
  }),

  contia: Object.freeze({
    id: 'contia',
    displayName: 'Contian League & Academy Cities',
    azgaarStateNames: Object.freeze(['Contia', 'Sunspire']),
    mappingConfidence: 'direct-name',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/knowledge-and-power-the-rise-of-the-contian-league/',
    primaryCultures: Object.freeze(['contian']),
    secondaryCultures: Object.freeze(['vondari', 'serpent-peoples', 'goblin-peoples', 'rakhnid-broods']),
    defaultLocalBranch: 'contian-core',
    faith: 'Secular Civic Philosophy & Collegial Patronage',
    polityForm: 'mercantile-scholarly-league',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'limestone-terracotta',
      kitFamily: 'Med',
      kitSkin: 'sun',
      wallMaterial: 'warm-ochre-limestone-stucco-and-carved-pilasters',
      roofMaterial: 'barrel-terracotta-tile-and-copper-lanterns',
      roofForm: 'low-hipped-courtyard-and-clerestory-pavilion',
      roofPitch: 28,
      roofOverhang: 0.42,
      irregularity: 0.09,
      weathering: 0.2,
      foundationType: 'courtyard-colonnade',
      streetGrammar: 'scholarly-terraced-avenue',
      dressingPreference: 'grey-setts',
      silhouetteSummary: 'Colonnaded lecture halls, stepped library archives, hydraulic aqueduct cisterns, observatory towers, and arcaded merchant guild houses.',
    }),
    mandatoryLandmarks: Object.freeze([
      'contian/collegium-lecture-hall',
      'contian/archive-rotunda',
      'contian/guild-exchange-loggia',
      'contian/aqueduct-cistern-house',
      'contian/observatory-instrument-tower',
      'contian/customs-canal-gate',
    ]),
    propPool: Object.freeze([
      'contian/scholar-courtyard-townhouse',
      'contian/printing-bindery-workshop',
      'contian/botanical-specimen-court',
      'contian/water-clock-kiosk',
      'contian/surveyor-obelisk',
      'contian/book-peddler-stall',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'collegium-fellow', title: 'Collegium Natural Philosopher', visualKind: 'villager', district: 'civic', role: 'scholarship' }),
      Object.freeze({ id: 'syndic-guard', title: 'League Customs Provost', visualKind: 'paladin', district: 'garrison', role: 'administration' }),
      Object.freeze({ id: 'archive-scrivener', title: 'Rotunda Archive Scrivener', visualKind: 'villager', district: 'civic', role: 'scholarship' }),
      Object.freeze({ id: 'exchange-broker', title: 'Loggia Factor & Assayer', visualKind: 'villager', district: 'market', role: 'trade' }),
      Object.freeze({ id: 'hydraulic-warden', title: 'Cistern & Aqueduct Engineer', visualKind: 'villager', district: 'craft', role: 'infrastructure' }),
    ]),
  }),

  frostgard: Object.freeze({
    id: 'frostgard',
    displayName: 'Frostgard Holds & Jotunn Reaches',
    azgaarStateNames: Object.freeze(['Frostgard', 'Stormgarde']),
    mappingConfidence: 'direct-name',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/unyielding-spirit-of-frostgards-frozen-heart/',
    primaryCultures: Object.freeze(['norths', 'jotunn']),
    secondaryCultures: Object.freeze(['orc-peoples', 'rakhnid-broods', 'goblin-peoples']),
    defaultLocalBranch: 'frostgard-norths',
    faith: 'Hearth-Oath Sagas & Ancient Glacier Reverence',
    polityForm: 'jarldom-and-jotunn-moot',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'granite-slate',
      kitFamily: 'Nordic',
      kitSkin: 'frost',
      wallMaterial: 'heavy-pine-stave-timber-over-drift-boulder-sills',
      roofMaterial: 'steep-shed-snow-board-and-turf',
      roofForm: 'deep-A-frame-wind-deflecting-longhouse',
      roofPitch: 52,
      roofOverhang: 0.45,
      irregularity: 0.18,
      weathering: 0.48,
      foundationType: 'earthfast-snow-sill',
      streetGrammar: 'windbreak-hearth-cluster',
      dressingPreference: 'black-setts',
      silhouetteSummary: 'Earth-bermed longhalls, megalithic Jotunn moot rings, seal-oil smokehouses, sea-ice slipways, and snow-trench windbreaks.',
    }),
    mandatoryLandmarks: Object.freeze([
      'frostgard/hearth-longhall',
      'frostgard/jotunn-stone-moot-ring',
      'frostgard/ice-harbor-boathouse',
      'frostgard/windbreak-beacon-tower',
      'frostgard/winter-store-pit-house',
      'frostgard/turf-roofed-smithy',
    ]),
    propPool: Object.freeze([
      'frostgard/earth-bermed-homestead',
      'frostgard/whale-rib-drying-stage',
      'frostgard/snow-trench-palisade',
      'frostgard/sled-dog-yard',
      'frostgard/carved-saga-runestone',
      'frostgard/blubber-try-pot-hearth',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'jarl-huscarl', title: 'Longhall Huscarl', visualKind: 'paladin', district: 'civic', role: 'defense' }),
      Object.freeze({ id: 'ice-pilot', title: 'Sea-Ice Whaler & Pilot', visualKind: 'villager', district: 'harbor', role: 'maritime' }),
      Object.freeze({ id: 'saga-skald', title: 'Moot-Ring Skald', visualKind: 'villager', district: 'sacred', role: 'sacred' }),
      Object.freeze({ id: 'winter-provender', title: 'Smokehouse & Store-Pit Keeper', visualKind: 'villager', district: 'market', role: 'agriculture' }),
      Object.freeze({ id: 'sled-wright', title: 'Runner & Bog-Iron Wright', visualKind: 'villager', district: 'craft', role: 'craft' }),
    ]),
  }),

  elenoria: Object.freeze({
    id: 'elenoria',
    displayName: 'Elenoria Canopy & Grove Realm',
    azgaarStateNames: Object.freeze(['Elenoria', 'Alveria', 'Vaeloria', 'Thornvale']),
    mappingConfidence: 'direct-name',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/guardians-of-harmony-elenorias-sacred-duty/',
    primaryCultures: Object.freeze(['elenori']),
    secondaryCultures: Object.freeze(['serpent-peoples', 'goblin-peoples', 'zuraldarr']),
    defaultLocalBranch: 'elenoria-elenori',
    faith: 'Sacred Duty of Living Harmony',
    polityForm: 'grove-stewardship-council',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'limestone-slate',
      kitFamily: 'Med',
      kitSkin: 'heartland',
      wallMaterial: 'pale-river-ashlar-and-pleached-heartwood-ribs',
      roofMaterial: 'curved-shingle-and-living-moss-leaf-slate',
      roofForm: 'swept-organic-pavilion-and-bough-gallery',
      roofPitch: 38,
      roofOverhang: 0.5,
      irregularity: 0.16,
      weathering: 0.28,
      foundationType: 'root-bridged-canopy',
      streetGrammar: 'organic-canopy-ring',
      dressingPreference: 'mossy-lanes',
      silhouetteSummary: 'Root-spanning stone bridges, living-bough council pavilions, botanical ward sanctuaries, terraced stream mills, and ranger canopy watch-platforms.',
    }),
    mandatoryLandmarks: Object.freeze([
      'elenoria/bough-council-pavilion',
      'elenoria/root-span-arch-bridge',
      'elenoria/grove-harmony-sanctuary',
      'elenoria/canopy-warden-outpost',
      'elenoria/terraced-herb-distillery',
      'elenoria/living-wood-craft-hall',
    ]),
    propPool: Object.freeze([
      'elenoria/understory-cottage',
      'elenoria/stream-weir-basin',
      'elenoria/suspended-walkway-span',
      'elenoria/seed-vault-shrine',
      'elenoria/wayfinder-lantern-bough',
      'elenoria/silviculture-tending-bench',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'grove-warden', title: 'Canopy Ward Sentinel', visualKind: 'paladin', district: 'garrison', role: 'defense' }),
      Object.freeze({ id: 'harmony-arbiter', title: 'Bough Council Arbiter', visualKind: 'villager', district: 'civic', role: 'administration' }),
      Object.freeze({ id: 'wood-shaper', title: 'Living-Wood Shaper', visualKind: 'villager', district: 'craft', role: 'craft' }),
      Object.freeze({ id: 'botanical-alchemist', title: 'Understory Herb Distiller', visualKind: 'villager', district: 'market', role: 'agriculture' }),
      Object.freeze({ id: 'seed-keeper', title: 'Sanctuary Seed Keeper', visualKind: 'villager', district: 'sacred', role: 'sacred' }),
    ]),
  }),

  umbrakor: Object.freeze({
    id: 'umbrakor',
    displayName: "Umbra'kor Dominion",
    azgaarStateNames: Object.freeze(["Umbra'kor", 'Umbrakor', 'Duskwatch', 'Nightsong', 'Netheris', 'Ravenshadow']),
    mappingConfidence: 'direct-name',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/the-umbrakor-dominions-pact-with-darkness/',
    primaryCultures: Object.freeze(['umbra-kori']),
    secondaryCultures: Object.freeze(['vondari', 'goblin-peoples', 'rakhnid-broods']),
    defaultLocalBranch: 'umbrakor-core',
    faith: 'Venemora & Pact with the Deep Shadow',
    polityForm: 'noble-house-dominion',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'granite-slate',
      kitFamily: 'Med',
      kitSkin: 'frost',
      wallMaterial: 'chiseled-columnar-basalt-and-obsidian-courses',
      roofMaterial: 'stepped-slate-terrace-and-cavern-drip-sheds',
      roofForm: 'vertical-buttressed-terrace-compound',
      roofPitch: 34,
      roofOverhang: 0.22,
      irregularity: 0.11,
      weathering: 0.36,
      foundationType: 'carved-basalt-ledge',
      streetGrammar: 'vertical-cavern-tier',
      dressingPreference: 'black-setts',
      silhouetteSummary: 'Cliff-hugging noble house compounds, void-spanning basalt arch bridges, spore/fungus cultivation halls, rift-seal checkpoints, and pale mineral wayfinders.',
    }),
    mandatoryLandmarks: Object.freeze([
      'umbrakor/cliff-house-compound',
      'umbrakor/void-arch-bridge',
      'umbrakor/vertical-terrace-block',
      'umbrakor/fungus-cultivation-hall',
      'umbrakor/house-market-balcony',
      'umbrakor/depth-warden-gate',
    ]),
    propPool: Object.freeze([
      'umbrakor/venemora-temple-hall',
      'umbrakor/rift-seal-checkpoint',
      'umbrakor/cavern-air-shaft',
      'umbrakor/pale-wayfinder',
      'umbrakor/underground-river-dock',
      'umbrakor/house-archive-vault',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'depth-warden', title: 'Rift-Seal & Depth Warden', visualKind: 'paladin', district: 'garrison', role: 'defense' }),
      Object.freeze({ id: 'house-archon', title: 'Noble House Archon', visualKind: 'paladin', district: 'civic', role: 'administration' }),
      Object.freeze({ id: 'venemora-acolyte', title: 'Vigil Acolyte of Venemora', visualKind: 'villager', district: 'sacred', role: 'sacred' }),
      Object.freeze({ id: 'myciculturist', title: 'Cavern Fungus Steward', visualKind: 'villager', district: 'agricultural', role: 'agriculture' }),
      Object.freeze({ id: 'shadow-factor', title: 'Balcony Exchange Factor', visualKind: 'villager', district: 'market', role: 'trade' }),
    ]),
  }),

  wyrmreach: Object.freeze({
    id: 'wyrmreach',
    displayName: 'Wyrmreach Dominion & Uncharted Interior',
    azgaarStateNames: Object.freeze(['Wyrmreach']),
    mappingConfidence: 'direct-name-architecture-uncertain',
    mappingNote: 'Published lore intentionally leaves inland Wyrmreach mysterious; coastal burgs use pragmatic local-peoples frontier architecture while inland sites use sparse windbreak refuges and rare smooth black pre-kingdom ruins.',
    loreStatus: 'published',
    loreSource: 'https://www.drusniel.com/the-mysteries-of-the-wyrmreach-dominion/',
    primaryCultures: Object.freeze(['orc-peoples', 'goblin-peoples', 'jotunn', 'serpent-peoples', 'rakhnid-broods', 'draconic-remnant']),
    secondaryCultures: Object.freeze([]),
    defaultLocalBranch: 'wyrmreach-orcs',
    faith: 'Frontier Ward-Keeping & Ancient Threshold Caution',
    polityForm: 'frontier-waystations-and-sealed-interior',
    architectureGrammar: Object.freeze({
      settlementStyleKey: 'granite-slate',
      kitFamily: 'Nordic',
      kitSkin: 'plains',
      wallMaterial: 'storm-pinned-drift-stone-and-salvaged-timber-bracing',
      roofMaterial: 'weighted-slab-roof-with-stone-wind-ties',
      roofForm: 'low-crouched-windbreak-shelter',
      roofPitch: 26,
      roofOverhang: 0.3,
      irregularity: 0.28,
      weathering: 0.62,
      foundationType: 'windbreak-rubble-shelter',
      streetGrammar: 'sparse-waystation-trail',
      dressingPreference: 'river-stone',
      silhouetteSummary: 'Storm-lashed coastal breakwaters and multi-people frontier waystations on the rim; sparse windbreak huts and rare, uncannily smooth black pre-kingdom thresholds inland.',
    }),
    mandatoryLandmarks: Object.freeze([
      'wyrmreach/storm-coast-waystation',
      'wyrmreach/frontier-cargo-breakwater',
      'wyrmreach/coastal-warning-lookout',
      'wyrmreach/mixed-community-market-shed',
      'wyrmreach/rock-windbreak-hut',
      'wyrmreach/ancient-smooth-stair',
    ]),
    propPool: Object.freeze([
      'wyrmreach/relic-survey-camp',
      'wyrmreach/impossible-measuring-plinth',
      'wyrmreach/gray-crust-descent-cover',
      'wyrmreach/storm-shielded-water-cache',
      'wyrmreach/old-rift-boundary-cairn',
      'wyrmreach/pre-kingdom-black-wall',
    ]),
    residentProfessions: Object.freeze([
      Object.freeze({ id: 'lookout-warden', title: 'Coastal Warning Lookout', visualKind: 'paladin', district: 'garrison', role: 'defense' }),
      Object.freeze({ id: 'waystation-quartermaster', title: 'Storm-Coast Quartermaster', visualKind: 'villager', district: 'market', role: 'trade' }),
      Object.freeze({ id: 'threshold-surveyor', title: 'Pre-Kingdom Ruin Surveyor', visualKind: 'villager', district: 'ruin', role: 'scholarship' }),
      Object.freeze({ id: 'breakwater-rigger', title: 'Breakwater Cargo Rigger', visualKind: 'villager', district: 'harbor', role: 'maritime' }),
    ]),
  }),
});

/**
 * Crosswalk from normalized Azgaar state names to canonical lore realm IDs,
 * preserving secondary Eldara polities (`docs/reference/eldara-local-cultures-populations.md`).
 */
export const STATE_NAME_TO_LORE_REALM = Object.freeze({
  lumeshire: 'lumeshire',
  zuraldi: 'zuraldi',
  stonehold: 'stonehold',
  ironpeak: 'stonehold',
  glimmerhold: 'stonehold',
  grukmar: 'grukmar',
  contia: 'contia',
  sunspire: 'contia',
  frostgard: 'frostgard',
  stormgarde: 'frostgard',
  elenoria: 'elenoria',
  alveria: 'elenoria',
  vaeloria: 'elenoria',
  thornvale: 'elenoria',
  "umbra'kor": 'umbrakor',
  umbrakor: 'umbrakor',
  duskwatch: 'umbrakor',
  nightsong: 'umbrakor',
  netheris: 'umbrakor',
  ravenshadow: 'umbrakor',
  wyrmreach: 'wyrmreach',
});

/**
 * Local culture branches from `docs/reference/eldara-local-cultures-populations.md`.
 */
export const LOCAL_CULTURE_BRANCHES = Object.freeze({
  'lumeshire-imperial': Object.freeze({
    id: 'lumeshire-imperial',
    cultureKey: 'lumish',
    loreRealm: 'lumeshire',
    azgaarStateName: 'Lumeshire',
    provinceContext: 'strong-majority',
    loreStatus: 'repo-authored',
    summary: 'Core Lumish Imperial administrative, agrarian, and cathedral-parish heartland.',
  }),
  'lumeshire-zuraldarr': Object.freeze({
    id: 'lumeshire-zuraldarr',
    cultureKey: 'zuraldarr',
    loreRealm: 'zuraldi',
    azgaarStateName: 'Lumeshire',
    provinceContext: 'enclave',
    loreStatus: 'published',
    summary: 'Autonomous Zuraldarr mountain-pass and highland communities within Lumeshire (Persbury, Westclesia, Pyreaz, Hatbury, Lexabusur).',
  }),
  'lumeshire-border-orcs': Object.freeze({
    id: 'lumeshire-border-orcs',
    cultureKey: 'orc-peoples',
    loreRealm: 'lumeshire',
    azgaarStateName: 'Lumeshire',
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: 'Borderland orcish settlements along the Pyreaz / Grukmar march.',
  }),
  'lumeshire-border-goblins': Object.freeze({
    id: 'lumeshire-border-goblins',
    cultureKey: 'goblin-peoples',
    loreRealm: 'lumeshire',
    azgaarStateName: 'Lumeshire',
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: 'Borderland goblin wetland/march trade settlements inside outer Lumeshire.',
  }),
  'ironpeak-vondari': Object.freeze({
    id: 'ironpeak-vondari',
    cultureKey: 'vondari',
    loreRealm: 'stonehold',
    azgaarStateName: 'Ironpeak',
    provinceContext: 'strong-majority',
    loreStatus: 'repo-authored',
    summary: 'Vondari mountain-hold mining, smelting, and fortress communities of Stonehold / Ironpeak.',
  }),
  'ironpeak-contract-orcs': Object.freeze({
    id: 'ironpeak-contract-orcs',
    cultureKey: 'orc-peoples',
    loreRealm: 'stonehold',
    azgaarStateName: 'Ironpeak',
    provinceContext: 'mixed-majority',
    loreStatus: 'repo-authored',
    summary: 'Contract-bound and frontier orcish heavy-haul and quarry settlements in Ironpeak.',
  }),
  'ironpeak-deep-umbrakori': Object.freeze({
    id: 'ironpeak-deep-umbrakori',
    cultureKey: 'umbra-kori',
    loreRealm: 'stonehold',
    azgaarStateName: 'Ironpeak',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: "Deep-seam Umbra'kori enclaves near Stonehold's subterranean approaches.",
  }),
  'grukmar-goblins': Object.freeze({
    id: 'grukmar-goblins',
    cultureKey: 'goblin-peoples',
    loreRealm: 'grukmar',
    azgaarStateName: 'Grukmar',
    provinceContext: 'mixed-majority',
    loreStatus: 'published',
    summary: 'Wetland, delta, and boardwalk-building goblin merchant-artisan communities of Grukmar.',
  }),
  'grukmar-orcs': Object.freeze({
    id: 'grukmar-orcs',
    cultureKey: 'orc-peoples',
    loreRealm: 'grukmar',
    azgaarStateName: 'Grukmar',
    provinceContext: 'mixed-majority',
    loreStatus: 'published',
    summary: 'Upland ridge-fortified orcish clan assembly and heavy-haul settlements of Grukmar.',
  }),
  'grukmar-rakhnid': Object.freeze({
    id: 'grukmar-rakhnid',
    cultureKey: 'rakhnid-broods',
    loreRealm: 'grukmar',
    azgaarStateName: 'Grukmar',
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: 'Rakhnid silk-weaving and marsh-canopy brood enclaves allied with Grukmar.',
  }),
  'grukmar-umbrakori': Object.freeze({
    id: 'grukmar-umbrakori',
    cultureKey: 'umbra-kori',
    loreRealm: 'grukmar',
    azgaarStateName: 'Grukmar',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: "Umbra'kori trade and intelligence enclaves within Grukmar.",
  }),
  'grukmar-jotunn': Object.freeze({
    id: 'grukmar-jotunn',
    cultureKey: 'jotunn',
    loreRealm: 'grukmar',
    azgaarStateName: 'Grukmar',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Highland Jotunn border steadings on Grukmar’s northern ridges.',
  }),
  'contian-core': Object.freeze({
    id: 'contian-core',
    cultureKey: 'contian',
    loreRealm: 'contia',
    azgaarStateName: 'Contia',
    provinceContext: 'strong-majority',
    loreStatus: 'published',
    summary: 'Scholarly and mercantile Contian League academy towns and river ports.',
  }),
  'contia-vondari': Object.freeze({
    id: 'contia-vondari',
    cultureKey: 'vondari',
    loreRealm: 'contia',
    azgaarStateName: 'Contia',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Vondari artificer, foundry, and hydraulic engineering wards within Contia.',
  }),
  'contia-serpent-enclaves': Object.freeze({
    id: 'contia-serpent-enclaves',
    cultureKey: 'serpent-peoples',
    loreRealm: 'contia',
    azgaarStateName: 'Contia',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Warm-basin Serpent Peoples river-trade and botanical enclaves in Contia.',
  }),
  'contia-goblin-quarters': Object.freeze({
    id: 'contia-goblin-quarters',
    cultureKey: 'goblin-peoples',
    loreRealm: 'contia',
    azgaarStateName: 'Contia',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Canal-side goblin dockworker and tinker quarters in Contian ports.',
  }),
  'contia-rakhnid': Object.freeze({
    id: 'contia-rakhnid',
    cultureKey: 'rakhnid-broods',
    loreRealm: 'contia',
    azgaarStateName: 'Contia',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Rakhnid silk-merchant enclaves in Contian trade cities.',
  }),
  'frostgard-norths': Object.freeze({
    id: 'frostgard-norths',
    cultureKey: 'norths',
    loreRealm: 'frostgard',
    azgaarStateName: 'Frostgard',
    provinceContext: 'mixed-majority',
    loreStatus: 'published',
    summary: 'Human Norths fjord, tundra, and hearth-longhall holds of Frostgard.',
  }),
  'frostgard-jotunn': Object.freeze({
    id: 'frostgard-jotunn',
    cultureKey: 'jotunn',
    loreRealm: 'frostgard',
    azgaarStateName: 'Frostgard',
    provinceContext: 'mixed-majority',
    loreStatus: 'published',
    summary: 'Jotunn megalithic stone-and-timber glacial steadings of Frostgard.',
  }),
  'frostgard-orcs': Object.freeze({
    id: 'frostgard-orcs',
    cultureKey: 'orc-peoples',
    loreRealm: 'frostgard',
    azgaarStateName: 'Frostgard',
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: 'Cold-adapted orcish hunting and ice-pass clans in Frostgard.',
  }),
  'frostgard-rakhnid': Object.freeze({
    id: 'frostgard-rakhnid',
    cultureKey: 'rakhnid-broods',
    loreRealm: 'frostgard',
    azgaarStateName: 'Frostgard',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Sub-glacial Rakhnid thermal-vent hollows in Frostgard.',
  }),
  'frostgard-goblins': Object.freeze({
    id: 'frostgard-goblins',
    cultureKey: 'goblin-peoples',
    loreRealm: 'frostgard',
    azgaarStateName: 'Frostgard',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Hot-spring and whaling-station goblin trapper camps in Frostgard.',
  }),
  'elenoria-elenori': Object.freeze({
    id: 'elenoria-elenori',
    cultureKey: 'elenori',
    loreRealm: 'elenoria',
    azgaarStateName: 'Elenoria',
    provinceContext: 'strong-majority',
    loreStatus: 'published',
    summary: 'Core Elenori canopy, root-bridge, and sacred grove stewardship settlements.',
  }),
  'elenoria-serpent-groves': Object.freeze({
    id: 'elenoria-serpent-groves',
    cultureKey: 'serpent-peoples',
    loreRealm: 'elenoria',
    azgaarStateName: 'Elenoria',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'River-glade Serpent Peoples herbalist sanctuaries in Elenoria.',
  }),
  'elenoria-goblin-tracks': Object.freeze({
    id: 'elenoria-goblin-tracks',
    cultureKey: 'goblin-peoples',
    loreRealm: 'elenoria',
    azgaarStateName: 'Elenoria',
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: 'Outer-margin goblin resin-tapping and trail-barter camps in Elenoria.',
  }),
  'elenoria-zuraldarr-wardens': Object.freeze({
    id: 'elenoria-zuraldarr-wardens',
    cultureKey: 'zuraldarr',
    loreRealm: 'elenoria',
    azgaarStateName: 'Elenoria',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Zuraldarr highland-edge grove wardens sharing druidic kinship with Elenoria.',
  }),
  'umbrakor-core': Object.freeze({
    id: 'umbrakor-core',
    cultureKey: 'umbra-kori',
    loreRealm: 'umbrakor',
    azgaarStateName: "Umbra'kor",
    provinceContext: 'strong-majority',
    loreStatus: 'published',
    summary: "Core Umbra'kori basalt cliff-compounds, cavern tiers, and Rift-warded cities.",
  }),
  'umbrakor-vondari-holdouts': Object.freeze({
    id: 'umbrakor-vondari-holdouts',
    cultureKey: 'vondari',
    loreRealm: 'umbrakor',
    azgaarStateName: "Umbra'kor",
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: "Fortified Vondari deep-mining holdouts and treaty wards within Umbra'kor.",
  }),
  'umbrakor-goblin-warrens': Object.freeze({
    id: 'umbrakor-goblin-warrens',
    cultureKey: 'goblin-peoples',
    loreRealm: 'umbrakor',
    azgaarStateName: "Umbra'kor",
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: "Lower-tier cavern goblin porter and fungus-tending warrens in Umbra'kor.",
  }),
  'umbrakor-rakhnid-deep': Object.freeze({
    id: 'umbrakor-rakhnid-deep',
    cultureKey: 'rakhnid-broods',
    loreRealm: 'umbrakor',
    azgaarStateName: "Umbra'kor",
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: "Chasm-spanning Rakhnid silk-bridge and Venemora-aligned broods in Umbra'kor.",
  }),
  'wyrmreach-orcs': Object.freeze({
    id: 'wyrmreach-orcs',
    cultureKey: 'orc-peoples',
    loreRealm: 'wyrmreach',
    azgaarStateName: 'Wyrmreach',
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: 'Storm-hardened orcish coastal waystations and windbreak camps on the Wyrmreach rim.',
  }),
  'wyrmreach-goblins': Object.freeze({
    id: 'wyrmreach-goblins',
    cultureKey: 'goblin-peoples',
    loreRealm: 'wyrmreach',
    azgaarStateName: 'Wyrmreach',
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: 'Wreck-salvage and cove-harbor goblin landings along the Wyrmreach coast.',
  }),
  'wyrmreach-jotunn': Object.freeze({
    id: 'wyrmreach-jotunn',
    cultureKey: 'jotunn',
    loreRealm: 'wyrmreach',
    azgaarStateName: 'Wyrmreach',
    provinceContext: 'plural-frontier',
    loreStatus: 'repo-authored',
    summary: 'Cyclopean windbreak steadings of Jotunn watch-clans in northern Wyrmreach.',
  }),
  'wyrmreach-serpent-enclaves': Object.freeze({
    id: 'wyrmreach-serpent-enclaves',
    cultureKey: 'serpent-peoples',
    loreRealm: 'wyrmreach',
    azgaarStateName: 'Wyrmreach',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Estuary and thermal-cove Serpent Peoples waystations on the Wyrmreach coast.',
  }),
  'wyrmreach-rakhnid': Object.freeze({
    id: 'wyrmreach-rakhnid',
    cultureKey: 'rakhnid-broods',
    loreRealm: 'wyrmreach',
    azgaarStateName: 'Wyrmreach',
    provinceContext: 'enclave',
    loreStatus: 'repo-authored',
    summary: 'Fissure-dwelling Rakhnid outposts along Wyrmreach escarpments.',
  }),
  'wyrmreach-draconic-remnant': Object.freeze({
    id: 'wyrmreach-draconic-remnant',
    cultureKey: 'draconic-remnant',
    loreRealm: 'wyrmreach',
    azgaarStateName: 'Wyrmreach',
    provinceContext: 'enclave',
    loreStatus: 'design-proposal',
    ruralOnly: true,
    summary: 'Uninhabited or trace-presence inland anomaly zones with smooth black pre-kingdom thresholds (0 burgs).',
  }),
});

/**
 * Six shared environmental overlays (`docs/asset-bible/areas/*.md`).
 * Gated strictly by physical geography, hydrology, biome, and site context — never by realm name alone.
 */
export const ENVIRONMENTAL_OVERLAYS = Object.freeze({
  'coast-harbor': Object.freeze({
    id: 'coast-harbor',
    displayName: 'Coast, Fishing Harbor & River-Port',
    promptFile: 'areas/coast-harbor.md',
    loreStatus: 'design-proposal',
    preconditions: Object.freeze({
      requiresWaterAccess: true,
      allowedWaterTypes: Object.freeze(['coast', 'estuary', 'navigable-river', 'lake-port', 'underground-river']),
    }),
    foundationAdaptation: 'pile-jetty-and-tide-quay',
    sharedAssets: Object.freeze([
      'coast-harbor/pile-jetty',
      'coast-harbor/fish-smoking-shed',
      'coast-harbor/tide-stair-quay',
      'coast-harbor/net-mending-bench',
      'coast-harbor/cargo-capstan',
    ]),
    forbiddenWhenAbsent: Object.freeze([
      'coast-harbor/pile-jetty',
      'coast-harbor/tide-stair-quay',
      'coast-harbor/cargo-capstan',
      'frostgard/ice-harbor-boathouse',
      'grukmar/goblin-boat-landing',
      'umbrakor/underground-river-dock',
      'wyrmreach/frontier-cargo-breakwater',
    ]),
  }),

  'mountain-pass': Object.freeze({
    id: 'mountain-pass',
    displayName: 'Mountain Pass, Terraced Settlement & Highland Commerce',
    promptFile: 'areas/mountain-pass.md',
    loreStatus: 'design-proposal',
    preconditions: Object.freeze({
      minSlope: 0.14,
      minElevation: 18,
      allowedBiomes: Object.freeze([9, 10, 11]),
    }),
    foundationAdaptation: 'stepped-retaining-terrace',
    sharedAssets: Object.freeze([
      'mountain-pass/pass-retaining-wall',
      'mountain-pass/switchback-parapet',
      'mountain-pass/upland-drainage-culvert',
      'mountain-pass/caravan-pack-rack',
      'mountain-pass/avalanche-refuge',
    ]),
    forbiddenWhenAbsent: Object.freeze([
      'mountain-pass/avalanche-refuge',
      'zuraldi/switchback-bridge',
    ]),
  }),

  'forest-canopy': Object.freeze({
    id: 'forest-canopy',
    displayName: 'Forest Floor, Canopy Town & Protected Grove',
    promptFile: 'areas/forest-canopy.md',
    loreStatus: 'design-proposal',
    preconditions: Object.freeze({
      requiresForest: true,
      allowedBiomes: Object.freeze([5, 6, 7, 8, 9]),
    }),
    foundationAdaptation: 'root-safe-stepped-plinth',
    sharedAssets: Object.freeze([
      'forest-canopy/root-step-path',
      'forest-canopy/canopy-support-joint',
      'forest-canopy/forest-herb-garden',
      'forest-canopy/elevated-ranger-platform',
      'forest-canopy/living-arch-gateway',
    ]),
    forbiddenWhenAbsent: Object.freeze([
      'forest-canopy/canopy-support-joint',
      'forest-canopy/elevated-ranger-platform',
    ]),
  }),

  'swamp-bog': Object.freeze({
    id: 'swamp-bog',
    displayName: 'Bog, Swamp Boardwalk & Raised Market',
    promptFile: 'areas/swamp-bog.md',
    loreStatus: 'design-proposal',
    preconditions: Object.freeze({
      requiresWetland: true,
      allowedBiomes: Object.freeze([12]),
    }),
    foundationAdaptation: 'braced-timber-stilts-and-corduroy-causeway',
    sharedAssets: Object.freeze([
      'swamp-bog/raised-boardwalk',
      'swamp-bog/reed-cutting-shed',
      'swamp-bog/flatwater-skiff',
      'swamp-bog/bog-pole-marker',
      'swamp-bog/mud-island-causeway',
    ]),
    forbiddenWhenAbsent: Object.freeze([
      'swamp-bog/flatwater-skiff',
      'swamp-bog/mud-island-causeway',
      'grukmar/bog-stilt-dwelling',
      'grukmar/raised-marsh-boardwalk',
    ]),
  }),

  'underground-cavern': Object.freeze({
    id: 'underground-cavern',
    displayName: 'Inhabited Cavern & Deep Infrastructure',
    promptFile: 'areas/underground-cavern.md',
    loreStatus: 'design-proposal',
    preconditions: Object.freeze({
      requiresUnderground: true,
      forbidsSky: true,
    }),
    foundationAdaptation: 'rock-cut-shelf-and-arch-bracket',
    sharedAssets: Object.freeze([
      'underground-cavern/deep-walkway-arch',
      'underground-cavern/cavern-drain-channel',
      'underground-cavern/shaft-air-damper',
      'underground-cavern/cavern-lift-platform',
      'underground-cavern/dim-wayfinding-crystal',
    ]),
    forbiddenWhenAbsent: Object.freeze([
      'underground-cavern/shaft-air-damper',
      'underground-cavern/dim-wayfinding-crystal',
    ]),
  }),

  'ruins-rift': Object.freeze({
    id: 'ruins-rift',
    displayName: 'Ancient Ruins, Abandoned Sites & Anomaly Threshold',
    promptFile: 'areas/ruins-rift.md',
    loreStatus: 'design-proposal',
    preconditions: Object.freeze({
      requiresRuinOrAnomalyContext: true,
    }),
    foundationAdaptation: 'fractured-ashlar-and-smooth-monolith-seam',
    sharedAssets: Object.freeze([
      'ruins-rift/buried-threshold',
      'ruins-rift/broken-arch-section',
      'ruins-rift/sealed-ward-plaque',
      'ruins-rift/archaeologist-tool-roll',
      'ruins-rift/anomaly-scar-stone',
    ]),
    forbiddenWhenAbsent: Object.freeze([
      'ruins-rift/buried-threshold',
      'ruins-rift/anomaly-scar-stone',
      'wyrmreach/ancient-smooth-stair',
      'wyrmreach/impossible-measuring-plinth',
    ]),
  }),
});

/**
 * Look up the canonical culture/seed entry from an Azgaar source culture ID or canonical key.
 */
export function resolveCultureEntry(cultureIdOrKey) {
  if (Number.isSafeInteger(Number(cultureIdOrKey)) && cultureIdOrKey !== '' && cultureIdOrKey !== null) {
    const id = Number(cultureIdOrKey);
    if (AZGAAR_CULTURE_SOURCE_MAP[id]) return AZGAAR_CULTURE_SOURCE_MAP[id];
  }
  if (typeof cultureIdOrKey === 'string') {
    const normalized = cultureIdOrKey.trim().toLowerCase();
    const sourceId = CULTURE_KEY_TO_SOURCE_ID[normalized];
    if (sourceId !== undefined) return AZGAAR_CULTURE_SOURCE_MAP[sourceId];
    const byName = Object.values(AZGAAR_CULTURE_SOURCE_MAP).find(
      (entry) => entry.sourceName.toLowerCase() === normalized,
    );
    if (byName) return byName;
  }
  return null;
}

/**
 * Validate the VisualIdentityCatalog invariants against `config/cultures.yaml` when provided.
 */
export function validateVisualIdentityCatalog(cultureCatalog = null) {
  const errors = [];
  for (let sourceId = 0; sourceId <= 13; sourceId += 1) {
    const entry = AZGAAR_CULTURE_SOURCE_MAP[sourceId];
    if (!entry) {
      errors.push(`Missing AZGAAR_CULTURE_SOURCE_MAP entry for sourceId ${sourceId}`);
      continue;
    }
    if (cultureCatalog?.sourceMappings) {
      const mapping = cultureCatalog.sourceMappings.find((m) => m.sourceId === sourceId);
      if (!mapping) {
        errors.push(`cultures.yaml missing sourceMapping for sourceId ${sourceId}`);
      } else {
        const expectedKey = mapping.targetType === 'none' ? 'none' : mapping.targetKey;
        if (entry.key !== expectedKey || entry.targetType !== mapping.targetType) {
          errors.push(`Culture mapping mismatch for sourceId ${sourceId}: ${entry.key} vs ${expectedKey}`);
        }
      }
    }
  }

  for (const [realmId, realm] of Object.entries(LORE_REALM_CATALOG)) {
    if (realm.id !== realmId) errors.push(`Realm id mismatch: ${realmId}`);
    if (!MAPPING_CONFIDENCE_VALUES.includes(realm.mappingConfidence)) {
      errors.push(`Invalid mappingConfidence for ${realmId}: ${realm.mappingConfidence}`);
    }
    if (!LORE_PROVENANCE_VALUES.includes(realm.loreStatus)) {
      errors.push(`Invalid loreStatus for ${realmId}: ${realm.loreStatus}`);
    }
    if (!realm.mandatoryLandmarks?.length) {
      errors.push(`Realm ${realmId} must declare mandatoryLandmarks`);
    }
    if (!realm.residentProfessions?.length) {
      errors.push(`Realm ${realmId} must declare residentProfessions`);
    }
  }

  if (LORE_REALM_CATALOG.stonehold?.mappingConfidence !== 'requires-confirmation') {
    errors.push('Stonehold <-> Ironpeak crosswalk must preserve mappingConfidence: requires-confirmation');
  }
  if (LORE_REALM_CATALOG.wyrmreach?.mappingConfidence !== 'direct-name-architecture-uncertain') {
    errors.push('Wyrmreach crosswalk must preserve mappingConfidence: direct-name-architecture-uncertain');
  }

  for (const [branchId, branch] of Object.entries(LOCAL_CULTURE_BRANCHES)) {
    if (branch.id !== branchId) errors.push(`Branch id mismatch: ${branchId}`);
    if (CULTURE_KEY_TO_SOURCE_ID[branch.cultureKey] === undefined) {
      errors.push(`Branch ${branchId} references unknown cultureKey ${branch.cultureKey}`);
    }
    if (!LORE_REALM_CATALOG[branch.loreRealm]) {
      errors.push(`Branch ${branchId} references unknown loreRealm ${branch.loreRealm}`);
    }
    if (!PROVINCE_CONTEXT_VALUES.includes(branch.provinceContext)) {
      errors.push(`Branch ${branchId} has invalid provinceContext ${branch.provinceContext}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
