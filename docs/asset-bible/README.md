# Drusniel World Builder — lore-first 3D scene & reference-image bible

**Version:** Draft v1, 19 October 2026  
**Status:** Production proposal, not a statement that meshes or runtime support exist.  
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

**Important:** The base prefab styles currently present are Tudor, Nordic, Med and Goblin. These are *prototypes*, not canonical region mappings. Existing environment props should be reused; material swaps alone cannot make a Stonehold forge-cavern, Elenoria tree-city and Contian academy truly distinct. The Goblin prefab family is currently accessible via special style keys but is not selected by the normal four-style settlement profile.

## Lore authority

Canonical public lore: https://www.drusniel.com/the-regions-of-astalor/ ; nation articles individually cited in each region dossier. Repository context: `config/cultures.yaml`, `docs/reference/eldara-local-cultures-populations.md`, `docs/plans/place-identity-world-differentiation-plan-2026-10-05.md` (proposal), `src/editor/world/settlements/`, `src/editor/towns/`.

## Explicit non-goals

- These Markdown files do **not** generate GLBs, texture sets, or modify simulator rendering code.
- Draft cultural extrapolations are marked **design proposal**, never silently upgraded to published lore.
- Do not copy a D&D franchise's trademarked locations, logos, characters or specific trade dress; this is original Drusniel art informed by generic tabletop fantasy needs.
- No GitHub Actions required. All asset production and tests can run locally.

## Proposed machine-readable manifests

- [`proposed-config/visual-identity.proposed.yaml`](proposed-config/visual-identity.proposed.yaml) defines realm, culture and area overlay classification.
- [`proposed-config/asset-candidates.proposed.yaml`](proposed-config/asset-candidates.proposed.yaml) inventories all **138 proposed** assets with priorities, per-region prompt paths, and missing-model status. Neither YAML schema is currently consumed by simulator runtime.
