# Phase 0 — Rust + Bevy migration: architecture audit and reference baselines

**Status:** Detailed plan only. Neither Phase 0 work package has been implemented.  
**Date:** 2026-11-22.  
**Source inspected:** main at 11d9d156d26e84ab182da6ba6a461089fc3c0c29. Recheck main before work.  
**Parent:** [Incremental Rust + Bevy migration roadmap](rust-bevy-incremental-migration-2026-11-22.md).  
**Implementation work packages:** PR-00A (architecture audit/ADR), followed by PR-00B (golden fixture/QA baseline). These are logical PR-sized deliverables, but the repository requires commits directly to main without feature branches.  
**Gate:** G0 — deterministic, versioned behavioral references and reproducible browser visual/performance evidence exist before introducing Rust/Bevy.

## 1. Mission, decisions and boundaries

Phase 0 must establish the precise behavior to **preserve**, the runtime modules that **own** that behavior, the authoritative storage for each state type, and the QA evidence that makes later JS vs Rust vs Bevy comparisons meaningful.

This is especially important because the current browser editor and the simulation subsystem expose **separate** formats, sources and lifecycles, and substantial Three.js/WebGPU-specific investment exists in terrain, vegetation, cities, coastal water and special effects.

**Fixed architectural direction:**
1. Retain the Three.js browser app and world editor as the operating reference.
2. Future Rust world-core should own headless deterministic simulation, not graphics or Bevy entities.
3. Future Bevy is a separate native desktop client, not the initial browser replacement.
4. Exactly one authority advances world state and clock per session; no simultaneous JS and Rust writes.
5. Preserve persistent IDs and canonical world coordinates; render-local floating origin is not persistent state.
6. Preserve Azgaar biome IDs 0–12 and deterministic custom definitions 32–254.
7. Never claim Bevy improves frame rate without scenes matched for assets and visual quality.
8. Leave advanced ocean, terrain GPU, voxel and workshop rewrites out of Phase 0.
9. No GitHub Actions, feature branches, worktrees, force-pushes or speculative framework adoption.

**PR-00A is documentation only.** Permitted: new dated architecture/ADR Markdown documents. Forbidden: edits to src/, tests/, scripts/, dependencies, assets or production YAML.

**PR-00B is non-production tooling and evidence only.** Permitted: small new deterministic Node scripts, tests, compact golden fixtures, QA reports, selected screenshots. Forbidden: changes to src/, renderer/gameplay behavior, save schemas, production assets or dependencies unless explicitly re-scoped in a later phase.

Stop the current package if source reality conflicts with the plan. Document the discrepancy and smallest follow-up decision; do not silently reshape production code.

## 2. Verified code ownership and starting points

Every implementing AI must inspect **current main**, not treat this table as a substitute for source reading.

| Area | Concrete sources | What to establish |
| --- | --- | --- |
| App bootstrap/entry | [src/main.js](../../src/main.js), [src/bootstrap.js](../../src/bootstrap.js), [src/editor/EditorController.js](../../src/editor/EditorController.js), [src/editor/TerrainAwareEditorController.js](../../src/editor/TerrainAwareEditorController.js) | Boot graph, editor ownership, state and lifecycle |
| Simulation public API | [src/sim/index.js](../../src/sim/index.js) | createSimulationWorld, public methods, command lifecycle |
| Simulation entities | [src/sim/model/worldState.js](../../src/sim/model/worldState.js), [src/sim/model/worldDefinition.js](../../src/sim/model/worldDefinition.js), [src/sim/model/entityKinds.js](../../src/sim/model/entityKinds.js) | Revision, IDs, entity collections, state mutation |
| Commands/events | [src/sim/commands/commandEnvelope.js](../../src/sim/commands/commandEnvelope.js), [src/sim/commands/dispatcher.js](../../src/sim/commands/dispatcher.js), [src/sim/events/domainEvent.js](../../src/sim/events/domainEvent.js), [src/sim/events/reducers.js](../../src/sim/events/reducers.js) | Atomicity, rejection, error codes, ordering |
| Time/seed | [src/sim/time/worldClock.js](../../src/sim/time/worldClock.js), [src/sim/util/seededRng.js](../../src/sim/util/seededRng.js), [src/sim/config/defaultSimulationConfig.js](../../src/sim/config/defaultSimulationConfig.js) | Tick/cadence and deterministic RNG |
| World simulation | [src/sim/economy/stockFlow.js](../../src/sim/economy/stockFlow.js), [src/sim/logistics/shipments.js](../../src/sim/logistics/shipments.js), [src/sim/geography/geographicGraph.js](../../src/sim/geography/geographicGraph.js), [src/sim/population/cohorts.js](../../src/sim/population/cohorts.js) | Graph, stock conservation, shipments, demographic ticks |
| RPG domain | [src/sim/factions/politics.js](../../src/sim/factions/politics.js), [src/sim/rpg/consequencePipeline.js](../../src/sim/rpg/consequencePipeline.js), [src/sim/combat/combat.js](../../src/sim/combat/combat.js), [src/sim/lod/simLod.js](../../src/sim/lod/simLod.js) | Factions, opportunities, NPC promotions, combat, simulation LOD |
| Simulation persistence | [src/sim/persistence/snapshot.js](../../src/sim/persistence/snapshot.js), [src/sim/persistence/canonicalSerialize.js](../../src/sim/persistence/canonicalSerialize.js), [src/sim/persistence/SimulationReplay.js](../../src/sim/persistence/SimulationReplay.js), [src/sim/persistence/ReplayArchiveReader.js](../../src/sim/persistence/ReplayArchiveReader.js), [src/sim/persistence/IndexedDbSaveStore.js](../../src/sim/persistence/IndexedDbSaveStore.js) | Snapshot/checksum/replay and IndexedDB transactional behavior |
| Editor persistence | [src/editor/WorldDocument.js](../../src/editor/WorldDocument.js), [src/editor/storage.js](../../src/editor/storage.js), [src/editor/BrowserStorageRecord.js](../../src/editor/BrowserStorageRecord.js), [src/editor/world/worldConstants.js](../../src/editor/world/worldConstants.js) | **Different** world document schema and editor save behavior |
| Coordinates | [src/editor/world/WorldCoordinates.js](../../src/editor/world/WorldCoordinates.js), [src/editor/world/CoordinateSpaces.js](../../src/editor/world/CoordinateSpaces.js), [src/editor/world/FloatingOrigin.js](../../src/editor/world/FloatingOrigin.js) | Signed cells/chunks, Z sign, floating origin |
| Streaming | [src/editor/world/TerrainStreamingPlan.js](../../src/editor/world/TerrainStreamingPlan.js), [src/editor/world/WorldChunkWorkerClient.js](../../src/editor/world/WorldChunkWorkerClient.js), [src/editor/world/WorkerBackedWorldStore.js](../../src/editor/world/WorkerBackedWorldStore.js), [src/editor/InfiniteTerrainView.js](../../src/editor/InfiniteTerrainView.js) | Deterministic resident selection, worker queue, cancellation, slot recycling |
| World documents/chunks | [src/editor/world/InfiniteWorldStore.js](../../src/editor/world/InfiniteWorldStore.js), [src/editor/world/ChunkDocumentCodec.js](../../src/editor/world/ChunkDocumentCodec.js), [src/editor/world/generateWorldChunk.js](../../src/editor/world/generateWorldChunk.js) | Procedural regeneration, edited chunks, sparse/dense encoding |
| Azgaar world and sim | [src/editor/import/AzgaarJsonImporter.js](../../src/editor/import/AzgaarJsonImporter.js), [src/editor/import/AzgaarMacroWorldSource.js](../../src/editor/import/AzgaarMacroWorldSource.js), [src/editor/world/AzgaarMacroWorldGenerator.js](../../src/editor/world/AzgaarMacroWorldGenerator.js), [src/sim/import/projectAzgaarWorld.js](../../src/sim/import/projectAzgaarWorld.js) | Separate gameplay world guidance and simulation projection, full metadata |
| Biomes | [src/editor/AzgaarBiomeCatalog.js](../../src/editor/AzgaarBiomeCatalog.js), [docs/adding-a-biome.md](../adding-a-biome.md) | 13 IDs, custom biomes, ecology/display rules |
| Towns/workshop | [src/editor/world/settlements/SettlementPlanner.js](../../src/editor/world/settlements/SettlementPlanner.js), [src/editor/towns/TownStreamer.js](../../src/editor/towns/TownStreamer.js), [src/editor/workshop/](../../src/editor/workshop/) | Semantic plans vs authored meshes vs runtime rendering |
| Rendering | [src/render/](../../src/render/), [src/editor/stylized/](../../src/editor/stylized/), [src/editor/water/](../../src/editor/water/), [src/editor/voxel/](../../src/editor/voxel/) | Three.js-specific render logic and reusable data/math |
| Config/QA | [editor.config.yaml](../../editor.config.yaml), [config/](../../config/), [docs/perf-qa.md](../perf-qa.md), [scripts/run-perf-qa.mjs](../../scripts/run-perf-qa.mjs), [scripts/run-world-visual-qa.mjs](../../scripts/run-world-visual-qa.mjs) | Effective settings, actual GPU backend, reproducible visual and performance evidence |

