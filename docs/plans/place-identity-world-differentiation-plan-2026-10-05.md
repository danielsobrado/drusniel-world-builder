# Place Identity and World Differentiation Plan

Status: Proposed  
Date: 2026-10-05  
Scope: Drusniel World Builder / Azgaar world simulator

## Purpose

The project already has strong foundations for a large procedural RPG world:

- Azgaar Full JSON import with states, provinces, cultures, religions, burgs, routes, rivers, markers, zones, and notes.
- Infinite streamed terrain with canonical world coordinates.
- Distinct Azgaar biomes and climate/hydrology guidance.
- Regional vegetation character.
- Procedural settlement generation.
- Procedural building generation and reusable building pools.
- Settlement residents.
- Deterministic world simulation for economy, logistics, population, factions, conflict, RPG opportunities, combat, simulation LOD, replay, and persistence.

The next major quality improvement should not be another isolated procedural generator.

The main goal is to make every region, settlement, culture, and historical area feel like a specific place with its own identity.

A player should be able to travel across the world and recognize meaningful differences in:

- Landscape.
- Architecture.
- Settlement layout.
- Economy.
- Religion.
- Politics.
- Local materials.
- NPC appearance and roles.
- History.
- Current problems.
- Visible consequences of simulation.
- Stories and opportunities.

The core architectural principle is:

> The canonical world and simulation decide what a place is and what happened there. Rendering decides what those facts look like. Narrative presentation decides how those facts are explained to the player.

Do not let the renderer invent canonical facts. Do not let an LLM or quest generator invent canonical outcomes independently from the simulation.

---

# 1. Current strengths

## 1.1 Macro world differentiation

The imported world already preserves useful Azgaar information.

The importer retains:

- States.
- Provinces.
- Cultures.
- Religions.
- Burgs.
- Rivers.
- Routes.
- Markers.
- Zones.
- Notes.
- Biomes.
- Population.
- Harbor/haven information.
- Climate and hydrology guidance.
- Terrain morphology guidance.

The world map can already visualize political, province, culture, religion, biome, height, and physical views.

This is an excellent source for place identity.

## 1.2 Natural environment differentiation

The terrain and stylized rendering systems already produce substantial environmental variation.

Examples include:

- All standard Azgaar biome IDs remain distinct.
- Custom biome IDs are preserved.
- Biome-specific grass palettes and silhouettes.
- Tree and understory variation.
- Snow and cold-region effects.
- Water and wetlands.
- Weather.
- Regional natural character through `RegionalCharacterField`.

`RegionalCharacterField` is especially useful because it establishes a reusable idea: broad deterministic regional character derived from canonical world coordinates.

That same concept should be extended from nature to civilization.

## 1.3 Settlement generation foundation

The settlement system already has useful procedural structure.

Important current components include:

- `SettlementField`
- `SettlementPlanner`
- `SettlementProfile`
- `SettlementStreets`
- `SettlementPlots`
- `SettlementDecor`
- `SettlementDefences`
- `SettlementBuildingCatalog`
- `SettlementResidents`

The planner already supports:

- Hamlet, village, town, city, and metropolis scale.
- Main streets.
- Ring roads.
- Side lanes.
- Market squares.
- Houses.
- Townhouses.
- Shops.
- Taverns.
- Smithies.
- Bakeries.
- Warehouses.
- Chapels.
- Farmhouses.
- Barns.
- Keeps.
- Walls.
- Gatehouses.
- Towers.
- Markets and street props.
- Farms and field belts.
- Route-aware settlement entrances.

These systems should be evolved rather than replaced.

## 1.4 Simulation foundation

The `src/sim` layer already contains many of the systems needed to create dynamic stories.

Important existing capabilities include:

- Canonical world state.
- Geographic graph.
- Deterministic world clock.
- Settlement economy.
- Production and consumption.
- Inventories.
- Prices.
- Physical shipments.
- Population cohorts.
- Migration-related population systems.
- Factions.
- Relationships.
- Embargoes.
- Conflicts.
- Military companies.
- RPG opportunities.
- Contracts.
- Persistent consequences.
- Encounter sites.
- Combat.
- Hierarchical simulation LOD.
- Save/replay/checksum infrastructure.
- Presentation view models and reason codes.

This is much more valuable than random quest generation because stories can emerge from real world conditions.

---

# 2. Current problem

The natural world can vary significantly, but settlements and civilization still collapse much of the world data into a small number of visual and structural outcomes.

The main example is `SettlementProfile.js`.

At present, settlement identity is mainly derived from:

- Population class.
- A small number of burg flags.
- A culture hash selecting one of four style presets.

The four current style families are approximately:

- granite + slate
- limestone + terracotta
- sandstone + terracotta
- limestone + slate

This is useful as a first implementation but too small for a world where cultures and regions are expected to feel distinct.

Two unrelated cultures can currently resolve to equivalent architecture.

## 2.1 Repeated settlement grammar

