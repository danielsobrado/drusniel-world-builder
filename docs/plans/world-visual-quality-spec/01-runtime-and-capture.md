# 01 — Runtime reliability and capture contract

Parent: [world visual quality plan](../world-visual-quality-plan-2026-10-13.md).
All paths in code spans are repository-relative. “New” identifies a required
future file; this documentation pass does not create implementation files.
Execute VQ-01, VQ-02, then VQ-03 before changing appearance.

## VQ-01 — Make camera cuts bounded and atomic

**Problem.** `InfiniteTerrainView.calculateVelocity` interprets a teleport as
movement. `ObjectView.residentObjectCellBounds` then unions all resident slots
into one rectangle. The retained audit recorded an object-index bucket overflow
on an Eldara jump. Both the predictor and the query shape need fixed contracts.

**Owners.** `src/editor/InfiniteTerrainView.js`, `src/editor/ObjectView.js`,
`src/editor/ObjectSpatialIndex.js`, `src/editor/player/PlayerController.js`,
`src/main.js`. Add `src/editor/world/CameraCutCoordinator.js` and
`src/editor/world/residentObjectQueries.js`.

### Required behavior

1. Add `InfiniteTerrainView.cutToCanonical({ x, z }, timestamp)`. Reject
   nonfinite coordinates/timestamp before mutation. Set `lastFocus` to a copied
   canonical point, `lastFocusTimestamp` to the supplied timestamp and
   `focusVelocity` to zero. Invalidate the four-value streaming chunk state, then
   synchronously call `updateStreamingFrame(point, timestamp, true)`. Slot
   descriptors must describe the destination before the method returns;
   asynchronous page generation keeps its existing token protection.
2. Introduce one `CameraCutCoordinator.cut({ x, z, yaw, pitch, mode, heightAboveGround = 1.7 })`,
   with canonical metres and radians. Supported modes: `player`, `fly`. Player
   mode uses the existing grounded eye height and accepts only offset 1.7. Fly
   mode samples destination ground and adds the finite positive offset. All explicit
   navigation jumps and the visual harness use it. Ordinary movement does not.
3. Transaction order: validate arguments; suspend input for the transaction;
   cancel any prior cut's completion wait; update terrain residency via
   `cutToCanonical`; perform the existing floating-origin update; apply its shift
   to all existing subscribers once; convert the target to render coordinates;
   set mode and pose; refresh object residency and collision focus; reset
   temporal history through the existing camera-cut notification; resume input
   only after destination collision is ready in player mode. Fly mode does not
   require grounded collision. Do not render an intermediate old-slot/new-pose
   frame. A second cut supersedes the first; its stale promise cannot resume
   input or publish an old pose.
4. Reuse the normal origin-update event path. Do not directly call
   `FloatingOrigin.setOrigin` without notifications. Do not zero the origin or
   convert canonical coordinates twice. A rebase without a cut preserves
   velocity; a cut resets it.
5. Protect callers that move the focus without the coordinator: in
   `calculateVelocity`, classify a displacement as discontinuous when its
   distance is greater than `max(2 * chunkWorldSize, 250 * dtSeconds)`.
   For that sample return zero velocity and store the new focus/time.
   `dtSeconds = max(0.001, elapsedMs / 1000)`. Regular slow frames and free flight
   below this threshold retain normal prediction. This guard supplements the
   explicit cut API; it does not replace the transaction.
6. Replace the union query in `collectResidentObjects` with one bounds query per
   **distinct resident descriptor**. Bounds are inclusive cell coordinates:
   `[originCellX, originCellZ, originCellX + chunkSize - 1,
   originCellZ + chunkSize - 1]`. Sort descriptors by numeric chunk Z then X;
   deduplicate returned objects by ID and sort by numeric ID before publication.
   Preserve the selected object once even when outside residency. Preserve the
   existing finite-world `objectMap.list()` path when there is no slots array.
   An empty slots array returns only an eligible selected object.
7. Keep `ObjectSpatialIndex`'s existing oversized-operation guard. Never replace
   the failed query with `objectMap.list()`, clamp away part of a rectangle, or
   catch the overflow and silently omit objects. Query count is at most the
   number of distinct resident descriptors; query area is at most one chunk.