### Verified compatibility facts (never merge these without an explicit conversion)

- Editor document format: **INFINITE_WORLD_FORMAT_VERSION = 6**, in src/editor/world/worldConstants.js.
- Simulation snapshot schema: **SIMULATION_SCHEMA_VERSION = 1**, in src/sim/persistence/snapshot.js. Schema version, document version, generator version and projection version are distinct.
- Default world pages: 64×64 cells with 65×65 shared height samples, world seed and bounded cache/slot residency.
- Canonical standard Azgaar biome IDs: 0–12; extra biome IDs: 32–254.
- Default calendar in src/sim/config/defaultSimulationConfig.js: 60 ticks/hour, 24 hours/day, 30 days/month, 12 months/year.
- WorldCoordinates.js: cellX = floor(worldX / tileSize); cellZ = floor(-worldZ / tileSize); cell center (x,z) = ((cellX+0.5)*tileSize, -(cellZ+0.5)*tileSize).
- WORLD_MAX_SAFE_CELL_COORDINATE = 0x3fffffff. Chunk keys use a colon delimiter.
- src/sim/persistence/canonicalSerialize.js sorts plain object keys, normalizes Map/Set, stringifies bigint, excludes undefined object properties and rejects non-finite values. Its 8-character FNV-1a-like checksum iterates **JavaScript UTF-16 code units**, not UTF-8 bytes. Compatibility testing must include Unicode and JS JSON number formatting.
- src/sim/index.js creates command IDs from command type, world ID and command sequence; dispatch and dispatchBatch have distinct transactional behavior. Some facade operations may bypass the generic command path and must be audited separately.
- src/editor/WorldDocument.js attempts transactional rollback of world/object/voxel data on failed load. Simulation saves have their own transactional IndexedDB contract.
- GPU FFT kernels under src/editor/water/fft/OceanFftGpuKernels.js are Three.js TSL. The numerical method can be ported, **not** the TSL node graph directly.

**Critical unknown:** Whether src/main.js actually wires the editor gameplay into src/sim/index.js, and whether editor v6 exports contain the simulation snapshot. **PR-00A must prove the answers from call sites; do not assume a unified authority.**

## 3. Phase 0 deliverables and file organization

This document is the only Phase 0 artifact created by the planning task. The following are future implementation outputs.

~~~text
docs/
  architecture/
    rust-bevy-phase-0-ownership-audit-YYYY-MM-DD.md
    rust-bevy-phase-0-adr-YYYY-MM-DD.md
  qa/
    rust-bevy-phase-0-YYYY-MM-DD/
      README.md
      manifest.json
      simulation-results.json
      world-results.json
      persistence-results.json
      benchmark-summary.json
      screenshots/                 # Curated reference images
test/
  fixtures/
    rust-bevy-phase0/
      scenarios.json
      simulation-goldens.json
      serialization-goldens.json
      world-goldens.json
scripts/
  generate-rust-bevy-phase0-goldens.mjs
  verify-rust-bevy-phase0-goldens.mjs
test/
  rust-bevy-phase0-goldens.test.js
tmp/
  rust-bevy-phase0/               # Noncommitted raw logs/captures
~~~

The YYYY-MM-DD suffix is the **actual execution/update date**, per CLAUDE.md. Existing large maps, browser profiles and raw frame/heap traces are **not duplicated or committed**. Store hashes, references and selected compact evidence. If a proposed file already exists on new main, inspect and integrate rather than overwrite.

---

# PR-00A — Source architecture, contracts and migration ADR

