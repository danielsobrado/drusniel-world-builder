# Phase 1 — Rust workspace, canonical protocol and JS compatibility boundary

**Status:** Implementation plan; **not implemented**.  
**Last updated:** 2026-11-27.  
**Target branch:** main (direct commits only; no feature branches or worktrees).  
**Latest inspected main at plan authoring:** db8d4366253c410426192bfa22b8e4b38b63637a.  
**Parent roadmap:** [Rust + Bevy incremental migration](rust-bevy-incremental-migration-2026-11-22.md).  
**Predecessor:** [Detailed Phase 0 audit and golden baseline plan](rust-bevy-phase-0-architecture-audit-and-baselines-2026-11-22.md).  
**Phase work packages:** **PR-01A — native Cargo workspace**; **PR-01B — protocol, validation, canonical compatibility and parity tests**. PR-01B can use two sequential reviewable commits (model/validation and conformance), but is one acceptance gate.  
**Final Phase 1 gate:** **G1-protocol**: Rust can validate and round-trip supported existing JS command/event/entity/snapshot records and reproduce relevant golden serialization/checksum behavior; no Rust simulation engine, graphics, browser adapter or authoritative runtime switch is introduced.

> **Implementer instruction:** Read this document, the parent roadmap, Phase 0 plan, and actual accepted PR-00A/PR-00B outputs. Read CLAUDE.md and AGENTS.md. Inspect newest main immediately before editing and again before pushing. Implement only the assigned work package, run the named tests, and commit/push directly to main without overwriting concurrent changes. All newly introduced source paths in this document are proposals, not current code.

---

## 1. Executive decision and explicit scope

The first Rust code must not become a second simulation or game. Phase 1 creates a **small, isolated, correctly versioned library boundary**, capable of expressing the present JS simulation data and future client transport without depending on Bevy, Three.js or a browser.

**In scope:**
- Pinned Rust toolchain and Cargo workspace under native/.
- Four minimal library crates, with a strict dependency direction.
- External YAML example/default config and validated loader, not duplicated game balance constants.
- Rust DTOs and pure validators for the current command/event/entity/simulation-snapshot data shapes.
- Distinct future bridge transport envelopes with explicit protocol version, correlation and errors.
- Stable persistent IDs, entity kinds/status, signed coordinates, Azgaar biome IDs, calendar and finite numeric boundaries.
- JS-compatible canonical JSON and checksum conformance over the Phase 0 golden corpus.
- Read-only JSON decoding and encoding; rejection of malformed/unsupported versions.
- Rust tests consuming **committed, actual** Phase 0 fixtures. Local verification scripts and documentation.
- Structured tracing-ready diagnostics and typed, stable errors.

**Out of scope:**
- World-state mutations, reducer logic, tick advancement, seeded RNG, factions/economy/NPC rules, save transaction implementation.
- GPU, Bevy, wgpu/WGSL, physics, asset loading, ocean, terrain generation or rendering.
- WASM compilation, a network server, a running protocol endpoint, browser UI/IndexedDB integration.
- Automatic conversion of editor world-document v6 to simulation snapshot v1.
- Modifying JS simulation semantics, world generation, renderer, editor, npm builds or runtime authority.
- Replacing JS golden values to make a Rust test pass.
- New GitHub Actions, deployment pipelines, feature branches or worktrees.

**Non-negotiable rule:** Phase 1 may publish **types, validators, serializers and independent libraries**, but cannot claim that the Rust engine simulates a single day, replays a command or integrates with the web editor.

## 2. Entry gates and dependency on Phase 0

The current inspected main contains the Phase 0 **plan document**, but no completed Phase 0 ownership-audit/ADR documents, no native Cargo workspace, and no Phase 0 golden fixture files. Therefore **do not mark Phase 0 complete** and do not claim Phase 1 implementation or parity exists.

**Before PR-01A:** Require an accepted PR-00A ownership audit and ADR specifying the true relation of src/main.js and src/sim/index.js, independent save formats and ownership of future Rust data. If Phase 0 graphics hardware QA remains blocked, a **workspace-only** PR-01A may still proceed once its architecture boundary is accepted. Record the exception; it does not authorize renderer work.

**Before PR-01B:** Require the PR-00B **deterministic fixture sub-gate**, including actual golden JSON and reproducible generator/verifier, even if full hardware graphics QA is still unavailable. Read its manifest and exact source baseline SHA. Never fabricate missing golden outputs. If PR-00B reveals a serious serialization or persistence defect, block protocol claims until a separately reviewed resolution exists.

**If prerequisites are missing:** first complete the corresponding Phase 0 deliverable. Do not create arbitrary sample goldens or reinterpret the Phase 0 plan as executed acceptance.

**Rebase parity evidence logically, not by manipulating git:** If current main has changed since the fixture baseline, verify whether behavior changed. Re-run source fixture generator and compare before accepting old references. Never perform direct branch rebases; work on the shared main as project guidance requires.

## 3. Source contracts inspected on current main

The following paths exist on the inspected main. They must be rechecked during implementation.

| JS contract | Existing source | Specific Phase 1 impact |
| --- | --- | --- |
| Command creation | [src/sim/commands/commandEnvelope.js](../../src/sim/commands/commandEnvelope.js) | Seven fields and finite payload, default actor/source/null revision |
| Dispatcher | [src/sim/commands/dispatcher.js](../../src/sim/commands/dispatcher.js) | Error codes, command ID/event ID relations, result shape, not implemented yet |
| Event creation | [src/sim/events/domainEvent.js](../../src/sim/events/domainEvent.js) | Seven event fields, sorted entity IDs, stripped private payload keys |
| Entity envelope | [src/sim/model/entityEnvelope.js](../../src/sim/model/entityEnvelope.js) | Eight fields, stable ID, kind/status, ticks/revision, sorted tags |
| Entity kinds | [src/sim/model/entityKinds.js](../../src/sim/model/entityKinds.js) | 22 literal kinds, four statuses, exact camelCase spelling |
| IDs | [src/sim/model/ids.js](../../src/sim/model/ids.js) | Imported ID prefixes, generated opaque IDs, stable-ID rule |
| State collections | [src/sim/model/worldState.js](../../src/sim/model/worldState.js) | Mapping from kind to snapshot collection, calendar, revision and diagnostics |
| World definition | [src/sim/model/worldDefinition.js](../../src/sim/model/worldDefinition.js) | World ID, seed, source fingerprint, projection, cultures and metadata |
| Snapshot | [src/sim/persistence/snapshot.js](../../src/sim/persistence/snapshot.js) | Snapshot shape and checksum, separate schema version |
| Canonical JSON | [src/sim/persistence/canonicalSerialize.js](../../src/sim/persistence/canonicalSerialize.js) | JS-compatible string sorting, number formatting and UTF-16 hash |
| Queries | [src/sim/queries/worldQueries.js](../../src/sim/queries/worldQueries.js) | Query projection and state checksum; pure query types only |
| Model validation | [src/sim/model/validation/validateWorldState.js](../../src/sim/model/validation/validateWorldState.js) | Cross-entity reference rules deferred to Phase 2; basic DTO checks now |
| Calendar and config | [src/sim/time/worldClock.js](../../src/sim/time/worldClock.js), [src/sim/config/defaultSimulationConfig.js](../../src/sim/config/defaultSimulationConfig.js) | Calendar shape, safe ticks and configurable cadence; no ticking in Phase 1 |
| Editor world document | [src/editor/WorldDocument.js](../../src/editor/WorldDocument.js), [src/editor/world/worldConstants.js](../../src/editor/world/worldConstants.js) | Distinct version 6 document; do not decode it as a simulation snapshot |
| Coordinates | [src/editor/world/WorldCoordinates.js](../../src/editor/world/WorldCoordinates.js), [src/editor/world/CoordinateSpaces.js](../../src/editor/world/CoordinateSpaces.js) | Signed cell/chunk keys, Z reversal and finite tile size |
| Azgaar biome catalog | [src/editor/AzgaarBiomeCatalog.js](../../src/editor/AzgaarBiomeCatalog.js), [docs/adding-a-biome.md](../adding-a-biome.md) | Canonical biome ranges and external metadata |
| Existing tests | [test/simulation-snapshot-migrations.test.js](../../test/simulation-snapshot-migrations.test.js), [test/simulation-replay-isolation.test.js](../../test/simulation-replay-isolation.test.js), [test/azgaar-world-guidance.test.js](../../test/azgaar-world-guidance.test.js) | Golden references; no edits to make tests pass |

