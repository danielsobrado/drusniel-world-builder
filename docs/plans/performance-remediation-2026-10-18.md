# Performance code review and remediation plan — 2026-10-18

Status: review complete; runtime fixes below are **not implemented** by this change.
Reviewed `main` at `d1f4d95e39f9cd5242a020477014ba303ae24e08`.

The largest confirmed opportunities are localizing object/workshop updates,
splitting settlement preparation into bounded work, and eliminating redundant
scene walks and buffer writes. First fix the measurement gap: settlement
preparation is absent from the performance harness's readiness checks.

This is a targeted review of the frame loop, streaming publication, scenery and
settlement preparation, object rendering, workshop transactions, and simulation
queries. It is not an exhaustive audit of every source file, shader or asset.
Findings distinguish source/probe evidence from historical browser measurements.
No current-head hardware FPS baseline or GPU speedup is claimed.

## Non-negotiable quality contract

- Keep the same render resolution/DPR, preset, visible populations, draw distances,
  geometry detail, textures, lighting, shadows, reflections, water effects, wind,
  interaction, animation and LOD thresholds/fades. No lower-quality defaults.
- Preserve exact procedural identities and used instance data. Better frame times
  with more missing, late or below-density scenery are not an improvement.
- Preserve collision readiness, door behavior, semantic workshop state, deterministic
  chemistry, undo/redo, atomic failures, simulation outcomes and save/load behavior.
- Keep Azgaar's standard terrain IDs `0–12` and deterministic custom IDs `32–254`.
  No biome grouping or legacy tile migration.
- Use the existing shared preparation allowance and conservative visibility bounds.
  Do not hide unfinished work from counters or add independent queue allowances.
- Keep modules focused. Put scheduling, indexing, publication and measurement in
  their owning modules rather than expanding `main.js` or `ConstructionView`.

Before implementing, read [performance QA](../perf-qa.md), the
[workshop framework](../architecture/workshop-geometry-framework.md), its
[implementation plan](workshop-geometry-framework-plan-2026-08-19.md), and the
[behavior review](../research/tiny-glade-workshop-behavior-review-2026-08-19.md).
Work on `main`, pull first, commit coherent changes, and push `main`.

## Evidence and priorities

P1 means address before accepting performance for the affected workload. P2 means
confirmed avoidable work with workload-dependent impact. These priorities do not
claim every finding dominates the default walking scene.

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| F01 | P1 | Settlement preparation can be excluded from a successful settle | Probe reports `settled` with 100 supplied settlement jobs |
| F02 | P1 | A residency/object revision refreshes all object renderers and resets LOD state | Source trace; global revision probe triggers refresh with an unchanged resident set |
| F03 | P1 | A local workshop edit reconstructs document-wide structures | Nine full entity enumerations for one affected entity |
| F04 | P1 | Settlement preparation contains large indivisible steps | 1,000 prop placements and 4,000 height samples before first yield check |
| F05 | P2 | Each discovery call walks the whole scene | Adding 100 meshes to 1,000 existing meshes visits 105,150 objects |
| F06 | P2 | Grass retirement/rebasing writes data unrelated to new publications | One tile retirement marks 3,440,640 bytes with zero new stems |
| F07 | P2 | Kit-town interaction scans all doors and dirties full instance arrays | One changed door dirties a 65,536-byte array for a 64-byte matrix |
| F08 | P2 | Uncached path searches rebuild global adjacency | Two one-edge searches check 20,000 edges in a 10,000-edge graph |
| F09 | P2 | Trade matching compares unrelated commodity offers | 1,000 buys × 1,000 incompatible sells make 1,000,000 commodity checks |

Run the retained, read-only diagnostic helper from the repository root:

```powershell
rtk proxy node scripts/benchmark-performance-review.mjs
```

[Probe source](../../scripts/benchmark-performance-review.mjs) imports the current
implementations, uses synthetic in-memory fixtures, and emits JSON. Counts are
work observations, not GPU driver measurements or assertions of future behavior.
The settlement-readiness fixture deliberately supplies a pending subsystem to
show that `settleReadiness()` ignores it; it is not a real browser capture.