**Definition of done:** A code-referenced ownership audit and accepted architecture decision record. **Documentation-only** commit to main.

### A01. Baseline provenance

Record: latest HEAD SHA, repo dirty/clean status, date, Node version, package.json and lockfile dependency versions, browser runtime requirements, GPU/renderer options, map input files, YAML config files and their SHA-256 hashes.

Read CLAUDE.md, AGENTS.md, README.md, docs/perf-qa.md, docs/architecture/workshop-geometry-framework.md and the parent roadmap. Check for newly added Rust, Bevy, simulator or NPC modules elsewhere in the repository. Do not rely on an outdated source inventory.

Output in ownership audit: a header containing verified source provenance, exact commands used to inspect it, and a list of relevant new files since the plan's baseline commit.

### A02. Browser/editor call graph

Trace exact function calls and state handoffs:
1. src/main.js/bootstrap -> config load/validation -> editor and render controllers.
2. Import action -> Azgaar full JSON -> import worker/macro guidance -> version 6 document.
3. View/camera state -> world/cell coordinate conversions -> chunk priority -> worker generation -> bounded GPU slots.
4. Terrain sculpt/paint, object placement, voxel stamps -> world state edits and persistence.
5. Simulation UI, if any -> actual simulation API or a different engine (mark verified or not integrated).
6. Asset residency -> settlement plans/workshop -> rendered scene meshes and postprocessing.
7. Editor document save/export/load -> IndexedDB/fallback -> transaction rollback.
8. Device loss/renderer restart and worker shutdown paths.

Produce a Mermaid flowchart where every edge is labeled with real source function or clearly marked not yet verified. Do not draw aspirational architecture as existing functionality.

### A03. Simulation call graph

Trace:
1. createMiniCampaignFixture -> createSimulationWorld -> Azgaar simulation projection, definition and state.
2. createCommandEnvelope -> dispatcher -> validation -> reducer -> accepted state/events/command journal and result.
3. rejected command -> diagnostics/reason log -> runtime resource rollback.
4. clock/scheduler -> daily economy/logistics and monthly population/factions.
5. geography/path cache, trade, settlement LOD, NPC promotion, combat, opportunities/contracts.
6. query/presentation APIs -> caller(s), including whether connected to src/main.js.
7. save/load/replay -> snapshot, journal/archives, IndexedDB/in-memory adapters.

Mark every graph crossing between browser editor and simulator as **confirmed**, **explicit adapter**, **independent/unconnected**, or **unknown**. Cite caller and callee.

### A04. Required ownership matrix

For each domain below, provide columns: current source function; writer; readers; authority; persistence owner and field/schema; update frequency; deterministic inputs; future Rust owner; future Bevy owner; bridge type; existing tests; migration risk; deletion/rollback condition.

Required domains: world ID/seed; tick/calendar; command sequence; entity IDs; economy/inventory; trade/shipment; geography/path; culture/religion; factions/diplomacy; populations/cohorts; named NPC/history; opportunities/contracts; combat; events/journals; state snapshots; simulation LOD; editor object placement; terrain edits; Azgaar atlas; generated heightfield; chunk residency; floating origin; town plans; workshop semantic building state; static authored assets; characters/rigs; collisions/voxel-only surfaces; weather and lighting; vegetation and biome materials; ocean/FFT/foam; rendering/postprocessing; audio/VFX; configs/UI.

All rows must answer: **what is authoritative versus derived/cache-only?** Bevy ECS entity IDs, mesh handles and render transforms are not persistent world identity.

### A05. Field-level simulation wire contract

Extract from source (not guess) the exact shape and semantics of:
- command: id, type, issuedAtTick, actorId, expectedWorldRevision, payload, source;
- accepted/rejected response, error code, message, state/revision, ordered events, optional result;
- domain event: observed fields, type and generated ID scheme;
- entity envelope: ID, kind, data, revision/destroyed fields;
- validation, optimistic revision, atomicity and allowed mutations;
- command sequences before/after failures, duplicate IDs and cross-session replay;
- batch rollback of state, ledger, LOD and history; AggregateError fallback;
- event chronology, periodic cadence commands, bounded journals/reason logs.

Inspect all facade methods for mutations outside generic dispatch (such as graph building and selected access policy helpers). Do not design the Rust boundary assuming all current writes are already normalized.

Document a proposed **versioned command/event/query/snapshot DTO**, mapping every proposed field to an existing JS source or explicitly marking it new. No code implementation in PR-00A.

### A06. Canonical JSON, checksum and error contract

Use src/sim/persistence/canonicalSerialize.js, commandEnvelope.js and snapshots. Document exact observed behavior for: plain/nested objects, key sorting, arrays, Map/Set ordering, escaped characters, accented Unicode and emoji/surrogate pairs, -0, decimals/exponents, bigints, undefined object entries vs undefined array entries, unsafe integers, NaN/Infinity, unsupported types and circular structures.

For each case document: JS input expression; canonical JSON; compatibility checksum or exact error; why naive Rust serde JSON/hash might differ. FNV-style checksum must be distinguished from SHA-256 provenance hashes. **Never silently swap algorithms** during migration.

### A07. Two distinct persistence contracts

Create a matrix and sequence diagram for:

**Editor world document v6:** src/editor/WorldDocument.js, InfiniteWorldStore.js, ChunkDocumentCodec.js, storage.js, BrowserStorageRecord.js. Include seed/generator version, sparse/dense terrain, Azgaar compressed guidance, objects, voxel stamps, collision schema, IndexedDB/fallback, import/export, failure and rollback semantics. Older native world formats 1–5 are not currently supported; do not invent compatibility.

**Simulation snapshot schema v1:** src/sim/persistence/snapshot.js, canonicalSerialize.js, SimulationHistory.js, IndexedDbSaveStore.js, ReplayArchiveReader.js, SimulationReplay.js. Include world/projection/source fingerprint, calendar/revision, stable entities, journal segment archive, clock and scheduler, in-memory vs browser store and corruption handling.

Required answers: whether one format embeds the other; how each is created/loaded in UI; storage database/namespace/slot; migration version checks; duplicate/failed save outcomes; restart behavior; if existing UI exposes the simulator snapshot. Missing connectivity must be marked a gap, not “already integrated.”

### A08. Spatial and generation contracts