### 3.1 Exact current command shape

Current createCommandEnvelope produces an object with:

| JSON field | Current JS behavior | Rust representation |
| --- | --- | --- |
| id | Nonempty string | String newtype / validated |
| type | Nonempty string, command names such as sim.patchEntity | String, **not** a closed enum (future command types) |
| issuedAtTick | Nonnegative Number.isSafeInteger | Checked u64 limited to JS safe integer |
| actorId | String(actorId), default system | String |
| expectedWorldRevision | null or nonnegative safe integer | Nullable checked u64; field **must** serialize as explicit null when null in current canonical command |
| payload | JSON-cloned arbitrary object, no non-finite numeric values | serde_json::Value with object-shape check for produced commands; preserve data keys |
| source | String(source), default system | String |

Constructor defaults apply when creating a **new** JS command; a serialized command envelope already contains the explicit output fields. A Rust command decoder must not quietly fill missing fields and claim byte-compatible roundtrip. Strict decoding and an optional separate Rust constructor should be separate paths.

### 3.2 Exact current event shape

Current createDomainEvent produces:
- id: nonempty string.
- type: nonempty string.
- tick: nonnegative JS safe integer.
- causedByCommandId: String(value).
- entityIds: array of strings sorted with JavaScript default Array.sort semantics.
- payload: JSON-cloned value with keys beginning with double underscore removed **at the top level** by current stripPrivate implementation.
- schemaVersion: positive JS safe integer, default 1.

Current dispatcher constructs event IDs using the command ID plus :event: plus the zero-based ordinal, with event tick equal to command.issuedAtTick. **Do not implement event generation or dispatch in Phase 1**, but include syntax and parity fixture checks for current event examples.

### 3.3 Exact current entity shape

Current createEntityEnvelope produces:
- id; kind; revision; createdAtTick; updatedAtTick; status; tags; data.
- kind is one of the 22 literal names below.
- status is one of active, inactive, destroyed, archived.
- revision, createdAtTick and updatedAtTick are nonnegative Number.isInteger values; Phase 1 wire validation also restricts to the representable JS-safe integer range for interoperable JSON.
- tags are strings sorted with JS default Array.sort (not localeCompare).
- data is arbitrary JSON-compatible structured clone; Phase 1 must preserve nested data and not impose invented domain schemas.
- Stable ID currently means nonempty string not containing literal substring undefined or null. Record this **observed permissive rule**; do not “fix” by imposing UUIDs or new regexes.

**All 22 kinds, exact JSON values:** region, settlement, populationCohort, market, resourceSite, route, faction, shipment, party, encounterSite, conflict, contract, worldEvent, inventoryAccount, facility, tradeOffer, carrier, character, opportunity, militaryCompany, graphNode, graphEdge.

**Kind-to-collection mapping (from worldState.js):**

| Kind | Snapshot collection | Kind | Snapshot collection |
| --- | --- | --- | --- |
| region | regions | settlement | settlements |
| populationCohort | populations | market | markets |
| resourceSite | resourceSites | route | routes |
| faction | factions | shipment | shipments |
| party | parties | encounterSite | encounters |
| conflict | conflicts | contract | contracts |
| worldEvent | worldEvents | inventoryAccount | inventories |
| facility | facilities | tradeOffer | tradeOffers |
| carrier | carriers | character | characters |
| opportunity | opportunities | militaryCompany | militaryCompanies |
| graphNode | graphNodes | graphEdge | graphEdges |

Do not derive collection names by simply adding an s. The mapping has exceptions such as populationCohort -> populations and inventoryAccount -> inventories.

### 3.4 Independent version boundaries

**Current simulation snapshot:** documentVersion = 1; simulationSchemaVersion = 1; projectionVersion and definition.schemaVersion are distinct; worldId, sourceFingerprint, snapshotTick, worldRevision, definition, calendar, diagnostics, entities, commandRange, eventRange and snapshotChecksum.

**Current editor world document:** INFINITE_WORLD_FORMAT_VERSION = 6 in src/editor/world/worldConstants.js; includes infinite-world/editor-specific data, not the same structure as the simulation snapshot. WORLD_GENERATOR_VERSION = 1 is also separate.

**Future bridge transport protocol:** protocolVersion = 1 for the newly defined external request/response envelope. This is **not** any current JS document/snapshot version and must not be inserted into existing snapshots, commands or game-state checksums.

---

## 4. Target native workspace (new files only)

The following is a *concrete target*, but no path below exists on the inspected main:

~~~text
native/
  Cargo.toml
  Cargo.lock
  rust-toolchain.toml
  rustfmt.toml
  README.md
  config/
    runtime.yaml
  crates/
    world-protocol/
      Cargo.toml
      src/
        lib.rs
        constants.rs
        error.rs
        json/
          mod.rs
          canonical.rs
          js_numbers.rs
          checksum.rs
        model/
          mod.rs
          ids.rs
          kinds.rs
          coordinates.rs
          calendar.rs
          definition.rs
          entities.rs
          snapshot.rs
        messages/
          mod.rs
          command.rs
          event.rs
          query.rs
          transport.rs
        validation/
          mod.rs
          limits.rs
          fields.rs
          snapshot.rs
      tests/
        js_compat_goldens.rs
        command_contract.rs
        event_contract.rs
        entity_contract.rs
        world_snapshot_contract.rs
        signed_coordinates.rs
        transport_contract.rs
    world-core/
      Cargo.toml
      src/lib.rs
    world-generation/
      Cargo.toml
      src/lib.rs
    world-storage/
      Cargo.toml
      src/
        lib.rs
        config.rs
      tests/config_contract.rs
  tests/
    fixtures/                  # Only for native-exclusive compact cases
  docs/
    protocol-contract.md
    compatibility-report.md
~~~

**Keep this layout as a guideline for small SOLID files**, not an excuse to add empty boilerplate in every planned module during PR-01A. Under PR-01A, create only Cargo manifests, minimal lib.rs files, rust-toolchain, config, README and the config loader/validation test. In PR-01B, add the concrete DTO/validation modules that are actually needed. Do not add a directory just to display architectural ambition.

**Use existing Phase 0 test/fixtures/rust-bevy-phase0/ in-place.** Do not duplicate goldens into native/tests/fixtures; tests in native must open the committed canonical fixture path relative to CARGO_MANIFEST_DIR.

### 4.1 Crate dependency direction

~~~text
                     world-protocol
                    /      |       \
                   /       |        \
           world-core  world-storage  world-generation
                   \       |        /
                    \      |       /
              [future adapters / Bevy client]
~~~

- world-protocol has no internal workspace dependencies; may use serde, serde_json, thiserror and narrowly justified formatting dependencies.
- world-core depends on world-protocol; **no Bevy**, engine, GPU, browser or I/O dependencies.
- world-generation depends on world-protocol; generator logic belongs to Phase 5, not now.
- world-storage depends on world-protocol; external YAML config loading is okay here; real persisted world saving belongs later.
- world-storage does **not** depend on world-core until a specific Phase 2/3 adapter needs it; no premature dependency.
- No crate depends on src/ JavaScript, npm, Vite or Three.js.
- Circular dependencies and low-level crates importing client types are prohibited.
- World-protocol DTOs express the **wire/domain vocabulary**, but do not own business rules or runtime state.

