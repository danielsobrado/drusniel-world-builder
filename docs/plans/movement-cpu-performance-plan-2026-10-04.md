# Movement CPU performance: prepared terrain and budgeted vegetation

Date: 2026-10-04  
Status: runtime stages implemented; strict frame-time acceptance remains open.

Implementation details, hardware results, and remaining failures are recorded in
[the performance investigation](../perf-investigation-2026-10-04.md). The initial
plan and baseline diagnosis below are retained for comparison.

## Goal

Reach **144 FPS during standard player movement on the reference hardware WebGPU setup**, with a **6.94 ms frame budget**, while preserving the current world, vegetation density, viewing distances, collisions, and visual features. Use Gods’ End’s approach: prepare reusable data before it is needed, sample arrays during play, and schedule every expensive generation stage under a shared deadline.

World Builder needs this preparation per chunk because its world streams and remains editable. Baking an entire fixed map at startup is not the implementation here. Startup prepares the initial dependency window; movement prepares the next window ahead of the player.

Follow [player movement performance QA](../perf-qa.md) throughout implementation. Each stage below needs a comparable hardware A/B capture before its performance claim is accepted.

## Evidence and current gaps

The [latest capture](../../tmp/fps-gap-profile.json) used NVIDIA Lovelace hardware WebGPU, no fallback adapter, a 1280 × 720 viewport at device scale 1, balanced post-processing, and `chunk-cross`: 8 s warmup, successful settle, 12 s running from `(0, 0)` with yaw/pitch 0.

| Measured item | Current result |
| --- | ---: |
| Average FPS | 68.63 |
| Frame p50 / p95 / p99 | 11.90 / 31.40 / 46.85 ms |
| Frames over 33.3 ms | 23 / 822, about 2.80% |
| Vegetation/scenery CPU (`stylized`), average / p95 | 8.866 / 18.995 ms |
| Rendering/submission CPU (`render`), average / p95 | 4.401 / 4.895 ms |
| Player + character CPU, combined averages | 0.367 ms |
| Terrain commit CPU, average / p95 | 0.037 / 0.200 ms |

The accompanying [sampled CPU profile](../../tmp/fps-gap.cpuprofile) supports the tree → blocker lookup → rock preparation diagnosis, with coast generation and procedural terrain sampling below it. Its inclusive stack times overlap and cover a different interval from the measured frame summary; do not add them or divide them by the report’s frame count.

The baseline report’s `gpuRender` field copied CPU render-phase statistics; it was **not a GPU timestamp measurement**. Its `cpuUpdate` aggregate combined phase summaries rather than computing frame percentiles. Both are corrected in the implementation: GPU timing is explicitly unavailable, CPU submission is separate, and CPU percentiles use per-frame sums.