The final standalone probe run used Node `v22.21.1` on Windows. A single-property
workshop dispatch took median 0.60 / 3.08 / 28.80 ms at 100 / 1,000 / 10,000
entities (five warmups, five batches of ten dispatches). Each dispatch affected
one entity but enumerated 900 / 9,000 / 90,000 records. These timings are indicative
local CPU measurements, with no browser or guaranteed machine isolation; use
work counts for portable regression checks.

## F01 — Include settlements in readiness and workload identity

Evidence: [PerfQaHarness.js:333](../../src/editor/performance/qa/PerfQaHarness.js#L333)
checks collision, streaming, construction queue depth and vegetation.
[SceneryPreparationStatus.js:2](../../src/editor/stylized/SceneryPreparationStatus.js#L2)
does not include `SettlementView` or `TownRuntime`. Neither is passed to the
harness at [main.js:1490](../../src/main.js#L1490).

Meanwhile, [SettlementPrototypePool.js:86](../../src/editor/world/settlements/view/SettlementPrototypePool.js#L86)
has queued, in-flight and completed work; its own `pending` getter also excludes
`uncompiled`, `compiling` and `unrevealed`. Site surface loading, preparation and
paving installation are additional readiness dependencies. Meshes deliberately
marked `skipWarmup` are outside the generic draw-preparation queue.
The existing `object-town` fixture exercises placed ObjectView gatehouses, not
the Azgaar settlement renderer, so it does not cover this gap.

- [ ] Expose bounded readiness snapshots from the default settlement renderer and
  optional kit runtime: site jobs, surfaces, worker requests/results, queued
  variants, compilation/reveal, publication and terminal failures. Enabled failed
  content must not silently become ready; intentionally disabled systems may.
- [ ] Feed them into both initial settle and post-stop recovery, retaining the
  existing 60-frame stable interval and timeout failure. Record actual visible
  buildings/props/interiors and requested counts alongside queue state.
- [ ] Add a fixed Azgaar burg approach/revisit scenario for the default renderer
  and a separate `?towns=kit` case. Keep `object-town` for F02.
- [ ] Split phase attribution around towns, weather/spells, ambience, draw
  preparation and final rendering. Currently town work follows the floating-origin
  mark, weather/spells precede `objects`, and much late CPU work lands in `render`.
  Preserve compatibility for existing report consumers.

Acceptance: pending textures, failed variants, compilation, unrevealed meshes and
site installation each prevent a false settle/recovery pass. Once every enabled
system is complete, the gate passes. Pure rendering is measured separately from
late simulation/preparation; asynchronous CPU/GPU work still needs profiles.

## F02 — Apply object residency and edits as local diffs

Evidence: [ObjectView.js:230](../../src/editor/ObjectView.js#L230) calls `refreshAll`
when the descriptor signature, global object revision or selection changes.
[refreshAll:243](../../src/editor/ObjectView.js#L243) groups all resident objects,
visits every definition, resolves placements, clears/reseeds each LOD controller,
writes near instances, empties far buckets, and rewrites non-LOD/foundation buffers.
It runs from `update()` in the frame loop. The spatial query already avoids
distant objects; the problem is publication and invalidation after that query.

- [ ] Maintain resident IDs by chunk and dirty IDs/definitions from object,
  terrain-placement, selection and definition events. Compare actual membership
  before refreshing; an unrelated world revision must cause no instance writes.
- [ ] Retain unchanged object matrices, picking IDs, foundation rows and LOD
  transitions. A selection change should update only the affected LOD entries.
- [ ] Update dirty subranges through the existing upload helper. Stage larger
  membership/capacity changes under the shared budget, publishing coherent
  renderer/picking mappings together and retaining previous valid geometry.
- [ ] Reuse the resident descriptor generation/signature until slots change;
  avoid its current per-frame `flatMap`/Set/sort/string work.

Acceptance: one local placement edit or one streamed chunk does work proportional
to changed instances plus affected batches, with zero writes and no LOD resets in
unrelated definitions. Exercise foundations, selection outside residency, terrain
edits, cancellation, rebase and the 64/256-building `object-town` routes. Preserve
the current complete visible scene during staged updates.

## F03 — Make semantic workshop transactions local internally

Evidence: [WorkshopPatch.js:61](../../src/editor/workshop/kernel/WorkshopPatch.js#L61)
sorts/enumerates the entire document and copies its Map before applying a patch;
the new document validates all references and parent chains.
[WorkshopCommandBus.js:140](../../src/editor/workshop/kernel/WorkshopCommandBus.js#L140)
rebuilds both before/after dependency graphs, and
[WorkshopInvalidation.js:35](../../src/editor/workshop/invalidation/WorkshopInvalidation.js#L35)
rebuilds two relationship graphs. `listEntities()` sorts afresh on every call.
The dirty result is local, but producing it is not. Preview replacement also
applies whole-document patches on each gesture update.

- [ ] Cache canonical entity ordering per immutable document. Share unchanged
  entities and use a bounded persistent/overlay representation for local patches;
  merely caching the sort leaves full Map copies and validation behind.
- [ ] Retain dependency/relationship indices across revisions; property-only
  edits should reuse topology. Update only touched edges when relationships change.
- [ ] Validate edited references and affected ancestor/dependency paths locally,
  including inbound references to deletions. Keep full validation at untrusted
  load/import boundaries and retain atomic rejection of invalid changes.
- [ ] Plan batch commands against one staged overlay and accumulate patch/inverse
  operations, avoiding repeated whole-document diff/serialization. Preserve child
  command sequencing, one commit revision and one history entry.
- [ ] Replace array-shift/sorted-insertion graph frontiers where profiling warrants
  with deterministic queues/heaps using the existing ordering semantics.

Acceptance: scale unrelated entities from 100 to 10,000 while editing one leaf;
count sorted/enumerated/validated records and graph nodes, not just final dirty IDs.
No full-document enumeration for a property-only preview/commit after initial
indexing. Validate reparenting, deletion with dependents, cycles, stale previews,
undo/redo, replay and deterministic derived geometry. No mesh-to-component inference.

## F04 — Bound settlement generation and installation steps

Evidence in the default renderer:
[SettlementSite.js:96](../../src/editor/world/settlements/view/SettlementSite.js#L96)
builds every placement, matrix, smoke/haze input and interior array before its
first `yield` at line 123. `advance()` checks its budget only after `job.next()`.
[installPaving:143](../../src/editor/world/settlements/view/SettlementSite.js#L143)
installs every layer/interior mesh together; `pavingMesh()` computes normals and
bounds synchronously. `SettlementView.update()` calls installation outside its
resumable `advanceWork()` gate.

The separate, opt-in kit renderer has a larger version of the same issue:
[TownStreamer.js:118](../../src/editor/towns/TownStreamer.js#L118) builds an entire
layout, instanced town and collision owner synchronously. One town per frame does
not bound one town's cost. This kit path is **not enabled by default**.

- [ ] Make placement, height-input collection, interior building and typed-array
  packing resumable, with bounded work between deadline checks. Use the existing
  settlement worker for pure preparation where appropriate, with revision tokens
  and transfer ownership defined explicitly.
- [ ] Prepare normals/bounds alongside generated data; install bounded batches
  under the shared allowance. Track oversized steps rather than assuming one
  generator `next()` or one variant is cheap.
- [ ] In kit mode, stage local modules and collider data before coherent publication;
  keep canonical height sampling, building seeds and door/collision ownership exact.
- [ ] Integrate compilation/reveal with fair shared scheduling and F01 readiness.
  Reconcile existing starvation escape paths; removing them without a guaranteed
  turn would leave buildings hidden indefinitely.

Acceptance: the 1,000-prop probe yields before traversing the entire fixture;
larger cities do not enlarge the maximum CPU slice proportionally. Measure p95/max
preparation, installation and first-use costs separately. Full output, interiors,
paving, materials and collision must match; cancel/load/revisit must reject stale
results without holes or overlapping generations.

## F05 — Register newly installed draw roots directly

Evidence: [StreamedDrawPreparation.js:38](../../src/render/preparation/StreamedDrawPreparation.js#L38)
traverses the whole scene on every `discover()`. It is not a steady-state per-frame
scan, but [ObjectView.js:405](../../src/editor/ObjectView.js#L405) calls it inside
the per-part creation loop. Variant and resident installation also invoke it.
The WeakSet avoids reenqueuing prepared meshes, not visiting them.

- [ ] Add registration of a new mesh/subtree and invoke it once per installation.
  Keep a full-scene discovery only for initial bootstrap or explicit recovery.
- [ ] Preserve material-variant readiness, detached-object cancellation,
  `skipWarmup` ownership and the existing anti-starvation reservation.

Acceptance: installing 100 meshes beside 1,000 unrelated prepared meshes visits
only the new subtrees, instead of 105,150 objects. Compare pending targets and
publication behavior with the full-discovery reference; compilation cost remains
a separate concern from discovery cost.

## F06 — Account for actual meadow page work and remove redundant metadata

Evidence: [MeadowBandBatch.js:93](../../src/editor/stylized/meadow/MeadowBandBatch.js#L93)
packs tiles sequentially. Removing an early tile changes every following start
offset and rewrites all four instance attributes. A full 16-tile page of 4,096
stems/tile marks 3,440,640 bytes after its first tile leaves. This is bounded by
the page, but exceeds the layer's 768 KiB source-publication allowance without
publishing a new stem. The allowance intentionally does not cover these writes.

[writeTile:74](../../src/editor/stylized/meadow/MeadowBandBatch.js#L74) also repeats
16 bytes of tile origin/reveal metadata per stem; rebasing changes that entire
attribute. [MeadowGrassBatches.js:134](../../src/editor/stylized/meadow/MeadowGrassBatches.js#L134)
visits all bands/pages on a dirty layer.

- [ ] Track dirty pages/bands and predict repack, retirement, metadata and first-use
  costs separately from source publication. Admit staged changes using total work,
  while retaining complete old publications until replacements can be committed.
- [ ] Prototype exact per-tile metadata addressed by a stable integer tile ID,
  or an equivalent exact page-anchor representation. Preserve reveal rank/time
  and large-coordinate precision. A 4-byte ID replacing 16-byte metadata saves
  12 of 56 instance bytes before table/alignment overhead, not a promised FPS gain.
- [ ] Keep only a bounded layout alternative that reduces total measured work.
  The prior unbounded run-based repacker increased fragmentation and uploads and
  was reverted; do not repeat it or introduce hidden filler stems as a shortcut.
- [ ] Preserve pending attribute ranges while culled, auxiliary-camera bounds,
  live displacement padding, pooled-buffer ownership and exact populated draw counts.

Acceptance: report repack/metadata/allocation bytes and CPU/GPU cost together,
including page churn and rebases. No discarded live stems, lower density, extra
recovery delay or growing fragmentation. Benchmark any extra shader fetch/binding
cost before retaining a metadata-table design. This continues Phase 4 of the
[existing grass plan](grass-performance-preserve-quality-2026-10-16.md).

## F07 — Localize kit-town doors and interior uploads

Scope: `?towns=kit` only. [TownDoors.js:21](../../src/editor/towns/TownDoors.js#L21)
tests every resident door for focus, and `update()` scans all angle/target rows
even with no moving doors. [TownMesh.js:112](../../src/editor/towns/TownMesh.js#L112)
sets `instanceMatrix.needsUpdate` without a range for one changed door.
[TownModuleInstances.js:100](../../src/editor/towns/TownModuleInstances.js#L100)
similarly rewrites interior prefixes and dirties full-capacity attributes.
The installed Three WebGPU backend uploads the whole array when ranges are empty
(`node_modules/three/src/renderers/webgpu/utils/WebGPUAttributeUtils.js:225`).

- [ ] Index door centers spatially and maintain a set of doors currently moving;
  preserve reach, height limits, tie ordering and immediate collider transitions.
- [ ] Mark only changed door matrices with the existing subrange helper. Track
  interior membership/order changes; unchanged selections need no writes, while
  changed selections upload only their affected populated prefix/ranges.
- [ ] Retain pending ranges across hidden frames and update conservative bounds
  for all allowed door angles. Remove active/index records when towns unload.

Acceptance: a single moving door updates one matrix and the exact same collider;
thousands of stationary distant doors do not add animation-loop work. Verify
open/close reversal, partial movement, rebase, unload/revisit and interior seams.
The 65,536-versus-64 byte comparison excludes unavoidable initial GPU allocation.

## F08 — Reuse graph adjacency across path searches

Evidence: [geographicGraph.js:392](../../src/sim/geography/geographicGraph.js#L392)
filters every active edge and reconstructs adjacency before each Dijkstra search.
The heap is already implemented; replacing a queue with a heap is not outstanding
work. `sim.findPath()` caches endpoint results, but new pairs still pay setup and
[shipments.js:51](../../src/sim/logistics/shipments.js#L51) calls `shortestPath`
directly. The probe finds a one-edge path twice while checking every edge twice.

- [ ] Introduce an adjacency index keyed by graph topology/eligibility revisions,
  reused by both public path queries and shipment planning.
- [ ] Update affected adjacency rows on edge/node changes; invalidate correctly
  across state clones, rollback, load and replay. Do not key solely by state identity:
  graph records can change in the same live state.
- [ ] Preserve deterministic edge/tie ordering and evaluate current travel costs,
  danger, condition, toll and access policies. Any additional result cache must
  include all cost options and cost revisions and return defensive results.

Acceptance: repeated/new nearby endpoint searches on an unchanged graph avoid
global adjacency reconstruction. Compare routes, cost breakdowns, unreachable
results and simulation journals with the uncached oracle after every mutation.
This improves simulation queries; it is not evidence of a walking FPS bottleneck.

## F09 — Partition trade offers before matching

Evidence: [shipments.js:363](../../src/sim/logistics/shipments.js#L363) sorts global
buy/sell arrays and scans all sells for each buy, only then rejecting commodity,
settlement and price mismatches. Completely incompatible commodities still incur
the full Cartesian product in the probe.

- [ ] Partition sell candidates by commodity while preserving the existing price
  and ID ordering; traverse buys in their existing global order.
- [ ] Stop an ascending sell scan once its price exceeds the buy limit. Avoid
  revisiting exhausted candidates without changing partial-fill semantics.
- [ ] Reuse F08 adjacency for route attempts. Preserve same-settlement exclusions,
  route failures, event/reason-code order, ordinal allocation and atomic commands.

Acceptance: incompatible-commodity work scales with indexing the offers, not
buy-count × sell-count. Use randomized parity fixtures covering equal prices,
partial fills, failed routes, inactive records, replay and saved-state round trips.
Do not truncate candidates or approximate the economic simulation.

## Existing work to preserve and remaining uncertainty

- Collision registry/query locality and opportunity visibility were fixed in the
  [October 13 review](../performance-review-2026-10-13.md); do not repeat them.
- Shared meadow dispatch, shared ground input caching and multi-publication byte
  admission are already present. The newer
  [October 16 grass results](../grass-performance-results-2026-10-16.md) supersede
  the earlier worker-affinity and one-publication recommendations.
- That report still records roughly 3.1–3.4 seconds to full scenery readiness,
  with tree/rock manifests and flowers remaining after grass finishes. This is
  historical evidence, not a measured current-head defect or proof that round-robin
  scheduling is wrong. Reproduce on current `main`; then measure useful progress,
  oldest visible job age, dependencies and scheduling delays before changing it.
- Water copies, post-processing passes, shadow/occlusion work, binding updates,
  asset decode and long-travel memory retention remain profiling targets, not
  confirmed new defects in this review. Keep their current quality settings.
- No full hardware matrix or visual captures were run for this review-only change.
  The prior reports explicitly limit their FPS conclusions because of contention.

## Execution order and release gates

1. **Measurement:** implement F01, then freeze a current-head baseline. Include
   configuration/assets/harness hashes, viewport/DPR, map/seed, route, preset,
   adapter, native foreground focus, browser errors and visible populations.
2. **Local CPU work:** implement F02/F03/F05 independently, adding behavior and
   work-count regressions. Record before/after probe results per change.
3. **Streaming delivery:** implement F04; attribute the remaining manifest/flower
   recovery gap. Continue F06 only against measured upload/rebase evidence.
4. **Specialized paths:** implement F07 for kit mode and F08/F09 for simulation.
   Measure each with its own workload rather than averaging into grass FPS.
5. **Acceptance:** run focused tests, full verification, repeated hardware routes
   and visual/motion comparisons. Commit a result report with every finding's
   disposition, source/config hashes and retained raw-report paths.

For browser measurements, follow the complete [QA guide](../perf-qa.md): real
nonfallback hardware WebGPU, headed browser, native focus retained, initial settle,
zero browser errors, frozen sources, no competing app tabs/captures/builds. Use at
least three unprofiled repetitions per comparable route; profile separately.

Existing commands, from the repo root (start Vite in another terminal):

```powershell
rtk npm run dev
rtk npm run qa:perf -- --headed --qa diagonal --density standard --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics
rtk npm run qa:perf -- --headed --qa diagonal --density high-grass --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics
rtk npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 --settle --drain-seconds 20
rtk npm run qa:perf -- --headed --qa edited-world --warmup 8 --duration 12 --settle --drain-seconds 20
rtk npm run qa:perf -- --headed --qa object-town --buildings 256 --warmup 8 --duration 12 --settle --drain-seconds 20
rtk npm run qa:perf -- --headed --qa construction-ring --x 0 --z -100 --yaw 180 --warmup 40 --duration 12 --settle --constructionStyle coursed-rubble
rtk npm run qa:perf -- --headed --qa diagonal --warmup 8 --duration 12 --settle --drain-seconds 20 --revisit --turn-on-revisit
rtk npm run qa:perf:matrix -- --headed --warmup 8 --duration 12
rtk npm run verify
```

Run cases sequentially and archive each result before the next overwrites
`tmp/perf-qa-latest.json`. The new settlement route is a deliverable of F01;
do not assume `object-town` supplies it. Use the existing world visual, vegetation,
workshop, construction and water fixtures for affected systems, inspecting images
and motion at matched time/wind/pose. Include turns, eviction/revisit, edits, biome
edges, auxiliary views, failed workers and large-coordinate origin shifts.

- [ ] Existing matrix gates remain: frame p95 ≤33.3 ms, hitch rate ≤2%, collision
  readiness and its existing CPU gate, requested density, construction residency,
  and complete water acceptance. Record p99/max and hitch clustering as well.
- [ ] Full scenery recovers within two seconds after stopping using the 60-frame
  stable definition, with zero final missing/below-density in-view grass tiles.
  Grass-only readiness cannot replace full readiness. Preserve route coverage and
  movement-end snapshots, including the new settlement population evidence.
- [ ] Exact used instance/semantic data and simulation parity pass; matched visual
  fixtures and motion show no lost detail, shadow, coverage or interaction quality.
- [ ] Long travel and repeated edits keep memory, queued work and GPU resources
  bounded; throughput improves without starvation or stale publications.
- [ ] All nine findings have fixes and relevant regression evidence, or an explicit
  measured disposition explaining why a proposed experiment was rejected. Any
  failing release gate remains open; do not weaken thresholds to claim completion.

## Validation performed for this review

The diagnostic helper completed all nine probes and passed ESLint. The following
existing tests passed: **46 tests, zero failures**. These establish surrounding
behavior and demonstrate the review did not change runtime code; passing tests
do not refute the scaling findings or establish hardware acceptance.

```powershell
rtk proxy npx eslint scripts/benchmark-performance-review.mjs
rtk proxy node --test test/workshop-command-transaction.test.js test/workshop-invalidation-locality.test.js test/workshop-tool-interaction.test.js tests/meadowBatchUploads.test.js tests/meadowWorkerCompaction.test.js test/towns/town-lod.test.js test/resident-object-queries.test.js tests/PerfQaSettleGate.test.js tests/sim/pathCachePersistenceRegression.test.js
```

Full `verify`, browser performance and visual QA are implementation acceptance
requirements above, not checks claimed as executed for this documentation change.