**Enforcement:** Cargo metadata inspection (or a small local test) must fail if the protocol crate gains an unapproved heavy dependency or any crate adds bevy, wgpu, wasm-bindgen, web-sys, reqwest, axum, tokio or a GUI stack in Phase 1. Those are future adapter/runtime concerns, not needed for pure contracts.

### 4.2 Version/toolchain policy

- Choose an actually installed/published stable Rust toolchain that supports edition 2024, then record and **pin exact channel version** in native/rust-toolchain.toml; record rustc and cargo outputs in the PR evidence. No floating nightly or unverified future version string.
- Use edition = "2024" consistently unless the accepted Phase 0 ADR documents a supported toolchain incompatibility.
- Pin exact direct dependency versions in native workspace manifests at implementation time after verifying the versions exist. Commit native/Cargo.lock and require reproducible --locked builds. Do not invent crate versions in the plan.
- Begin with only required crates: serde + derive, serde_json, a maintained YAML decoder, thiserror and tracing; add a JS-compatible float formatter only if the exact Phase 0 numeric goldens justify it and verify that crate's license/version. Use standard library instead of new dependencies for trivial hashing/limits.
- Use dev-only test dependencies only when necessary; standard cargo test covers most required cases.
- Set forbidding unsafe code in each library crate. No custom unsafe routines for micro-optimizations.
- Record MSRV/toolchain and platforms tested, especially Windows and WSL2.

### 4.3 Error/logging conventions

- Rust errors are typed, with stable machine-readable code strings matching the current JS errors where compatibility applies (examples: invalid_command_id, invalid_event_tick, invalid_entity_kind, unsupported_schema_version, checksum_mismatch).
- A separate future transport error envelope may add path, details, and a message, but **must not rename existing error codes** when reporting corresponding JS contract validation failures.
- Libraries must return Result, never panic for untrusted JSON, invalid IDs, malformed YAML, unknown version or out-of-range numeric values.
- Use tracing for structured diagnostic spans/events; never log full confidential simulation payloads, personal NPC dialogue, secrets or map content by default.
- Keep the tracing subscriber in future binaries/test setup, not as a global side effect of a library import.
- No blanket unwrap or expect in production paths; tests may use expect with explicit context.
- No silently swallowed errors, logging as the only error response, or partial command acceptance.

---

# PR-01A — Workspace and build foundation

**Prerequisite:** Accepted PR-00A architecture/ADR. PR-00B goldens desirable but not required for scaffold-only work.  
**Permitted paths:** native/ and (only if genuinely needed) a new docs/qa dated report. Do not touch src/, editor.config.yaml, package.json/package-lock, existing tests, JS build or runtime.

## 5. PR-01A file-by-file implementation

| New file | Responsibility | Explicit acceptance |
| --- | --- | --- |
| native/Cargo.toml | One workspace, four members, locked resolver and shared edition/version policy | Cargo metadata resolves every member |
| native/Cargo.lock | Reproducible exact dependency graph | cargo test --locked works |
| native/rust-toolchain.toml | Exact stable toolchain pin | rustup resolves installed toolchain or error is documented |
| native/rustfmt.toml | Conservative formatting settings | cargo fmt --check |
| native/crates/world-protocol/Cargo.toml | Pure DTO library manifest | No engine, browser or async runtime dependency |
| native/crates/world-protocol/src/lib.rs | Small public module root, forbid unsafe | Library compiles |
| native/crates/world-core/Cargo.toml and src/lib.rs | Headless future simulation crate boundary | Can depend on protocol, no fake simulation API |
| native/crates/world-generation/Cargo.toml and src/lib.rs | Future pure generator boundary | No generator implementation yet |
| native/crates/world-storage/Cargo.toml and src/lib.rs | Future I/O adapter boundary | No save/store implementation yet |
| native/crates/world-storage/src/config.rs | External YAML reader + typed path/error handling | Good/malformed/missing config tests |
| native/config/runtime.yaml | **Native bridge/tooling** configuration, not world simulation values | Validated; no hardcoded runtime URLs/credentials |
| native/crates/world-storage/tests/config_contract.rs | YAML load/error tests | Reproducible on Windows/WSL |
| native/README.md | Install, build, verify and current limitations | Commands exactly work |
| native/docs/protocol-contract.md | Phase 1 design note: ownership and versions | Clear phase/non-goals |
| native/docs/compatibility-report.md | Initial report with not-implemented/not-tested statuses | No fictitious pass claim |

**No dummy public APIs returning default data.** For example, world-core must not expose a placeholder tick() returning success; a tiny crate root plus documentation and compile-time dependency smoke tests is sufficient.

### 5.1 Cargo workspace specification

Use the exact four member paths in Section 4. Set resolver = "3" for edition 2024, and workspace.package edition = "2024"; align crate package edition to workspace inheritance. Use Cargo's standard workspace.dependencies mechanism for shared versions. Dependencies must be resolved and locked using the toolchain selected in this PR.

Manifest shape (version placeholders here are **not** a runnable Cargo manifest; substitute verified concrete versions during implementation):

~~~toml
[workspace]
resolver = "3"
members = [
  "crates/world-protocol",
  "crates/world-core",
  "crates/world-generation",
  "crates/world-storage",
]

[workspace.package]
edition = "2024"
license = "MIT"

[workspace.dependencies]
serde = { version = "<verified-version>", features = ["derive"] }
serde_json = "<verified-version>"
thiserror = "<verified-version>"
tracing = "<verified-version>"
~~~

**License caution:** The MIT in this proposed manifest is a **suggestion to check**, not permission to relicense the repository or third-party assets. Match the actual repository license and dependency attribution in the accepted ADR; do not add a misleading workspace license if the repository's own license is not verified.

### 5.2 External YAML config specification

Phase 1's YAML config is for **future bridge/runtime limits and diagnostics only**. It must not mirror the whole live editor.config.yaml or define a second source of truth for Azgaar, world generation, NPC economics or scene quality.

Suggested documented shape:

~~~yaml
protocol:
  version: 1
  limits:
    max_request_bytes: 1048576
    max_page_size: 200
    max_event_entity_ids: 1024

diagnostics:
  level: info
  include_payloads: false
~~~

These values are **new proposed bridge policy**, not current JS game-engine defaults. All runtime behavior must obtain them through typed validated configuration; do not scatter the numbers in logic. Reject zero, negative, out-of-range and unknown policy keys with a typed error. Preserve sane future ability to tighten client-specific limits separately from legacy snapshot validation.

- Config is read from an explicitly supplied path; do not rely on process working directory.
- Missing file is an error unless an explicit caller-provided fallback path exists; no hidden magic defaults.
- Relative source/config paths are resolved against the manifest or a documented native root, never silently against an arbitrary shell cwd.
- Config loader is pure except for explicit file reads; decoding+validation can be unit-tested from strings without touching disk.
- Never log credentials or secret env vars. There are none required for Phase 1.
- Config failures return an error with path and cause, no panic.
- Do **not** load config automatically from world-protocol or world-core.

### 5.3 PR-01A verification

~~~bash
rustc --version
cargo --version
cargo metadata --manifest-path native/Cargo.toml --format-version 1
cargo fmt --manifest-path native/Cargo.toml --all --check
cargo clippy --manifest-path native/Cargo.toml --workspace --all-targets --locked -- -D warnings
cargo test --manifest-path native/Cargo.toml --workspace --locked
cargo check --manifest-path native/Cargo.toml --workspace --locked
~~~

- Run on Windows or WSL2 native toolchain; document host/target.
- Confirm the normal JS app still builds: npm run verify (record if unrelated preexisting failures).
- Confirm git diff lists only native/ and permitted docs/qa report files.
- Commit and push directly to main. Provide exact SHA and nonzero test failures rather than describing hypothetical passes.

### 5.4 PR-01A acceptance