`SettlementPlots.js` currently uses a largely shared building mix.

Core, middle, and edge zones are variations of the same general vocabulary.

Most settlements share combinations of:

- house
- townhouse
- shop
- tavern
- smithy
- bakery
- warehouse

The landmark logic is also largely universal.

## 2.2 Repeated decoration grammar

`SettlementDecor.js` provides good detail, but most places share the same decoration vocabulary:

- wells
- market stalls
- lanterns
- planters
- shrines
- signposts
- benches
- carts
- barrels
- fences

This makes technically detailed settlements still feel related to one global kit.

## 2.3 Repeated resident identity

`ResidentManifest.js` currently focuses on generic villagers, with a paladin used for the first resident of a capital.

This is intentionally lightweight, but eventually local residents should represent:

- Culture.
- Profession.
- Religion.
- Wealth.
- Faction.
- Local economy.
- Current settlement conditions.

## 2.4 Simulation and local realization are too separate

The simulation layer already understands shortages, trade, factions, danger, conflict, contracts, population, and other world changes.

The rendered settlement does not yet expose enough of those facts.

For example:

A settlement may have a food shortage in the simulation but still visually look like a normal healthy settlement.

A dangerous road may be represented by a danger value but not by visible patrols, abandoned carts, warning signs, camps, or damaged infrastructure.

A conflict may exist at the macro level without visibly changing the local town.

The simulation should increasingly become an input to local 3D realization.

---

# 3. Core concept: PlaceIdentity

Introduce a canonical deterministic resolver called conceptually:

`PlaceIdentity`

A place identity is not a second mutable world database.

It is a derived view over canonical world definition, imported Azgaar metadata, geographic context, and simulation state.

A place can be:

- A settlement.
- A province.
- A state.
- A wilderness region.
- A route segment.
- A historical site.
- A local landmark area.

The resolver should answer:

> What makes this place this place?

Example:

```yaml
id: settlement:142
name: Varekh

geography:
  biome: taiga
  climate: cold_wet
  coast: true
  river: false
  elevationClass: lowland
  ruggedness: 0.31
  localMaterials:
    - timber
    - granite
    - slate

culture:
  id: culture:8
  family: varethi
  architecturalTradition: varethi_northern
  languageStyle: varethi
  preferredColors:
    - dark_green
    - charcoal
    - bone

religion:
  id: religion:4
  tradition: ancestor_cult
  sacredArchitecture: ancestor_hall
  roadsideShrines: true

politics:
  stateId: region:state:3
  factionId: faction:3
  borderRegion: true
  militaryPressure: 0.62

economy:
  primaryRoles:
    - fishing
    - forestry
    - salt
  wealth: poor
  marketImportance: regional
  tradeAccess: coastal

history:
  foundedEra: old
  borderWars: 2
  majorEvents:
    - varekh_fire
    - northern_war

current:
  foodSecurity: 0.74
  unrest: 0.28
  routeDanger: 0.61
  conflictNearby: true

settlement:
  class: town
  role: fishing_port
  layoutGrammar: coastal_harbor
  architectureGrammar: varethi_northern_coastal
```

This identity should be deterministic.

The same world seed, imported source, simulation state, and configuration must produce the same identity.

---

# 4. PlaceIdentity architecture

Suggested modules:

```text
src/worldIdentity/
  PlaceIdentityResolver.js
  PlaceContext.js
  GeographyIdentity.js
  CultureIdentity.js
  ReligionIdentity.js
  EconomyIdentity.js
  PoliticalIdentity.js
  HistoricalIdentity.js
  SettlementRoleResolver.js
  ArchitectureGrammarResolver.js
  SettlementGrammarResolver.js
```

Configuration should remain outside logic.

Suggested configuration:

```text
config/
  cultures.yaml
  religions.yaml
  architecture.yaml
  settlement-roles.yaml
  settlement-grammars.yaml
  regional-materials.yaml
  historical-archetypes.yaml
```

Avoid one giant configuration file.

Each file should have a clear responsibility.

---

# 5. Culture must become a real gameplay and visual concept

Culture should no longer resolve only to one material preset.

A culture profile should define tendencies.

Example:

```yaml
cultures:
  varethi:
    architecture:
      families:
        - northern_timber_stone
      walls:
        timber: 0.55
        stone: 0.35
        plaster: 0.10
      roofs:
        slate: 0.65
        wood_shingle: 0.35
      roofPitch:
        min: 42
        max: 58
      floors:
        preferred: [1, 2]
      features:
        deepEaves: 0.8
        balconies: 0.25
        courtyards: 0.05
        shutters: 0.7
        chimneys: 0.9

    settlement:
      preferredLayouts:
        organic_cluster: 0.4
        road_village: 0.35
        river_linear: 0.25

    decoration:
      fenceFamilies:
        - split_timber
        - stacked_stone
      shrineFamilies:
        - ancestor_post
        - stone_cairn

    clothing:
      materials:
        - wool
        - leather
      paletteFamily: northern_muted
```

