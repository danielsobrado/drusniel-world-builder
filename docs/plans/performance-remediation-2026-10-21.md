# Performance review and fix plan — 2026-10-21

**What this repo does:** Drusniel is a Three.js world editor with streamed terrain,
procedural settlements, vegetation, water, workshop authoring and campaign data.
This review assumes one interactive browser, long-distance exploration of an
imported Azgaar world, population-sized towns, and the shipped visual settings.

**Verdict:** fix synchronous cold-town planning and retained town data first.
Protect skyline coverage before accepting faster settlement frames. Eight
confirmed findings follow, with a complete implementation and validation checklist.

**Implementation update — 2026-10-22:** All eight findings now have runtime fixes
and regression coverage. See [implementation results and remaining acceptance
checks](../performance-remediation-results-2026-10-22.md). No visual settings
were reduced and no FPS speedup is claimed. The baseline findings and original
acceptance checklists below are retained as the review record.

## Review boundary and evidence

The reproducible source baseline is `e9ef4707a583571a04fc337b70d9518279a08e86`
on `main`. An ordinary `git archive` copy under
`tmp/performance-review-2026-10-21/runtime/` isolated the probes and tests from
concurrent settlement work; no branch or worktree was created.

Concurrent commits through `83263dcb` changed settlement identity, recipes and
street layouts. The implementation locations responsible for the eight findings
were rechecked and are unchanged there. Planner population/sample totals below
describe the frozen fixture, not the newer layouts. Source line references refer
to the baseline. Recheck them against `main` before implementing.

Reviewed the entry point, package/build configuration, frame scheduling, terrain
height fallback, settlement planning and worker handoff, derived-data ownership,
town LOD selection, instanced publication, ambient ground sampling, minimap
updates, surface loading and relevant tests. Re-ran the existing broad performance
probe, including workshop transactions, object residency, scene discovery,
grass compaction, door uploads, readiness, path queries and trade matching.
This is a focused performance review, not an exhaustive shader, asset or simulation audit.

Read [performance QA](../perf-qa.md) before implementation. Changes involving
workshop geometry must also follow the [geometry framework](../architecture/workshop-geometry-framework.md),
[implementation plan](workshop-geometry-framework-plan-2026-08-19.md), and
[Tiny Glade behavior review](../research/tiny-glade-workshop-behavior-review-2026-08-19.md).
Work only on `main`; pull first, commit coherent changes, and push `main`.

## Quality contract

- Keep resolution, DPR, density, building population, draw distances, LOD thresholds,
  geometry detail, textures, lighting, shadows, water effects, wind and animation.
  Do not disable effects, shorten visibility or use cheaper assets to meet a target.
- Preserve exact procedural identities, terrain heights, street/footprint masks,
  instance transforms, color/seed data, collision, doors and interiors. Preserve
  the current deterministic simulation, persistence and undo/redo behavior.
- Keep Azgaar terrain IDs `0–12` and deterministic custom IDs `32–254`.
  No terrain grouping or legacy remapping.
- Scheduling changes must retain a complete valid publication until its replacement
  is ready. Faster frames with missing buildings, reduced grass coverage, late
  textures or longer recovery do not count as improvements.
- Use existing preparation queues, spatial queries and upload helpers. Keep
  error handling, cancellation, ownership and readiness visible. Do not add a
  second independent frame allowance or conceal oversized work from counters.
- Keep semantic workshop state authoritative and generated geometry derived.
  Keep changes in the owning modules; do not expand `main.js` into another scheduler.

## Priorities and measured work

P1 means a release or quality blocker for the stated workload. P2 means confirmed
avoidable work or a resource-lifetime defect whose frame impact depends on workload.
These are CPU work counts and resource-state observations, not GPU measurements.