- [ ] Phase 0 PR-00A audit/ADR accepted or explicit approved workspace-only exception recorded.
- [ ] Toolchain exact version and Cargo.lock committed, no nightly.
- [ ] Exactly one native workspace with the four declared minimal library crates.
- [ ] No Bevy, wgpu, WASM, UI, HTTP or database dependencies.
- [ ] No fake game logic or public success stubs.
- [ ] Config YAML parser/validator tests include valid/missing/malformed/unknown key/bound cases.
- [ ] cargo metadata/fmt/clippy/check/test pass or fail with reproducible documented reasons.
- [ ] No JS runtime, package manifest or renderer changes.
- [ ] No GitHub Actions; direct main commit and push.

---

# PR-01B — Data contracts, validation and JS parity

**Prerequisite:** PR-01A accepted and the deterministic portion of PR-00B completed; actual golden files exist and reproduce.  
**Intent:** Implement **data-model compatibility**, not simulation behavior. Two sequential commits are acceptable: PR-01B.1 models/validation, then PR-01B.2 canonical checksum and golden conformance.

## 6. Representation rules: no made-up state model

### 6.1 Primitive types

| Domain primitive | Rust wire representation | Validation |
| --- | --- | --- |
| WorldId | Nonempty String newtype | Follow createWorldDefinition rule; no UUID assumption |
| EntityId | Nonempty String newtype | Preserve current isStableEntityId semantics; opaque |
| CommandId | Nonempty String | No forced UUID/splitting |
| EventId | Nonempty String | Read-only generated ID syntax tests |
| Tick | u64 wrapper | 0 through 2^53-1 inclusive for JS JSON interop |
| WorldRevision | u64 wrapper | Same JS-safe numeric bound |
| EntityRevision | u64 wrapper | Same interop bound even if legacy JS constructor accepts wider Number.isInteger |
| CellX/CellZ, ChunkX/ChunkZ | signed i64 internally | Restrict current source-compatible cell bounds to absolute 0x3fffffff; conversion checked |
| Render/world spatial X/Z | finite f64 where serialized | No NaN/Infinity; render-local f32 belongs to future client |
| BiomeId | u8 | Standard 0–12 and nonstandard 32–254 where assigned; preserve actual imported metadata |
| EntityKind | 22-case enum | serde camelCase values exactly match JS |
| EntityStatus | 4-case enum | active/inactive/destroyed/archived |
| JSON data/payload | serde_json::Value | Preserve deep arbitrary object/array content, no invented typed domain fields |
| Nullable fields | Exact explicit null vs absent per existing reference | Do not lose null merely due to skip_serializing_if |
| Strings | Unicode strings | Round-trip escaped/Unicode text; match UTF-16 checksum behavior |

**All numeric serialization must be explicitly checked.** It is not enough that Rust u64 can store a value; JS Number cannot safely represent integers larger than 2^53-1. Also reject negative tick/revision, invalid nonfinite numbers, and invalid coordinates **before** creating semantic types. Binary formats and 64-bit-integer string representations require a later versioned protocol change; not now.

### 6.2 IDs are opaque, especially generated IDs

Current generatedEntityId produces a colon-rich string including kind, world ID, command ID and ordinal. The current JS command ID itself can contain colon separators. Therefore **do not split generated IDs on colon to reconstruct components** in Phase 1: an unqualified split may not be invertible and may not match the existing JS parseGeneratedEntityId behavior.

- Preserve the ID exactly as a string.
- Test imported prefixes from src/sim/model/ids.js, e.g. region:azgaar-state:, region:azgaar-province:, settlement:azgaar-burg:, culture:azgaar:, religion:azgaar:, route:azgaar:, river:azgaar:.
- Test generatedEntityId fixture outputs from actual JS source including a command ID with embedded colons.
- No re-keying IDs to sequential Bevy ECS indices or UUIDs.
- Do not introduce a new parser unless Phase 0 proves a safe exact parsing contract. If parser appears broken/ambiguous, record for a separate reviewed fix.

### 6.3 Coordinate conversion contracts

world-protocol may include a small **pure** coordinate module because renderer/native interoperability needs it:
- floor division with mathematical floor for negative values; no truncation-toward-zero bug.
- positive modulo for cell-to-local chunk indexing.
- world-to-cell from src/editor/world/WorldCoordinates.js with **world Z inverted**.
- cell center conversion x=(cellX+0.5)*tileSize, z=-(cellZ+0.5)*tileSize.
- chunk key string format x:z, signed, canonical -0 normalized where relevant.
- reject zero/nonfinite tile size and outside current max-safe-cell range.
- no origin-rebase state machine or camera updates in Phase 1: those belong to future renderer adapters.

**Required edge table with chunkSize 64:**

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

Test **both X and Z axes** and at least two tile sizes from source-conformant fixtures. Keep camera/floating origin separate from canonical stored positions.

## 7. Core DTOs: exact existing JS shape

### 7.1 CommandEnvelope

In native/crates/world-protocol/src/messages/command.rs define a struct with the seven fields of Section 3.1 using serde rename rules or explicit renames to produce **exact JS camelCase JSON**. Keep type as String. The supplied fixture must verify fields serialized in complete form, with nullable expectedWorldRevision present when null.

Provide:
- try_from_json(bytes, limits) -> Result<CommandEnvelope, ProtocolError>.
- validate() -> Result<(), ProtocolError>.
- to_legacy_json() -> Result<Vec<u8> or String, ProtocolError>.
- A separate constructor with explicit defaults; it must not turn absent serialized fields into accepted values without a declared compatibility rule.

Do not make a dispatcher or command execution method. The goal is validated pass-through and roundtrip.

### 7.2 DomainEvent

In messages/event.rs, define:
- id, type, tick, causedByCommandId, entityIds, payload, schemaVersion.
- Preserve the event ID and causedByCommandId as strings.
- Validate schemaVersion >= 1, JS-safe integer, no empty event ID/type.
- Validate and serialize entityIds in JS default sort order **only when creating a new event**; when decoding existing canonical event, fail on unsorted list or preserve data as an explicit decoded-as-is record according to the accepted Phase 0 contract. Do not silently reorder historical event data during snapshot/replay checks.
- Validate that payload values are JSON-safe and that event payload does not contain prohibited top-level private double-underscore keys in **newly constructed canonical events**; preserve legacy event fixture behavior exactly.
- No event reducer or subscriber in Phase 1.

### 7.3 EntityEnvelope

In model/entities.rs implement exact eight fields, kind/status as enums and arbitrary data as JSON object/value matching source:
- id, kind, revision, createdAtTick, updatedAtTick, status, tags, data.
- Preserve tag order in decoded fixtures unless the validation contract requires already-sorted canonical tags.
- New-construction helper sorts using JavaScript Array.sort ordering and preserves duplicate tags (JS current implementation sorts but does **not** deduplicate them).
- Validate ID against current JS rule, no invented UUID regex.
- Preserve each entity's data and fields; do not restrict data to a fabricated common NPC schema.

### 7.4 WorldDefinition and WorldSnapshot

In model/definition.rs and model/snapshot.rs define the current simulation persisted data model, preserving:

**WorldDefinition fields:** worldId, seed, sourceFingerprint, projectionVersion, schemaVersion, physicalScale, cultures, cultureCatalog (nullable), religions, biomes, sourceMeta.

**Simulation snapshot fields:** documentVersion, simulationSchemaVersion, projectionVersion, worldId, sourceFingerprint, snapshotTick, worldRevision, definition, calendar, diagnostics, entities, commandRange, eventRange, snapshotChecksum.