8. Key object residency invalidation on the actual descriptor-set signature,
   object revision and selection. A changed slot set must update objects even
   if the camera remains in the same focus chunk.

### Tests and gate

Add `test/camera-cut-coordinator.test.js` and
`test/resident-object-queries.test.js`; extend
`test/object-view-lifecycle.test.js` and
`test/floating-origin-resilience.test.js`.

- Mock a deferred page load, cut A→B→C, resolve promises in C,A,B order. Only C
  may publish or release collision input; events occur in the specified order.
- Test coordinates `(0,0)`, `(-5667,93)`, `(8000000,-3000000)` and
  `(-8000000,3000000)`, duplicate descriptors, negative cells, no slots,
  selection outside the window, and an object overlapping two query bounds.
- A 10 m displacement over 1 second predicts ordinary motion. A 100000 m
  displacement over 16 ms predicts zero. A rebase at constant canonical focus
  produces no canonical displacement.
- Queries for slots millions of cells apart never cover the gap. Keep an
  explicit test that a truly oversized direct index query still throws.
- Browser: perform 20 alternating long cuts, wait for readiness after each,
  and capture the first and final destination. Require zero page/console/GPU
  errors, valid destination collision, no old destination objects, and no stale
  temporal trail after the existing history reset.

Run:

```bash
node --test test/camera-cut-coordinator.test.js test/resident-object-queries.test.js test/object-view-lifecycle.test.js test/floating-origin-resilience.test.js
```

## VQ-02 — Drain every legitimate scenery job

**Evidence boundary.** A single bush job remained pending in all twelve audit
shots. The captured data does not identify the exact blocked dependency. Source
inspection shows resumable bush work waiting for rock blocker snapshots and
prepared fields, with bushes scheduled after other heavy work. Do not write the
QA report as if a root cause has already been reproduced.

**Owners.** `StylizedSurfaceViewBase.js`, `StylizedBuildQueue.js`,
`StagedViewRebuild.js`, `StylizedBushView.js`, `RockManifestStore.js`,
`src/editor/world/PlacementPreparationWindow.js`, `PreparedPlacementStore.js`.
Add `src/editor/stylized/SceneryWorkScheduler.js`.

### Implement the following contracts

- Extend preparation diagnostics with a `queues` object keyed by
  `grass`, `flower`, `tree`, `rock`, `bush`, `detail`, `treeManifest`,
  `rockManifest`. Each entry reports `depth`, `oldestAgeMs`, `completed`,
  `advanced`, `blocked`, `cancelled`; the last four are cumulative counters.
  `advanced` means an iterator cursor or stage changed, not merely that it ran.
- A blocked job records `key`, copied focus coordinates, content revision,
  dependency type, dependency chunk keys, last progress time and blocked reason.
  Allowed reasons: `budget`, `prepared-field`, `rock-manifest`, `variant`,
  `obsolete`. Return a structured snapshot on demand; do not allocate a full
  job dump every frame. Log no per-frame console spam.
- `getPreparationStatus().ready` remains false while any image-changing queue,
  staged replacement, manifest request, placement field, meadow build, draw
  preparation, variant load or material bake is pending. Count staged work even
  between queue flush and resynchronization. Disabled layers with no pending
  work count zero. A known error is reported as an error, never as “ready”.
- Copy `{ chunkX, chunkZ }` into every resumable job. Current jobs keep a mutable
  reference to `terrainView.focusChunk`; that reference must not conceal a move.
  A generation token identifies each job's focus/content/prototype revision.
  A stale generation cannot publish. A pure LOD fade update may finish its
  current publication and then consume the latest plan; it must not restart
  the same geometry build on every fade tick.
- Keep producer updates in dependency order (fields → rock manifests → rock
  plan → tree plan → bush plan → detail plan). Move expensive **flush** turns
  into `SceneryWorkScheduler`, after collision's existing reservation.
  Round-robin the runnable consumers in fixed order
  `[meadow, rock, tree, bush, detail, flower]`; advance the starting index by one
  each frame. Animation, visibility and uniform updates still run every frame;
  only resumable preparation consumes these scheduled turns. Keep existing
  per-queue slice/build limits and the shared 6 ms ceiling. Never run a blocked consumer to exhaustion or increase that ceiling.