Culture profiles should affect:

- Building shape.
- Materials.
- Roof style.
- Floor count.
- Window style.
- Doors.
- Balconies.
- Courtyards.
- Chimneys.
- Arcades.
- Defensive structures.
- Street furniture.
- Fences.
- Signage.
- Market appearance.
- Religious architecture.
- Clothing.
- Local naming presentation.

Do not create a unique mesh library for every culture.

Use procedural grammar and reusable components.

---

# 6. Architecture = Culture × Geography × Wealth × Role

Culture alone is not enough.

The same culture should adapt to local environment.

The architecture resolver should combine:

```text
Architecture =
  Cultural Tradition
  × Climate
  × Local Materials
  × Terrain
  × Settlement Role
  × Wealth
  × Political Conditions
  × Historical Conditions
```

Examples:

## Northern mountain branch

- Stone foundations.
- Heavy masonry lower floors.
- Timber upper floors.
- Steep roofs.
- Slate roofs.
- Small openings.
- Large chimneys.
- Terraced streets.
- Retaining walls.

## Same culture on a wet coast

- Timber remains recognizable.
- Larger roof overhang.
- More raised foundations.
- Fish sheds.
- Warehouses.
- Rope, net, dock, and drying props.
- Salt-weathered surfaces.
- Less dense defensive architecture.

## Same culture in a wealthy regional capital

- More masonry.
- Larger multi-floor houses.
- Formal civic buildings.
- Larger markets.
- Better paving.
- Decorative facades.
- Administrative compounds.

This gives variation without losing cultural continuity.

---

# 7. Local material system

Add a derived regional material palette.

Inputs can include:

- Biome.
- Geology approximation.
- Mountainness.
- Forest coverage.
- Climate.
- Rivers.
- Coast.
- Trade connectivity.

Material examples:

- granite
- limestone
- sandstone
- fieldstone
- riverstone
- clay brick
- timber
- bamboo-like construction material where appropriate to the fictional culture
- slate
- terracotta
- wood shingles
- thatch
- plaster

A local material should have:

- availability
- local cost
- prestige
- weathering behavior
- construction suitability

Imported cultures should prefer materials, but local scarcity should matter.

A wealthy trade city can import prestigious materials.

A poor isolated settlement should mostly build from what is locally available.

---

# 8. Settlement roles

Every settlement should get one or more economic/social roles.

Example roles:

- subsistence_farming
- grain_producer
- vineyard
- pastoral
- fishing
- salt_producer
- mining
- quarry
- forestry
- river_port
- sea_port
- market_town
- crossroads
- fortress
- border_garrison
- pilgrimage
- temple_center
- administrative
- royal_capital
- manufacturing
- artisan_center
- frontier
- university_or_scholarship if appropriate to the world
- ruined_or_declining

Role assignment should use real world conditions.

For example:

```text
Fishing:
  coast or major river
  suitable population
  water access

Mining:
  mountain/ruggedness
  mineral-resource abstraction
  route access modifies scale

Market town:
  graph centrality
  nearby settlements
  route intersection
  population

Fortress:
  border pressure
  terrain defensibility
  conflict history
  capital/state policy
```

The simulation should later be able to change role importance over time.

---

# 9. Make settlement role physically visible

Role should affect the 3D settlement.

## Fishing village

Add:

- docks
- small boats
- nets
- drying racks
- fish baskets
- sheds
- smokehouses
- waterfront market
- salt storage

## Mining settlement

Add:

- mine entrance nearby
- ore carts
- stockpiles
- blacksmith activity
- timber supports
- dirty industrial yards
- worker housing

## Farming village

Add:

- barns
- granaries
- mills
- animal pens
- larger farm belts
- carts
- irrigation where appropriate

## Trade town

Add:

- warehouses
- caravan yards
- larger market
- inns
- stables
- multiple route entrances
- weigh station
- richer merchant houses

## Border fortress

Add:

- walls or palisades
- towers
- barracks
- drill yard
- checkpoints
- banners
- supply yards
- refugee camp during war

The settlement role must be visible without opening a UI.

---

# 10. Settlement layout grammars

Replace the current mostly shared street grammar with selectable settlement grammars.

Do not delete the current street planner.

Refactor it into reusable strategies.

Suggested grammars:

## road_village

Buildings grow along one important road.

Best for:

- small villages
- frontier settlements
- trade routes

## river_linear

Settlement follows a river bank.

Features:

- parallel main street
- bridge concentration
- mills
- docks
- flood-aware placement

## coastal_harbor

Settlement wraps around a bay or harbor.

Features:

- waterfront road
- docks
- warehouses
- uphill residential streets
- harbor market

## crossroads

Four or more route directions meet.

Features:

- central market
- inns
- stables
- dense route-facing commercial core

## organic_cluster

Irregular medieval growth.

Features:

- narrow curved lanes
- irregular blocks
- small plazas
- older core

## hill_fort

Settlement grows around a fortified high point.

Features:

- keep/citadel at high ground
- radial descent
- switchback streets
- defensive perimeter

## walled_radial

A development of the current planner.

Features:

- gates aligned to important roads
- ring streets
- strong center
- defensive wall

## planned_grid

Used for:

- newly founded settlements
- administrative capitals
- colonies
- rebuilt cities

## terraced_mountain

Uses contour-following roads.

Features:

- terraces
- stairs
- retaining walls
- limited flat building pads

## delta_or_canal

Optional later grammar.

Features:

- waterways
- bridges
- narrow islands
- warehouses
- trade infrastructure

---

# 11. Settlement grammar selection

Selection should be deterministic and based on conditions.

Example scoring:

```text
coastal_harbor += harborPotential
coastal_harbor += portFlag
coastal_harbor += tradeImportance

river_linear += riverProximity
river_linear += riverTrade

hill_fort += defensibility
hill_fort += borderPressure
hill_fort += citadelFlag

crossroads += routeDegree
crossroads += marketImportance

planned_grid += recentFoundation
planned_grid += administrativeRole

terraced_mountain += slope
terraced_mountain += ruggedness
```

Culture then biases the result.

History can override it.

Example:

A planned capital destroyed during a war might regrow as a mixed grid + organic settlement.

---

# 12. Cities need districts

A city should not be only a larger village.

Add a `DistrictPlanner` above `SettlementPlanner`.

Suggested districts:

- old_town
- market
- civic
- noble
- temple
- artisan
- docks
- warehouse
- military
- residential
- poor_quarter
- gardens
- university
- industrial
- suburban
- farm_outskirts

Each district should define:

- building mix
- density
- street style
- prop family
- wealth
- road width
- landmark probability
- resident professions
- cleanliness/weathering
- lighting density
- defensive importance

Example:

```text
City
├── Old Town
│   ├── narrow lanes
│   ├── old temple
│   └── dense mixed buildings
├── Market Quarter
│   ├── central square
│   ├── shops
│   ├── taverns
│   └── warehouses
├── Docks
│   ├── piers
│   ├── cranes
│   ├── fish market
│   └── warehouses
├── Noble/Civic Quarter
│   ├── palace/governor hall
│   ├── gardens
│   └── wider streets
└── Outer District
    ├── poorer housing
    ├── workshops
    └── farms
```

Districts should remain aggregate until locally streamed.

---

# 13. Culture-specific building vocabulary

The building catalog should support semantic categories rather than one universal look.

For example:

```text
house
shop
tavern
smithy
temple
warehouse
civic
farm
military
industrial
monument
```

A culture/architecture grammar decides the realization.

For example:

`temple` for one religion might produce:

- tower shrine

Another:

- courtyard sanctuary

Another:

- longhouse temple

Another:

- domed stone complex

The planner should request semantic function.

The architecture layer should choose form.

This avoids hard-coding religion-specific logic into settlement plotting.

---

# 14. Religion should be visible

Religion is already imported but should become much more important locally.

Religion can influence:

- Main sacred building.
- Small shrines.
- Burial practices.
- Cemeteries.
- Roadside monuments.
- Pilgrimage roads.
- Sacred trees or groves.
- Statues.
- Processional plazas.
- Religious clothing.
- Festival decoration.

Religious buildings should be major settlement landmarks.

A player should often be able to identify the dominant religion from the skyline.

---

# 15. Factions and political identity should be visible

Faction state should affect:

- banners
- colors
- guards
- checkpoints
- heraldic signs
- administration buildings
- military presence
- walls
- patrol density
- propaganda or public notices
- occupied settlement visuals

Different political regimes can later influence:

- tax infrastructure
- guard presence
- public order
- civic architecture
- settlement maintenance

Do not encode these only as cosmetic random variants.

They should reflect canonical faction state.

---

# 16. Connect simulation to visible settlement state

This is one of the highest-value improvements.

Create a local realization adapter such as:

```text
SimulationState
   ↓
SettlementConditionView
   ↓
VisualConditionResolver
   ↓
3D local realization
```

The resolver should create visual tags.

Example:

```yaml
prosperity: 0.72
foodShortage: 0.15
unrest: 0.42
warPressure: 0.81
routeDanger: 0.6
populationTrend: growing
tradeActivity: high

visualTags:
  - busy_market
  - guarded_gates
  - military_patrols
  - construction_activity
  - refugee_presence
```

---

# 17. Examples of visible simulation consequences

## Food shortage

Possible effects:

- fewer market stalls
- empty baskets
- fewer livestock
- queues near granary
- beggars
- higher guard presence if unrest increases
- abandoned fields if shortage is caused by war or migration

## Prosperity

Possible effects:

- construction scaffolding
- cleaner streets
- larger markets
- more caravans
- richer facade variants
- expanded outskirts
- more decorative lighting