- Snapshot data fields must match actual captured JS snapshot object; no extra bridge envelope inserted.
- Entities is an object with **22 explicit collection keys**, each mapping to a JSON array of entity envelopes. Do not serialize a Rust HashMap in nondeterministic order.
- Use a stable ordered container and explicit collection-name mapping; ensure serialized order matches **canonicalSerialize** when hashing.
- Calendar is JSON from current worldClock with tick/year/month/day/hour/minute; validate finite safe numbers and observed field requirements without adding Gregorian assumptions.
- Diagnostics includes commandsAccepted, commandsRejected, eventsEmitted, eventsApplied, validationFailures; retain existing JSON keys/counters.
- commandRange and eventRange are distinct nullable fields, preserve their arbitrary documented data subshapes from actual snapshots.
- WorldSnapshot documentVersion=1 is not editor document v6.
- Validate schema version; reject unsupported future snapshot version with error code unsupported_schema_version.
- Verify snapshotChecksum by hashing **the snapshot without snapshotChecksum** using the exact compatibility serializer. Error code checksum_mismatch when it fails.
- Validate worldId and sourceFingerprint relationships where the current restore path does so. Do not “upgrade” schema by silently changing field values.
- Full cross-entity reference validation and replay state reconstruction stay in Phase 2; Phase 1 validates record/collection structure and field types only.

### 7.5 Editor world document boundary

Provide a **separate** model type for the editor world **header** and validation of INFINITE_WORLD_FORMAT_VERSION=6 when explicitly requested. Do **not** deserialize editor documents with the simulation WorldSnapshot struct. Do not write a converter or populate missing simulation data from editor document fields.

A minimal pure validation result may return:
- formatKind = editor-world-document;
- version = 6;
- source world ID/metadata if actually present;
- opaque raw JSON for the rest, for future Phase 5 processing.

Keep this in a distinct module; never choose format by guessing whether a JSON object “looks like” a snapshot. Caller must pass explicit expected format or use a strict verified discriminator. Tests must reject cross-format decode attempts.

## 8. New future bridge messages (separate from legacy DTOs)

These are new **transport-agnostic** envelope types and **do not** represent existing JS snapshots or emitted commands.

### 8.1 Protocol version and shape

Define PROTOCOL_VERSION = 1 in messages/transport.rs. The future request/response envelope is:

~~~json
{
  "protocolVersion": 1,
  "requestId": "request:fixture-01",
  "worldId": "world:fixture",
  "operation": "getWorldMetadata",
  "payload": {}
}
~~~

And a successful response:

~~~json
{
  "protocolVersion": 1,
  "requestId": "request:fixture-01",
  "ok": true,
  "payload": {},
  "error": null
}
~~~

And a failed response:

~~~json
{
  "protocolVersion": 1,
  "requestId": "request:fixture-01",
  "ok": false,
  "payload": null,
  "error": {
    "code": "unsupported_protocol_version",
    "message": "Unsupported protocol version",
    "path": "protocolVersion",
    "details": null
  }
}
~~~

**These are specified example messages**, not outputs already emitted by current JS source. Future runtime adapters will implement transport, session ownership and API operations.

**Protocol request rules:**
- protocolVersion must match current major version 1; reject newer/unsupported values, no silent downgrade.
- requestId and worldId nonempty, bounded string lengths from native/config/runtime.yaml when transport is eventually enabled; no generated UUID requirement.
- operation is one of the enumerated supported **names**, not a world event type. Phase 1 may parse the operation enum but may not execute it.
- payload is JSON object, size/bounds checked from provided configuration.
- For requests unrelated to a loaded world (future handshake/config introspection), define worldId as nullable **only if explicitly designed and tested**. In Phase 1 keep worldId required for the first implemented operation examples to avoid ambiguous session routing.
- Response error and payload are explicit nullable fields; exactly one is populated according to ok.
- Unknown top-level fields in new transport envelopes should be rejected (versioned protocol discipline). Unknown nested payload keys depend on operation schema and should be rejected for validated operations.
- No network, channels, sockets, global task scheduler or listener created.

### 8.2 Operation catalog (reserved, no implementation)

| Operation | Intended eventual behavior | Phase 1 |
| --- | --- | --- |
| handshake | Verify protocol/schema versions and client capabilities | DTO only |
| getWorldMetadata | Read world ID/fingerprint/versions/tick | DTO only |
| loadWorld | Select an existing persisted world | DTO only |
| submitCommand | Submit a validated simulation command | DTO only |
| advanceTicks | Advance authoritative simulation time | DTO only |
| getEntity | Query a stable ID/kind | DTO only |
| listEntities | Paginated sorted entity query | DTO only |
| getEvents | Read ordered events after an explicit cursor | DTO only |
| getSnapshot | Return a versioned simulation snapshot | DTO only |
| saveWorld | Persist through an explicit storage adapter | DTO only |
| restoreWorld | Restore a saved snapshot/journal | DTO only |

**Warning:** Listing an operation **does not mean it exists or returns success**. Return unsupported_operation in the future runtime until implemented. Do not add fake handlers. A future client may use WebAssembly in-browser or a headless native/server transport; Phase 1 deliberately leaves transport selection open while fixing the envelope contract.

### 8.3 Queries and cursors

In messages/query.rs define read-only data types for:
- GetEntity: kind and stable entityId.
- ListEntities: kind, optional page cursor, optional page size.
- EventPage: world ID, revision/tick or event cursor, ordered event array, next cursor, hasMore.
- WorldMetadata: world ID, source fingerprint, projection/schema versions, calendar, revision.

Use **opaque cursor strings** rather than leaking Bevy entity IDs, array indices or runtime memory addresses. Query pages must have stable sort criteria and an explicit revision boundary; decide exact encoding and query semantics after Phase 2's state store exists. Phase 1 can validate and roundtrip these DTOs but **must not assert functional query results**.

---

## 9. JSON, Unicode, numbers and compatibility checksums

This is the most technically risky part of Phase 1. A naive serde_json::to_string + a Rust hash is **not** guaranteed to reproduce current JavaScript snapshotChecksum.

### 9.1 Current source behavior

Source: src/sim/persistence/canonicalSerialize.js.

1. Plain object properties are enumerated by Object.keys(value).sort(), following JS string comparison rules. Do not use localeCompare for object keys.
2. Map entries are sorted by String(key).localeCompare(String(key)); this is different from default Array.sort and potentially locale/ICU-dependent. Phase 0 should capture actual Map/Set goldens.
3. Set values similarly use String(a).localeCompare(String(b)).
4. Arrays preserve index order.
5. BigInt is stringified as decimal string.
6. Non-finite numbers reject; typed unsupported data may reject.
7. JSON.stringify controls decimal/exponent notation, escaping and omission semantics.
8. checksumCanonical starts with 2166136261 (32-bit), XORs **UTF-16 code units** of the canonical JSON string, multiplies by 16777619 with 32-bit wrap, returns zero-padded lowercase 8-digit hex.

**Critical traps:**
- A non-BMP character is two JS UTF-16 code units, but a Rust char is a Unicode scalar value. Hashing Rust .chars() or UTF-8 bytes yields a different result. Iterate canonical_text.encode_utf16().
- serde_json may format floating-point literals differently from JSON.stringify, even when numerically equal. The serializer must pass exact Phase 0 numeric format goldens.
- serde_json map ordering may differ, and Rust BTreeMap lexicographic UTF-8 order is not necessarily JS UTF-16 order for all Unicode keys.
- JS Map/Set sort uses localeCompare; Rust standard library ordering is not automatically equivalent. Use the exact source fixtures, and do not claim compatibility for arbitrary exotic keys unless tested.
- JS JSON.stringify normalizes -0 to 0 and has specific treatment of number exponent thresholds.
- JSON transports cannot directly express JS undefined, Map, Set or BigInt without normalization; the pure serializer must explicitly support the **golden source representations** where relevant, rather than claiming that serde_json::Value itself can hold them.
- Avoid rewriting existing source checksum behavior as SHA-256; SHA-256 remains an artifact provenance tool only.

### 9.2 Required pure functions and separation

