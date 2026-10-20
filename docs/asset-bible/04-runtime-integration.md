# Integration architecture: lore-first regional settlements in the simulator

This document describes the active runtime integration connecting `config/cultures.yaml`, `config/visual-identity.yaml`, and `config/asset-registry.yaml` to the procedural settlement planner (`src/editor/world/settlements/`), the modular kit town renderer (`src/editor/towns/`), and resident population manifests (`src/editor/actors/ResidentManifest.js`).

## Active integration points

- [`config/cultures.yaml`](../../config/cultures.yaml): preserves immutable Azgaar source IDs (`0..13`) and canonical cultures + cultural seeds.
- [`src/worldIdentity/PlaceIdentityResolver.js`](../../src/worldIdentity/PlaceIdentityResolver.js): resolves `culture`, `stateName`, `province`, `biome`, `elevation`, `slope`, `waterDepth`, `port`, and `isUnderground` into a frozen, deterministic `PlaceIdentity` record with `loreRealm`, `cultureKey`, `localBranch`, `provinceContext`, `mappingConfidence`, `economicRoles`, and `activeOverlays`.
- [`src/worldIdentity/SceneRecipeResolver.js`](../../src/worldIdentity/SceneRecipeResolver.js): turns a `PlaceIdentity` into a deterministic `SceneRecipe` containing `architecture`, `streetConfig`, `zoneMix`, `districtMix`, `multiPeopleDistricts`, physically gated `mandatoryLandmarks`, `regionalProps`, `overlayModules`, `forbiddenAssets`, and `residentProfessions`.
- [`src/editor/world/settlements/SettlementProfile.js`](../../src/editor/world/settlements/SettlementProfile.js): attaches `identity`, `recipe`, `hasRegionalIdentity`, and `kitStyleKey` to the settlement profile while preserving the 4 workshop styles (`granite-slate`, `limestone-terracotta`, `sandstone-terracotta`, `limestone-slate`) for procedural mesh pooling.
- [`src/editor/world/settlements/SettlementStreets.js`](../../src/editor/world/settlements/SettlementStreets.js), [`SettlementPlots.js`](../../src/editor/world/settlements/SettlementPlots.js), [`SettlementDecor.js`](../../src/editor/world/settlements/SettlementDecor.js), [`SettlementPlanner.js`](../../src/editor/world/settlements/SettlementPlanner.js):
  - Adapts street drift, ring counts, and surface roles (`boardwalk`, `imperial-setts`, `switchback-terrace`, `forge-causeway`).
  - Places mandatory regional landmarks and physically eligible overlay props with `assetId`, `kitPrefab`, `kitProp`, and `foundationType`.
  - Allocates multi-people district wards (such as Goblin wetland stilt wards + upland Orc/Troll camp wards in Grukmar, or Norths + Jotunn wards in Frostgard).
  - Suppresses surface crop fields in underground caverns (`umbrakor`) and high Wyrmreach ruins (`wyrmreach`).
- [`src/editor/towns/TownLayout.js`](../../src/editor/towns/TownLayout.js) & [`TownDressing.js`](../../src/editor/towns/TownDressing.js):
  - Uses `plan.profile.kitStyleKey ?? plan.profile.style.key` so Goblin wetland/march settlements select the `Goblin` kit family under `?towns=kit` while keeping procedural workshop compatibility.
  - Honors per-building `kitFamily` and `kitPrefab` so multi-people towns mix Goblin stilt prefabs and Nordic upland camp prefabs in the same settlement.
  - Resolves every `assetId` through `resolveRuntimeAsset(assetId)` from `AssetRegistry.js`, recording once-per-ID fallback traces until bespoke GLBs are marked `ready`.
- [`src/editor/actors/ResidentManifest.js`](../../src/editor/actors/ResidentManifest.js):
  - Assigns deterministic regional `profession`, `professionTitle`, `role`, `district`, `loreRealm`, `cultureKey`, and `localBranch` to each resident while keeping `kind` (`'paladin'` | `'villager'`) compatible with `ResidentAssets`.

## Automated verification

- `node --test test/world-identity-registry.test.js` — validates catalog schemas, 138-asset registry parity, physical constraint gating, and once-per-ID fallback warning tracking.
- `node --test test/place-identity-resolver.test.js` — validates deterministic `PlaceIdentity` and `SceneRecipe` resolution across Lumeshire, Zuraldi upland provinces, Stonehold/Ironpeak crosswalks, Grukmar multi-people wetlands, Umbra'kor caverns, and Wyrmreach rural-only draconic constraints.
- `node --test test/regional-vertical-slices.test.js` — validates the 4 priority vertical slices and all 9 canonical lore realms end-to-end across `planSettlement`, `layoutTown`, and `residentManifest`.
- `node --test test/asset-bible-pipeline.test.js` — validates 6-view orthographic prompt generation, workspace scaffolding, and on-disk asset readiness auditing.