## War

Possible effects:

- checkpoints
- barricades
- militia
- supply carts
- damaged houses
- closed shops
- refugees
- temporary camps
- banners
- fortified gates

## Dangerous trade route

Possible effects:

- warning sign
- abandoned wagon
- graves
- guard patrol
- merchant convoy waiting in town
- reduced market activity

## Epidemic or severe population decline

Possible effects:

- quiet streets
- closed buildings
- temporary graves
- reduced market activity
- abandoned houses

These should be driven by thresholds and reason codes, not random storytelling.

---

# 18. Stories should emerge from world state

The current RPG consequence pipeline is the correct architectural direction.

Examples already present include:

- dangerous route → opportunity to clear it
- shortage → opportunity to deliver food

Expand this into a general system.

A story should usually begin with a real simulation fact.

Example:

```text
Bandits occupy mountain road
        ↓
Shipment cannot pass
        ↓
Grain delivery is delayed
        ↓
Food inventory drops
        ↓
Food prices rise
        ↓
Unrest increases
        ↓
Local faction reacts
        ↓
Contract is generated
        ↓
Player clears bandits
        ↓
Route danger falls
        ↓
Shipment resumes
        ↓
Food reaches town
        ↓
Price pressure falls
        ↓
Faction/player reputation changes
```

This is a much stronger story than a randomly generated quest saying:

> Kill ten bandits.

The world supplies the reason.

---

# 19. World Chronicle

Add a structured historical event system.

Suggested conceptual module:

```text
src/sim/history/
  WorldChronicle.js
  HistoricalEvent.js
  HistoricalFactIndex.js
  HistoricalSiteResolver.js
```

Possible event categories:

- settlement_founded
- settlement_expanded
- settlement_declined
- ruler_crowned
- ruler_died
- battle
- siege
- rebellion
- famine
- epidemic
- migration
- religious_schism
- pilgrimage
- discovery
- trade_boom
- mine_opened
- mine_exhausted
- bridge_destroyed
- bridge_rebuilt
- monster_attack
- settlement_sacked
- settlement_rebuilt
- hero_deed
- treaty
- border_change

Events should be structured data.

Example:

```yaml
id: history:battle:937
type: battle
tick: 123421
locationId: region:province:17
participants:
  - faction:3
  - faction:8
winner: faction:3
casualties:
  estimated: 640
effects:
  routeDangerDelta: 0.4
  settlementDamage:
    settlement:142: 0.31
importance: 0.82
```

Do not store only prose.

---

# 20. History should become physical

Historical facts should produce world details.

Examples:

Battle:

- graves
- ruined fortifications
- memorial
- abandoned weapons
- battlefield marker

Old settlement fire:

- rebuilt architecture
- burned ruins outside rebuilt area
- different district age

Destroyed bridge:

- broken bridge remains
- ferry crossing
- temporary route

Religious event:

- shrine
- monastery
- pilgrimage destination

Famous hero:

- statue
- named inn
- monument
- NPC dialogue reference

This creates a world where history is visible.

---

# 21. Use Azgaar markers, notes, and zones as authored history seeds

The importer already preserves markers, notes, and zones.

Convert them into canonical world facts where possible.

Examples:

Azgaar marker:

```text
Ancient Ruins
```

becomes:

```yaml
historicalSite:
  type: ruins
  origin: azgaar_marker
  importance: authored
```

A note can provide:

- site description
- old event
- local legend
- ruler history
- battle summary

A zone can seed:

- disputed region
- cursed land
- battlefield
- old empire
- religious territory
- monster-infested wilderness

Authored data should take priority over generated history.

---

# 22. NPC identity

Do not globally instantiate every person.

Keep the current simulation LOD approach.

At local simulation tier, instantiate representative NPCs.

NPC role should derive from:

- settlement economy
- population cohorts
- district
- culture
- religion
- faction
- wealth
- current conditions

Possible professions:

- farmer
- fisher
- miner
- woodcutter
- baker
- smith
- merchant
- caravan master
- sailor
- priest
- guard
- soldier
- noble
- administrator
- healer
- hunter
- beggar
- refugee

Important people should be promoted to persistent named characters.

Examples:

- mayor
- governor
- priest
- faction leader
- guard captain
- merchant prince
- guild leader
- criminal leader
- famous artisan

These identities should survive local simulation demotion.

---

# 23. Clothing and NPC visuals

Resident visuals should use place identity.

Inputs:

```text
culture
+ climate
+ profession
+ wealth
+ faction
+ religion
+ settlement role
```

Examples:

A fisherman in a northern culture and a wealthy merchant from the same culture should still look related while being obviously different professions and social classes.

Faction soldiers should use faction identity.

Religious NPCs should use religious identity.

Avoid one global villager look.

---

# 24. Regional wilderness identity

Place differentiation should not stop at settlement walls.

Each broad area should gain environmental character.

Possible regional modifiers:

- meadow-heavy
- dense forest
- rocky
- scrub
- marshy
- burned
- ancient forest
- cultivated
- heavily hunted
- sacred grove
- corrupted
- war-damaged
- abandoned farmland
- logging region

The existing `RegionalCharacterField` is a strong foundation.

Extend the concept with additional deterministic fields rather than replacing it.

Possible conceptual channels:

```text
naturalCharacter:
  meadow
  forest
  scrub
  rocky

civilizationCharacter:
  cultivated
  grazed
  logged
  hunted
  sacred
  disturbed

historicalCharacter:
  battleDamage
  abandonment
  ruins
  oldRoadDensity
```

Do not store full-resolution masks unless necessary.

Prefer deterministic coarse fields and sparse authored overrides.

---

# 25. Roads should tell stories

Routes should vary by:

- importance
- wealth
- terrain
- state investment
- local culture
- traffic
- danger
- history

Possible road classes:

- foot trail
- rural track
- maintained road
- trade road
- royal road
- military road
- ancient road
- ruined road

Visible differences:

- width
- paving
- drainage
- milestones
- bridges
- roadside shrines
- signs
- inns
- patrols
- wagon traffic
- maintenance
- damage

The same route can change over time.

---

# 26. Borders should feel like borders

Political borders should occasionally create physical differences.

Not every border requires a wall.

Possible border manifestations:

- customs post
- patrol
- milestone
- banner
- road quality change
- architecture transition
- language/signage change
- shrine style change
- guard uniform change
- abandoned fort
- checkpoint during conflict

Border intensity should depend on:

- faction relationship
- conflict state
- trade
- geography
- route importance

---

# 27. Settlement uniqueness budget

Every settlement should have a small deterministic uniqueness budget.

Even settlements sharing culture, biome, and role should not be clones.

Generate a few stable local traits.

Examples:

- unusually large central tree
- famous bridge
- double market square
- red roof tradition
- many balconies
- stone boundary walls
- local flower gardens
- unusual tower type
- dense orchard belt
- famous inn
- old ruined gate
- sacred pond
- memorial avenue

These traits should come from a constrained grammar.

Do not generate arbitrary nonsense.

A useful target:

- hamlet: 1 local trait
- village: 1–2
- town: 2–3
- city: 3–5
- metropolis/capital: 5+

---

# 28. Landmark hierarchy

Settlements should contain landmark tiers.

## Tier 1: ordinary landmarks

Examples:

- well
- tavern
- smithy
- shrine
- mill

## Tier 2: settlement landmarks

Examples:

- main temple
- market hall
- governor house
- bridge
- town gate
- harbor tower

## Tier 3: regional landmarks

Examples:

- cathedral
- citadel
- palace
- great bridge
- famous guild hall
- ancient monument

## Tier 4: world landmarks

Rare.

Examples:

- imperial palace
- giant fortress
- sacred mountain temple
- legendary tower
- massive ruined city

The player should recognize important locations from skyline and map.

---

# 29. Settlement aging

Architecture should represent age.

Possible building states:

- new
- maintained
- weathered
- old
- damaged
- abandoned
- ruined
- rebuilt

Age can affect:

- surface weathering
- roof condition
- vegetation growth
- structural irregularity
- repair patches
- extensions
- surrounding props

Historical districts should show older construction patterns.

New outskirts can use newer patterns.

---

# 30. Growth and decline

Simulation should eventually influence settlement footprint.

Growth does not need fully dynamic per-building simulation initially.

Use controlled stages.

Example:

```text
population/economy threshold crossed
        ↓
settlement growth stage increments
        ↓
planner enables next district/outer band
        ↓
new deterministic plots appear
```

Decline can:

- deactivate buildings
- create abandonment
- shrink markets
- create ruins
- reduce maintenance

Important rule:

Existing persistent landmarks and authored buildings should not randomly move when population changes.

---

# 31. Recommended data flow

```text
Azgaar Full JSON
        │
        ├── geography
        ├── states/provinces
        ├── cultures
        ├── religions
        ├── burgs
        ├── routes
        ├── markers
        ├── zones
        └── notes
        │
        ▼
World Definition
        │
        ├───────────────┐
        ▼               ▼
Simulation State    World Guidance
        │               │
        └───────┬───────┘
                ▼
        PlaceIdentityResolver
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
 Architecture  Layout   Narrative
 Grammar       Grammar  Context
        │       │        │
        └───────┼────────┘
                ▼
        Local 3D Realization
```

---

# 32. Architectural boundaries

## World definition owns

Immutable imported or authored facts.

Examples:

- culture definitions
- religion definitions
- geography
- imported routes
- imported settlement source
- authored historical seeds

## Simulation state owns

Mutable canonical facts.

Examples:

- population
- inventory
- prices
- faction relationships
- conflict
- danger
- shipments
- prosperity
- unrest
- historical events
- contracts

## PlaceIdentity owns