The [migration record](../gods-end-migration.md) reports 69.36 FPS **before** migration and 71.33 / 68.35 FPS afterward. It does not establish an improvement. The [earlier hardware matrix](../perf-investigation-2026-07-29.md#authoritative-post-review-matrix) reached 170.91 FPS in its standard case. That is evidence that much better throughput has been possible; its older content/configuration and 8 s measurement are not a controlled A/B against today’s scene.

### Verified baseline code paths

| Area | Existing behavior | Required change |
| --- | --- | --- |
| Terrain | [InfiniteWorldStore](../../src/editor/world/InfiniteWorldStore.js) already caches generated tiles and Float64 heights, then bilinearly interpolates heights. Cache misses still call the generator on the requesting thread. | Populate the required canonical data before placement starts; make movement placement reads unable to generate missing data. |
| Worker pages | [generateWorldChunk](../../src/editor/world/generateWorldChunk.js) creates terrain, water, masks, and optional grass/flower scatter. Render heights are Float32. | Extend existing worker preparation with precise CPU sampling data and needed halos; preserve canonical precision. |
| Tree dependencies | [TreeManifestStore.context](../../src/editor/stylized/TreeManifestStore.js) calls `getPreparedBlockersForChunk` before comparing its cached context signature. That lookup can advance rock generation. | Make context lookup read-only and enqueue missing dependencies explicitly. |
| Rock finalization | [StylizedRockView](../../src/editor/stylized/StylizedRockView.js) slices base scatter, then `storeManifest` synchronously builds riverbank, coast, and seabed features. Its build timer ends before those features. | Make all stages resumable and include their time in the same job/deadline. |
| Collision consumers | [RockCollisionSource](../../src/editor/collision/providers/RockCollisionSource.js) calls synchronous `manifestForChunk`; [TreeCollisionSource](../../src/editor/collision/providers/TreeCollisionSource.js) can call `build` without a yield callback. | Collision requests must use the same prepared records and explicit readiness contract. |
| Ecology | [ForestHabitatField](../../src/editor/stylized/forest/ForestHabitatField.js), [ScatterClusterField](../../src/editor/stylized/forest/ScatterClusterField.js), and [TileDistanceField](../../src/editor/stylized/forest/TileDistanceField.js) already cache samples/grids. Cold distance fields still scan and transform a chunk plus halo synchronously. Some caches clear on global world revision. | Prepare fields ahead, share overlapping data, and invalidate only affected dependencies. |
| Budgets | [DeferredWorkBudget](../../src/editor/performance/DeferredWorkBudget.js), [FrameSlack](../../src/editor/performance/FrameSlack.js), and [StylizedBuildQueue](../../src/editor/stylized/StylizedBuildQueue.js) exist. Nested work has independent clocks, and a minimum allowance can be granted again to later consumers. | Establish one consumable allowance and absolute deadline per frame. Every nested stage inherits it. |
| Configuration | [exploration.yaml](../../config/exploration.yaml) currently sets `frameBudget.targetFps: 120`. | Set the intended production target to 144 during the scheduler change and record it in all comparison reports. |

### What to adapt from Gods’ End

These are local source references in the adjacent checkout, inspected for this plan:

| Donor source | Useful behavior | World Builder adaptation |
| --- | --- | --- |
| [TerrainSampler](../../../drusniel-gods-end/src/world/TerrainSampler.js) | Loads/builds height arrays and samples four stored values. | Prepared canonical chunk arrays with sufficient neighboring data. |
| [ProceduralVegetationField](../../../drusniel-gods-end/src/grass/ProceduralVegetationField.js) | Builds density, growth, moisture, understory, and path channels before use. | Prepare this project’s terrain/ecology inputs per chunk, retaining its species and placement rules. |
| [WorldPropSystem](../../../drusniel-gods-end/src/world/WorldPropSystem.js) and [WorldCollisionSystem](../../../drusniel-gods-end/src/physics/WorldCollisionSystem.js) | Places saved stones and constructs hull data during initialization; runtime manages distance activation/residency. | Generate each revision’s rock records once and share them among rendering, blockers, and collision. |
| [vegetationRebuild](../../../drusniel-gods-end/src/foliage/vegetationRebuild.js) | Default 2 ms shared scheduler, adaptive allowance, staged generation/preparation/finalization/publication, visibility and aging priorities. | Extend existing queues with that lifecycle. A 2 ms cap is a ceiling; actual allowance must fit the remaining 144 FPS budget. |
| [InstanceViewCuller](../../../drusniel-gods-end/src/foliage/InstanceViewCuller.js) | Shares culling/repacking time across layers and resumes unfinished passes. | Put scenery repacking and upload preparation under the same frame accounting. |

No matched Gods’ End FPS capture is available in this review. The claim to validate is World Builder’s measured result, not assumed donor parity.

## Frame allocation and success criteria

This is a **planning allocation**, not a predicted result:

| CPU work / reserve | Average allowance |
| --- | ---: |
| Rendering and post-processing submission | 4.40 ms |
| All vegetation/scenery updates, including scheduled work | 1.20 ms |
| Player physics and character animation | 0.37 ms |
| Other CPU work, including terrain commits | 0.47 ms |
| Browser/timing reserve | 0.50 ms |
| Total | 6.94 ms |

Vegetation therefore needs roughly an **86% reduction** from the captured average. Copying a 2 ms scheduler and adding it to today’s other costs is insufficient. Separate cheap mandatory scenery updates from optional preparation, and charge both accurately. If fixed submission work prevents this allocation, optimize it in stage 5; do not claim success from vegetation timings alone. CPU phase sums also do not establish GPU headroom or presented FPS.

Acceptance for the unchanged **standard** scene, across three valid unprofiled repeats:

- Average FPS at least 144 in each run; report all runs and their median.
- Frame p95 at most 6.94 ms, p99 at most 10 ms; zero post-warmup frames over 33.3 ms on the primary route, as requested by the QA guide. Average FPS alone is an intermediate result.
- `stylized` mean at most 1.20 ms and p95 at most 2 ms. Measure individual stage overruns rather than hiding them in an average.
- Zero synchronous procedural terrain generation or full field builds from movement placement/blocker lookups once they use prepared data. An unready dependency queues work and yields.
- Main-thread terrain commit p95 below 2 ms, at most one commit/frame while moving, and zero procedural tile sampling during commit. Preserve the guide’s straight-boundary grass rebuild limit of three.
- No lower density, missing vegetation, increased visible holes, broken collisions, or growing deferred backlog. Count completed/visible work and actual player distance alongside FPS.
- The full density/construction/water matrix must pass its existing gates. Its 33.3 ms p95 / 2% hitch ceilings remain regression gates, not proof of 144 FPS. Record dense-case timings separately; this plan does not assume every stress scene will reach 144.

Provisional streaming targets: p95 request-to-ready time at most 250 ms for visible vegetation; no repeatedly eligible near job waiting over 500 ms; no collision readiness stops on the settled primary route. Validate these against measured travel speed and dependency cost in stage 0. Required lookahead is at least `speed × p95 preparation latency + dependency reach`, with safety margin. Teleports and world loads use an explicit readiness phase rather than this steady-movement latency target.

## Data ownership and lifecycle

The intended dependency flow is:

```text
canonical world + local revisions + configuration
  -> prepared terrain/tile/water/path data, including dependency halos
  -> base ecology and rock-cluster inputs
  -> complete rock manifest + blocker index + signature
  -> tree manifest + root fitting
  -> canopy-dependent ground cover and other dependent layers

complete rock/tree manifests -> collision snapshots
complete manifests -> instance buffers -> draw preparation -> publication
```

Base ecology must not depend on the trees it is supposed to generate. Tree shade/canopy overlays are downstream data. Rendering, tree exclusion, and physics consume the same placement records but retain distinct readiness states; a placement blocker is not itself a physics collider.

Each prepared entry/job carries canonical chunk coordinates, world identity/epoch, relevant local revision signatures, configuration/generator version, and prototype/palette version where applicable. Floating-origin changes affect render transforms, never cache identity or procedural seeds.

Use explicit states such as `missing`, `queued`, `building`, `ready`, `failed`, and `cancelled`. An empty completed manifest is ready; unavailable assets or an unfinished halo are not an empty result. Keep the previous complete visual publication while a replacement prepares. If an edit makes current collision unsafe, keep the existing player readiness policy until the new collider generation is valid.

Prepared CPU data lives independently of GPU slots. Retain dependency references while jobs or collision need them, then evict with bounded memory and hysteresis. Do not make deterministic placement depend on whether a neighboring render chunk happens to be resident.

## Implementation sequence

### 0. Preserve the baseline and expose the missing work

Primary files: [FrameProfiler](../../src/editor/performance/qa/FrameProfiler.js), [PerfCounters](../../src/editor/performance/qa/PerfCounters.js), [buildPerfReport](../../src/editor/performance/qa/buildPerfReport.js), and the generation paths listed above.

1. Record the starting commit **and working-tree diff**, effective world/configuration, browser/adapter, viewport, and asset revisions. The reviewed checkout contains migration changes beyond HEAD; a commit ID alone cannot reproduce it. Preserve the current capture rather than overwriting it.
2. Capture three unprofiled baseline runs. Take a separate sampled CPU profile for attribution; profiling overhead must not enter the throughput comparison.
3. Add stage timings for context/blocker lookup, base rock scatter, riverbank/coast/seabed work, field construction, candidate acceptance/indexing, roots, instance assembly, preparation, and publication. Include synchronous work in callbacks between animation frames.
4. Record main-thread procedural sample counts, cache hits/misses/evictions, prepared bytes, stale-result drops, duplicate requests, job age/latency, stage overruns, visible completion, collision readiness stops, and worker/commit queue delay. Distinguish lifetime totals, measurement-window deltas, and per-frame gauges.
5. Report actual whole-frame CPU percentiles and label render submission as CPU. Instrument at job/slice boundaries; avoid expensive timing on every terrain read or per-frame report sorting.

**Exit:** reproduce the regression, attribute previously untimed rock finalization, and establish workload/completion metrics that prevent empty scenery or a stalled player from passing.

### 1. Enforce the shared deadline through nested jobs

Primary files: `DeferredWorkBudget.js`, `FrameSlack.js`, `StylizedBuildQueue.js`, [StylizedSurfaceViewBase](../../src/editor/stylized/StylizedSurfaceViewBase.js), `StableScatterManifest.js`, `StylizedRockView.js`, `TreeManifestStore.js`, and [StreamedDrawPreparation](../../src/render/preparation/StreamedDrawPreparation.js).

1. Set the intended frame target to 144. Capture a configuration-only control if this change affects the comparison; report it separately from code savings.
2. Calculate one frame allowance from measured fixed cost, current-frame elapsed work, and reserve. Pass one absolute deadline/clock through queues and nested stages. Child work may shorten that deadline but never reset or extend it.
3. Grant any progress floor **once globally per frame**, not once per consumer. Record when the floor intentionally exceeds available slack. Aging changes priority; it does not grant every waiting job extra milliseconds.
4. Check the deadline before starting work and between bounded units. The current manifest builder guarantees one candidate before checking; do not let every nested caller claim a new first unit after exhaustion. If one candidate/feature can exceed the slice, split its work or prepare its inputs earlier.
5. Refactor rock generation into resumable base scatter, candidate limiting/indexing, acceptance, riverbank, coast, seabed, blocker-index/signature, and completion stages. Budget array merging, sorting, statistics, and finalization too. Preserve existing candidate order, IDs, RNG channels, and spacing outcomes.
6. Carry the deadline into planted-tree processing, root fitting, instance assembly, and preparation/publication callbacks. Promise/worker completion should mark work runnable; heavy continuation work resumes through the scheduler.
7. Keep scheduler orchestration in the existing budget/queue layer. Extract small builders/stores from the large views instead of growing a second competing scheduler or adding more logic to `src/main.js`.

Start with a provisional 0.25 ms maximum synchronous unit; measure overshoot and tune units against hardware. Driver compilation/submission cannot be preempted: count it, bound how many draws start, reuse/prewarm variants, and treat persistent overshoots as unfinished work.

**Exit:** fake-clock tests prove an exhausted parent prevents nested generation, shoreline finalization yields, and completed output is identical across slice sizes. Hardware reports include every stage and show where the remaining allowance is spent.

### 2. Prepare canonical terrain and distance fields before placement

Primary files: `InfiniteWorldStore.js`, [WorkerBackedWorldStore](../../src/editor/world/WorkerBackedWorldStore.js), [WorldChunkWorkerClient](../../src/editor/world/WorldChunkWorkerClient.js), `generateWorldChunk.js`, `TileDistanceField.js`, [WaterDistanceField](../../src/editor/water/WaterDistanceField.js), and [PathClearanceField](../../src/editor/stylized/forest/PathClearanceField.js).

1. Add a small prepared-field store and a read-only sampling adapter. These are proposed responsibilities, not existing APIs. Reuse the worker pool and existing tile/height caches rather than creating an independent world generator.
2. Prepare canonical tile IDs, heights, required slope/normal inputs, and water/path distance fields in workers. Transfer typed arrays; main-thread installation validates versions and installs data within the budget. Preserve the bounded terrain commit path.
3. **Preserve precision:** current canonical generated heights are Float64, while render-page heights are Float32. Do not seed the canonical cache from rounded render heights. Produce/reuse Float64 CPU samples from the same generation pass, keeping Float32 render payloads separate. Compare interpolation and placement results before changing any precision contract.
4. Apply canonical height/tile overrides and relevant neighboring edits to each worker snapshot before deriving fields. Version the entire dependency region. If any relevant edit arrives during a build, discard/reschedule that result; do not patch a stale height array while leaving its ecology or water distances stale.
5. Calculate halo size from all consumers: bilinear corners, slope/root stencils, water/path search distance, shoreline probes, scatter candidate halos, and blocker overlap. Compose dependency reach across stages; the current one-chunk blocker halo is not a universal field margin. Reuse overlapping prepared blocks.
6. Provide `ready/pending` sampling semantics for placement. Missing data schedules preparation; it must not synchronously invoke the generator, return a fake flat height, or treat an unloaded neighbor as empty. Keep exact canonical editor/physics queries available where their existing contract requires them, and count any runtime fallback separately.
7. Prioritize collision terrain and upcoming visible dependencies over optional ecology. Bound requests, worker concurrency, transferred bytes, and commit backlog; heavy ecology must not delay mandatory terrain pages.

Memory must be a measured configuration, not an unlimited cache. Existing height memos alone permit about 8 MiB at 256 × 64² × 8 bytes before masks/overhead. Record bytes for every new channel and halo, share ownership where possible, and use `entries × (side + 2 × halo)² × bytesPerSample` to size the allowed working set. Reject configurations that cannot hold pinned dependencies; do not evict them repeatedly to meet an unrealistic cap.

**Exit:** repeated placement queries use prepared arrays; cold preparation runs off the movement call stack. Seam, negative-coordinate, edited-height, import, and floating-origin tests match canonical values. Halo prefetch improves misses without increasing visible residency.

### 3. Make rock manifests and blockers shared prepared dependencies

Primary files: `StylizedRockView.js`, `TreeManifestStore.js`, `RockCollisionSource.js`, `TreeCollisionSource.js`, and their collision providers.

1. Extract a rock manifest store, following the existing tree-store separation. Let the view handle LOD/rendering; let the store own revisioned build jobs, immutable placements, signatures, blocker indices, and residency.
2. Separate lookup from scheduling: a cached lookup returns ready/pending state and never performs generation. Queue the whole required rock dependency window once; tree jobs wait for its completion instead of polling until a getter performs enough work.
3. Coalesce requests from neighboring trees, bushes, rendering, and collision by chunk/version. Reuse a spatial blocker index and cached per-chunk signatures. Cache halo aggregates by neighbor versions; stop concatenating/re-hashing every placement on every context check.
4. Keep tree jobs dormant while dependencies are pending and wake them on completion. Prioritize rock work that unlocks player collision and near-visible trees, then visible scenery, then distant prefetch; use aging within the shared allowance.
5. Remove synchronous cold-build escapes from movement consumers of `manifestForChunk`, `getBlockersForChunk`, and collision snapshots. Adapt providers to pending results explicitly; their current loops assume an immediate snapshot. Preserve last-valid-position behavior rather than treating missing colliders as clear space.
6. Prepare collision prototype data when assets become available, then build chunk collider instances from the same completed placements. Handle delayed rock prototype selection explicitly so the migration’s `prototypeIndexForRoll` readiness error cannot masquerade as an empty ready chunk.
7. Publish a complete manifest only after all shoreline categories and blocker metadata finish. Collision readiness and draw readiness may finish at different times but must refer to compatible placement versions.

**Exit:** one manifest build per chunk/version across all consumers; no tree/collision lookup advances a rock builder; pending/empty/failed are distinct; approach direction and completion order do not change placements or cross-border spacing.

### 4. Prepare ecology and invalidate it locally

Primary files: `ForestHabitatField.js`, `ScatterClusterField.js`, `TileDistanceField.js`, `TreeManifestStore.js`, [StylizedChunkRevisionTracker](../../src/editor/stylized/StylizedChunkRevisionTracker.js), and [TreeRootFitter](../../src/editor/stylized/forest/TreeRootFitter.js).

1. Build reusable terrain-dependent ecology inputs ahead of candidate evaluation. Share height, slope inputs, moisture/water distance, path distance, regional weights, and existing forest/rock patch grids where their sampling semantics match.
2. Preserve existing grid origins, spacing, categorical biome/species decisions, and interpolation rules. Do not introduce a coarse interpolated suitability field that silently changes acceptance. Move exact evaluations into preparation or compute them cheaply from prepared inputs; require a separate visual decision if later approximation is needed.
3. Retain canopy/shade as a downstream overlay keyed by the completed tree manifest. Root fitting samples the precise terrain adapter once per placement/revision and remains a scheduled stage.
4. Extend local revision tracking to the actual terrain, water, path, forest-edit, construction-footprint, and palette dependencies. An edit invalidates its affected chunks plus the relevant influence halo. Global generator/world changes invalidate the epoch. Camera motion, render LOD changes, and floating-origin rebasing do not invalidate ecology.
5. Reject stale worker responses and release leases on cancellation, eviction, reset, and disposal. Preserve authored world/forest edits as canonical persistence; prepared fields/manifests are rebuildable derived data. Disk baking is optional later if measured startup cost justifies it.

Preserve Azgaar’s 13 standard biome IDs `0–12` in order. Persist non-standard definitions and deterministic IDs `32–254`. Do not add the former generic terrain grouping or a legacy migration path.

**Exit:** an unchanged revisit performs no new field/manifest build while retained; eviction produces identical regenerated results. A local edit rebuilds only affected dependencies. Imported worlds, custom biomes, planting/felling, terrain edits, and undo/redo remain correct.

### 5. Remove the remaining scenery and submission cost

Re-profile after stages 1–4. Use the results to order this work; the latest profile also contains LOD planning, placement signatures, meadow sampling/compaction, contact-shade bookkeeping, and render submission.

1. Update only changed chunk representations. Avoid rewriting a whole resident tree/rock set when one chunk completes or a fade value advances. Reuse arrays/transforms and update instance attribute ranges.
2. Share a culling/repacking allowance among scenery layers. Resume long passes, retain complete visible data until replacement is ready, and ensure camera turns do not restart unfinished work forever.
3. Make forest-floor/contact-shade updates and other remaining cold field paints explicit scheduled jobs. Keep cheap animation/time-uniform updates separate from build time.
4. Measure actual per-frame submission counts and renderer CPU cost. Verify counter reset/accumulation semantics before interpreting `rendererDrawCalls`; the capture’s final value is not sufficient evidence of per-frame calls. Reuse prepared scene/pass state and reduce redundant submissions/buffer writes where the profile points.
5. If render CPU stays near 4.4 ms and the complete frame still misses 6.94 ms, keep investigating submission and GPU timing. Retain the existing post-processing/visual preset for the performance comparison.

**Exit:** the entire standard route meets the frame target with complete scenery, not just the rock microbenchmark.

## Validation and rollout

### Reproducible hardware commands

Serve the app in one terminal with `npm run dev`. Close every other rendering tab and run GPU tests sequentially. On this WSL setup, use native Windows Chromium through the existing wrapper:

```bash
npm run qa:perf:windows -- --qa chunk-cross --x 0 --z 0 --yaw 0 --pitch 0 --warmup 8 --duration 12 --speed run --settle --viewportWidth 1280 --viewportHeight 720 --out tmp/movement-cpu-before-1.json
npm run qa:perf:windows -- --qa chunk-cross --x 0 --z 0 --yaw 0 --pitch 0 --warmup 8 --duration 12 --speed run --settle --viewportWidth 1280 --viewportHeight 720 --out tmp/movement-cpu-after-1.json
```

Capture `before-2/3` and `after-2/3` under the same conditions, changing only the output filename. Take the before runs before implementation; the command names do not select a code revision. Preserve the reports for each implementation stage. Use `--cpu-profile tmp/movement-cpu-attribution.cpuprofile` on a separate run.

On a machine where local headed Chromium has hardware WebGPU, the equivalent command is `npm run qa:perf -- --headed ...`. Run `npm run qa:perf:matrix -- --headed` on a hardware-capable host; on WSL launch `scripts/run-perf-matrix.mjs` with native Windows Node/Playwright as described by the project’s hardware QA setup. A Linux software-adapter result is invalid, regardless of process success.

Reject comparison runs with fallback/WebGL, unsuccessful settle, wrong workload activation, incomplete frame capture, or unexpected stationary movement. The existing settle gate checks terrain/collision/walls; it is not proof that all vegetation is ready. Report vegetation backlog at measurement start and finish, and add an explicit prepared-window settle check without concealing preparation time. Save startup/readiness duration separately.

### Required behavioral checks

| Check | What it must prove |
| --- | --- |
| Fake-clock nested jobs | No child starts after deadline; one global floor; all generation/finalization stages resume; no double time accounting. |
| Determinism | Different slice sizes, queue order, worker completion order, approach direction, and cache eviction produce identical placement IDs/positions and blocker outcomes. |
| Sampling | Exact canonical heights, overrides, negative coordinates, chunk seams, large imported coordinates, slope/root stencils, and water/path halos remain consistent. |
| Invalidation | Tile/height/water/path/forest edits, undo/redo, config changes, prototype readiness, and world reset invalidate the right data; stale completions never publish. |
| Collision | Trees/rocks use matching placement revisions; pending data blocks unsafe movement; normal running does not accumulate readiness stops. |
| Sustained movement | Run a 60 s route crossing multiple previously unseen chunks; check completed chunks per second, queue age, memory, worker delay, and actual travel distance. |
| Revisits and turns | Reverse/diagonal movement and camera turns reuse prepared data without starvation, repeated full rebuilds, or visible gaps. |
| Shorelines and edits | Exercise riverbanks, coast, seabed, and terrain/path edits while moving; include rapid direction changes and a floating-origin snap. |
| Visual parity | Compare fixed-pose captures, accepted/visible counts, species distribution, shoreline coverage, roots, and draw distances. |

Extend existing meaningful coverage in [stylizedManifestBudget.test.js](../../tests/stylizedManifestBudget.test.js), [stableScatterManifest.test.js](../../tests/stableScatterManifest.test.js), [WorldChunkWorkerClient.test.js](../../tests/WorldChunkWorkerClient.test.js), and terrain/ecology/collision suites. The current rock budget test replaces `storeManifest`, so it cannot catch expensive real shoreline finalization; add coverage that exercises those stages. Run focused tests after each change, then `npm test` and `npm run build` for the integrated result. Use `npm run verify` when asset/configuration changes require its broader checks.

Run the complete density/construction/water matrix after integration. The migration record’s water route was blocked by natural props and did not establish swimming acceptance. Resolve that failure and require actual entry, swim, dive, surface, dry exit, and active caustics; timings from a player that stayed dry do not pass water QA. Also run the guide’s dedicated approaching-wall route when checking construction performance.

### Delivery checkpoints

- [x] Baseline package and stage telemetry saved; profiled and contaminated captures excluded from throughput claims.
- [x] Nested budgets and rock feature/finalization stages resume under the shared allowance; individual atomic operations can still overrun it.
- [x] Precise prepared terrain/halo data consumed by placement.
- [x] Shared rock/blocker records and pending collision contracts integrated.
- [x] Ecology preparation, local invalidation, and bounded residency covered by behavioral checks.
- [ ] Remaining scenery/submission work fits the complete frame budget.
- [ ] Three standard hardware runs meet the 144 FPS criteria; sustained-route and full matrix gates pass.

Use small reviewable changes in this order. For each checkpoint record what changed, correctness results, before/after CPU phases and frame distribution, queue age, completed scenery, memory, and remaining failures. If a checkpoint misses its target, retain the failing result and profile the remaining work. Do not close the performance task merely because the scheduler exists or one average FPS number improves.