In world-protocol/src/json/ provide:
- serialize_legacy_json(value) -> Result<String, ProtocolError>, returning the exact canonical JS JSON string for supported JSON-compatible wire values.
- checksum_legacy_json(value) -> Result<String, ProtocolError>, returning the existing 8-digit lowercase value.
- checksum_legacy_text(canonical_text) -> String, taking a string already known to be canonical and iterating UTF-16 units.
- validate_wire_json(value) -> Result<(), ProtocolError> for finite numbers/allowed object shapes.
- Optional explicit source golden normalizer for Map/Set/BigInt test cases; it must be separate from the normal transport serializer and clearly documented.
- Keep number formatting in a separate small module (js_numbers.rs), with exact-source fixture tests; if a verified dependency is necessary, pin it.

Do not use host locale defaults to “approximate” JavaScript localeCompare. Where the Phase 0 Map/Set golden includes locale-dependent ordering, record the source locale/ICU context and either reproduce it deterministically for that supported fixture or mark the coverage **blocked**. Never claim a pass for unsupported locales.

### 9.3 Golden test policy

Read the **actual** Phase 0 golden corpus, not examples written by hand for this phase. Required groups:
- JS sorted objects, nested/arrays, all declared Map/Set and bigint normalization.
- ASCII, accented Unicode, emoji/surrogate pairs and escaped strings.
- Negative zero; exponent threshold and fractional/scientific numeric cases; JS-safe integer limits.
- NaN/Infinity/unsupported types and error codes from test representations.
- Actual accepted command, domain event and snapshotChecksum fixtures from Phase 0.
- Unsupported snapshot version, missing checksum, checksum mismatch and wrong data shape.
- Some legacy string-vs-number fields to ensure parsers do not silently coerce.

**Hard pass:** Exact text and exact checksum for **supported** cases; no epsilon for JSON text or checksum. For structured object equality, compare parsed JSON data plus field presence/null. For signed world coordinates, compare integer results exactly; only use documented tolerance for f64 coordinates when fixtures themselves justify it.

If a required fixture is blocked due to unresolved locale/number behavior, do not change goldens, introduce a broad acceptance tolerance or mask a failing case. Record the exception as a Phase 1 blocker and keep the library non-authoritative.

---

## 10. Validation and defensive parsing

### 10.1 Size/config bounds

Load protocol limits from native/config/runtime.yaml in an explicit adapter/config object. Values suggested in Section 5.2 are new transport constraints, **not legacy source limits**. Scope them correctly:
- max_request_bytes: applies to new transport request input only.
- max_page_size: applies to future listEntities query.
- max_event_entity_ids: applies to new future submitted event envelopes when enabled, **not historical snapshots** until backward-compatibility is proven.

Do not impose arbitrary new request limits on existing saved simulation snapshots or Azgaar world JSON and then call the failure a source regression. Legacy snapshot validation uses existing schema and observed safe representation limits.

### 10.2 Error code matrix

| Condition | Expected stable code or policy | Source |
| --- | --- | --- |
| Missing/empty command ID | invalid_command_id | commandEnvelope.js |
| Missing/empty command type | invalid_command_type | commandEnvelope.js |
| Negative/unsafe issued tick | invalid_issued_at_tick | commandEnvelope.js |
| Negative/unsafe expected revision | invalid_expected_world_revision | commandEnvelope.js |
| Nonfinite/invalid command payload | invalid_command_payload | commandEnvelope.js |
| Missing/empty event ID | invalid_event_id | domainEvent.js |
| Missing/empty event type | invalid_event_type | domainEvent.js |
| Invalid event tick | invalid_event_tick | domainEvent.js |
| Non-array event entity IDs | invalid_event_entity_ids | domainEvent.js |
| Invalid event schema version | invalid_event_schema_version | domainEvent.js |
| Invalid entity ID | invalid_entity_id | entityEnvelope.js |
| Unknown entity kind | invalid_entity_kind | entityEnvelope.js |
| Unknown status | invalid_entity_status | entityEnvelope.js |
| Negative revision or tick fields | invalid_revision / invalid_created_at_tick / invalid_updated_at_tick | entityEnvelope.js |
| Unsupported snapshot schema | unsupported_schema_version | snapshot.js |
| Missing snapshot checksum | missing_checksum | snapshot.js |
| Mismatched snapshot checksum | checksum_mismatch | snapshot.js |
| Structurally malformed snapshot | invalid_snapshot | snapshot.js |
| Invalid new transport version | unsupported_protocol_version | New Phase 1 transport code |
| Bad new transport operation | unsupported_operation or invalid_operation (document choice) | New Phase 1 transport contract |
| Request exceeds configured transport bytes | request_too_large | New Phase 1 transport contract |

**Existing JS compatibility error precedence matters.** If two fields are invalid, the Rust parser should report the first error consistent with relevant JS factory/restore path where Phase 0 fixtures capture it. New transport errors may be stricter because they are an independent versioned protocol.

### 10.3 Negative tests

Reject (no panic, no partial state):
- empty IDs/types;
- wrong scalar types (object instead of string, string instead of tick);
- negative/overflow tick, NaN/Infinity, massive integer outside JS safe range;
- event entityIds that are nonarray; malformed event schemaVersion;
- unknown entity kind/status and invalid stable entity ID;
- invalid snapshot versions, missing fields, malformed entities, checksum mismatch;
- command fields unexpectedly absent when serialized command is expected complete;
- editor v6 document passed into simulation snapshot decoder;
- future/unknown protocol version, missing requestId, unknown top-level transport key;
- broken YAML including unknown keys, zero bounds and missing file;
- oversized new transport payload according to passed config;
- Unicode supplementary characters and non-ASCII keys;
- duplicate entity collection keys and malformed JSON;
- malicious nested structures to ensure errors are controlled and no obvious unbounded recursion exists (establish conservative parser nesting rules using the chosen JSON library).

Protect against excessive allocation when parsing **new transport** input, but do not create a duplicate complex JSON parser when the current library already enforces depth/size limits.

---

## 11. PR-01B test matrix and expected coverage

| Test file | Required fixtures / assertions |
| --- | --- |
| tests/js_compat_goldens.rs | Exact canonical string + hash for all required Phase 0 source cases, including Unicode and number formatting |
| tests/command_contract.rs | All command fields, exact camelCase JSON, null preservation, numeric bounds, errors and unknown command type string pass-through |
| tests/event_contract.rs | Event fields, sorted IDs, schemaVersion, private payload stripping policy, invalid event cases |
| tests/entity_contract.rs | 22 kinds, four statuses, tag sorting, stable/imported/generated IDs, opaque nested data |
| tests/world_snapshot_contract.rs | Schema version 1, 22 entity collections, nested definition/calendar/diagnostics, ranges, checksum and corruption cases |
| tests/signed_coordinates.rs | Phase 0 W00/W01, chunk floor/mod boundaries, Z inversion, max bounds and finite tile size |
| tests/transport_contract.rs | Protocol version, request/response correlation, success/error exclusivity, unknown version/operation, size bounds |
| world-storage/tests/config_contract.rs | Valid YAML, missing file, unknown key, malformed YAML, zero and excessive bounds, explicit path |
| External JS verification | Phase 0 verifier still passes; source old fixtures untouched |
| Existing web regression | npm test / npm run verify, reported honestly |

**Tests must verify source snapshot parity without executing simulation in Rust.** Phase 2 will port world state, time, commands, reducers and replay. A test that validates a snapshot/checksum does **not** demonstrate the Rust runtime can produce that snapshot.

### 11.1 Golden fixture loading

- Derive the fixture root from CARGO_MANIFEST_DIR and an explicit relative path into repository test/fixtures/rust-bevy-phase0/.
- Fail clearly when a fixture is missing or its manifest indicates an unmatched source baseline.
- Do not copy a stale fixture into native/ to satisfy a path.
- Verify parser results and reserialization against exact committed golden strings/checksums where appropriate.
- Keep source SHA of the generating JS code and current Rust commit in the conformance report.
- A mismatch reports scenario ID, JSON pointer/path, expected vs actual and the compatibility primitive responsible.
- The checksum compatibility tests must use text+hash pairs, not only hash comparisons.
- New transport tests use separately authored **specification** messages, not claimed source JS golden outputs.