Derived interpretation.

It should be reproducible from world definition + simulation state.

## Renderer owns

Visual representation.

It must not change canonical state.

## Narrative layer owns

Descriptions and presentation.

It can generate prose from structured facts.

It must not silently create new canonical outcomes.

---

# 33. Integration gap to fix early

`projectAzgaarWorld.js` should retain enough burg identity for the simulation to reason about place characteristics.

Current settlement projection should be extended to preserve relevant source references such as:

- cultureId
- religionId where derivable
- provinceId
- stateId
- capital
- port
- citadel
- walls
- plaza
- temple
- harbor/haven indicators
- settlement feature/type where available

Do not duplicate entire Azgaar records in every entity.

Store normalized references and useful immutable source traits.

---

# 34. Implementation phases

## Phase 1 — Canonical PlaceIdentity

Goal:

Create a read-only deterministic identity resolver.

Tasks:

1. Add world identity modules.
2. Normalize settlement links to culture/religion/region.
3. Add culture and religion configuration.
4. Derive geography context.
5. Derive settlement role.
6. Expose identity through queries.
7. Add deterministic tests.

Acceptance:

Given the same saved world and simulation state, every settlement receives the same identity.

No visual changes are required yet.

---

## Phase 2 — Architecture grammar

Goal:

Replace four culture-hashed style presets with structured architecture profiles.

Tasks:

1. Create architecture YAML schema.
2. Map cultures to architecture families.
3. Add climate adaptation.
4. Add local material availability.
5. Add wealth modifiers.
6. Refactor `buildingRecipe` to accept resolved architecture grammar.
7. Preserve pooled geometry where possible.

Acceptance:

Two cultures no longer accidentally look identical solely because of a four-style hash.

The same culture remains visually recognizable across different environments.

---

## Phase 3 — Settlement roles

Goal:

Give each burg a meaningful economic/social identity.

Tasks:

1. Implement `SettlementRoleResolver`.
2. Use geography and route graph.
3. Use economy simulation when available.
4. Add role tags to PlaceIdentity.
5. Add basic role-driven props and landmark weighting.

Acceptance:

Fishing, farming, mining, trade, port, and fortress settlements are visually distinguishable.

---

## Phase 4 — Multiple layout grammars

Goal:

Stop using one global settlement morphology.

Tasks:

1. Refactor current street code into reusable strategy pieces.
2. Implement:
   - road_village
   - river_linear
   - coastal_harbor
   - crossroads
   - organic_cluster
   - hill_fort
   - walled_radial
3. Add grammar scoring.
4. Add deterministic fallback.
5. Add planner tests.

Acceptance:

A player can identify major settlement morphology from above without seeing building textures.

---

## Phase 5 — District planner

Goal:

Make cities structurally different from enlarged villages.

Tasks:

1. Add district model.
2. Add district placement.
3. Add district-specific building mixes.
4. Add district-specific streets.
5. Add district-level resident profession weighting.
6. Stream local district details only near player.

Acceptance:

Towns and cities contain recognizable internal quarters.

---

## Phase 6 — Religion and landmarks

Goal:

Make religion and politics visible.

Tasks:

1. Add sacred architecture grammar.
2. Add shrine families.
3. Add cemeteries/sacred sites.
4. Add faction banners and guards.
5. Add civic/government landmarks.
6. Add landmark hierarchy.

Acceptance:

Dominant religion and political identity can often be inferred visually.

---

## Phase 7 — Simulation-visible consequences

Goal:

Make macro simulation visible locally.

Tasks:

1. Add `SettlementConditionView`.
2. Add visual condition tags.
3. Connect shortage.
4. Connect prosperity.
5. Connect unrest.
6. Connect war.
7. Connect trade activity.
8. Connect route danger.
9. Connect population growth/decline.

Acceptance:

Changing simulation state produces deterministic visible local changes without directly mutating the renderer from simulation code.

---

## Phase 8 — World Chronicle

Goal:

Create persistent history.

Tasks:

1. Add structured historical events.
2. Record major simulation events.
3. Convert Azgaar markers/notes/zones into initial seeds where possible.
4. Add historical site resolver.
5. Add map presentation.
6. Add local visual manifestations.

Acceptance:

Important past events remain discoverable after the original simulation condition has ended.

---

## Phase 9 — NPC identity

Goal:

Make local residents represent the place.

Tasks:

1. Add profession weighting from economy.
2. Add culture/climate clothing sets.
3. Add faction uniforms.
4. Add religious roles.
5. Promote important people.
6. Preserve named identities through simulation LOD.

Acceptance:

Residents of two different regions no longer look or behave like the same generic population.

---

## Phase 10 — Narrative presentation

Goal:

Explain the living world to the player.

Tasks:

1. Expand opportunity templates.
2. Build rumor sources from structured facts.
3. Add settlement summaries.
4. Add local history descriptions.
5. Add NPC context adapters.
6. Optionally use an LLM only as a prose renderer over structured facts.

