# Rust + Bevy incremental migration roadmap

**Status:** Proposed plan; no implementation is claimed by this document.  
**Created:** 2026-11-22  
**Repository:** https://github.com/danielsobrado/drusniel-world-builder  
**Baseline inspected:** main at eca3cc2fafd27ac6fccc8d6068cbd23b511840ac  
**Primary objective:** Develop a Rust-owned, renderer-independent persistent world simulation and an optional native Bevy game client while retaining the existing Three.js world builder and browser UI.

## 1. Decision and non-goals

**Decision:** Use a staged, reversible migration, not a big-bang TypeScript/JavaScript-to-Rust rewrite. First prove equivalent state and deterministic simulation. Then prototype one Bevy playable region. Only migrate expensive graphics subsystems after quantified visual, performance, and maintenance gates.

The existing browser application remains the production reference throughout this plan. Rust is intended to own authoritative world state, time, commands, events, persistence, and eventually terrain-generation logic shared between clients. The existing Three.js editor continues to own its visual editor, procedural workshop, rendering, and browser interaction until replacement is explicitly approved. Bevy is a **second native client**, not a replacement for the browser by default.

Non-goals:
- No immediate port of the entire rendering stack, workshop, ocean, voxel pipeline, or editor.
- No simultaneous JS and Rust authorities for a single live world.
- No guarantee that Bevy, Rust, ECS, or native execution alone improves GPU FPS.
- No change to the 13 canonical Azgaar biome IDs or loss of custom biome metadata.
- No mandatory WebAssembly Bevy renderer or browser feature regression.
- No GitHub Actions or new hosted CI requirements; verification uses existing and new local scripts.
- No speculative engine abstractions, engine-agnostic GPU DSL, compatibility layer for unsupported legacy saves, or duplicate simulation source of truth.

**Stop condition:** If parity, browser responsiveness, asset fidelity, or performance gates fail, keep the relevant system in Three.js. A useful Rust world core remains an independent deliverable.

## 2. Current implementation: code ownership map

This plan was written against the inspected main tree, not against assumed code. Paths below are starting points; each implementing AI must inspect current main and follow the actual call graph before editing.

| Concern | Current ownership / references | Porting policy |
| --- | --- | --- |
| Simulation API and dispatch | [src/sim/index.js](../../src/sim/index.js), [src/sim/commands/dispatcher.js](../../src/sim/commands/dispatcher.js) | Extract contracts; migrate implementation in bounded steps |
| Entity state, identities, validation | [src/sim/model/worldState.js](../../src/sim/model/worldState.js), [src/sim/model/entityKinds.js](../../src/sim/model/entityKinds.js), [src/sim/model/ids.js](../../src/sim/model/ids.js), [src/sim/model/validation/validateWorldState.js](../../src/sim/model/validation/validateWorldState.js) | Define a stable, versioned Rust representation |
| Deterministic chronology | [src/sim/time/worldClock.js](../../src/sim/time/worldClock.js), [src/sim/util/seededRng.js](../../src/sim/util/seededRng.js) | Port exactly; never seed from wall-clock time |
| Simulation domain | [src/sim/economy/stockFlow.js](../../src/sim/economy/stockFlow.js), [src/sim/logistics/shipments.js](../../src/sim/logistics/shipments.js), [src/sim/population/cohorts.js](../../src/sim/population/cohorts.js), [src/sim/factions/politics.js](../../src/sim/factions/politics.js), [src/sim/combat/combat.js](../../src/sim/combat/combat.js), [src/sim/rpg/consequencePipeline.js](../../src/sim/rpg/consequencePipeline.js) | Domain-by-domain migration with reference fixtures |
| Snapshots, replay, IndexedDB | [src/sim/persistence/snapshot.js](../../src/sim/persistence/snapshot.js), [src/sim/persistence/canonicalSerialize.js](../../src/sim/persistence/canonicalSerialize.js), [src/sim/persistence/SimulationReplay.js](../../src/sim/persistence/SimulationReplay.js), [src/sim/persistence/IndexedDbSaveStore.js](../../src/sim/persistence/IndexedDbSaveStore.js) | Preserve logical schema; separate storage adapters |
| Azgaar projection and biome IDs | [src/sim/import/projectAzgaarWorld.js](../../src/sim/import/projectAzgaarWorld.js), [src/editor/world/AzgaarMacroWorldGenerator.js](../../src/editor/world/AzgaarMacroWorldGenerator.js), [src/editor/AzgaarBiomeCatalog.js](../../src/editor/AzgaarBiomeCatalog.js) | Preserve metadata, positions, physical scale, and biome contracts |
| World chunks and worker jobs | [src/editor/world/TerrainStreamingPlan.js](../../src/editor/world/TerrainStreamingPlan.js), [src/editor/world/WorldChunkWorkerClient.js](../../src/editor/world/WorldChunkWorkerClient.js), [src/editor/world/generateWorldChunk.js](../../src/editor/world/generateWorldChunk.js), [src/editor/world/ChunkDocumentCodec.js](../../src/editor/world/ChunkDocumentCodec.js) | Port data/algorithm before GPU representation |
| Global/render coordinates | [src/editor/world/FloatingOrigin.js](../../src/editor/world/FloatingOrigin.js), [src/editor/world/WorldCoordinates.js](../../src/editor/world/WorldCoordinates.js), [src/editor/world/CoordinateSpaces.js](../../src/editor/world/CoordinateSpaces.js) | Canonical global positions remain independent of camera origin |
| Towns and generated buildings | [src/editor/towns/TownStreamer.js](../../src/editor/towns/TownStreamer.js), [src/editor/world/settlements/SettlementPlanner.js](../../src/editor/world/settlements/SettlementPlanner.js), [src/editor/workshop/](../../src/editor/workshop/), [docs/settlement-rendering.md](../settlement-rendering.md) | Share plans and baked assets; defer live workshop port |
| Forest, grass, LOD and shaders | [src/editor/stylized/](../../src/editor/stylized/), [docs/adding-a-biome.md](../adding-a-biome.md) | Recreate visual techniques incrementally; no direct material portability assumption |
| Ocean and coastal optics | [src/editor/water/](../../src/editor/water/), [src/editor/water/fft/OceanFftGpuKernels.js](../../src/editor/water/fft/OceanFftGpuKernels.js), [docs/rendering/offshore-fft-ocean-2026-11-22.md](../rendering/offshore-fft-ocean-2026-11-22.md) | Port algorithms to native GPU compute/WGSL; Three.js TSL is not portable shader source |
| GPU voxels | [src/editor/voxel/GpuVoxelWorld.js](../../src/editor/voxel/GpuVoxelWorld.js), [src/editor/voxel/GpuVoxelChunk.js](../../src/editor/voxel/GpuVoxelChunk.js) | Dedicated experimental phase only |
| Web rendering and post FX | [src/render/](../../src/render/), [src/render/postprocessing/](../../src/render/postprocessing/) | Existing output is visual benchmark; do not promise pixel-identical results |
| User settings | [editor.config.yaml](../../editor.config.yaml), [config/](../../config/) | Keep configuration external, YAML-backed, validated |
| Existing verification | [docs/perf-qa.md](../perf-qa.md), [scripts/run-simulation-persistence-qa.mjs](../../scripts/run-simulation-persistence-qa.mjs), [scripts/run-ocean-fft-qa.mjs](../../scripts/run-ocean-fft-qa.mjs) | Preserve preexisting tests and add cross-runtime parity |