### 11.2 Test commands

~~~bash
cargo fmt --manifest-path native/Cargo.toml --all --check
cargo clippy --manifest-path native/Cargo.toml --workspace --all-targets --locked -- -D warnings
cargo test --manifest-path native/Cargo.toml --workspace --locked
cargo check --manifest-path native/Cargo.toml --workspace --locked

# Existing browser/Node coverage remains relevant:
node scripts/verify-rust-bevy-phase0-goldens.mjs
npm test
npm run verify
~~~

The Phase 0 verifier command exists **only after PR-00B**. Do not label it passing when it has not been implemented. For verification requiring running Chrome/GPU, follow docs/perf-qa.md and run only when the modified paths require such checks. Phase 1 adds no GPU code; the renderer is not benchmarked as a supposed migration success.

**Optional local release compilation:** cargo build --manifest-path native/Cargo.toml --workspace --release --locked. Record actual warnings, build results and executable output; libraries do not produce standalone game binaries.

---

## 12. Source file and test layout: minimal API guidance

**World-protocol public API should be small.** Suggested Rust module surfaces (signatures indicative; use exact type definitions in source):

~~~rust
pub mod error;
pub mod json;
pub mod messages;
pub mod model;
pub mod validation;
pub mod constants;
~~~

**Command/event types:** command.rs holds CommandEnvelope and pure constructor/validator; event.rs holds DomainEvent; no giant protocol.rs file holding everything.

**IDs/kinds:** ids.rs handles opaque validated identifiers; kinds.rs handles the exact 22-case EntityKind enum, four-case EntityStatus, and the explicit kind-to-collection table. Do not hide domain rule parsing inside serde attributes alone when exact JS error codes matter.

**Snapshot:** snapshot.rs handles persisted schema types and shape checks; checksum.rs handles hashing; canonical.rs handles object ordering; js_numbers.rs handles number text. Do not include world-state reducers inside snapshot.

**Transport:** transport.rs contains versioned request/response and validation, query.rs contains pure read-only query definitions. No server/router/service creation.

**Storage/config:** world-storage/config.rs is the only Phase 1 YAML file-read entry point. world-storage otherwise remains a future adapter crate without persistence behavior.

**World-core/generation:** should compile with strict dependencies and no public pretend engine methods. A later Phase 2 implementer starts state, command handling and clock only after conformance gate.

**Error type:** ProtocolError should carry stable code, safe details, optional path and source error. It must support comparisons of exact codes in tests and allow error conversion without losing context. Avoid a huge domain-specific error framework.

**Logging:** record interesting validation and conversion failures with tracing at adapter boundaries, but do not print a line on every parsed entity in large worlds. Keep the library side-effect-free.

---

## 13. Detailed PR sequencing and ownership

### PR-01A.1 — Minimal workspace

1. Recheck current HEAD, read accepted PR-00A audit/ADR and verify proposed native/ path does not already exist.
2. Create native/Cargo.toml, rust-toolchain.toml, Cargo.lock and four minimal crate manifests/lib.rs files.
3. Select stable Rust edition/toolchain and record tested Windows/WSL host.
4. Add config YAML with explicit new bridge limits, plus a small loader/validator in world-storage.
5. Add README with exact local commands and a short statement that there is no runtime engine yet.
6. Verify cargo metadata/fmt/clippy/test/check, then npm run verify (or record unrelated baseline issue).
7. Ensure changed files are only native/ and permitted QA docs; commit/push main.

### PR-01B.1 — Legacy DTO and contract validation

1. Recheck HEAD and PR-00B golden fixtures; validate source baseline hashes.
2. Implement primitive wrappers, 22-case enum and statuses, imported/stable ID rules and canonical coordinates.
3. Implement command/event/entity structs with exact JSON field names, source-compatible validation and explicit nulls.
4. Implement WorldDefinition, SimulationSnapshot and distinct editor document header validation.
5. Implement future transport request/response structures and query DTOs **without handlers**.
6. Add narrow tests for parsing, valid roundtrip and malformed input, using actual goldens.
7. Run fmt/clippy/test; ensure no game logic, state mutation, renderer changes; commit/push main.

### PR-01B.2 — Canonical JSON and conformance

1. Implement exact canonical serializer, JS numeric formatting and UTF-16 FNV-style checksum.
2. Link all eligible Phase 0 serialization and snapshot goldens and test exact output.
3. Document unsupported Map/Set locale cases if any, and never mark them as passing.
4. Add error-precedence and Unicode tests, run full cargo tests plus existing JS golden verifier.
5. Write native/docs/compatibility-report.md (or dated QA report) recording actual passes, blocked cases and source SHA.
6. Verify cargo --locked, npm test and npm run verify (or document exact existing failures).
7. Check that no golden reference files were regenerated to match Rust; commit/push main.

**Do not parallelize PR-01B.1 and PR-01B.2 changes to shared world-protocol files.** Cargo workspace changes also need single-writer discipline under main-only policy.

---

## 14. Acceptance gates, failure and rollback

### 14.1 G1-protocol PASS

All must be true:
- PR-00A accepted and deterministic PR-00B fixture sub-gate passed.
- Four crate workspace compiles and uses a pinned stable toolchain/lockfile.
- No Bevy/GPU/WebAssembly/runtime or JS production changes.
- Exact current command/event/entity/snapshot DTO field sets and value shapes supported.
- 22 kinds, four statuses and explicit collection mapping tested.
- Editor document v6 rejected when interpreted as simulation schema v1.
- JS-safe numeric limits, Unicode, opaque stable IDs and signed world coordinate conventions tested.
- Compatibility JSON serializer and 8-character checksum match **all required supported Phase 0 golden samples**. Any unsupported source fixture is explicitly treated as a gate blocker, not silently excluded.
- Transport request/response version is independent of existing document versions and fails safely.
- Config YAML loads from an explicit path and rejects invalid settings.
- cargo fmt/clippy/test/check --locked run successfully on supported reference environment.
- Existing JavaScript golden verifier, npm test and npm run verify run with results and no unexplained regressions.
- No large binary fixtures or copied map content, no new GitHub Actions.
- Documentation reports actual verification evidence and latest commit SHA.

### 14.2 BLOCKED conditions

- PR-00A/00B source contracts or goldens still unavailable.
- No stable toolchain accessible to run native tests.
- JS numeric serialization or locale-dependent Map/Set golden cannot be matched safely.
- Source fixture baseline points at unrelated or semantically changed JS source.
- Existing JS behavior is ambiguous/defective in ways that prevent a trustworthy protocol decision.
- New config/serialization cannot roundtrip without silently dropping fields.

**Response to blocked:** Stop the affected PR/claim; record failing scenario ID, source SHA, expected/actual, minimal technical cause and proposed change. PR-01A may remain a successful workspace-only deliverable; full G1-protocol may not.

### 14.3 FAIL conditions

- Rust accepts a malformed snapshot version/checksum as valid.
- IDs, tick/revision or Unicode data change after roundtrip.
- A failed decoder panics or leaks private details through logs.
- A new protocol implementation mutates JS runtime or creates a second world authority.
- Fixture generator modifies expected results merely because Rust disagreed.
- Native crate graph accidentally depends on Bevy/GPU/browser/network runtime.
- Existing web tests regress because Phase 1 touched production files.

Rollback should be **surgical**: revert only the failing native commit, preserve phase documents and existing JS editor. No schema migrations or JS data should need rollback because Phase 1 is side-effect-free.

---

## 15. Risk register and explicit mitigation

