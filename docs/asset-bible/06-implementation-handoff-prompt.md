# Implementation handoff prompt — Drusniel lore-first settlements and asset pipeline

Copy the prompt below into the implementation AI that has access to `danielsobrado/drusniel-world-builder`.

---

You are the lead engineer, technical artist and technical designer for **Drusniel World Builder**, a large-scale Azgaar/Fantasy Map Generator RPG simulator. Implement the lore-first regional identity, settlement, and 3D asset pipeline described in `docs/asset-bible/`, while preserving existing features, deterministic world generation, and streaming performance. **Work in the repository; make real source changes and tests. Do not stop after writing another plan.**

## Mandatory source material and truth hierarchy

1. Public narrative canon: https://www.drusniel.com/ and especially https://www.drusniel.com/the-regions-of-astalor/ and linked realm articles. Treat **Astalor as narrative geography** and **Eldara as the current simulator map**; do not silently assume their geographies are identical.
2. Current simulator map and population: `maps/Eldara Full 2026-07-23-20-37.json`, `docs/reference/eldara-local-cultures-populations.md`.
3. Canonical culture IDs and source mapping: `config/cultures.yaml`.
4. Existing architectural strategy: `docs/plans/place-identity-world-differentiation-plan-2026-10-05.md` — status **Proposed**. Build on its `PlaceIdentity` concept; avoid a competing subsystem.
5. This complete asset bible: `docs/asset-bible/README.md`, `00-lore-and-map-crosswalk.md`, `01-identity-taxonomy.md`, `02-image-to-3d-pipeline.md`, `03-production-backlog.md`, `04-runtime-integration.md`, `05-differentiation-matrix.md`, `regions/*.md`, `areas/*.md`, `templates/*.md`, `proposed-config/*.yaml`.
6. Always inspect actual checked-in code and existing tests before editing. Existing proposals and asset candidates are **not implemented features**.

**Identity rule:** Never flatten ancestry, canon culture, local cultural branch, polity, province, faith, geography, economic role, district or historical overlay into a single race/faction/style flag. Same polity can host very different settlements; same people adapt to coast, mountains and wetland. Azgaar IDs stay immutable. Do not invent lore or turn unclear narrative mappings into asserted facts (especially **Stonehold vs Ironpeak**, and sparse **Wyrmreach** ruins/remnants). Use provenance/confidence flags.

## Existing code to inspect and integrate

- `src/editor/world/settlements/SettlementProfile.js`, `SettlementPlanner.js`, `SettlementPlots.js`, `SettlementBuildingCatalog.js`, `SettlementDecor.js`, `SettlementTrim.js`, `SettlementGathering.js`.
- `src/editor/towns/TownPrefabCatalog.js`, `TownLayout.js`, `TownRuntime.js`, `TownStreamer.js`, `TownDressing.js`, `TownKitAssets.js`, `TownSkins.js`, `townMode.js` and the optional `?towns=kit` path.
- `src/editor/actors/ResidentManifest.js` for culture/profession-sensitive residents.
- `tools/blender/medieval_town_kit/`, `assets-src/medieval-town-kit/`, `public/assets/environment/medieval-kit/`, `config/objects.yaml`, environment asset registries, GLB and texture optimization scripts.
- Existing tests, benchmark tooling, worker boundaries, renderer lifecycle and normal application build/test commands (derive commands from `package.json`; do not guess).

Current asset baseline: 22 base placeable object types, 140 medieval-town prefabs, 224 modular pieces, four prefab families (Tudor/Nordic/Med/Goblin), Gods End environmental assets; these do not yet constitute canonical Drusniel regional architecture. The normal settlement profile selects four generic material styles and does not normally select the Goblin family's special keys. `SettlementPlots.js` has only craft/wealthy/quay district overrides, while the runtime also has a separate `?towns=kit` renderer. Reuse/extend rather than replace functioning systems.

## Implement in vertical slices, not a big-bang asset explosion

**Phase 0 — Audit and tests.** Establish a baseline from actual code and run tests/build. Identify load paths, asset formats, registry conventions, deterministic seeds, worker-safe data, performance counters, existing renderer variants. Record current behavior and known gaps concisely. Do not rewrite existing canon files to suit art prompts.

**Phase 1 — Data-driven typed identity/asset registry.** Convert the `*.proposed.yaml` specs into a validated runtime or build-time schema after reviewing them, without blindly renaming proposal to production. Keep YAML authored data and generate small normalized JS/JSON as needed. Explicitly link narrative region, Azgaar state, province, canonical culture/branch, biomes/terrain, roles, districts, era/history, lore source, assets, allowed/excluded placement, fallback variants and assets' source reference IDs. Validate referential integrity, duplicates, unknown values and deterministic selection. Add a lightweight CLI validator and unit tests. Statuses must distinguish `planned`, `reference-approved`, `modeling`, `review`, `ready`, `fallback`; planned assets must never be rendered as though they already exist.

**Phase 2 — Deterministic PlaceIdentity and scene recipes.** Resolve Azgaar culture IDs through `config/cultures.yaml`, then contextual state/province/branch, geography/biome, economic role, district, scale, wealth, faith/factions and historical state. Expose a serializable worker-safe `PlaceIdentity` and data-driven recipe for roads, plots, infrastructure, landmark anchors, asset categories, dressing and residents. Same map/seed/config must generate the same results across reloads/chunks. Do not introduce new random outcomes on LOD switches or streaming. Use geometric constraints: no inland docks, flooded basement houses, impassable mountain-road grades, floating overhangs, or sky buildings in underground layers. Provide graceful explicit fallbacks to existing meshes and warn once per missing asset ID.