**Important distinctions:**
- The native infinite-world document is currently **version 6** (see README); the simulation snapshot schema in src/sim/persistence/snapshot.js is separately versioned and currently reports **SIMULATION_SCHEMA_VERSION = 1**. Never conflate them.
- Azgaar standard biome IDs are **0–12** in canonical order; deterministic additional definitions occupy **32–254**. This is a repository contract.
- Existing world pages are **64 x 64 cells** with **65 x 65 shared height samples**, using a bounded streamer and floating-origin behavior. Treat these as compatibility inputs, not Bevy renderer constraints.
- The current ocean GPU kernels are Three.js TSL-driven; the FFT mathematics are reusable but nodes, bindings, dispatch layout, resource lifetimes, and render passes require a native implementation.
- The full simulation already has replay and diagnostics. ECS is a presentation/gameplay option, **not** a substitute for its authoritative event/state model.
- A separate NPC/simulator project may be added concurrently within this repository. Before Phase 1, locate it and integrate with its public contracts rather than creating a second incompatible simulation API.

## 3. Target architecture

~~~text
drusniel-world-builder/
  src/                         Existing Three.js browser editor and 3D client
  config/                      Existing YAML config and catalogs
  assets/ / public/            Existing authored and runtime assets
  native/
    Cargo.toml                 One isolated Cargo workspace
    crates/
      world-protocol/          Versioned DTOs, commands, events, queries
      world-core/              Engine-independent authoritative simulation
      world-generation/        Azgaar, chunk generation and settlements
      world-storage/           Persistence interfaces and native adapters
      world-wasm/              Browser adapter, only if warranted
      world-server/            Optional headless simulation host
    bevy-client/               Native renderer, exploration, gameplay and UI
    config/                    Native-specific YAML, no duplicated world rules
    tests/                     Parity fixtures and integration harness
  docs/plans/                  Dated migration decisions and per-PR tasks
~~~

The native directory is an **intended layout, not an existing implementation**. Keep it additive; do not move or rename existing JS files in the foundation PR.

**Dependency direction:** world-protocol <- world-core and world-storage; world-protocol/world-core <- world-generation where justified; adapters and bevy-client depend on those crates. **world-core must never depend on Bevy, wgpu, Web APIs, UI toolkits, or filesystem storage.** Avoid cyclic crate dependencies; shared types live in world-protocol, not in the renderer.

**Authority and execution:** exactly one running simulation authority per world/session. In-browser use can run Rust/WASM locally while native Bevy runs the same core in-process; optional dedicated server can own a multiplayer/shared world. Never advance both local and remote authorities for the same session. All browser/UI commands enter through a versioned command boundary; clients consume state queries, event batches, and render snapshots. Local preview and selection remain frontend concerns.