Document with numeric examples:
- cell/chunk world coordinate transformations and flipped world Z;
- negative coordinate floor division and positive modulo;
- reserved tile 255, sparse/dense chunk codec, maximum safe cell coordinates;
- 64×64 cells and 65×65 shared height samples, edit propagation across a boundary;
- floating-origin rebase changing render coordinates only;
- load/unload radii, predicted camera velocity, priority tie-break, slot pool and cancellation;
- deterministic chunk generation from seed/version/canonical coords, generator version;
- Azgaar 13 standard biome identities, custom ID range, source physical scale and atlas format;
- state/province/culture/religion/burg/river/route metadata and ocean transition outside imported bounds;
- settlement deterministic plan signatures versus geometry derived from plans.

The audit must distinguish derived height/mesh caches from authoritative edit overrides. Document where source data is insufficient for actual physical cave collision.

### A09. GPU and editor portability audit

Inventory src/render/, src/editor/stylized/, src/editor/water/fft/, src/editor/voxel/, src/editor/workshop/ and src/editor/world/settlements/.

Create a table with **feature, reusable math/data, Three.js/TSL/WebGPU binding, Bevy equivalent category, preprocessing required, asset/texture portability, existing QA, unknowns and migration risk**. Include:
- ocean FFT and shoreline foam, breaking/refraction, reflections;
- grass/forest representations, alpha mip levels and impostors, biome layers;
- GPU marching cubes and lack of CPU collider for GPU-only surfaces;
- authored GLB animations, KTX2, meshlet experiments and meshoptimizer;
- runtime procedural town geometry, semantic workshop edits and local rebuilds;
- device loss, GPU resource residency, postprocessing and shadows.

This is an inventory, **not** an implementation or guarantee of Bevy feature parity. Include third-party license constraints and shader source conversion risk.

### A10. ADR and risk register

Produce docs/architecture/rust-bevy-phase-0-adr-YYYY-MM-DD.md with explicit decisions:
1. Headless Rust authority / engine independence.
2. Existing Three.js editor remains supported.
3. Bevy as optional native client after a single-region proof.
4. One session authority; future shadow mode is read-only.
5. Separate adapters for editor document v6 and simulation schema v1.
6. Persistent global IDs/coordinates vs ephemeral renderer entities/origin.
7. Versioned protocol before choosing WASM or local/remote transport.
8. No port of advanced graphics before benchmarks and matched quality.
9. Runtime configuration in YAML with validated values.
10. No GitHub Actions; main-only, bounded commits.

Each decision includes: context, chosen option, alternatives rejected, consequences, revisit evidence and stop/rollback rule.

Create a **risk register with likelihood (Low/Med/High), impact (Low/Med/High), code evidence, mitigation, detection test, owner and go/no-go** for: unconnected sim and editor authorities; incompatible saves; JS/Rust checksum/number mismatch; RNG and event order; negative coords; shader/TSL port; reduced foliage quality; GPU capability mismatch; WebGL/software adapter false benchmarks; worker concurrency/stale chunks; sparse edit loss; NPC memory divergence; huge fixtures and asset licensing; concurrent main edits.

### A11. PR-00A required evidence and acceptance

- [ ] Current main and versions/hashes recorded.
- [ ] Browser and simulation call graphs follow real caller/callee paths.
- [ ] Any missing integration between src/main.js and src/sim/index.js explicitly reported.
- [ ] Complete authority/writer/reader/persistence matrix for all required domains.
- [ ] Editor v6 and simulator v1 save contracts separate and mapped.
- [ ] Command, event, clock, error/replay and checksum contracts field-level.
- [ ] Worked signed-coordinate/biome/chunk/floating-origin examples.
- [ ] GPU portability map and concrete asset/visual risks.
- [ ] Dated ADR, risk register and first open decisions exist.
- [ ] All Markdown source links verified; no production edits.
- [ ] Commit/push to main and record SHA and exact changed file list.

**PR-00A should not add test scripts or fixture outputs.** It defines what PR-00B will capture.

---

# PR-00B — Golden fixtures, deterministic tests, browser baselines

**Prerequisite:** PR-00A accepted; pull and inspect its actual files in latest main.  
**Definition of done:** deterministic, automatically verified golden corpus plus reproducible (or explicitly blocked) hardware visual and frame-pacing baseline evidence.

## B01. Implement minimal test-only fixture tooling

Create:
- scripts/generate-rust-bevy-phase0-goldens.mjs — explicit --write to refresh committed fixtures; --out PATH for dry-run output; no writes by default.
- scripts/verify-rust-bevy-phase0-goldens.mjs — regenerates in memory or tmp, compares exact expected outputs, reports first path/value divergence and exits nonzero.
- test/rust-bevy-phase0-goldens.test.js — integrated with existing npm test discovery, uses stable fixtures.
- test/fixtures/rust-bevy-phase0/scenarios.json — scenario catalog specifying ID, seed/inputs, deterministic operation sequence, output types and owner module.
- test/fixtures/rust-bevy-phase0/serialization-goldens.json, simulation-goldens.json and world-goldens.json — compact expected values.

Split large scripts into small modules under scripts/lib/rust-bevy-phase0/ based on sole responsibility (scenario registry, capture, normalized projection, verifier, file I/O). No new test framework or npm dependency. Use Node built-ins, existing exported modules and actual existing sample maps.

**Suggested invocation contract (these commands do not exist until PR-00B implements them):**

~~~bash
node scripts/generate-rust-bevy-phase0-goldens.mjs --out tmp/rust-bevy-phase0/dry-run
node scripts/generate-rust-bevy-phase0-goldens.mjs --write
node scripts/verify-rust-bevy-phase0-goldens.mjs
node --test test/rust-bevy-phase0-goldens.test.js
npm test
~~~

--write is **never automatic**, requires explicit approved semantic updates, and should refuse a dirty source tree. Verification must never rewrite expected files. Include help/invalid args, typed error handling, nonzero failure codes, safe output paths, deterministic stable ordering. Use structured logs. No wall-clock time, random UUID, filesystem absolute path, generated device info or unstable Map iteration in goldens.

**Artifact SHA-256 hashes** are provenance, not the existing simulation checksum; keep both separated and algorithm-labeled.

## B02. Simulation golden scenario set (S00–S23)

Use createSimulationWorld({ campaign: createMiniCampaignFixture() }) as the main source, createInMemorySaveStore for Node-only save fixtures, and derive IDs via world.queries()/world.state. The checked-in mini-campaign has three settlements, routes, provinces, culture and religion. For valid domain actions requiring more data, add a **small explicit input fixture** instead of hardcoding magic IDs. Use only real public methods or individually labeled exported module-level contracts.