- A consumer that waits for a rock chunk requests that dependency explicitly;
  pending rock **render** publication elsewhere is not a global reason to skip
  all bushes. Replace the `!rockView.pendingRebuild` blanket flush gate with
  per-job readiness of the actual blocker snapshot. Preserve the previous
  complete bush publication until its replacement is complete.
- Make the preparation radius cover all dependencies. For render radii T, R, B
  (maximum enabled tree, rock, bush band), use
  `max(loadRadius + 2, T + 4, R + 3, B + 4, maxDetailRadius + 3)`.
  Set the rock manifest window to preparation radius minus 2. Validate that
  `PreparedPlacementStore` capacity holds the resulting square; fail config
  validation if not. No silent truncation or global cache expansion.
- A legitimately disabled rock layer, or a fully resolved empty eligible rock
  set, returns a ready immutable empty blocker snapshot. An unresolved asset
  request returns pending. A failed required asset returns an error. Keep these
  three outcomes distinct.
- Cancel jobs outside the dependency window on a cut/eviction. Do not leave
  their staged iterators, pending maps or queue entries behind. Stationary
  scenery must stop scheduling replacements once signatures stop changing.

### Reproduction and deterministic diagnosis

Before the fix, run pose 02 for 120 seconds and save a snapshot every second.
If the old failure no longer reproduces, record that fact and still implement
and test the contracts above. For any remaining pending job after the fix,
follow this exact order: verify generation identity; verify its dependency keys
lie in the declared window; verify empty versus unresolved asset state; verify
its producer is scheduled; verify its iterator advances when granted a turn.
Repair the violated contract. If none is violated but the 120-second gate still
fails, mark VQ-02 failed and stop appearance work; do not ignore the queue.

Add `test/scenery-preparation-progress.test.js` and
`test/scenery-work-scheduler.test.js`. Use fake time and resumable generators to
verify: all runnable consumers receive a turn in six frames; blocked bushes
allow other consumers to run; complete/empty rocks release bushes; obsolete
jobs cannot publish; stationary inputs reach zero pending work; no-op calls do
not count as progress; a budget boundary yields without losing a job.
Test B larger than T/R to prove the dependency-window formula.

```bash
node --test test/stylized-build-queue.test.js test/scenery-preparation-progress.test.js test/scenery-work-scheduler.test.js
```

**Gate:** all twelve original poses satisfy the full readiness predicate for
60 consecutive rendered frames within 120 seconds, including one revisit.
No counters may be excluded. Save exact unresolved records if any pose fails.
This is a correctness gate, not a frame-rate result.

## VQ-03 — Build the permanent visual review runner

Add the following focused files:

| New file | Responsibility |
| --- | --- |
| `scripts/run-world-visual-qa.mjs` | Playwright orchestration, lock, errors, screenshots, exit status |
| `scripts/lib/world-visual-poses.mjs` | Original pose ingestion, seeded additional sampling, fixture metadata |
| `scripts/lib/world-visual-report.mjs` | SHA/config hashes, artifact hashes and report validation |
| `src/editor/performance/qa/WorldVisualQa.js` | Dev-only adapter to cuts, readiness, diagnostics and render-path inspection |
| `test/world-visual-poses.test.js` | Selection and schema contracts |
| `test/world-visual-report.test.js` | Missing/error artifact rejection |

Add package script `qa:world:visual` pointing to the runner. Its CLI is fixed:
`--out PATH` (required), `--suite original|extended|lighting|motion|all`
(default `all`), `--baseline PATH` (optional for first capture only),
`--url URL` (default `http://localhost:5173`). Unknown flags fail. Headed browser
is mandatory; do not offer a headless acceptance mode.

### Poses

1. Read the twelve original shots from
   `docs/qa/visual-audit-2026-10-13/procedural-captures.json`; copy x/z/yaw/pitch
   exactly. Eye height is current grounded feet + 1.7 m, FOV 68°, 1600×900,
   DPR 1. Never substitute render-local coordinates from their state snapshots.
2. Original pose IDs remain `original-01` … `original-12` after a biome fix.
   Record `historicalBiomeId` and `actualBiomeId` separately. Pose 11 is allowed
   to change biome under VQ-07; original images must not be renamed accordingly.