**Data fidelity:** persistent IDs are stable across runtimes and saves; event timestamps come from simulation ticks; coordinate conversion is explicit; deterministic generation is driven by stable seed + version + canonical coordinates, not iteration order or process time. Avoid interpreting Bevy entities as persistent IDs.

**Serialization:** start with debuggable versioned JSON and documented canonical ordering. Optimize large data with binary chunks only after tests and profiling. Existing native world-document v6 and simulation snapshots are migrated/bridged independently. Define exact integer/floating-point behavior and tolerant versus exact comparisons before porting algorithms.

**Logging/errors:** Rust uses structured diagnostics with tracing and typed errors; production boundaries translate failure to stable, machine-readable codes. Never silently ignore invalid state or partially apply a command. Configuration constants belong in YAML or named constants modules. Each crate exposes a narrow API and has short cohesive source files. No temporary migration-only comments in shipping code; permanent TODOs must identify genuinely outstanding work.

## 4. Release principles, acceptance evidence and gates

For each PR:
1. Pull/inspect latest main immediately before work and preserve unrelated concurrent commits. Work on main as required by CLAUDE.md; do not force push or use feature branches/worktrees.
2. Make one bounded, reviewable change, commit to main, and push. Maintain working web functionality.
3. Supply Rust unit/property tests and JS regression/parity tests for changed contracts.
4. Run applicable existing commands. Do not introduce GitHub Actions.
5. Record evidence in a dated markdown or JSON report: baseline commit, implementation commit, test commands/results, benchmark environment, failures and screenshots where visual behavior is changed.
6. If a PR is too large to review or recover, split by domain; no cross-cutting speculative refactors.

**Baseline commands (run only when applicable and document environment):**

~~~bash
npm run verify
npm run test
npm run qa:perf -- --help
npm run qa:water:acceptance
npm run qa:ocean-fft
npm run qa:vegetation:lod
cargo fmt --manifest-path native/Cargo.toml --all --check
cargo clippy --manifest-path native/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path native/Cargo.toml --workspace
~~~

The baseline commands above are a menu, **not** proof that all commands succeed on every machine. Follow docs/perf-qa.md for an actually valid performance run (browser server, warmup, hardware and comparable captures). Capture fail/error output; do not manufacture passing numbers.

**Proposed go/no-go gates:**
- **G0, before Rust logic:** benchmark and save/parity fixtures exist and pass in JS.
- **G1, before Rust becomes authoritative:** identical ordered commands produce equivalent state, events, rejection codes, save/restore, and replay on both runtimes over the agreed fixture corpus. Pure integers/IDs/event order should be exact; document floating-point tolerances per field, not blanket approximate equality.
- **G2, before widening Bevy scope:** one playable Bevy region has correct geography, coordinate transforms, collisions, assets, and reproducible native screenshots. No silent corruption or leaking resident assets.
- **G3, before advanced GPU port:** baseline GPU/CPU/memory and screenshot comparisons demonstrate a compelling reason to invest; no unconditional parity requirement for capabilities not yet supported.
- **G4, before any browser deprecation:** Bevy meets feature-by-feature usability, export, editor, performance, stability and asset-fidelity criteria. This gate may never be met; dual clients are acceptable.

Do not claim an FPS target before collecting baselines. Benchmark **average and p95/p99 frame time**, worker/generation latency, streaming hitch counts, resident GPU/CPU bytes, load time, and frame-time variance under identical camera paths. Report hardware, GPU driver, resolution, quality settings, power mode and warmed/cold cache. Native vs browser FPS is only meaningful when rendering equivalently.

## 5. Ordered phases and PR-sized deliverables

The following are **implementation phases**, not a request to implement them immediately. PR identifiers name sequential implementation chunks, not existing GitHub pull requests.

### Phase 0 — Audit, baseline fixtures and decision record

**Priority:** P0. **Prerequisites:** none. **Outputs:** dated migration ADR, test fixtures, performance baseline. **Gate:** G0.

**PR-00A: Architecture inventory**
- Inventory world data call paths through src/sim/index.js, src/editor/WorldDocument.js, src/editor/world/, and bootstrap/renderer entry points.
- Identify which state updates are authoritative, browser-only, derived or renderer-specific. Map any newly added standalone simulator under its actual folder.
- Document existing version numbers, config key ownership, data-format compatibility policy, supported platforms and current browser workflows.
- Write an ownership table that names each domain's current owner, new Rust owner, adapter, fallback and deletion conditions.
- Determine the Bevy version by inspecting stable releases at implementation time. **Bevy 0.20.1 is the verified stable patch at plan creation**, not a permanent required dependency.

**PR-00B: Parity corpus and benchmarks**
- Extract source-controlled, non-sensitive fixtures for empty world, Azgaar-imported world, custom biomes, two settlements, trade, population monthly tick, faction conflict, encounter and replay after reload.
- Capture canonical snapshot/event/checksum output with existing JS implementation. Include negative cases (invalid command, malformed snapshot, missing route), deterministic random seed cases, leap/boundary tick cases and serialization round trips.
- Capture world-streaming trajectories: standing still, diagonal traversal, abrupt turn, teleport, chunk boundary, floating-origin rebase and ocean/forest/town transitions.
- Establish fixed screenshots with camera pose, FOV, time/weather, exposure and quality presets. Retain a browser benchmark reference with hash/commit provenance.