| ID | Deterministic operations | Golden evidence / assertions | Existing reference |
| --- | --- | --- | --- |
| S00 | createEmptyWorldState() | Empty collections, revision, calendar, diagnostics | src/sim/model/worldState.js |
| S01 | Create mini campaign, no commands | World ID, seed/fingerprint, entity IDs, snapshot | src/sim/index.js |
| S02 | initializeSystems() | Ordered events, initialized factions/economy/population | src/sim/index.js |
| S03 | stepTicks(1) | Clock == calendar tick, no early daily event | test/simulation-state-consistency.test.js |
| S04 | initialize + stepDays(2) | Daily journal tick order and ledger entries | test/simulation-command-chronology.test.js |
| S05 | initialize + stepMonths(1) | Day/month cadence, population and economy | src/sim/time/worldClock.js |
| S06 | initialize + stepMonths(2) | Stable market/cohort/faction projection and checksum | src/sim/economy/stockFlow.js |
| S07 | Valid sim.patchEntity settlement rename | Stable ID, state revision, accepted event/journal | src/sim/commands/dispatcher.js |
| S08 | Invalid/missing entity and revision | Exact rejection codes, no partial mutation | test/simulation-command-transaction.test.js |
| S09 | Good+bad dispatch batch, using actual accessible API | All-or-nothing state/ledger/LOD/journal | test/simulation-command-transaction.test.js |
| S10 | Build graph, route query, change access/danger, query | Reachability, cache invalidation and tie-break order | src/sim/geography/geographicGraph.js |
| S11 | Plan/advance shipment and trade | Quantity, IDs, route, conservation, ledger | src/sim/logistics/shipments.js |
| S12 | Promote person from real settlement | Persisted name/role, stable ID and cohort effects | src/sim/population/cohorts.js |
| S13 | Promote/demote settlement LOD tiers | Events, tier persistence and replay | src/sim/lod/simLod.js |
| S14 | Faction relationship/valid conflict | Diplomacy and ordered consequence events | src/sim/factions/politics.js |
| S15 | Detect/discover/accept/resolve valid contract | Lifecycle, reason codes, world consequence | src/sim/rpg/consequencePipeline.js |
| S16 | Supported encounter and combat | Combat result/ticks/status and ordered events | src/sim/combat/combat.js |
| S17 | Snapshot then replay commands in fresh world | State/checksum, new command ID sequence | test/simulation-replay-isolation.test.js |
| S18 | Save, restore and continue | Checksums, continuing IDs, no history duplication | test/simulation-save-transaction.test.js |
| S19 | Load with invalid scheduler/clock/snapshot | Typed rejection and unchanged live runtime | test/simulation-state-consistency.test.js |
| S20 | Multiple archive segments + corruption | Exact journal order, bounded reads, error | test/simulation-replay-archive-batches.test.js |
| S21 | Custom valid/invalid calendar config | Tick mapping, boundary errors | test/simulation-config-validation.test.js |
| S22 | Known RNG seed sequence | Exact repeatable values and generation IDs | src/sim/util/seededRng.js |
| S23 | Pause, attempt step, resume, step | Clock and event semantics, no unwanted tick | src/sim/time/worldClock.js |

For each scenario capture: ID, actual seed/definition fingerprint, schema versions, starting and ending tick, revision, ordered accepted and rejected command envelopes, ordered events, selected entity projections, diagnostics, exact state and snapshot checksums where available, error codes. Do not store JS internal functions, circular objects or unnecessary huge world dumps.

**Important:** If public facade lacks batch dispatch or a particular action cannot be set up without production changes, mark a separate **module-level** test and document it; never claim user-facing API coverage. Do not invent actual expected checksums or scene IDs. Goldens must come from executing source code.

Run generator twice in **different Node processes** and compare output bytes. Capture actual output/fixture names, not fabricated passing data. Re-run after the main source SHA changes.

## B03. Serialization golden cases (minimum 18)

Produce exact JS input/expected canonical JSON/checksum-or-error pairs for:
1. Insertion-ordered objects with different key order.
2. Nested sorted objects.
3. Empty object, array, Map and Set.
4. Map with string keys.
5. Map with numeric keys (JS string-comparison key ordering).
6. Set ordering/deduplication.
7. Arrays preserving order.
8. Strings with newline/tab/backslash/quotes.
9. Accented/BMP Unicode.
10. Emoji/supplementary Unicode and surrogate pair.
11. -0 versus +0.
12. Fraction and exponent JS JSON notation.
13. JS safe integers and integer boundaries.
14. bigint to decimal string.
15. undefined object field vs undefined array element.
16. NaN and +Infinity/-Infinity rejection.
17. Unsupported Date/function/type behavior.
18. Equivalent Map/object insertion order, same canonical output.
19. Circular references (observed rejection behavior).
20. Nested weird payloads accepted/rejected by commandEnvelope.

Use a static JS case registry for values JSON cannot express. **No eval**. Hash must match checksumCanonical, which is defined in src/sim/persistence/canonicalSerialize.js over JS UTF-16 char codes. Do not substitute Rust or SHA-256 hashing as reference.

## B04. World and Azgaar golden scenarios (W00–W07)

### W00 — signed cell/chunk boundary table

For chunkSize=64, verify both cell X and cell Z axes:

| Cell | Chunk | Local |
| ---: | ---: | ---: |
| -129 | -3 | 63 |
| -65 | -2 | 63 |
| -64 | -1 | 0 |
| -63 | -1 | 1 |
| -1 | -1 | 63 |
| 0 | 0 | 0 |
| 1 | 0 | 1 |
| 63 | 0 | 63 |
| 64 | 1 | 0 |
| 65 | 1 | 1 |
| 128 | 2 | 0 |

Also test worldX/worldZ at exact tile and chunk borders, just before/after zero, negative quadrants, world-Z sign inversion, -0 normalization, invalid nonfinite inputs and maximum allowed cell values. Get expected values from current exports in src/editor/world/WorldCoordinates.js and TerrainStreamingPlan.js.

### W01 — canonical vs render-local floating origin

Use two signed world points, two render origins and a forced origin rebase. Assert render -> canonical -> render round trip and unchanged canonical chunk keys/IDs after rebase. Record exact reference values and documented float tolerance. Existing src/editor/world/FloatingOrigin.js and CoordinateSpaces.js are sources.