3. Extend coverage with two additional locations per land biome, selected from
   the procedural generator at the implementation revision. Use unsigned LCG
   `s = (1664525*s + 1013904223) >>> 0`, initial seed `20261014`,
   `u = s / 4294967296`. Draw cell X then cell Z as `floor(u*16000)-8000`.
   Retain an accepted candidate only when at least 512 m from every already
   retained location of that biome; draw yaw as `u*2π` only on acceptance.
   At most 1,000,000 candidates, report counts. If a biome has no two candidates,
   fail extended coverage; do not relax distance or change the seed.
4. Fix the selected coordinates in the first post-VQ-07 manifest. Subsequent
   revisions replay that manifest; they do not rerun selection and shift the
   views. There must be three valid views per current land biome: where an
   original pose no longer has its historical ID, retain it as a regression view
   and select a third current-biome pose with the same algorithm.
5. Import `maps/Eldara Full 2026-07-23-20-37.json` through the existing import
   path. Add the imported snow/coast fixtures specified in chapter 03; report
   the map hash. Never use the failed original import attempt as a baseline.

### Runtime and capture

Expose `window.__worldVisualQa` only in dev builds with `?qaVisual=1`.
API: `cut(pose)`, `readiness()`, `setCaptureUi(boolean)`,
`diagnostics()`, `runMotion({ startPose, cameraMode, sequenceId })`, `dispose()`.
`cameraMode` is `first-person` or `third-person`; the sole sequence ID is
`walk-sprint-turn-v1`, defined in chapter 04. The runner awaits returned
promises; it must not mutate private streaming focus fields as the old temporary
capture script did. Acquire the existing platform browser lock from
`scripts/perf-run-lock.mjs`; run only one rendering page at a time.

Wait 16 seconds minimum after a pose, then require 60 consecutive ready frames;
the total maximum wait after the cut is 120 seconds. Grounded player collision
is part of readiness. A failure writes `failed-<pose>.png`, readiness JSON and
errors, and exits nonzero; it never counts toward accepted coverage.

Capture a full-page HUD image and a canvas-only clean PNG at each original
pose; extended poses need clean PNG only. Use lossless PNG for all new evidence.
Record region/sky resolved values, source world and seed, canonical pose, origin,
actual biome, backend, adapter, active render path, weather, wind, clock,
readiness, populations and errors next to every image.

Full-world captures keep live region animation; they are qualitative comparisons
and population/readiness assertions, **not** byte-identical pixel tests.
Deterministic pixel thresholds apply to isolated fixtures with frozen time,
fixed wind, particles off and fixed geometry, defined in the next chapters.
Do not freeze the simulation before settling it or bypass preparation work.

Report schema includes `schemaVersion: 1`, `sourceSha`, `dirtyFiles`,
`configHashes`, `mapHash`, `adapter`, `viewport`, `startedAt`, `finishedAt`,
`poses`, `checks`, `artifacts`, `passed`. Each artifact has path and SHA-256;
each check has task ID, expected, actual, passed. Nonempty dirty files invalidate
an authoritative performance comparison unless they are only untracked outputs.
Install the instrumentation, including tracked resource-byte/upload accounting,
in a commit before collecting its baseline. Baseline diagnostics must already
contain every comparative metric required by VQ-13.

### Baseline policy

Retain the old JPEGs as review evidence. Collect a fresh runtime baseline after
VQ-01–03 pass, before VQ-04. Run `--suite original` twice and the three
chunk-cross runs plus one full performance matrix from chapter 04. This isolates
appearance cost from readiness repairs. Do not run future appearance fixtures
or require the post-VQ-07 extended manifest at this stage; `all`, `extended`,
`lighting` and `motion` become acceptance suites as their later tasks land.
A suite with an unavailable required fixture fails explicitly; it never silently
skips that fixture.
Record before/after runtime diagnostics from VQ-01–02, but label any original
unsettled performance run invalid. No artificial zero-backlog baseline.

**Gate:** repeat original suite twice in fresh browser contexts. Canonical poses,
actual biome IDs and sorted placement IDs match between runs; readiness and
browser error gates pass. Configuration and source hashes match within each
pair. Add a deliberate missing artifact and an unresolved queue in tests: both
must make `passed` false and the CLI exit nonzero.
