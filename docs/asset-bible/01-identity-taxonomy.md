# Deterministic place identity, tags, taxonomy and asset namespace

## Separation of dimensions (do not collapse)

```text
worldLore       Astalor [narrative label] / worldMap Eldara [data label]
  └ realm       Lumeshire, Contia, Frostgard, Stonehold*, Elenoria, Grukmar, Umbra'kor, Wyrmreach
     └ stateId  Azgaar immutable state ID; lore/display alias separate
        └ provinceId / cellId / burgId / deterministic generated-village ID
           ├ culture: lumish | zuraldarr | contian | norths | vondari | elenori | umbra-kori | cultural seed
           ├ localBranch: e.g. pass-wardens, river-registry-contians, sea-road-norths
           ├ ancestry: human, dwarf, elf, goblin, orc, etc. (population-level)
           ├ faith: map religion / local rites (distinct)
           ├ biome: map biome, plus altitude, humidity, canopy, temperature and precipitation
           ├ terrainFeature: coast, harbor, river, ridge, pass, marsh, cavern, ruins
           ├ economy/role: farm, fish, mine, smith, market, trade, fortress, pilgrimage, academy
           ├ scale: hamlet, village, town, city, metropolis
           ├ layout: coastal-harbor, road-village, river-linear, terraced, organic, fortress, grid...
           ├ district: residential, civic, market, docks, farming, military, magical, industrial, sacred
           └ stateOverlays: season, prosperity, destruction, occupation, plague, festival, weather
```

`*` Stonehold ↔ Ironpeak map alias **unverified**; see crosswalk.

## Suggested registry IDs

- Architecture set: `arch/<culture-or-branch>/<terrain-variant>` e.g. `arch/zuraldarr/mountain-pass`.
- Scene recipe: `scene/<realm>/<role>/<biome>/<scale>` e.g. `scene/lumeshire/market/temperate/town`.
- Object/GLB: `asset/<culture-or-shared>/<category>/<name>/<variant>` e.g. `asset/vondari/industry/ore-lift/01`.
- Material: `mat/<family>/<substrate>/<finish>` e.g. `mat/stone/mountain-granite/wet`.
- Images: `references/<asset-id>/hero.png`, `front.png`, `left.png`, `rear.png`, `detail.png`.
- Texture reference: `references/materials/<material-id>/albedo-reference.png` (an *art reference*, not a verified PBR output).

## Configuration record (proposal, NOT implemented)

```yaml
id: place/eldara/42/1204
source: { map: Eldara, azgaarStateId: 4, provinceId: 42, burgId: 1204 }
lore: { realm: lumeshire, displayRealm: Lumeshire }
society: { polity: lumeshire, culture: zuraldarr, localBranch: pass-wardens, faith: local-grove-rites }
land: { biome: temperate-deciduous-forest, feature: mountain-pass, elevationBand: highland }
settlement: { scale: village, roles: [caravan, cattle, defense], grammar: terraced-slope }
visual: { architecture: arch/zuraldarr/mountain-pass, overlays: [autumn, prosperous] }
```

This is *schema illustration*, not a valid real burg: never treat these example map IDs or the example biome as verified. Calculate real values from import. Use source culture IDs as immutable foreign keys, mapping via `config/cultures.yaml`.

## Assets have **eligibility**, not ownership by location alone

```yaml
id: asset/zuraldarr/civic/council-hall/01
kind: landmark
cultures: [zuraldarr]
roles: [civic, caravan]
terrainFeatures: [valley, mountain-pass]
allowedDistricts: [civic, market]
materials: [mat/stone/mountain-granite/dry, mat/wood/aged-dark-timber/rough]
footprintMeters: { width: 12, depth: 9 }
variants: 2
status: planned
```

A generic cart or barrel should be `asset/shared/...` and be locally dressed with relevant materials and goods rather than duplicated into every civilization folder. `allows` and `requires` are validated against the actual place identity; `tags` are for discovery only.

## Place assembly constraints

- `terrain > economy`: fertile delta yields ferries and fish sheds, but not a pass-toll station.
- `culture > architectural grammar`: form and spatial organization; `climate > envelope`: roof pitch, eaves, foundations and shutters.
- `polity > civic surface`: flags, checkpoints, bureaucratic signage, guards; a border minority home need not share imperial building geometry.
- `faith > ritual sites`, not every roof type.
- `wealth > quality and density`; poor and rich versions share readable construction grammar.
- `timeline > wear and damage` without changing the cultural core.
- `district > function` (fishing nets by docks, tailings by smelter, parchment racks by academy) and plausible pedestrian/cargo connections.
- Asset source fields: `loreStatus: published | repo-authored | proposal`, `modelStatus: missing | blockout | review | approved | runtime`, `sourceUrls`, `referenceSet`, `textureSet`, `license`, `geometryMetrics`.