| ID | Priority | Finding | Probe observation |
| --- | --- | --- | --- |
| F01 | P1 | Cold height queries can synchronously plan a whole town | One query generated 1,206 buildings and 2,756 props, taking 12,026 ground samples |
| F02 | P1 | Completed town plans, indices and skylines have no travel eviction | Eight plans remained after all consumers and requests were gone |
| F03 | P1 | Skyline disappears before replacement buildings are drawable | Skyline hidden with a prepared/paved site and a variant still queued |
| F04 | P2 | Ambient ground patches rebuild in one frame, including pure rebases | 4,097 height calls per rebuild; another 4,097 at unchanged canonical focus after rebase |
| F05 | P2 | Local minimap redraw samples the whole image and scans distant objects | 37,636 height calls, 36,864 tile calls, all 10,000 off-map objects inspected |
| F06 | P2 | Kit-town LOD classification ignores the deferred-work gate | 20,000 coordinate reads for 10,000 placements; LOD update runs with budget exhausted |
| F07 | P2 | Instance capacity growth clones unchanged prototype geometry | Growing 8 slots to 16 copied 1,080,000 static geometry bytes in a synthetic prototype |
| F08 | P2 | A late texture fallback acquires a reference after the owner released it | One fallback set retained with `uses: 1` and no remaining lease owner |

## Must fix

### 1. F01 — Prevent interactive cold queries from planning a city

**What this is:** Terrain height and biome queries include canonical settlement
grading, so houses stand on their pads and streets remain clear.