### W02 — shared height-edge continuity

Generate two adjacent 64×64 chunks, record the 65 edge height samples (plus corner cases), edit a shared sample and prove both pages refer to the same canonical height value. Test both X and Z edges, including negative chunk coordinates.

### W03 — sparse/dense chunk encoding

Round-trip sparse terrain and height edits and dense imported/modified pages with ChunkDocumentCodec.js. Preserve reserved tile ID 255 and sentinel behavior (existing tests/ChunkDocumentCodec.test.js).

### W04 — deterministic clean chunk regeneration

Generate a fixed set of chunks in different request orders, evict/recreate and compare canonical outputs. Include forest, steep land, coastline and out-of-map ocean near a real Azgaar sample. Record seed, generator version, chunk coords and array checksums.

### W05 — Azgaar projection and guidance

Use test/azgaar-world-guidance.test.js small guidance fixture and **reference** maps/Astalor Full 2026-07-23-20-37.json by SHA-256. Capture source dimensions/scale, compact atlas metadata, all 13 standard biome IDs, deterministic custom biome ID allocation 32–254, sample elevation/temperature/precipitation, river channels, distances, states/provinces/cultures/religions, burgs/routes/markers and ocean transition. No duplicate giant map files.

### W06 — chunk residency planner and worker lifecycle

With fixed focus/velocity/radii/slot pool, record exact descriptor ordering, priorities and slot reuse for: stationary view, predicted advance, diagonal traverse, reverse direction, large teleport, load/unload hysteresis. Include cancellation/retry/late worker response handling through existing worker-client tests; do not invent GPU timings for these CPU fixtures.

### W07 — settlement plans

Generate two representative deterministic settlement plans, record source seed, stable town ID/signature, plot/building counts and a small selected placement transform sample. Distinguish world-level plans from workshop meshes.

**Existing tests to incorporate:** tests/ChunkDocumentCodec.test.js; tests/chunkLodPlanGolden.test.js; test/azgaar-world-guidance.test.js; test/world-chunk-worker-client.test.js; test/world-chunk-worker-count.test.js; test/floating-origin-resilience.test.js; test/settlement-plan-cache.test.js.

## B05. Independent editor world-document cases (E00–E06)

These are **not** simulation snapshots. Test world-document version 6 through actual editor store/model APIs:
- E00: empty generated world create/load roundtrip.
- E01: height/terrain edits and placed objects survive roundtrip.
- E02: optional voxel stamps and collision metadata survive roundtrip.
- E03: full Azgaar source import serializes macro guidance/metadata.
- E04: old/unsupported document version rejected without corrupting live state.
- E05: invalid collision schema version rejected.
- E06: injected load failure restores world, objects and voxels; aggregate rollback failure surfaced when cleanup itself fails.

Reuse existing fixture setup and tests. If browser-only behavior is necessary, use Playwright and label it as such. Keep formats and fixture outputs separate from S00–S23.

## B06. Browser simulation persistence QA

Run existing full browser-storage QA; it launches a source-snapshot server, exercises actual IndexedDB in a persistent browser profile and restarts the browser context:

~~~bash
node scripts/run-simulation-persistence-qa.mjs tmp/rust-bevy-phase0/simulation-persistence-qa.json
~~~

This tests restart persistence, exact state/snapshot checksums, pending/overlapping save transactions, archive order, bounded reason-log memory, namespace isolation, failed commit retry, missing IndexedDB detection, and corrupt-save rejection without replacing the valid world.

**Do not use this test for graphics performance:** its browser is headless with GPU disabled.

Run and record existing focused Node tests:

~~~bash
node --test \
  test/simulation-clock-chronology.test.js \
  test/simulation-command-chronology.test.js \
  test/simulation-command-transaction.test.js \
  test/simulation-state-consistency.test.js \
  test/simulation-snapshot-boundaries.test.js \
  test/simulation-snapshot-migrations.test.js \
  test/simulation-replay-isolation.test.js \
  test/simulation-replay-archive-batches.test.js \
  test/simulation-history-retention.test.js \
  test/simulation-save-transaction.test.js
npm test
npm run verify
~~~

Use Windows-compatible shell syntax if needed. Record exact invocation, exit code, relevant log/error and source SHA. An already-failing test must be reported accurately, not silently repaired by a Phase 0 runtime edit.

## B07. Valid performance baseline (P00–P10)

Read [docs/perf-qa.md](../perf-qa.md) **immediately before running**. The harness requires the app to be served, correct warmup/settle, visible hardware Chromium, no software WebGPU fallback or WebGL substitution, and comparable foreground runs.

**Hardware/measurement envelope:**
- Hardware reference: native Windows headed Chromium or the documented Windows wrapper from WSL; actual GPU adapter and browser version recorded.
- Resolution 1280×720, deviceScaleFactor 1. Separate 1920×1080 visual study optional; never merge.
- Default comparison warmup 8 s, settle enabled, 12 s measured time (record scenario-specific deviations), same camera/seed/config.
- Report cold startup time **separately** from warm/settled pacing.
- Focus loss, throttling, fallback adapter, WebGL, settle timeout or missing report => **invalid capture**; keep as rejection evidence and repeat.
- Never perform CPU/heap profiling in the quoted frame-pacing run; diagnostics must be separate captures.
- At least one **valid** capture per mandatory scenario, and repeatability samples on chunk-cross, dense vegetation and settlement revisit. Ideally three repeats when feasible; do not invent rates.

**Run server first:**

~~~bash
npm install
npm run dev
~~~

**Native hardware invocation (choose ONE route):**

~~~bash
# Windows or WSL, Windows hardware Chromium:
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --settle \
  --out tmp/rust-bevy-phase0/perf-chunk-cross.json

# Native non-WSL hardware Chromium:
npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 --settle \
  --out tmp/rust-bevy-phase0/perf-chunk-cross.json
~~~