**Phase 3 — Regional differentiated scenes.** First complete four end-to-end examples that demonstrate visibly different topology and economics:
1. **Lumish imperial market settlement** (orderly square, church/civic hall, granary, stalls, workshops, maintained roads and household clutter).
2. **Zuraldarr mountain pass settlement** (slope-following stone terraces, council yard, cattle pens, waymarkers, caravan facilities, retaining walls and path constraints), within Lumeshire without forcing Imperial architectural dominance.
3. **Stonehold/Vondari mining and forge settlement** (quarries, ore handling, mine head, blast/forge workyards, ventilation, transport, stronghold civic spaces; keep narrative-to-map mapping provisional until verified).
4. **Grukmar mixed-people wetland/trade settlement** (distinct goblin wetland platforms, orc upland halls, multi-people trade areas, raised safe routes, water and food infrastructure; avoid flattening peoples into fantasy-monster cliches).

Each example must have a data-driven settlement role, placement grammar, recognizable material/roof/structural language, authentic production/logistics infrastructure, region dressing, resident professions, and test fixture/screenshot or reproducible debug seed. Expand later to Contian, Frostgard, Elenoria, Umbra'kor and carefully constrained Wyrmreach. The same culture should also look different in a harbor, inland market and frontier context.

**Phase 4 — Reference-to-3D production pipeline.** Implement the reproducible **local** tooling: registry-driven prompt exports in Markdown and/or JSON, per-asset directories, status checks, image metadata, front/left/rear/top/detail slots, material reference slots, Blender import/procedural construction helpers, GLB export (including units, pivot, collision, LOD, texture maps, alpha conventions), and content manifest generation. `docs/asset-bible/regions/*.md`, `areas/*.md`, `templates/*.md` are prompt sources. Track model provenance, copyright/license/approval, mapping from each approved concept image to final GLB, and validation. **Do not pretend text prompts automatically generate production meshes or PBR maps**: implement automated steps possible locally and create explicit review/manual or optional image/3D-provider integration points for the rest. Don't commit huge generated GLBs, images, binaries or texture atlases unless repository conventions explicitly require them; preserve ignored asset rules and document local regeneration. A workflow that yields reference prompts and placeholder/fallback prefabs before approval is valid.

**Phase 5 — Runtime integration and performance.** Make both `SettlementView` and `?towns=kit` derive visual decisions from the same `PlaceIdentity`/scene recipe or explicitly document differences. Preserve worker-safe pure data generation. Scene size must not turn 500 settlements into 500 loaded city graphs: lazy load by region, instance repeated props and material atlases, share geometry, use mesh/prefab LOD, cull distant dressing, load interiors on demand. Detect/memoize stable asset keys, avoid per-frame allocations/network fetches and expensive full-world loops. Benchmark both render paths for hamlet/village/town/city/metropolis on representative terrain and record baseline vs after for frame time, generation time, draw calls, triangles, texture memory and scene memory. Derive acceptable numerical budgets from profiling; don't invent them.

**Phase 6 — Tests and handoff.** Add tests for source ID mapping, population/settlement identity stability, region selection, branch identity, district placement, asset registry validation, missing/unknown texture/GLB fallbacks, deterministic seeds and streamer lifecycle; add a compact visual fixture/test for each four slices. Run repository's existing format/lint/build/test commands and any local Blender export validation available; document commands and tests that cannot run (e.g. Blender not installed). Update `docs/asset-bible/README.md` and integration notes with actual implemented status and exact generated paths. Do not mark remaining P1/P2/P3 backlog assets as done.

## Engineering guardrails

- Prefer KISS, YAGNI, SOLID, small composable modules, single source of truth, YAML-driven configuration, and deterministic pure functions where practical.
- Keep source of truth distinct from visual presentation; `drusniel.com` may be unavailable at runtime, so **no runtime web scraping/dependency**.
- Keep user-authored settlement placements and manual overrides intact. Preserve world save compatibility or provide explicit migrations.
- Do **not** add GitHub Actions or cloud CI automation. Use local scripts/tests/build instructions.
- Avoid modifying unrelated files, broad renames, breaking prefab identifiers, changing Azgaar ID semantics, replacing existing working renderers, and generated binary churn.
- Never fabricate asset provenance, lore approval, existing model status, user confirmation or benchmark results.
- Scope for a coding AI is software, manifests, reproducible art tooling and procedural stand-ins; high-quality final visual meshes require supplied/generated reference images and technical-art signoff.

## Acceptance criteria

1. Four demonstration scenes are reproducible by ID/seed and visually distinct beyond simple palette changes.
2. Lumish and Zuraldarr within the same polity, and goblin and orc settlements within Grukmar, are differentiated through architecture, geography and economic infrastructure; biome/role changes are visible within one culture.
3. Source map culture IDs unchanged; lore-vs-map mapping explicitly tracked with confidence.
4. Registry and prompt-to-model workflow are usable with one local command and no GitHub Actions; proposed vs modeled vs runtime-ready states are inspectable.
5. Missing meshes load documented fallbacks without crash; both rendering paths behave coherently, or known parity limitations are documented.
6. Test/build outcomes and actual before/after performance measures included in final engineering report.

## Execution instructions

Read the sources first; inspect Git status and existing code/tests; choose the minimum change to deliver a fully tested first vertical slice. Then implement subsequent slices in coherent commits when practical, with short commit messages. Do not merely propose work. When external image-generation/modeling resources are unavailable, produce exact prompts, candidate asset registry, placeholders or procedural meshes, plus a clear asset handoff list; continue implementing all software pieces that do not depend on those resources. At completion, report: changed files/commits, scene fixtures, new runtime behavior, asset counts by status, local commands, passing/failing tests, benchmark measurements, known gaps and the next lowest-risk asset production steps.
