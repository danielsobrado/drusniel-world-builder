# Drusniel World Builder — lore-first 3D scene & reference-image bible

**Version:** v1.1 (Runtime PlaceIdentity & Asset Registry Integrated), 20 October 2026  
**Status:** Runtime `PlaceIdentity`, `SceneRecipe`, and 138-asset fallback registry are active in code; bespoke 3D GLB assets remain tracked honestly as `planned` until reference images and Blender models are completed.  
**Purpose:** Generate **consistent reference images** for 3D assets, author tiling PBR materials, and dress **distinct regions and settlements** in Drusniel World Builder.

## Start here

1. Read [00-lore-and-map-crosswalk.md](00-lore-and-map-crosswalk.md): lore from **drusniel.com** is authoritative for narrative names, while `Eldara` Azgaar geography and `config/cultures.yaml` supply simulation IDs. Do **not** equate Astalor and Eldara automatically.
2. Read [01-identity-taxonomy.md](01-identity-taxonomy.md): world → realm/state → province/place → canonical culture/branch → biome/terrain → settlement role → district → asset. **Faith, ancestry and polity are independent variables.**
3. Select one [regional brief](regions), then a matching [area overlay](areas).
4. Run the prompts in the regional file in order: **scene mood board** → **asset hero** → **same-object orthographic views** → **tileable material references**. See [02-image-to-3d-pipeline.md](02-image-to-3d-pipeline.md).
5. Track candidate assets in [03-production-backlog.md](03-production-backlog.md) and integrate using [04-runtime-integration.md](04-runtime-integration.md).
6. Hand the full implementation brief to a coding AI: [06-implementation-handoff-prompt.md](06-implementation-handoff-prompt.md).

## Region dossiers

| Lore realm / geography | Production document | Core visual identity |
|---|---|---|
| Lumeshire | [lumeshire.md](regions/lumeshire.md) | formal Imperial order, markets, churches, border logistics |
| Zuraldi (within Lumeshire) | [zuraldi.md](regions/zuraldi.md) | semi-autonomous upland councils, terraces, caravan passes |
| Contian Theocracy | [contian.md](regions/contian.md) | regulated magic, scholar institutions, geometric city plans |
| Frostgard | [frostgard.md](regions/frostgard.md) | winter longhalls, defensive supply towns, giant-frontier readiness |
| Stonehold | [stonehold.md](regions/stonehold.md) | dwarven/guild fortress-cities, mountain infrastructure, forges |
| Elenoria | [elenoria.md](regions/elenoria.md) | grown living-wood architecture, hidden libraries and forest paths |
| Grukmar | [grukmar.md](regions/grukmar.md) | **many peoples**, clan markets, swamp towns and upland fortified holdings |
| Umbra'kor | [umbrakor.md](regions/umbrakor.md) | cavern terraces, house compounds, depth wards, pale-glow wayfinding |
| Wyrmreach | [wyrmreach.md](regions/wyrmreach.md) | **mysterious frontier**, scattered inhabited enclaves and anomalous ruins—not a uniform city style |

## Area overlays

[coast-harbor](areas/coast-harbor.md) · [mountain-pass](areas/mountain-pass.md) · [forest-canopy](areas/forest-canopy.md) · [swamp-bog](areas/swamp-bog.md) · [underground-cavern](areas/underground-cavern.md) · [ruins-rift](areas/ruins-rift.md)

## Implemented Runtime & CLI Tooling

- **Canonical Catalogs & Configs**:
  - [`config/visual-identity.yaml`](../../config/visual-identity.yaml) & [`src/worldIdentity/VisualIdentityCatalog.js`](../../src/worldIdentity/VisualIdentityCatalog.js)
  - [`config/asset-registry.yaml`](../../config/asset-registry.yaml) & [`src/worldIdentity/AssetRegistry.js`](../../src/worldIdentity/AssetRegistry.js)
- **Deterministic PlaceIdentity & SceneRecipe Resolvers**:
  - [`src/worldIdentity/PlaceIdentityResolver.js`](../../src/worldIdentity/PlaceIdentityResolver.js)
  - [`src/worldIdentity/SceneRecipeResolver.js`](../../src/worldIdentity/SceneRecipeResolver.js)
- **Reference-to-3D Production Pipeline CLI**:
  - `node scripts/validate-visual-identity.mjs` — validates all 14 Azgaar culture IDs (`0..13`), 9 lore realms, 36 local branches, 6 environmental overlays, and 138 candidate assets against `config/*.yaml` and `docs/asset-bible/proposed-config/*.yaml`.
  - `node scripts/asset-bible-pipeline.mjs status` — reports production status across all 138 assets (`54 P0`, `84 P1`) and verifies no unmodeled asset falsely claims `ready` or `reference-approved`.
  - `node scripts/asset-bible-pipeline.mjs prompts <asset-id|realm>` — emits structured 6-view orthographic + PBR material prompt packs.
  - `node scripts/asset-bible-pipeline.mjs scaffold <asset-id>` — creates `docs/asset-bible/references/<asset-id>/brief.md`, `material-notes.md`, and `prompts.json`.
  - `node scripts/asset-bible-pipeline.mjs inspect <asset-id>` — checks on-disk reference views (`hero.png`, `front.png`, `left.png`, `rear.png`, `top.png`, `detail.png`) and GLB readiness.