**Acceptance:** Fixtures reproducible on fresh checkout; commands for regeneration are documented; existing JS tests remain green or failures are documented as preexisting.

### Phase 1 — Isolated Rust workspace and explicit protocol contracts

**Priority:** P0. **Depends on:** Phase 0. **Outputs:** compilable but behavior-light native workspace.

**PR-01A: Workspace skeleton**
- Create native/Cargo.toml workspace and minimal crates world-protocol, world-core, world-storage, world-generation. Add bevy-client as a minimal crate only when Phase 6 starts; avoid premature dependencies.
- Pin Rust toolchain in native/rust-toolchain.toml; pin crate versions in Cargo.lock. Use native/config/*.yaml for environment defaults and checked-in example config.
- Use serde for DTOs, serde_yaml (or a maintained equivalent) for config, tracing for structured logs, and typed errors. Choose concrete dependencies from stable versions verified during implementation; do not guess API names from this plan.
- Add native/README.md with exact local build/test commands. Do not modify the existing npm build for the skeleton.

**PR-01B: Contract and schema**
- Introduce protocol version, world ID, seed/generator version, canonical coordinate type, biome catalog metadata, persistent entity IDs, tick, revisions, command envelope, result, domain event, bounded event cursor, query and render snapshot.
- Define who accepts/rejects commands and how duplicates, retries, errors, schema migrations and event gaps behave.
- Specify explicit JSON byte encoding, key order where checksums matter, integer size/signedness, NaN/infinity rejection, stable ordering for unordered collections, and coordinate axis/units (including the world-to-render Z sign).
- Add Rust <-> JS schema fixtures and an intentionally minimal protocol contract document. No network transport choice is required yet.

**Acceptance:** cargo fmt/clippy/test pass; fixture validation and JSON roundtrip pass; browser app is unchanged; no Rust crate imports Bevy or browser code.

### Phase 2 — Deterministic core: state, clock, RNG, commands, replay

**Priority:** P0. **Depends on:** Phase 1. **Gate:** part of G1.

**PR-02A: World state and entity model**
- Port src/sim/model/entityKinds.js, entityEnvelope.js, ids.js, worldState.js, worldDefinition.js and validation rules.
- Preserve stable IDs, expected revisions, entity lifecycle, structural validation and command atomicity. Choose a storage layout based on actual access patterns rather than mapping every world entity into a Bevy ECS entity.
- Test create/update/delete, invalid kinds, duplicate IDs, mutation isolation, corrupted/missing references and deterministic traversal ordering.

**PR-02B: Clock, cadence and seeded RNG**
- Port src/sim/time/worldClock.js and src/sim/util/seededRng.js, explicitly preserving tick calendar and RNG sequences.
- Test fixed-step determinism under varied wall-clock frame timing, suspension/resume, time acceleration, zero or invalid steps, tick boundaries and cross-runtime seeded sequences.
- Guarantee simulation time is decoupled from render FPS.

**PR-02C: Commands, event reducer and replay**
- Port src/sim/commands/, src/sim/events/, src/sim/persistence/canonicalSerialize.js, snapshot.js and SimulationReplay.js behavior.
- Ensure commands are validated before mutation, event application is all-or-nothing, errors are typed, IDs are idempotent where the current contract requires, and replay from snapshots reproduces state and event ordering.
- Do not silently change the existing snapshot schema. Add explicit migrations only where required and tested.

**Acceptance:** Exact parity for IDs, event order, integer quantities, error codes and canonical snapshots on Phase 0 fixtures; no state divergence after save/restart/replay.

### Phase 3 — Domain simulation migration

**Priority:** P0/P1. **Depends on:** Phase 2. **Gate:** finish G1 on domain corpus.

**PR-03A: Geographic graph and route planning**
- Port src/sim/geography/GraphAdjacency.js and geographicGraph.js, path caches, border access and edge rules.
- Compare graph reachability, shortest paths, tie-breaking order and invalidation after political or route changes.

**PR-03B: Economy and logistics**
- Port src/sim/economy/stockFlow.js and src/sim/logistics/shipments.js.
- Prove stock-flow conservation, no negative inventories unless explicitly permitted, transport progression, supply/demand and shipment-loss behavior. Compare at least multi-month replay.

**PR-03C: Population, cultures and politics**
- Port src/sim/population/cohorts.js, src/sim/config/cultureCatalog.js and src/sim/factions/politics.js.
- Preserve demographic cadence, named-person promotion, settlement/faction IDs, governance consequences and event logs.

**PR-03D: RPG opportunities and combat**
- Port src/sim/rpg/consequencePipeline.js and src/sim/combat/combat.js, preserving command/event interfaces.
- Allow prose generation, NPC conversations, narration and LLM calls to remain external **adapters**: model output proposes commands; core validation decides whether commands affect world state.
- Build replay fixtures for combat initiative, damage, encounter resolution, quest/contract state and faction consequences.

**PR-03E: Queries, simulation LOD and native save adapters**
- Port src/sim/queries/worldQueries.js, src/sim/lod/simLod.js, presentation view models where data-only, and native persistence adapters.
- Preserve population/cohort LOD; do not instantiate every world citizen as an active Bevy entity. Expose paginated and filtered queries for towns, NPCs, events, contracts, chat context, economy and factions.
- Prove that named NPC identity/history survives promotion, distance LOD, time progression, restart and movement between settlements.

**Acceptance:** All named Phase 0 fixtures match Rust reference outputs; diagnostics detect drift and localize first divergent command/event. Cross-runtime numerical precision differences are explicitly recorded, reviewed, and bounded rather than silently ignored.

### Phase 4 — Browser integration and single-authority rollout

**Priority:** P0. **Depends on:** Phases 2–3. **Gate:** G1.

**PR-04A: Browser-compatible runtime boundary**
- Build world-wasm only if its dependency graph and runtime behavior are suitable for the target browsers; otherwise use a local/remote headless world-server protocol for the first implementation.
- Choose the transport using measured startup cost, memory, threading limits and browser deployment requirements. Initial exchange can be versioned JSON, with binary bulk payloads later.
- Publish a minimal API: loadWorld, submitCommand, advanceTicks, queryWorld, getEvents, getSnapshot, save and restore. Add cancellation/timeout/error semantics at adapter boundaries.

**PR-04B: Shadow comparison**
- In development builds only, run Rust against identical commands **without applying its state** to the live browser. Compare state/revisions/events to JS and show a useful divergence report.
- Prevent double advancement, duplicate event emission and reordered asynchronous commands. Use a deterministic serial command queue.

**PR-04C: Rust-authority feature flag**
- Integrate a single explicit YAML-backed config flag to choose **JS or Rust authority at session initialization**; never run both as authoritative.
- Preserve existing IndexedDB saves and UI flows through adapter mapping. Provide a tested rollback path for incompatible worlds and a clear error instead of destructive migration.
- Leave visual/editor rendering in Three.js and measure bridge overhead and UI latency.

**Acceptance:** The existing browser world editor, simulation panels and saves operate in Rust-authority mode on supported fixtures. Toggle does not change world semantics. Rollback is tested. Rust latency and memory are measured, not assumed superior.

### Phase 5 — Deterministic world-generation Rust library

**Priority:** P1. **Depends on:** Phase 1; final integration after Phase 4. **May start in parallel with Phase 3 once protocols are frozen.**

**PR-05A: Azgaar ingest and guidance**
- Port data-only import/projection from src/sim/import/projectAzgaarWorld.js and relevant src/editor/import/ and src/editor/world/AzgaarMacroWorldGenerator.js logic, without porting UI or rendering.
- Preserve original physical dimensions, all 13 standard biome identities, custom IDs 32–254, cultures, religions, states/provinces, burgs, roads, rivers, markers and compact atlas guidance.
- Compare sample positions and metadata using real source fixtures. Never apply a blanket terrain/biome remapping.

**PR-05B: Chunks, coordinates and edits**
- Implement chunk sampling corresponding to WorldCoordinates.js, TerrainStreamingPlan.js, generateWorldChunk.js, ChunkDocumentCodec.js and infinite-world overrides.
- Preserve 64x64 pages, 65x65 canonical shared edges, world-to-chunk negative coordinate behavior, source seed/version, sparse edits and deterministic regeneration.
- Test boundaries in positive/negative quadrants, neighbor seams, origin rebasing, import rectangle/out-of-bounds ocean and mixed authored/generated terrain.

**PR-05C: Town plans and content generation**
- Port only world-level settlement plans/IDs and content descriptors required by native rendering; inspect SettlementPlanner.js, SettlementRegistry.js and TownStreamer.js before work.
- Preserve deterministic town layout and authored asset IDs. **Do not** rewrite the interactive workshop or GPU mesh-construction framework as part of this PR.

**Acceptance:** Same stable seeds/positions give documented matching samples and plans; loaded/evicted/reloaded chunks remain identical; no changed JS behavior.

### Phase 6 — Native Bevy proof of concept and vertical slice

**Priority:** P1. **Depends on:** Phase 1 and read-only world fixtures; live Rust integration depends on Phase 4. **Gate:** G2.

**PR-06A: Minimal native application**
- Create native/bevy-client as an isolated Bevy application pinned to the validated compatible Bevy 0.20.x release (or newer stable version explicitly approved at implementation).
- Start with desktop Windows as the reference environment; no mobile/web requirement for this PR.
- Add robust startup/config errors, window, camera modes, diagnostics, debug overlays, asset path selection, FPS/frame timing, logging and graceful shutdown.
- Load a static fixture without requiring server connectivity.

**PR-06B: One representative playable region**
- Render one imported Azgaar region containing coast or river, forest/meadow, sloped terrain, a town/landmark and one playable hero.
- Load GLB assets and animations from the existing asset library where supported. Record unsupported extensions/materials before replacing or converting them.
- Add movement, camera, jumping, collision and grounding. Preserve canonical simulation coordinates separately from Bevy local f32 transforms.

**PR-06C: Simulation-driven world interaction**
- Connect the same protocol to the Rust core; instantiate visible actors only for the active region and subscribe to events and render snapshots.
- Implement one end-to-end interaction: visit NPC, retrieve stored biography/context, choose action/dialogue, submit command, observe the persistent world consequence, save/reload.
- NPC text and LLM are optional external clients; the state change must remain deterministic.

**Acceptance:** The playable slice survives reload, teleport out/in, camera changes and world rebase. Capture stable comparison screenshots. Browser application remains functional and unchanged by default.

### Phase 7 — Native infinite-world streaming, physics and persistence

**Priority:** P1. **Depends on:** Phases 5–6. **Gate:** complete G2.

**PR-07A: Bounded chunk residency**
- Implement camera/predicted-velocity chunk selection, bounded CPU/GPU residency, job priority, cancellation, retry, cleanup and separate load/unload thresholds based on TerrainStreamingPlan.js and WorldChunkWorkerClient.js.
- Retain baseline default limits from editor.config.yaml unless measurements justify a documented native override. No unbounded entity or mesh accumulation.
- Keep large assets and distant town variants asynchronous; do not block startup on the entire asset catalog.

**PR-07B: Floating origin, far terrain and collisions**
- Adapt FloatingOrigin.js and coordinate-space conventions; maintain stable absolute world position across long traversal.
- Build terrain/collider provider with correct player grounding on CPU authoritative terrain. GPU-only voxels must not pretend to provide collision until actual collision is implemented.
- Add coherent far-terrain/horizon handling without allocating infinite detailed terrain.

**PR-07C: Save/stream/replay**
- Persist edits, object placements, origin-independent positions and simulation changes; verify recreation after crash/restart.
- Add stress fixtures for repeated fast traversal and save/load while streaming, ensuring no stale futures install out-of-date chunks.

**Acceptance:** Seam-free travel across chunk edges, predictable capped residency, stable origin and correct event/snapshot continuity. Report p95/p99 frame time, hitch count and bytes resident.

### Phase 8 — Assets, settlements, characters and interactable objects

**Priority:** P1/P2. **Depends on:** Phase 7. **May proceed in parallel with Phase 9 planning.**

**PR-08A: Shared asset preprocessing**
- Define a native asset manifest mapped to existing GLB, textures, compressed KTX2 and authored variants, with license/source metadata.
- Probe glTF materials, skinning, meshopt/Draco/texture compression compatibility; bake or transcode unsupported runtime formats offline instead of improvising at render time.
- Preserve IDs, source provenance, neutral/tintable materials and required normal/roughness maps.

**PR-08B: Settlement/structure rendering**
- Consume deterministic town placement plans; stream modular buildings, walls, Stonehold mountain gates, goblin and Frostgard variants, bridges and roads.
- Use batched/instanced or merged geometry where measured to help, without forcing static meshlet preprocessing onto changing procedural geometry.
- Do not port workshop editing yet; consume authored/baked plans and meshes.

**PR-08C: Character motion and animation**
- Import rigged GLBs, locomotion states, animation blending and hero choice; add safe spawn/despawn, proximity LOD and animation residency.
- Reproduce visible interactions and ground contact with supported native techniques. Explicitly list missing water/swim, cloth, or special character effects.

**Acceptance:** Accurate asset IDs, placement, transform orientation, scale, materials, collision, and stable distant-to-near LOD behavior with before/after screenshots and reproducible measurements.

### Phase 9 — Native biomes, trees, grass and stylized environment

**Priority:** P2. **Depends on:** Phase 8, may prototype earlier on static fixtures. **Gate:** G3 for broad rollout.

**PR-09A: Biome material system**
- Port table-driven biome configuration, transitions, snow/moss coat coverage, terrain color/noise, wetness and region-specific material responses.
- Preserve Azgaar IDs, extra definitions and surface-coat semantics. Follow docs/adding-a-biome.md and the current surface-coatings documents.
- Prefer data-driven materials, not per-biome forks of renderer code.

**PR-09B: Tree/understory pipeline**
- Reuse existing authored foliage atlases, impostors, KTX2 preparations and LOD policies where Bevy supports them; test correct alpha cutout and coverage-preserving mips.
- Implement sparse canopy, trunk/branch silhouettes, ecological understory, grass species selection, wind and distance transition with correct geographic sampling.
- Compare to the existing Tiny Glade-inspired stylized targets and forest screenshots. Do not optimize by simply deleting foliage.

**PR-09C: Shadows, weather and temporal quality**
- Add time of day, environmental lighting, sky, weather, shadows and selected postprocessing only as required for parity.
- Measure GPU costs and shader compilation/hitches separately. Avoid adding costly per-light effects to every foliage instance without evidence.

**Acceptance:** Forest, snow, desert, wetland and coast passes are visually reviewed at matching camera/lighting settings; biome distribution and streaming memory obey budgets.

### Phase 10 — Advanced water, coastal physics, reflections and GPU voxels

**Priority:** P2 / optional investment. **Depends on:** G3. **Never block launch of a functioning native core/client.**

**PR-10A: Water baseline**
- Implement rivers, lakes and ocean surface placement with native render passes. Reuse data-oriented bathymetry, ocean distance fields, shallow/deep gradients and physical wave inputs.
- Capture baseline coastline screenshots before adding heavier optics.

**PR-10B: GPU FFT and directional surf**
- Port algorithms from OceanFftGpuKernels.js, OceanSpectrum.js and related src/editor/water/fft modules into explicit wgpu/Bevy WGSL compute and render resources.
- Preserve spectrum/tick behavior, normalization, phase accuracy, workgroup bounds, GPU write/read dependencies and lazy update when ocean is not drawn.
- Compare mathematical kernels and generated fields with the existing scripts/run-ocean-fft-qa.mjs oracle; tolerate defined float precision differences only.

**PR-10C: Coastal response and reflections**
- Add breaking waves, persistent beach foam/backwash, rock interaction, refraction at headlands, caustics, depth behavior, reflection controls and wet-sand transitions one feature at a time.
- Benchmark each effect independently; avoid silently replacing current advanced rendering with a weaker generic water shader.

**PR-10D: Optional GPU voxels**
- Prove native marching cubes compute, GPU geometry generation, chunk stamps, and resident chunk disposal on a small fixture.
- Distinguish visual voxel surfaces from physics collision; require explicit collision data before allowing player walkability.
- Stop if hardware support, complexity or time is not justified.

**Acceptance:** Mathematical field tests, stable captures, native error/device-loss handling, bounded GPU memory, quality/performance comparison and documented feature parity gaps.

### Phase 11 — Native RPG gameplay, UI, simulator and NPC conversations

**Priority:** P2. **Depends on:** Phases 3–4 and native vertical slice; some interface work can run in parallel.

**PR-11A: Core interaction/UI shell**
- Create a compact, configurable, accessible native HUD: main viewport, left navigation, right inspector, hotbar, minimap/world map, event log, help/settings and keyboard/controller bindings.
- Reference the established compact CAD-like browser design, but avoid a full procedural-workshop clone.
- Support paused/fast-forward simulation views separately from render frame rate.

**PR-11B: World and character explorer**
- Display searchable settlements, factions, NPCs, biographies, important historical events, quests, travel routes, possessions and relationships from authoritative Rust queries.
- Keep the context of each NPC (city, culture, religion, allegiances, recent events, personal memory) grounded in stored world data.
- Virtualize/paginate lists to avoid materializing every NPC or town in the UI.

**PR-11C: NPC dialogue and consequential actions**
- Implement an external, configurable LLM/narrative adapter using bounded world context and explicit prompt schemas. Narrative text must not write directly to the world database.
- Convert proposed actions into typed commands, validate with world-core, produce explainable events, and persist those consequences.
- Handle unavailable model providers, timeouts, invalid structured output, replay and offline deterministic fallback safely.

**PR-11D: Browser/native interoperability**
- Document and test world handoff between existing browser simulator and native exploration: world ID, schema, snapshot tick/revision, object edits, NPC memories/events and save conflict policy.
- Never merge incompatible world revisions silently. Use explicit conflict resolution or read-only import when necessary.

**Acceptance:** User can open a saved Azgaar world, inspect a town, speak to an NPC, trigger one valid persistent world event, save, reopen in either client and observe the same event/history.

### Phase 12 — Benchmark, stabilize and decide product ownership

**Priority:** P1/P2. **Depends on:** one complete playable slice; repeat after major renderer phases. **Gates:** G3 and G4.

**PR-12A: Reproducible cross-engine benchmark**
- Compare identical scenes, assets, density, camera routes, weather, render scale, exposure and image-quality settings in Three.js WebGPU and Bevy native.
- Measure cold/warm start, content streaming, memory, hitches, GPU/CPU frame time, input latency and steady-state performance on the same machine.
- Keep raw logs and captures in a dated QA report, not only aggregate FPS claims.

**PR-12B: Reliability and packaging**
- Validate device loss/recovery, corrupt asset handling, missing save migration, world revision conflict, inaccessible network/server and crashing worker/resource cleanup.
- Add local native build/package scripts and supported deployment documentation. Do not create GitHub Actions.
- Maintain pinned toolchain/dependency security review, third-party licenses, diagnostics and reproducible builds.

**PR-12C: Architecture decision**
- Choose explicitly among: (A) Rust simulation + Three.js browser only; (B) Rust simulation + Three.js browser + Bevy desktop; (C) eventually retire specific Three.js runtime modules; (D) abandon remaining Bevy rendering phases.
- Base decision on measured native value and product needs, not language preference or an unsupported assumption that Rust improves graphics.
- Do not remove working JS code or browser tooling before the corresponding accepted functionality is shipped, parity-tested and backed up.

**Acceptance:** Written decision with evidence, surviving limitations, maintenance cost, remaining roadmap and a rollback plan.

## 6. Dependencies and safe parallel execution

~~~text
Phase 0 (audit + corpus)
  -> Phase 1 (contracts + native workspace)
       -> Phase 2 (deterministic core)
            -> Phase 3 (domain simulation)
                 -> Phase 4 (single-authority browser integration)
                 -> Phase 11 (NPC and simulation UIs, after client slice)
       -> Phase 5 (world generation; parallel after contracts stabilize)
       -> Phase 6 (Bevy static vertical slice; parallel on fixtures)
Phase 5 + Phase 6 -> Phase 7 (native streaming)
Phase 7 -> Phase 8 (assets/settlements/characters)
Phase 8 -> Phase 9 (biomes/foliage)
G3 -> Phase 10 (advanced ocean and voxels, optional)
Phase 3 + Phase 6 -> Phase 11 (gameplay)
Playable slice -> Phase 12 (benchmarks, release decision)
~~~

**Parallel-safe work:** Phase 0 screenshot capture and fixture generation; Phase 3 independent domain modules after world-core contracts freeze; Phase 5 generator and Phase 6 static native renderer after Phase 1; Phase 8 asset-preparation experiments and Phase 9 shader prototypes on fixed fixtures; Phase 11 UI wireframes and API query definitions.

**Do not parallelize blindly:** schema/protocol edits; competing authority/clock implementations; event canonicalization and replay changes; changes to a shared world-document codec; rendering changes touching the same GPU resources; concurrent writes to the same paths on main. Serially validate each integrating commit and re-read latest main immediately before pushing.

## 7. Scope and priority summary

| Phase | Priority | First business result | Must complete before broad Bevy work? |
| --- | --- | --- | --- |
| 0: audit and baseline | P0 | Objective parity/performance ground truth | Yes |
| 1: Rust workspace/protocol | P0 | Reusable stable data boundary | Yes |
| 2: deterministic core | P0 | Rust state/clock/replay correctness | Yes |
| 3: simulation domains | P0/P1 | Complete Rust world logic | For authority rollout |
| 4: browser adapter | P0 | Existing web app can use Rust authority | For production Rust ownership |
| 5: world generation | P1 | Canonical Azgaar/chunk data shared | For native streaming |
| 6: Bevy vertical slice | P1 | Evidence native client is feasible | Yes |
| 7: native streaming | P1 | Truly traversable bounded native world | For native scale |
| 8: assets/settlements | P1/P2 | Existing art survives native conversion | For representative benchmark |
| 9: biome environment | P2 | Visual quality comparable to stylized target | Before AAA claims |
| 10: water/voxels | P2, optional | Advanced GPU parity | No |
| 11: native RPG and NPC UI | P2 | Playable persistent narrative and exploration | For product experience |
| 12: benchmark/release decision | P1/P2 | Evidence-based client strategy | Before retiring any JS system |

## 8. First executable milestone

**Start only with PR-00A.** Its implementation AI should:
1. Read this roadmap, CLAUDE.md, README.md and actual current main.
2. Produce a current call-graph/ownership inventory of src/sim/index.js, state and persistence code, world document/import, streaming, renderer, and any new standalone NPC simulator.
3. Identify the smallest backward-compatible JSON protocol contract and enumerate existing tests that can produce golden fixtures.
4. Deliver a dated ADR/inventory document in docs/plans/ with specific paths, schema decisions, risks and a follow-up implementation brief for PR-00B.
5. Make **documentation-only** changes, run any relevant non-destructive checks, commit and push main. Do **not** create Rust files, change production authority, install Bevy, or begin shader conversion in PR-00A.

**Completion criterion for the overall program:** The browser editor remains reliable; a deterministic Rust world core serves at least one supported runtime with verified replay; a playable Bevy desktop slice can load and persist the same logical world; future rendering investment is explicitly justified by quality/performance benchmarks. Full renderer parity is optional, never assumed.

## 9. References

**Repository sources:** README.md; CLAUDE.md; docs/perf-qa.md; docs/settlement-rendering.md; docs/adding-a-biome.md; docs/plans/01-canonical-simulation-world-model-plan-2026-07-24.md; docs/plans/09-hierarchical-simulation-lod-plan-2026-07-24.md; docs/plans/10-persistence-replay-and-debugging-plan-2026-07-24.md; docs/plans/11-combat-and-npc-systems-plan-2026-07-24.md; docs/rendering/offshore-fft-ocean-2026-11-22.md; src/sim/; src/editor/world/; src/editor/stylized/; src/editor/water/; src/editor/voxel/; src/editor/workshop/; src/render/.

**External sources (versions and APIs must be reconfirmed during implementation):**
- Bevy 0.20 release notes: https://bevy.org/news/bevy-0-20/
- Bevy current examples: https://bevy.org/examples/
- Bevy WebGPU examples and platform notes: https://bevy.org/examples-webgpu/
- Bevy setup and supported targets: https://bevy.org/learn/quick-start/getting-started/setup/
- Bevy documentation: https://docs.rs/bevy/
- Rust project guidelines: https://doc.rust-lang.org/cargo/guide/
- WebAssembly Rust book: https://rustwasm.github.io/docs/book/

**Migration disclaimer:** This is an architectural plan, not a claim that any new Rust/Bevy code exists or that a future engine is necessarily faster. All phase gates require actual implementation evidence.