| ID | Existing scenario | Required comparison purpose |
| --- | --- | --- |
| P00 | move | Character baseline and fixed forward motion |
| P01 | diagonal | Predictive streaming on diagonal path |
| P02 | chunk-cross | Frame hitches at chunk boundaries |
| P03 | edited-world | In-motion height/biome edits and worker rebuild |
| P04 | object-town, buildings=256 | Heavy town/building density |
| P05 | diagonal, density=dense-mixed | Dense vegetation and ground cover |
| P06 | settlement-approach | Authored imported town approach |
| P07 | settlement-approach with revisit and turn-on-revisit | Camera return/turn recovery |
| P08 | construction-ring, x=0,z=-100,yaw=180 | Real walls in view, not default misleading spawn |
| P09 | water-acceptance via dedicated QA driver | Land/water/swim/dive/surface recovery |
| P10 | optional gpuTimings=1 | Render-pass GPU timings if device supports timestamps |

For P07 inspect documented --revisit / --turn-on-revisit options. For P09 use the existing npm run qa:water:acceptance or perf matrix dedicated driver, not an unsupported assumption that a plain qa:perf scenario provides full acceptance checks.

**Explicit P08 example:**

~~~bash
npm run qa:perf:windows -- \
  --qa construction-ring --x 0 --z -100 --yaw 180 \
  --warmup 10 --duration 12 --settle \
  --out tmp/rust-bevy-phase0/perf-construction-ring.json
~~~

Extract: average FPS, frame dt mean/p50/p95/p99/max, hitches/hitch rate/threshold, frames measured, per-phase CPU timings, WebGPU timestamps if supported, backend and fallback flags, worker/terrain streaming counters, resident chunks/GPU slots and actual available memory metrics, collision readiness, scenery settle/recovery, config/asset hash and invalid capture reasons. Record **not available** for missing metrics, not zeros.

No invented FPS target or automatic win for Rust. Bevy comparisons occur later, with equivalent scenes, assets and settings.

## B08. Visual reference capture

Reuse [scripts/run-world-visual-qa.mjs](../../scripts/run-world-visual-qa.mjs), [scripts/lib/world-visual-poses.mjs](../../scripts/lib/world-visual-poses.mjs), existing pose sources and QA harnesses; inspect actual --suite/--only/--out support before use.

Capture at least these **distinct** reference anchors where stable existing fixtures exist:
- grassland/savanna terrain blend;
- temperate forest canopy plus understory;
- rainforest density and distance LOD;
- snow/tundra or glacier, snow and moss coat;
- swamp/wetland, pools and transition;
- beach surf, foam, wet sand;
- coastal rock impact/reflections/caustics;
- Stonehold or another representative detailed city street;
- far-terrain landscape, mountains and horizon;
- hero/player-scale navigation in a settlement.

For each screenshot save source SHA, map/seed, real canonical world pose, rotation/FOV, viewport, quality/render backend, clock/weather, light/exposure, settled state, config/asset hashes and screenshot SHA-256. Do not invent coordinates. Mark an unsupported anchor **missing** and add a deterministic test fixture only if it is a small non-production change.

Screenshots are cross-engine **visual reference** oracles, not blindly pixel-identical pass criteria. Future Bevy runs must match content/camera/exposure before comparisons.

## B09. Baseline manifest and evidence

Emit docs/qa/rust-bevy-phase-0-YYYY-MM-DD/manifest.json with fields:

~~~json
{
  "schemaVersion": 1,
  "phase": "rust-bevy-phase-0",
  "baselineGitSha": "<actual-commit-sha>",
  "capturedAtUtc": "<actual-UTC-timestamp>",
  "source": {
    "repository": "danielsobrado/drusniel-world-builder",
    "branch": "main",
    "workingTreeClean": true
  },
  "runtime": {
    "node": "<actual-version>",
    "browser": "<actual-version-or-not-applicable>",
    "os": "<actual-platform>",
    "gpu": "<actual-adapter-or-unavailable>"
  },
  "contracts": {
    "editorDocumentVersion": 6,
    "simulationSchemaVersion": 1,
    "canonicalChecksumAlgorithm": "js-utf16-fnv1a32"
  },
  "inputs": [
    { "path": "editor.config.yaml", "sha256": "<actual-sha256>" }
  ],
  "commands": [
    { "argv": ["npm", "test"], "exitCode": 0, "logPath": "<actual-report-path>" }
  ],
  "cases": [
    { "id": "S04", "status": "passed", "artifact": "simulation-results.json" }
  ],
  "captureStatus": "complete-or-blocked",
  "blockingIssues": []
}
~~~

Above values with angle brackets are **illustrations only**. Actual manifest values must come from tool execution. Tests must validate mandatory fields and reject fabricated or missing artifacts. Link each case to its input/source and actual output. Keep file checksums and migration-compatibility checksums distinct.

## B10. Reproducible execution order

1. Read and accept PR-00A outputs; pull newest main and capture HEAD.
2. Verify working tree clean; do not overwrite other sessions' changes.
3. Implement fixture scripts (small modules, no runtime changes or new dependencies).
4. Generate serialization golden corpus, then simulation S00–S23, world W00–W07, editor E00–E06.
5. Generate again in a **separate Node process**; require identical output bytes.
6. Run focused JS tests, then npm test and npm run verify.
7. Run Playwright simulation persistence QA; preserve actual report.
8. Run valid hardware WebGPU performance matrix P00–P09 and optional P10, or mark graphics G0 blocked.
9. Capture curated world visual screenshots; preserve exact camera/content provenance.
10. Build manifest, small reports and QA README. Classify pass/blocked/fail per suite.
11. Run the non-writing golden verifier and npm test again.
12. Check git diff contains no src/ changes, production asset/config changes, dependency additions or giant binary/log artifacts.
13. Re-read latest main and reconcile concurrent changes; if source semantics changed, regenerate against approved latest source instead of mixing SHAs.
14. Commit/push directly to main, record commit SHA, test commands and honest failure/limitation summary.

**Golden drift rule:** A changed golden is a failing test. An implementing AI cannot update expected data merely to make tests green. An intentional JS behavior change requires explicit reviewed source diff, approved fixture refresh, and a note identifying which invariant changed.

### PR-00B acceptance checklist

- [ ] Generator, verifier and Node test run from clean checkout.
- [ ] S00–S23 simulation cases captured or explicitly blocked with concrete cause.
- [ ] At least 18 serialization cases include exact canonical outputs/errors.
- [ ] W00 signed coordinate table, Z-flip, -0, W01–W07 generator/streamer cases covered.
- [ ] E00–E06 editor v6 document scenarios covered independently of simulation.
- [ ] Byte-identical results from two separate Node processes.
- [ ] Existing focused tests, npm test and npm run verify results documented.
- [ ] IndexedDB restart, corruption and transactional QA executed (or explicit browser blocker).
- [ ] Hardware WebGPU baseline P00–P09 captured **validly** (or explicit G0 graphics blocker).
- [ ] Reference biome/terrain/ocean/city screenshots and camera metadata captured (or blocker).
- [ ] Manifest contains actual source/config/map hashes and command exit codes.
- [ ] No production source, dependencies, assets, config or renderer changes.
- [ ] Verification never rewrites goldens; diff is reviewable and small.
- [ ] Commit/push to main; no GitHub Actions, branches, worktrees or force-push.