Acceptance:

Narrative text is traceable to canonical facts and reason codes.

---

# 35. Suggested first vertical slice

Do not implement the entire system at once.

Build one end-to-end example.

Use three nearby settlements:

1. farming village
2. river trade town
3. border fortress

They should belong to at least two cultures.

The vertical slice should demonstrate:

- distinct culture architecture
- different settlement morphology
- different economic role
- different landmarks
- different resident professions
- faction identity
- one simulation-driven shortage
- one dangerous route
- one generated opportunity
- visible change after player resolves it
- one Chronicle event
- save/reload determinism

This proves the architecture before scaling content.

---

# 36. Performance rules

The new system must preserve the current large-world architecture.

Do not:

- globally instantiate buildings for all settlements
- globally instantiate citizens
- create high-resolution identity masks
- run expensive culture/layout logic every frame
- require terrain chunks for macro simulation
- create unique geometry for every building

Prefer:

- deterministic derived identity
- cached settlement plans
- shared procedural building pools
- semantic building recipes
- district-level LOD
- coarse deterministic regional fields
- sparse historical overrides
- worker-safe pure planning functions

Place identity should be cheap enough to calculate on demand and cache.

---

# 37. Determinism rules

Every procedural decision that affects canonical or reproducible presentation should derive from stable inputs.

Use:

- world seed
- settlement ID
- culture ID
- region ID
- grammar version
- historical event IDs

Do not use `Math.random()`.

Version important generators.

Examples:

- PLACE_IDENTITY_VERSION
- SETTLEMENT_ROLE_VERSION
- ARCHITECTURE_GRAMMAR_VERSION
- DISTRICT_PLAN_VERSION

A generator change should not silently alter old saves without a deliberate migration/version policy.

---

# 38. Configuration rules

Keep tunable content in YAML.

Avoid hard-coding culture definitions inside JavaScript.

Recommended separation:

```text
config/cultures.yaml
config/religions.yaml
config/architecture.yaml
config/settlement-roles.yaml
config/settlement-grammars.yaml
config/regional-materials.yaml
config/historical-archetypes.yaml
```

JavaScript should implement reusable rules and validation.

YAML should define content.

---

# 39. Testing strategy

Add tests for:

## Identity determinism

Same input → same identity.

## Culture differentiation

Two explicitly different culture configs produce different resolved architectural grammar.

## Environmental adaptation

Same culture in different climate/material contexts produces related but different architecture.

## Role resolution

Known geography and economy conditions resolve expected role.

## Settlement grammar selection

Known context resolves expected layout family.

## History persistence

Important historical event remains after save/reload.

## Simulation visual tags

Known shortage/conflict state maps to expected deterministic visual tags.

## LOD conservation

Promotion/demotion does not change canonical population, inventory, named people, or history.

---

# 40. What not to prioritize first

Do not start with:

- hundreds of new building assets
- individual simulation for every citizen
- procedural family trees
- free-form AI-generated lore
- dozens of new commodities
- fully dynamic destruction for every building
- interiors for every house
- global tactical armies
- another terrain rewrite

The current project already has enough systems to gain much more from connecting them coherently.

---

# 41. Target player experience

The desired result is that travel itself becomes meaningful.

Example:

The player leaves a cold forest village.

The village is dominated by dark timber, steep slate roofs, wood piles, hunters, and forestry activity.

The road reaches a river town of the same culture.

The architecture is recognizably related, but the settlement has:

- warehouses
- docks
- mills
- merchant houses
- a bridge market
- denser streets

The player crosses a state border.

The next settlement belongs to another culture.

Immediately visible changes include:

- pale stone construction
- terracotta roofs
- courtyards
- different sacred architecture
- different fences
- different clothing
- different banners
- different street layout

The local simulation also matters.

The town is currently suffering because a dangerous route blocked grain shipments.

The player sees:

- reduced market activity
- higher guard presence
- waiting merchant wagons
- public concern
- a real contract generated from that condition

The player clears the danger.

The shipment resumes.

After simulation advances:

- food arrives
- prices improve
- market activity returns
- unrest falls
- the event becomes part of local history

That is the target.

The world should not merely look different.

It should have reasons for looking different.

---

# 42. Recommended implementation priority

The highest-value sequence is:

```text
Place Identity
    ↓
Settlement Role
    ↓
Architecture Grammar
    ↓
Layout Grammar
    ↓
Districts
    ↓
Religion / Faction Visual Identity
    ↓
Simulation-visible Consequences
    ↓
World Chronicle
    ↓
NPC Identity
    ↓
Narrative Presentation
```

This sequence reuses the project's strongest existing systems and avoids building parallel world models.

The immediate first step should be Phase 1: implement the canonical `PlaceIdentity` resolver and extend the Azgaar-to-simulation projection so culture, religion, settlement traits, geography, and simulation context can meet in one deterministic representation.
