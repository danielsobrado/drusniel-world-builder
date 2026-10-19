# Integration plan: make lore-first areas appear in the simulator

**This is a plan, not implemented code.** Existing `docs/plans/place-identity-world-differentiation-plan-2026-10-05.md` already proposes `PlaceIdentity`. Extend that rather than introducing a second culture engine.

## Real integration points

- `config/cultures.yaml`: keep immutable source IDs and seven canonical cultures + cultural seeds. A region dossier does not change Azgaar IDs.
- `src/editor/world/settlements/SettlementProfile.js`: currently chooses four hard-coded style families by hashing source culture. Resolve canonical `PlaceIdentity` **before** layout/architecture selection.
- `src/editor/world/settlements/SettlementPlots.js`: core/mid/edge plus craft/wealthy/quay insufficient for docks, sacred grove, mine-head, registry district, fungus farm or academy.
- `src/editor/towns/TownPrefabCatalog.js`: four prefabs (`Tudor`, `Nordic`, `Med`, `Goblin`), fallback `Tudor`; the existing Goblin family has special styles but regular profiles do not emit them. Preserve explicit, documented fallbacks for missing regional models.
- `src/editor/towns/TownDressing.js`, `SettlementDecor.js`, `SettlementTrim.js`: dress buildings by role, habitat, local culture and historical overlay rather than simply by family.
- `src/editor/actors/ResidentManifest.js`: visible labor should match the economy (miners, scribes, fishers, herders) rather than generic villagers.
- `tools/blender/medieval_town_kit/`: build new modular families with compatible origins, snap grids, LOD export, shared atlas and deterministic naming.

## Implementation order

1. **Metadata only:** author asset registry with provenance, region eligibility, settlement roles, tags, performance budgets, and fallback IDs. Write pure data tests.
2. **Place identity:** map source culture and state/province/biome/role into a deterministic record; persist no random cosmetic re-roll on scene streaming.
3. **Four vertical slices:** Lumish market, Zuraldi pass, Vondari mine, Goblin/Orc Grukmar swamp network. Do not generate a hundred bespoke buildings before these read well.
4. **Settlement grammar:** add role-specific district/building weights with hard constraints for waterways, gradient and accessible roads; validate no impossible placements.
5. **Town renderer convergence:** the normal settlement renderer and `?towns=kit` path should derive from **the same scene recipe**, allowing distinct runtime realizations and explicit feature parity testing.
6. **Perf:** instance low-variation props, atlas repeated materials, distance-cull/interior gating, region streaming and LOD meshes. Capture baseline and after changes for frame time, draw calls, texture memory and generation time.

## Config sketch — example ONLY

```yaml
sceneRecipes:
  - id: scene/zuraldi/caravan-pass/highland/village
    cultures: [zuraldarr]
    terrainFeatures: [mountain-pass]
    roles: [caravan, defense, cattle]
    layoutGrammar: terraced-slope
    mandatoryLandmarks: [asset/zuraldarr/civic/council-hall/01, asset/zuraldarr/trade/caravan-shelf/01]
    targetMix: { residence: 0.50, cattle: 0.15, trade: 0.15, defense: 0.10, civic: 0.10 }
    dressing: [cattle-trough, switchback-marker, piled-salt, wagon-brace]
    fallbackFamily: Nordic
```

This sample proposes new keys; **no loader currently consumes this schema**. Avoid treating `fallbackFamily` as canonical visual identity. Use deterministic variation and author different scales/proportions before tinting materials.

## Acceptance tests

- Same `PlaceIdentity` + seed + asset registry yields the same placement and variant choices across reloads.
- Zuraldarr village within Lumeshire receives Zuraldarr grammar without inheriting all Imperial monumental assets.
- Harbor assets appear only with a reachable coast/river berth; underground city has no full sky surface.
- Wyrmreach uncharted cells use minimal mystery/ruin dressing, not a fabricated full 'dragon city'.
- Two Grukmar settlements with different cultures and topography do **not** become identical Goblin hut clusters.
- Every missing asset fails to named fallback with structured warning and no renderer crash.
- A generated hamlet/town/metropolis stays within frame-time, draw-call, and memory budgets determined by existing test harness; do not fabricate numeric budgets before profiling.
- Source lore and asset manifest are discoverable by deterministic IDs; no runtime dependency on WordPress availability.