| Risk | Severity | Detection | Mitigation |
| --- | --- | --- | --- |
| Missing Phase 0 audit/fixtures | Critical | Check docs/architecture and test/fixtures presence + manifest | Gate PR-01B on real accepted outputs |
| Browser editor and simulator are not connected | High | PR-00A verified call graph | Keep separate adapters and never assert a unified authority |
| Editor document v6 confused with snapshot v1 | Critical | Cross-format rejection tests | Explicit independent format types |
| JS UTF-16 hash differs from Rust chars/UTF-8 | High | Emoji/BMP string goldens | Hash canonical text with encode_utf16 |
| JS JSON.stringify number notation differs from serde_json | High | -0, exponents, boundary floats | JS-compatible number text module and exact tests |
| JS localeCompare Map/Set ordering differs by locale/ICU | High | Source Map/Set parity corpus | Explicit locale constraints or documented blocker; no approximate sort |
| Generated entity IDs contain colon-rich command IDs | High | IDs with embedded colons | Treat IDs as opaque strings; no naive split |
| JS-safe integer overflow | High | Boundary u64/i64 fixtures | Explicit <= 2^53-1 validation |
| JSON null lost as omitted optional field | High | Roundtrip field-presence assertions | Serialize required nullable fields explicitly |
| Unknown nested data dropped by typed models | High | Nested entity/definition fixture tests | Use serde_json Value for extensible nested data |
| Unknown entity kinds/biome ID remapped | High | 22-kind and biome fixtures | Exact enums and canonical ranges |
| Config defaults duplicate game tuning | Medium | Diff/ownership review | Native YAML only for bridge policy |
| Oversized JSON / untrusted payload | Medium | malformed/size/depth tests | Scoped limits and error returns |
| Rust crate cycles/dependency bloat | Medium | cargo metadata and manifests | Strict graph and minimal dependencies |
| Empty success stubs misrepresented as implementation | Medium | API/source review | No fake runtime functions |
| Concurrent main commits | High | Latest HEAD checks pre-write/pre-commit | Single-writer, incremental direct commits, no force-push |
| Compatibility test changes existing JS app | Critical | git diff and npm regression | Native-only changes; strict source-scope review |

No quantified incidence or invented performance gains.

---

## 16. Phase 1 deliverable report template

At the end of each work package, append a **real execution report** to native/docs/compatibility-report.md or a dated docs/qa report with:

~~~text
Work package: PR-01A / PR-01B.1 / PR-01B.2
Source main SHA before change:
Implementation commit SHA:
Phase 0 audit/fixture SHA:
Rust toolchain / cargo:
Host OS / architecture:
Cargo.lock hash:
Added / changed files:
Expected scope vs actual scope:
Commands actually executed:
  - command:
    exit:
    summary:
Golden fixture group totals:
  - command:
  - event:
  - entity:
  - snapshot:
  - serial/Unicode/numbers:
  - coordinates:
Known source incompatibilities:
Blocked/failing fixtures:
Unimplemented features (explicit):
Follow-up PR:
~~~

**A declaration of passing tests without executing them is not acceptable.** No benchmark claims are needed in Phase 1; this is not a renderer change.

---

## 17. Copyable implementation prompts

### Prompt: PR-01A — Native workspace foundation

> Inspect latest main in https://github.com/danielsobrado/drusniel-world-builder. Read CLAUDE.md, AGENTS.md, docs/plans/rust-bevy-incremental-migration-2026-11-22.md, docs/plans/rust-bevy-phase-0-architecture-audit-and-baselines-2026-11-22.md, and docs/plans/rust-bevy-phase-1-rust-workspace-and-protocol-2026-11-27.md. Read and verify any accepted Phase 0 ownership audit and ADR; if absent, report the dependency and restrict work to what the plan explicitly allows. Implement **PR-01A only**, creating a small native/ Cargo workspace with four minimal crates world-protocol, world-core, world-generation, world-storage, verified stable toolchain, Cargo.lock, small YAML runtime-policy loader/tests, README and report. Follow exact dependency direction; no Bevy, graphics, WASM, HTTP, production JS changes, dummy simulation functions, GitHub Actions, feature branches or worktrees. Run cargo metadata, fmt, clippy, check and tests --locked, plus JS verification if applicable. Commit and push main. Report actual SHA, changed files and test results.

### Prompt: PR-01B.1 — Protocol types and validation

> Inspect current main and accepted PR-01A/Phase 0 fixture data. Read the same roadmap and Phase 1 plan. Implement **PR-01B.1 only**: exact current JS command/event/entity/snapshot DTOs and validators; 22 entity kinds, four statuses, opaque IDs, explicit snapshot v1 vs editor document v6, JS-safe numeric and signed coordinate rules, versioned future transport envelopes and query DTOs without runtime handlers. No world state mutation, simulation clock, reducers, save adapters, Bevy, WASM, network or production JS changes. Use real Phase 0 goldens; if absent, stop rather than fabricating. Keep source files small and cargo strict. Commit/push main with actual results.

### Prompt: PR-01B.2 — Canonical checksum and parity

> Inspect latest main, current Phase 0 golden corpus and PR-01B.1 DTOs. Implement **PR-01B.2 only** from the detailed Phase 1 plan. Reproduce current JS canonicalSerialize/checksumCanonical behavior for the supported source corpus, including exact object/Map/Set ordering constraints, JS number formatting, UTF-16 FNV-style hash, Unicode supplementary characters, -0, null vs missing, error codes and snapshot checksum checks. Do not silently approximate or rewrite goldens. Run cargo fmt/clippy/test/check --locked, Phase 0 golden verifier, npm test and npm run verify, reporting exact pass/fail/blocker evidence. Do not implement world simulation, Bevy, browser integration, GPU code or GitHub Actions. Commit and push main.

---

## 18. Handoff to Phase 2

**Phase 2 may assume only:**
- native/ workspace with immutable and versioned wire contract definitions;
- stable DTOs and typed errors for current supported JS simulation data;
- exact accepted serializer/checksum compatibility with Phase 0 golden fixtures;
- tested nonmutable coordinate/id/kind/calendar structures;
- separate editor v6 and simulation snapshot v1 format boundaries;
- future transport envelopes that do **not** imply a running server or WASM client.

**Phase 2 must still implement:** authoritative world state, per-entity data changes, event reducers, command transaction rollback, fixed-step world clock, seeded RNG, save/replay behavior and parity over complete state transitions. None of these can be claimed by passing Phase 1 DTO tests.

The first Phase 2 implementation should target source-replay fixtures from src/sim/model/worldState.js, src/sim/time/worldClock.js and src/sim/commands/dispatcher.js before domain simulation is ported.

## 19. References

- [Migration roadmap](rust-bevy-incremental-migration-2026-11-22.md).
- [Phase 0 detailed plan](rust-bevy-phase-0-architecture-audit-and-baselines-2026-11-22.md).
- [Repo guidance](../../CLAUDE.md), [AGENTS.md](../../AGENTS.md), [README](../../README.md).
- [Command envelope](../../src/sim/commands/commandEnvelope.js), [Dispatcher](../../src/sim/commands/dispatcher.js), [Event](../../src/sim/events/domainEvent.js).
- [Entity envelope](../../src/sim/model/entityEnvelope.js), [Entity kinds](../../src/sim/model/entityKinds.js), [IDs](../../src/sim/model/ids.js), [World state](../../src/sim/model/worldState.js).
- [Simulation snapshot](../../src/sim/persistence/snapshot.js), [Canonical serializer](../../src/sim/persistence/canonicalSerialize.js), [World definition](../../src/sim/model/worldDefinition.js).
- [World coordinates](../../src/editor/world/WorldCoordinates.js), [World constants](../../src/editor/world/worldConstants.js), [World document](../../src/editor/WorldDocument.js).
- [Rust Cargo workspaces](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html), [Cargo manifest](https://doc.rust-lang.org/cargo/reference/manifest.html), [Serde](https://serde.rs/), [Rust edition guide](https://doc.rust-lang.org/edition-guide/).

**Final status clarification:** This is a detailed specification committed to main. The Cargo workspace, protocol crates, YAML loader, JS parity tests and migration gate **are not implemented by this documentation change**.