**Problem:** [InfiniteWorldStore.generatedHeight:296](../../src/editor/world/InfiniteWorldStore.js#L296)
falls back to the generator when neither memoized nor prepared heights exist.
[AzgaarMacroWorldGenerator.sampleHeight:419](../../src/editor/world/AzgaarMacroWorldGenerator.js#L419)
then calls `SettlementField.grade`, whose
[ensurePlan:196](../../src/editor/world/settlements/SettlementField.js#L196) generates
and indexes the entire town synchronously. `cover()` can take the same route for tiles.
The prepared-plan guard in the terrain worker does not protect the main-thread
generator. A cached registry contains locations, not prepared plans.

This is reachable through `InfiniteTerrainView.getCanonicalHeight`, including
ambient patches and other auxiliary samplers, or editor minimap queries touching
cold cells. Ordinary warmed walking may avoid it; this is not a claim that every
player height query generates a town.

**Evidence:** A flat-ground field with seed 9 and burg 18, population 28, capital
and walls enabled, generated 1,206 buildings and 2,756 props on its first
`grade(0, 0, 20)`. It made 12,026 ground calls and took **80.65 ms in one local
Node run**; the second identical query made no additional ground calls.
This is an isolated cold-call timing, not browser frame latency.

**Fix:** Prepare the pages and settlement plans needed by interactive samplers
through the existing worker service before those samplers enter cold cells.
Defer optional publication when dependencies are missing; keep numeric canonical
sampling available to workers and explicit synchronous callers.

- [ ] Audit interactive callers of `getCanonicalHeight`, `getHeight`, `getTile`,
  `grade` and `cover`; cover auxiliary views, minimap initialization, fly mode,
  imports, edits and teleports, not only the collision-driven walking route.
- [ ] Reuse `PreparedPlacementStore`, `SettlementPreparation` and the worker
  authority; deduplicate requests and discard results from obsolete world/edit epochs.
- [ ] Preserve exact graded heights and collision readiness. Do not return zero,
  ungraded ground or an old height under the player to avoid computation.
- [ ] Keep `settlementMainThreadPlansGenerated` and procedural-miss counters in
  diagnostics; add cold interactive sampling to readiness and regression fixtures.

**Acceptance:** Approach/teleport into a previously untouched city with ambience
and UI active: zero main-thread plan generation, exact canonical heights after
preparation, and valid prior imagery while optional work waits. Extend
`test/settlement-plan-ports.test.js`, `test/settlement-plan-preparation.test.js`
and the prepared-terrain tests; retain failure/retry and stale-result behavior.

**If we skip it:** One cache miss can bypass otherwise bounded streaming and block
input for a whole planning job.

### 2. F02 — Bound retained settlement data across long travel

**What this is:** A mutable field entry keeps the deterministic plan, its spatial
index and, on the main renderer, worker-generated skyline arrays.

**Problem:** [SettlementField.entryAt:78](../../src/editor/world/settlements/SettlementField.js#L78)
and `ensurePlan` retain those entries for the generator's lifetime.
[SettlementPlanPreparation.end:74](../../src/editor/world/settlements/view/SettlementPlanPreparation.js#L74)
only cancels outstanding requests; completed payloads stay on entries.
The [worker authority and receiving workers](../../src/editor/world/settlements/SettlementPlanPorts.js#L45)
also retain their own plans/indices. Disposing a site or GPU skyline does not evict
these CPU payloads. Storage scales with towns visited, up to the world's town count,
rather than with the active streaming window.

**Evidence:** Visit eight separated population-5 towns, prepare each plan and
skyline, then release the last plan consumer. Requests and consumers both become
zero, but all eight plans/indices/skylines remain: 4,513 buildings,
5,632,224 bytes of skyline typed arrays, and 5,575,214 bytes when the plans are
JSON-encoded. JSON size is **not** a heap measurement and excludes index overhead.

**Fix:** Bound disposable derived payloads, with pins for live sites, skylines,
terrain jobs and queued installation. Apply the policy in the authority, terrain
workers and main field; deterministic regeneration is already available.

- [ ] Track active use and recent use in the existing field/preparation ownership.
  Evict unpinned `plan`, `index` and `skyline` payloads together under a bounded
  working-set policy; retain source registry data and canonical identity.
- [ ] Clear payloads on the stable entry objects, or repair all bucket references
  if removing entries. Deleting only `resolvedEntries` leaves other references alive.
- [ ] Keep terrain consumers pinned independently of renderer leases. Do not
  clear a plan just because a visual site left while a terrain job still needs it.
- [ ] Add retained plan/index/skyline counts and bytes to resource diagnostics.
  Report pinned exceptions rather than pretending a hard limit was met.

**Acceptance:** A deterministic multi-town travel/evict/revisit soak reaches a
memory plateau per process/worker. Revisited plans, pads, masks and skylines match
their previous values exactly. Simultaneous terrain/view requests, cancellations,
failed workers and world replacement do not lose live data or resurrect evicted work.
Extend the registry, plan-port, plan-preparation and streaming-locality tests.

**If we skip it:** Long sessions retain increasingly large town data even though
visible sites and terrain chunks appear correctly bounded.

### 3. F03 — Keep skyline coverage until the town is actually published

**What this is:** A distant town silhouette bridges the period before its detailed
buildings have loaded and become drawable.

**Problem:** The [isDrawn callback:77](../../src/editor/world/settlements/view/SettlementView.js#L77)
checks only surfaces, completed site preparation and paving. The
[skyline visibility switch:81](../../src/editor/world/settlements/view/SettlementSkyline.js#L81)
therefore hides the silhouette while variants can still be queued, compiling,
staged or fading into view. This can make a cheaper frame contain less scenery.
The full settle gate does account for pending work; this finding concerns
coverage during streaming, not a claim that the settle gate ignores variants.

**Evidence:** A site with `surfaces`, no `job`, and `pavingReady: true` makes
the real callback hide its skyline with one variant still queued.

**Fix:** Base the per-site handover on actual published replacement coverage,
including relevant prototype tiers and fade state.

- [ ] Track readiness for the site's required building representations through
  `SettlementSelection`, `SettlementTierPublication` and the prototype pool.
- [ ] Retain the skyline while replacement coverage is incomplete or failed.
  Do not gate one site's handover on unrelated towns or street-furniture jobs.
- [ ] Keep the handover coherent across turns, tier growth, eviction and rebasing;
  verify that any overlap/fade does not visibly darken or erase the town.
- [ ] Add per-site coverage evidence to approach/revisit captures so a low frame
  time cannot silently benefit from a gap between representations.

**Acceptance:** Delay one required variant, shader compilation or publication;
the silhouette remains until its replacement is visible. Test both normal and
failed preparation with `test/settlement-skyline-preparation.test.js`,
`test/settlement-tier-publication.test.js` and matched approach/turn screenshots.

**If we skip it:** Preparation optimizations can appear successful while buildings
temporarily disappear, violating the requested quality constraint.

## Should fix

### 4. F04 — Slice ambient ground preparation and reuse it across rebases

**What this is:** Ambient particles sample a 64×64 height texture covering 128 m
so sand, snow and mist follow the ground.

**Problem:** [LocalGroundHeight.update/rebuild:67](../../src/editor/stylized/ambient/LocalGroundHeight.js#L67)
resamples all texels plus the base height in a single synchronous call after
roughly 32 m of drift or any origin change.
[AmbientEffectsSystem.update:171](../../src/editor/stylized/ambient/AmbientEffectsSystem.js#L171)
calls it without a deadline; `WorldAmbience` runs directly in the frame loop.
It can also expose the cold-plan path in F01.

**Evidence:** 4,097 height calls on initialization, 4,097 after 33 m movement,
and 4,097 more when only render coordinates/origin change by 4,096 m and canonical
focus remains the same.

**Fix:** Retain the patch in canonical coordinates. A pure rebase should update
its render-space uniforms, while real terrain changes or movement prepare a
replacement in bounded slices using the shared allowance.

- [ ] Preserve the 64×64 resolution, 128 m extent, sample locations, half-float
  encoding, interpolation and effect populations.
- [ ] Prepare before the existing coverage margin is exhausted, and atomically
  switch texture data, corner and base together. Retain coverage while waiting.
- [ ] Include edit/world revisions, cancellation and queued work in validity and
  readiness. Do not make old heights permanent by caching only the camera position.
- [ ] Extend `test/ambient-effects.test.js` with work-count, pure-rebase,
  edited-terrain and delayed-publication cases; compare particle contact visually.

**Acceptance:** Zero height calls for a pure rebase of a valid patch; a bounded
number per preparation slice for a new patch; final texels match canonical sampling.

**If we skip it:** Periodic movement and origin changes still concentrate thousands
of height calls into one frame even after streaming itself is budgeted.

### 5. F05 — Make local minimap updates proportional to changed content

**What this is:** The editor's cell-scale minimap is also used while walking in
worlds without an available Azgaar region map.

**Problem:** [EditorUi.updateMinimap:1841](../../src/editor/EditorUi.js#L1841)
rebuilds all pixels/height samples and calls `objectMap.list()` before rejecting
off-map objects. [HUD recentering](../../src/editor/player/hud/createHudMinimapSource.js#L24)
calls it synchronously. This is a redraw cost, not a per-frame heading cost:
heading already uses a guarded CSS transform. Imported-world walking normally
uses `HudRegionMap`, a different rendering path.

**Evidence:** One 192×192 redraw takes 37,636 cell-height calls and 36,864 tile calls.
With 10,000 off-map objects it reads 20,000 X coordinates to reject all of them.
Each cell-height call normally reads four terrain vertices, though memoization
can make those vertex reads cheap.

**Fix:** Use [ObjectMap.queryBounds:141](../../src/editor/ObjectMap.js#L141) for local
objects. Cache unchanged terrain samples/colors and prepare the bitmap in bounded
work, preserving its exact raster and coordinate handover.

- [ ] Query object bounds using the current minimap rectangle and preserve the
  existing marker inclusion rule; reuse local revision/signature support.
- [ ] Reuse samples only when the sampling lattice and terrain/palette revisions
  match. Nonintegral pixel shifts must not reuse misaligned relief pixels.
- [ ] Coalesce editor invalidations. Publish the bitmap and its center together,
  updating the HUD adapter so deferred recentering cannot offset an old bitmap
  against a new center.
- [ ] Preserve marker order/colors, contours, terrain edits, custom biomes and
  large-coordinate behavior. Extend minimap relief/burg tests and add a redraw
  fixture with distant objects, edits and repeated recenters.

**Acceptance:** Adding distant objects does not increase local redraw visits.
Unchanged regions reuse samples, per-frame preparation is bounded, and the final
bitmap/markers equal the existing renderer for the same center and world state.

**If we skip it:** UI recenters and editor updates can stall independently of the
3D preparation budget and get more expensive as authored objects accumulate.

### 6. F06 — Bound kit-town LOD classification as well as buffer writes

**What this is:** Large optional kit towns (`?towns=kit`) draw near modules around
the player and far modules elsewhere; interiors have a separate nearby radius.

**Problem:** [TownStreamer.update:78](../../src/editor/towns/TownStreamer.js#L78)
always calls `updateLods`, outside the deferred-work check. Every 8 m,
[TownModuleInstances.split:190](../../src/editor/towns/TownModuleInstances.js#L190)
classifies all placements, then scans both slot sets; interior selection does
another full scan every 6 m. Stable slots already limit writes, but they do not
limit the CPU work required to discover changes.

**Evidence:** A 10,000-placement module reads 20,000 coordinates on a small split
refresh, even when the near/far membership stays unchanged. A caller fixture
with `shouldYield() === true` still executes the LOD update.

**Fix:** Reuse a local placement index for candidate membership changes and retain
the existing slot sets. Bound initialization, large moves and remaining scans
through the shared deferred-work mechanism.

- [ ] Keep the 130 m split radius, 36 m interior radius, refresh distances,
  geometry and exact near/far membership rules.
- [ ] Stage large classifications, including the initial split in `prepareTown`;
  publish coherent near/far sets with no missing or duplicated placements.
- [ ] Expose pending selection to kit-town readiness; preserve door updates and
  collision while work waits. Prioritize newly near detail without dropping the
  complete previous representation.
- [ ] Extend `test/towns/town-split-lod.test.js` beyond its 50-placement fixture
  and `town-streaming-locality.test.js` with exhausted-budget, teleport, rebase,
  large-town and repeated-threshold cases.

**Acceptance:** Nearby movement inspects local candidates/changes, not every
remote module; large updates yield. All placements remain represented exactly
once and nearby detail recovers within unchanged acceptance limits.

**If we skip it:** Population-sized kit cities can cause periodic CPU bursts even
though their changed matrix rows are uploaded efficiently.

### 7. F07 — Stop copying static geometry when instance capacity grows

**What this is:** Each pooled prototype grows its matrix and instance attributes
as more buildings use it.

**Problem:** [SettlementPrototypePool.tier:223](../../src/editor/world/settlements/view/SettlementPrototypePool.js#L223)
passes the existing geometry back through `createInstancedRenderers`.
[createGeometry:30](../../src/editor/stylized/lod/StylizedLodRuntime.js#L30) deep-clones
all attributes and indices, including static vertex data, before replacing the
instance attributes. Capacity changes need new instance storage, not new vertices.
Growth happens within one publication step; a deadline check around the step
does not split the cloning inside it.

**Evidence:** Growing one synthetic 30,000-vertex prototype from capacity 8 to
16 copies 1,080,000 unchanged vertex/index bytes, before matrix/dither allocation.
This proves CPU copies, not GPU upload bytes or a typical production prototype size.

**Fix:** Retain immutable prototype buffers and bounds across capacity changes;
allocate only instance-specific storage. Keep the existing staged replacement.

- [ ] Establish explicit ownership for shared static attributes before changing
  disposal. Verify the installed Three.js WebGPU and WebGL lifetime behavior;
  simply sharing attribute objects and disposing the old geometry can invalidate
  buffers still used by the replacement.
- [ ] Avoid cloning old instance attributes that are immediately overwritten.
  Reuse static bounds and do not regenerate materials solely for capacity growth
  where the renderer permits reuse safely.
- [ ] Trace all shared-helper callers: ObjectView, trees, bushes, rocks, ground
  details, roadside details and settlement tiers. Start with the capacity-growth
  path; do not perform an unrelated rendering rewrite.
- [ ] Extend tier-publication, instance-vertex-budget, object-local-publication
  and detail-visibility tests for growth, cancellation and disposal. Preserve
  storage-buffer matrices, dither, color, morphology and auxiliary camera bounds.

**Acceptance:** Growing a tier makes zero copies of immutable prototype arrays;
old instances remain drawable until the replacement is ready. Retirement cannot
break another live tier. Confirm backend behavior and frame cost on hardware.

**If we skip it:** Town arrival and growing instance groups retain avoidable
allocation/copy bursts and overlapping copies during publication.

### 8. F08 — Make texture lease release terminal across async fallback

**What this is:** A site acquires shared surface sets and releases those exact
references when it leaves. A failed set can fall back to a photographed set.

**Problem:** [SurfaceLibrary.acquire:105](../../src/editor/world/settlements/surfaces/SettlementSurfaceLibrary.js#L105)
releases by emptying the mutable `held` list. If a load rejects later,
[acquireRole:88](../../src/editor/world/settlements/surfaces/SettlementSurfaceLibrary.js#L88)
adds a fallback to the same list and acquires it after release. The disposed site
ignores the resolved surfaces and never releases again.

**Evidence:** Acquire a dressing with a pending `cobble-cut`, release immediately,
then reject that load. With in-memory successful fallback loaders, the real
library retains `cobble-grey` with `uses: 1`, despite no remaining lease owner.
Repeated failures can accumulate orphaned reference counts. Set names are finite;
this is blocked normal eviction, not proof of one new unique GPU allocation per visit.

**Fix:** Track release state on the lease and apply it to late acquisitions.
Do not let fallback completion create an unowned reference; preserve fallback
behavior for sites that are still live.

- [ ] Keep `release()` idempotent and make every late acquire/resolve path honor it.
  Ensure sharing with another live site retains that site's own reference.
- [ ] Apply the same ownership rule when the library is disposed while a recipe
  fetch or bake is pending; prevent late work from reviving disposed resources.
- [ ] Add a small async regression covering release-before-rejection, two owners,
  fallback failure, success-after-release and library disposal. Assert disposal
  counts and empty reference maps without network or GPU dependencies.

**Acceptance:** Once all owners release, pending success/failure/fallback paths
leave zero live references. A live site's materials remain valid and use the
same quality fallback as before.

**If we skip it:** Evicted sites can keep surface resources alive until the entire
library is disposed, despite its apparent reference-counting policy.

## Implementation order and release checks

1. Fix F03 and add coverage assertions first, so later performance comparisons
   cannot pass by drawing an incomplete town. Add the small F08 ownership fix.
2. Fix F01, then F02 with terrain and renderer pins coordinated. Eviction without
   F01 protection would create more synchronous regeneration opportunities.
3. Fix F04 and F05 using the now-prepared terrain dependencies.
4. Fix F06 and F07, preserving existing local instance writes and publication.
5. Run identical baseline/candidate hardware routes and visual checks. Keep any
   failing gate open; do not weaken thresholds or density to close the checklist.

For each finding, add one meaningful work-count or ownership regression that
fails before its fix, plus the existing affected behavioral tests. Timing
assertions in Node are not acceptance gates. No new dependency is required by
this plan; inspect installed renderer code when validating buffer ownership.

Use frozen runtime/config/assets for each browser comparison. Follow the
foreground, hardware-adapter, exclusive-run and error checks in
[performance QA](../perf-qa.md). Capture at least two comparable baseline runs
and two candidate runs, interleaving them where practical. Archive reports with
source SHA, configuration, route, population, adapter, viewport and resource counts.
Keep other app rendering tabs closed and do not run builds during captures.

With a matching app server already running, use the existing entry points:

```powershell
rtk npm run qa:perf:matrix -- --headed --warmup 8 --duration 12
rtk npm run qa:perf -- --headed --qa settlement-approach --warmup 8 --duration 12 --settle --drain-seconds 20 --revisit --turn-on-revisit --resources
rtk npm run qa:perf -- --headed --qa edited-world --warmup 8 --duration 12 --settle --drain-seconds 20
rtk npm run verify
```

Run captures sequentially and preserve each output before another run overwrites
it. Add a `towns=kit` variant of the settlement fixture using the existing runner's
query plumbing, and a large-city route that proves the split workload is active.
Do not substitute `object-town`, which exercises placed objects rather than this
settlement pipeline. Include cold import/teleport, long travel, town eviction and
revisit, a pure origin shift, minimap recenters and active ambient effects.

- [ ] Same visual settings and effective populations; no browser errors, fallback
  backend, failed workers or unreported missing assets.
- [ ] Existing matrix limits remain: frame p95 ≤33.3 ms, hitch rate ≤2%, collision
  readiness and CPU gate, requested vegetation densities, construction residency
  and complete water acceptance. Also report p99/max and clustered hitches.
- [ ] Full scenery recovers within two seconds after stopping, with the existing
  60-consecutive-frame definition and zero final missing/below-density in-view
  grass tiles. Grass-only recovery is insufficient.
- [ ] Capture movement-end and during-handover town coverage, not only a settled
  screenshot. Compare matched pose/time/wind images and motion for lighting,
  shadows, silhouettes, textures, interiors and near/far transitions.
- [ ] Exact terrain/plan/instance data and behavior tests pass. Memory reaches a
  plateau during the travel soak; inspect main, worker and resource ownership,
  distinguishing tracked array bytes from actual process/GPU memory.
- [ ] All eight fixes have evidence, full `verify` passes, and the unchanged
  hardware/quality gates pass before marking remediation complete.

## Validation performed for this review

Read-only assert-based probes on Node `v22.21.1` confirmed all eight table entries.
Their local source and JSON are under ignored
`tmp/performance-review-2026-10-21/{probes.mjs,results.json}`; they are diagnostics,
not committed runtime code or a hardware benchmark. The fixture descriptions
above specify their inputs. The temporary script imports the frozen source copy
and uses the existing CSS test loader for the minimap method.

The existing `scripts/benchmark-performance-review.mjs` also passed against the
frozen baseline. The October 18 findings are not repeated as current defects:
workshop edits enumerate zero full entity lists; unrelated object revisions cause
zero refreshes; adding 100 meshes visits 100 subtrees; one door marks 16 matrix
components; pending settlements block settle; two warmed local paths inspect two
edges; incompatible trade offers take 1,000 commodity reads rather than a million.
The tested grass retirement now marks 229,376 bytes, and placement preparation
yields after 64 height samples. These observations do not certify all cases.

**Existing regression tests: 53 passed, zero failed/skipped/cancelled.** Run from
the frozen runtime directory to reproduce that baseline test selection:

```powershell
rtk proxy node --test test/ambient-effects.test.js test/settlement-plan-ports.test.js test/settlement-plan-preparation.test.js test/settlement-plan-retry.test.js test/settlement-registry-cache.test.js test/settlement-preparation-status.test.js test/settlement-selection-budget.test.js test/settlement-tier-publication.test.js test/settlement-skyline-preparation.test.js test/settlement-size.test.js test/towns/town-split-lod.test.js test/towns/town-streaming-locality.test.js test/detail-visibility.test.js test/object-local-lod-publication.test.js tests/stylizedInstanceVertexBudget.test.js tests/minimapRelief.test.js tests/minimapBurgs.test.js
```

Passing existing tests establishes surrounding behavior; the missing regression
cases listed above still need to be written with the fixes.

**Not checked:** Current hardware FPS/GPU timing, browser visual or motion parity,
long-run heap/worker/GPU memory, full `verify`, every shader/asset, and exhaustive
simulation/persistence behavior. Newer concurrent settlement layouts were not
benchmarked. Those gaps limit performance claims; the hardware and quality checks
remain required before accepting implementation.