---

## 4. Phase 0 gate and stop conditions

**G0 PASS:** Both audit and ADR are accepted; exact JS serializer and simulation/world fixture corpus is deterministic; persistence behavior is recorded; hardware WebGPU visual/performance baseline evidence is valid; artifacts have verifiable source hashes and commands; browser/game runtime is untouched.

**G0 BLOCKED:** Hardware WebGPU not available, sources not runnable or required fixture tooling cannot run. Clearly separate successful architecture/fixture sub-gates from blocked graphics metrics. A Phase 1 workspace-only skeleton may be authorized after the *architecture and deterministic fixture gates* pass, but renderer migration or performance claims must remain blocked.

**G0 FAIL:** Actual replay drift, nondeterministic world generation, corrupted saves, invalid state mutation or broken core invariant revealed by tests. Document the smallest source fix as a **separate future work item**, do not smuggle it into PR-00A/B.

### Risk assessment: minimum mandatory entries

| Risk | Detection | Required mitigation |
| --- | --- | --- |
| Sim and editor unconnected | Exact call graph from src/main.js and src/sim/index.js | Explicit protocol/adapter planning, no fake shared authority |
| Two incompatible save formats | Separate v6/v1 schema and restart fixtures | Versioned adapters, tested conversions later |
| JS/Rust hash drift | Unicode/JSON/Map/Set golden strings and hashes | Exact compatibility function or intentional new version |
| Tick/event order drift | Daily/monthly sequence and replay tests | Fixed-step command order, deterministic seeds |
| Negative coordinates/Z flip | W00/W01 signed boundary and rebase tests | Canonical world coordinate contract |
| Worker race / stale chunks | W06 and worker lifecycle tests | Versioned job cancellation/commit ownership |
| GPU/TSL mismatch | Renderer portability audit | Defer until native proof and measured adaptation |
| Misleading performance | Hardware adapter, backend/settle validation | Reject software/WebGL/focus-lost captures |
| Reduced art/forest/ocean quality | Stable reference captures and asset manifest | Comparable scene/quality gate |
| Massive fixture bloat | Artifact path/size inspection | Compact JSON, source-map hash references |
| Concurrent main changes | Pre-write HEAD/source check | Regenerate on latest approved baseline, no force-push |

No subjective success scores or invented numeric speedups.

## 5. Handoff to Phase 1

Required accepted artifacts:
1. Audit of browser and simulation authorities, including verified missing or present integration.
2. Field-level, versioned command/event/state/save contracts and an ADR.
3. Exact deterministic JS goldens for serialization, time/RNG, replay, world coordinates, Azgaar and terrain.
4. Explicit **world document v6 vs simulation schema v1** compatibility boundaries.
5. Verified browser storage/corruption behavior and source/test provenance.
6. Hardware WebGPU performance and visual references, or an explicitly blocked graphics gate.
7. Migration risks and limitations requiring later design decisions.

Phase 1 creates the Rust workspace and protocol **only after** these are sufficient to avoid guessing current behavior. Bevy itself is not introduced during Phase 0.

## 6. Implementation prompts

### PR-00A prompt

Read CLAUDE.md, AGENTS.md, README.md, the parent Rust-Bevy migration roadmap, and docs/plans/rust-bevy-phase-0-architecture-audit-and-baselines-2026-11-22.md. Inspect latest main, trace both actual call graphs and execute **PR-00A only**. Write dated ownership audit and architecture ADR documents. Include exact source references, verified integration boundaries, field-level simulation commands/events/IDs, separate editor v6 and simulation v1 saves, canonical serializer/checksum, signed coordinates, Azgaar/biome/chunk rules, GPU portability table, and detailed risk register. Verify links and cite current functions. Do not change any runtime file, tests, scripts, assets or dependencies. Commit and push main, reporting file paths, commit, decisions and blockers.

### PR-00B prompt

Read accepted PR-00A outputs and docs/plans/rust-bevy-phase-0-architecture-audit-and-baselines-2026-11-22.md. Inspect latest main and execute **PR-00B only**. Implement deterministic small JavaScript golden generator/verifier and Node test. Create scenario corpus S00–S23, 18+ canonical JSON cases, W00–W07 world tests, E00–E06 editor v6 tests, all generated from real source behavior. Run focused existing simulation tests, browser IndexedDB persistence QA, hardware WebGPU perf scenarios P00–P09 using docs/perf-qa.md, and curated visual QA poses. Preserve source hashes, environment, exact commands, results and any blockers. Never invent metrics or auto-refresh goldens. Do not change runtime src/, assets, configs or dependencies and do not add Rust/Bevy yet. Commit and push main, reporting pass/blocked/fail evidence.

## 7. References

- [Parent Rust + Bevy roadmap](rust-bevy-incremental-migration-2026-11-22.md)
- [Repository guidance](../../CLAUDE.md) and [AGENTS.md](../../AGENTS.md)
- [README](../../README.md), [Performance QA guide](../perf-qa.md), [Adding a biome](../adding-a-biome.md), [Settlement rendering](../settlement-rendering-2026-11-26.md)
- [Simulation API](../../src/sim/index.js), [Canonical checksum](../../src/sim/persistence/canonicalSerialize.js), [Snapshot](../../src/sim/persistence/snapshot.js)
- [Coordinate conversion](../../src/editor/world/WorldCoordinates.js), [World document](../../src/editor/WorldDocument.js), [Chunk codec](../../src/editor/world/ChunkDocumentCodec.js)
- [Simulation browser persistence QA](../../scripts/run-simulation-persistence-qa.mjs), [Performance harness](../../scripts/run-perf-qa.mjs), [Visual QA harness](../../scripts/run-world-visual-qa.mjs)

**Reminder:** This document defines Phase 0 work. No PR-00A audit, PR-00B golden fixtures, hardware benchmarks, Rust code, or Bevy code are claimed to exist by writing this plan.
