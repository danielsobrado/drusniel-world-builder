# Grass performance: execution plan with unchanged visual quality

Date: October 16, 2026

Status: implementation handoff; runtime changes have not been made for this plan.

Reviewed baseline: `6214f270c3ad1d811c590358ef5c7393bf5a986e` on `main`.

## Objective

Improve movement smoothness, grass delivery and rendering throughput while retaining every requested blade and card, their existing detail, and all visual effects. Optimize how the same scene is prepared and submitted. Complete the work through measured validation; a faster frame with less grass present does not count as an improvement.

Start with worker utilization, repeated worker inputs and publication costs. Use measurements to decide whether the later renderer and shader experiments are justified. The opportunities below are grounded in current code, but their FPS benefits are hypotheses until measured.

## Instructions for the implementing AI

1. Read the root [AGENTS.md](../../AGENTS.md) and [performance QA guide](../perf-qa.md) before editing. Work only on `main`; pull before starting, commit coherent progress, and push `main`. Do not create branches or worktrees. Do not discard another session's changes.
2. Read the [October 15 audit](../performance-audit-2026-10-15.md), [October 16 implementation report](../performance-improvements-2026-10-16.md), and current [environment behavior](../stylized-environment.md). Recheck the code after pulling: several sessions share this checkout.
3. Treat the reviewed commit as context, not a commit to reset the shared checkout to. For frozen A/B captures, use ordinary immutable runtime copies outside active sources, following the previous report's approach. Confirm dependency/asset serving works without browser errors. Coordinate sequential hardware runs through the existing browser lock.
4. Keep changes small and responsibilities separate. Extend the worker pool, sampler, batching and QA modules rather than growing `MeadowTileLayer.js` into a general scheduler/cache/uploader.
5. After each phase, record the implementation, relevant tests, evidence, and acceptance decision in a companion report. Keep or revert each experiment based on its own evidence. Report unsuccessful experiments too.
6. Stay within grass and shared scenery/rendering infrastructure. If a fix requires workshop geometry changes, first read the three workshop documents required by `AGENTS.md` and scope that work separately.

## Quality contract

- Preserve active meadow densities, stable stem ranks, accepted stem identities and positions, blade segment counts, silhouettes, LOD thresholds, draw distances, blade/card overlap and all existing fades. Do not tune the older clump settings as a substitute for measuring the active meadow.
- Preserve biome appearance, thin grass islands, ecotones, canopy suppression, path and rock clearance, height distribution, pigment, wind, gust sheen, lighting/shadows, body interaction, footprints and spell response.
- Preserve Azgaar terrain IDs `0–12` and deterministic custom IDs `32–254`. Add no legacy terrain remapping.
- Keep the prior publication visible while its replacement prepares. Do not detach, recycle or overwrite buffers still owned by a publication or in-flight worker.
- Do not reduce resolution/DPR, disable effects, extend fades to conceal delayed density, or loosen coverage/performance gates to produce better numbers.
- Conservative per-camera culling of provably invisible geometry is allowed. It must preserve every potentially visible displaced blade, including auxiliary cameras. Do not introduce aggressive occlusion guesses or change the shader's existing retirement rules.
- For unchanged input, preparation and layout changes must retain exact used stem data. For shader changes, require deterministic visual and motion comparisons; unchanged settings alone do not prove unchanged output.

## What is already implemented

Do not repeat the previous optimization pass:

- A two-worker meadow compaction pool, transferable result buffers, stale-result rejection and bounded main-thread fallback.
- Exact reuse of processed prefixes across compatible promotions.
- Persistent packed pages: at most 16 tiles per page and a 65,536-stem capacity target, with an oversized tile allowed to progress. Draws contain populated stems rather than empty slots.
- Displacement-aware page bounds, shared meadow frame uniforms, and one buffer-changing publication per layer per frame.
- A shared preparation allowance that increases its floor under sustained backlog; terrain commits run before optional scenery preparation.
- Recovery/coverage checks in the matrix. Grass readiness alone does not satisfy full scenery readiness.

The broader foliage/wind/tuning uniform-sharing experiment was already reverted after slower captures. Do not reintroduce it without fresh attribution and a narrower hypothesis.

## Existing evidence and limits

A fresh capture on reviewed `6214f270` was collected while preparing this handoff: standard diagonal movement, native Windows nonfallback NVIDIA Lovelace WebGPU, 1280×720, DPR 1, 8 seconds warmup, initial settle and 12 seconds movement. It settled, had zero browser errors and zero measured collision readiness/procedural terrain misses. Results: **107.82 FPS, 18.3 ms frame p95, 28.42 ms p99, four hitches (0.31%)**, and a 6.111 ms average CPU render phase. At movement end, six in-view tiles were missing and 17 were below requested density. Grass first became continuously ready after 3.262 seconds; full scenery after **7.613 seconds**, exceeding the two-second gate. Recovery finished with zero in-view gaps.

This is one diagnostic baseline, not an A/B improvement claim or a complete matrix. All 1,467 fingerprinted files under `src/`, `config/` and `settings/` remained unchanged; root configuration/assets were outside that hash set, and other desktop activity was not controlled. See the [retained baseline summary](../qa/grass-performance-preserve-quality-2026-10-16/baseline-summary.json) for the exact command, capture metadata, source-check limits and raw-report hash. Raw evidence is in ignored `tmp/performance-followup-2026-10-16/`. Phase 0 must still establish repeated, fully fingerprinted comparison runs.

The October 16 report measured runtime `78f4e5b8`, before the later ecotone/island integration. Its native Windows, nonfallback NVIDIA WebGPU matrix reported:

| Case | Frame p95 | Hitch rate | In-view missing / below-density tiles at movement end | Full scenery first ready after stop |
| --- | ---: | ---: | ---: | ---: |
| Standard | 19.450 ms | 1.40% | 12 / 11 | 5.891 s |
| Dense forest | 24.375 ms | 1.69% | 8 / 15 | 9.138 s |
| High grass | 22.980 ms | 1.35% | 7 / 12 | 3.830 s |
| Dense mixed | 21.105 ms | 1.33% | 5 / 17 | 5.199 s |
| Construction corridor | 31.800 ms | 3.29% | 22 / 0 | 0.312 s |

All recovered to complete in-view grass, but the matrix failed: diagonal recovery exceeded two seconds and construction exceeded the 2% hitch-rate gate. These are historical diagnostic results, not current-baseline measurements or proof of a general FPS gain. The report explicitly notes uncontrolled desktop activity and unequal grass populations during movement.

The earlier CPU profile showed substantial renderer binding/uniform overhead. That predates the latest batching and uniform changes; obtain a new profile before assigning the remaining render cost to grass. GPU render-pass timestamps exclude uploads, compute and CPU submission.

## Phase 0 — establish comparable evidence

Deliverable: a baseline report and exact workload/source fingerprints before implementation.

1. Capture current `main` with fixed seed/map, configuration, camera route, resolution/DPR, lighting and hardware. Include root `editor.config.yaml`, relevant assets and harness sources in fingerprints, not only `src/`. Record commit, dirty state, browser/backend and adapter. Require initial settle and zero browser errors. Exclude captures changed by HMR or concurrent source edits.
2. Run at least three unprofiled repetitions each for standard and high-grass diagonal movement. Keep individual results and medians/ranges. Do not run builds, tests or other GPU harnesses concurrently with timing captures. Include full 20-second recovery observations and movement-end grass diagnostics.
3. Capture a separate CPU profile plus sampled GPU timings. Distinguish CPU submission, worker processing, upload/first-use cost and render-pass GPU time. Profiled FPS must not enter the unprofiled comparison table.
4. Capture a settled identical camera pose with complete requested density for draw-cost comparisons. Use deterministic visual fixtures for fixed wind/time; ordinary wall-clock movement endpoints need not contain equal populations.
5. Add bounded, opt-in diagnostics where the current report cannot distinguish causes:
   - Per layer: visible backlog, oldest visible-job age, completed ranks and tiles per second, missing/below-density counts over the route.
   - Worker execution duration, main-thread dispatch/clone duration, in-flight count, idle duration with eligible backlog, and completed-result-to-publication delay. Report durations within each execution context; do not subtract unsynchronized absolute timestamps across contexts.
   - Bytes of page/config/prefix inputs cloned, buffers allocated and transferred, and discarded results/ranks.
   - Source-publication bytes, repacked bytes, first-use allocation/upload bytes and origin-only updates separately. Existing marked-range counters are not actual driver-transfer measurements.
   - Blocker-specific full scenery recovery: terrain, fields/manifests, meadow workers, publication, variants/materials, construction and draw preparation.
6. Inspect route coverage over time or distance, not only the last frame. More complete grass may increase draw cost while improving delivery; explain this instead of treating it as an automatic rendering regression.

Relevant files: `src/editor/performance/qa/PerfCounters.js`, `buildPerfReport.js`, `PerfQaHarness.js`; `src/editor/stylized/SceneryPreparationStatus.js`; `scripts/run-perf-qa.mjs`; `scripts/grass-coverage-gates.mjs`.

Acceptance: repeatable baseline, workload identity, valid hardware captures, and attribution sufficient to select the next change. A baseline that fails existing acceptance remains a failure; do not silently adjust targets.

## Phase 1 — use both compaction workers without starving cards

Evidence: `MeadowCompactionPool.eligibleWorkers()` permanently routes blades to worker 0 and cards to worker 1 whenever card templates exist. A blade backlog cannot borrow an idle card worker. `complete()` frees a worker, but further dispatch depends on the layer receiving another preparation turn. Measure how often these constraints matter before changing them.

Files: `src/editor/stylized/meadow/MeadowCompactionPool.js`, `MeadowWorkerCompaction.js`, `MeadowTileLayer.js`, `MeadowGrassField.js`; `src/editor/stylized/SceneryWorkScheduler.js` and `src/editor/performance/DeferredWorkBudget.js`.

Implementation:

1. Replace exclusive worker ownership with bounded shared dispatch and explicit blade/card fairness. Start with the existing two workers; do not assume more workers help while terrain and vegetation workers also compete for CPU.
2. Prefer visible/near and aged work. Guarantee cards a dispatch opportunity under sustained blade pressure, while allowing either layer to borrow idle capacity when the other has no ready work. Do not displace a running job.
3. Keep pending work bounded and cancellation-aware. Do not create a second unbounded FIFO behind the existing tile priority list.
4. If dispatch latency is material, arrange a bounded completion-triggered preparation opportunity. Keep snapshot serialization and buffer publication on the shared main-thread budget; do not bypass it with an unlimited message-callback drain.
5. Preserve promotion cursor reuse, edited-ground invalidation, cancellation ownership and worker failure fallback. Completed results still publish through the normal publication scheduler.

Tests: extend `tests/meadowWorkerCompaction.test.js` for idle-worker borrowing, sustained mixed-load fairness, priority changes on a turn, cancellation, failure, and exactly bounded dispatch. Keep `tests/meadowCompactionReuse.test.js` and the publication/streaming tests passing.

Acceptance: identical used output arrays and final populations; no starvation or new failures; lower idle time while useful work waits, with improved delivery and no repeatable hitch regression. If worker execution is already saturated, prioritize Phase 2 or exact sampling reuse instead of adding scheduler complexity.

## Phase 2 — stop cloning unchanged ground data for every tile

Evidence: `MeadowGroundSampler.forTile()` includes the terrain page's tile, height and surface-mask arrays plus canopy and configuration inputs in every job snapshot. `MeadowCompactionPool.dispatch()` transfers recycled output buffers, but structured-clones the snapshot and any previous prefix. Many 8 m meadow tiles share one terrain page, and promotions can resend that input.

Files: `MeadowGroundSampler.js`, `MeadowGroundSample.js`, `MeadowCompactionPool.js`, `meadowCompaction.worker.js`, `buildMeadowCompaction.js`, `MeadowCompactionPrefix.js` in `src/editor/stylized/meadow/`.

Implementation:

1. Measure repeated bytes and main-thread clone time. Separate terrain page data, canopy grid, shared settings, per-tile rock inputs and promotion prefixes.
2. Register immutable page/settings snapshots once per worker and revision; send small references in tile requests. A newly assigned worker must receive the dependency before its first build.
3. Include every actual dependency in identity/invalidation: page content/revision, forest field and settings, seed, eligibility, growth and look tables, paths and rocks. Do not assume the current terrain revision alone represents them all. Audit live-setting and forest updates as part of this step.
4. Bound cache bytes and entries. Pin dependencies used by in-flight jobs, release obsolete revisions, and clear caches on failure/disposal/world replacement. A long exploration route must not retain every visited page.
5. Never transfer live terrain or published prefix buffers out of the main thread. For prefixes, first reduce copies to used records while preserving processed candidate capacity, including rejected ranks. Consider worker-local prefix retention only if the extra ownership/cache protocol is justified by measurement.
6. Keep the same `createMeadowGroundSample` and compactor rules. Cache data, not an approximation of habitat or grass density.

Tests: actual structured-clone/transfer integration, two workers receiving the same revision, a new revision arriving before an old result, terrain edits, path/rock/growth/forest invalidation, empty prefixes with processed ranks, disposal, bounded eviction/revisit and worker failure. Verify source/publication buffers remain attached and byte-identical.

Acceptance: lower clone bytes/time per prepared tile, bounded memory and unchanged compaction output for procedural and imported large-coordinate worlds.

## Phase 3 — publish ready grass promptly under the actual upload cost

Evidence: `MeadowTileLayer.canPublish()` charges `count × 56` bytes and caps buffer-changing publications to one per blade/card layer per frame. That cap applies even when several tiny ready tiles fit the byte allowance. It was introduced to contain real bursts, so do not simply remove it. Page repacking and full first-use uploads are outside that source-byte estimate.

Files: `MeadowTileLayer.js`, `MeadowGrassBatches.js`, `MeadowBandBatch.js`, `MeadowPageBounds.js`; `src/editor/stylized/attributeUpload.js`; `src/render/preparation/DrawPreparation.js` and `StreamedDrawPreparation.js`.

Implementation:

1. Measure completed-but-unpublished wait separately from unfinished compaction. Track each dirty page and the real cost of publishing into it: source copy, companion metadata, repacking, allocation and deferred first use.
2. Introduce a shared accounting boundary for both layers. Stage changes until their cost is affordable and publish atomically; retain previous output during staging. Integrate with existing draw preparation rather than adding competing upload schedulers.
3. Once accounting is reliable, allow multiple small ready publications within the same frame allowance. Keep a bounded exception so one oversized tile can progress; do not grant each layer an independent oversized exception in the same frame.
4. Preserve pending dirty ranges while a mesh is culled. First rendering after a turn must upload the accumulated changes correctly.
5. Profile page removal/count changes: `MeadowBandBatch.update()` rewrites later records when their packed offsets move. Test bounded tail movement or another local packing policy if this is a significant cost. Keep all companion attributes and reveal metadata aligned; compare draw count, memory and upload costs together.

Tests: extend `test/meadow-publication-budget.test.js`, `tests/meadowBatchUploads.test.js`, `tests/meadowStreamingPublication.test.js` and `tests/meadowPageBounds.test.js`. Cover repeated preparation calls in one frame, zero-stem ground, oversized progress, several small tiles, culled-frame updates, promotions during arrival fade and rebases.

Acceptance: more ready tiles published per unit of upload work, reduced publication delay, bounded worst-frame allocation/upload behavior and unchanged visible populations. Do not trade faster recovery for new streaming hitches.

## Phase 4 — remove repeated per-stem metadata and unnecessary page work

Evidence: `MeadowBandBatch.writeTile()` repeats `(renderX, renderZ, revealTime, revealRank)` in a 16-byte `instanceTile` attribute for every stem. Rebasing rewrites this metadata for every populated stem, although the information is shared by the tile. `MeadowGrassBatches.commit()` also visits all bands/pages when the layer is dirty.

Implementation options, measured independently:

1. Track dirty bands/pages so unchanged pages need no repack/bounds pass. Retain invalidation for membership, output, origin and live displacement-bound changes.
2. Prototype a per-tile metadata table addressed by a 32-bit stem tile ID. Replacing 16 bytes with 4 saves 12 of the current 56 instance bytes per stem, approximately 21.4%, before table/alignment overhead. This is a storage calculation, not an FPS prediction. Preserve metadata precision and stable IDs through slot reuse.
3. Measure the additional vertex fetch and binding cost, compatibility backend behavior, draw preparation and material warmup. Keep the table only if total cost improves. Do not pack positions or appearance into lossy formats.
4. Evaluate spatial page assignment only if bounds often encompass large empty areas after movement. Existing pages already cull; a spatial policy must improve useful culling enough to offset extra pages/draws/repacking. Preserve all camera-specific visibility guarantees.

Acceptance: exact used stem data and reveal behavior, lower measured memory/upload or CPU cost, no increased missing grass and no repeatable GPU regression. Add focused tests for table ownership, page churn and large-coordinate rebases if implementing a table.

## Phase 5 — optimize remaining computation only where the new profile points

These are conditional follow-ups, not required rewrites:

- **Ground sampling:** `MeadowGroundSample.js` evaluates patch/island/tussock rules for each candidate. `GrassPatchiness.js` uses deterministic value noise. If it dominates worker time, cache the exact lattice values used by each tile and interpolate with the existing arithmetic. Use `meadowWindVariation.js` as the local caching pattern. Do not replace the field with coarser samples. Check negative/large coordinates, sparse biomes, canopy patches, narrow eligible strips and mixed-biome edges against the original output byte for byte. Do not skip ecotone reads unless a conservative neighborhood proof establishes identical results.
- **CPU render submission:** re-profile the current pinned Three implementation. Grass already shares compatible frame uniforms. Attribute remaining binding/update time to material families and render passes before changing groups. Object/camera-dependent values must remain correct for reflection, shadow, preparation and main passes. Inspect local dependency code; make dependency upgrades a separately scoped experiment.
- **GPU work:** inspect generated shader code and timed render contexts before assuming repeated TSL helpers survive compiler optimization. Reusing exact per-stem terms may help; changing height noise, wind frequency, lighting precision or evaluation cadence is outside the quality contract. A new compute/storage path needs measured benefit after its dispatch and bandwidth costs, backend support and deterministic visual parity. Do not start with a renderer rewrite.
- **Non-grass recovery blockers:** when grass is complete but scenery still fails recovery, use blocker-specific data to fix manifests/material/draw preparation in their existing queues. Raising the global budget, lowering scenery density or reporting only grass readiness does not satisfy full recovery.

## Commands and validation

Start the appropriate frozen-runtime Vite server and verify its URL. These commands assume `http://localhost:5173`; pass `--url` when using a different port. Save every baseline/candidate repetition under a distinct path rather than overwriting the latest evidence.

```sh
# Native hardware WebGPU on this WSL setup, using Windows Chromium.
npm run qa:perf:windows -- --qa diagonal --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics --out tmp/grass-perf/baseline-standard-1.json
npm run qa:perf:windows -- --qa diagonal --density high-grass --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics --out tmp/grass-perf/baseline-high-grass-1.json

# Separate diagnostic capture; do not use its FPS for unprofiled comparisons.
npm run qa:perf:windows -- --qa diagonal --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics --gpuTimings 1 --cpu-profile tmp/grass-perf/diagnostic.cpuprofile --out tmp/grass-perf/diagnostic.json

# Warm revisit and 180-degree turn, plus edited terrain and boundary streaming.
npm run qa:perf:windows -- --qa diagonal --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics --revisit --turn-on-revisit --out tmp/grass-perf/revisit.json
npm run qa:perf:windows -- --qa edited-world --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics --out tmp/grass-perf/edited.json
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics --out tmp/grass-perf/chunk-cross.json

# Exact-prefix work probe; not an FPS benchmark.
node scripts/benchmark-meadow-work.mjs

# Focused existing suites; add the new behavioral tests from implemented phases.
node --test tests/meadowWorkerCompaction.test.js tests/meadowCompactionReuse.test.js tests/meadowBatchUploads.test.js tests/meadowStreamingPublication.test.js tests/meadowPageBounds.test.js test/meadow-publication-budget.test.js test/meadow-habitat-compaction.test.js test/meadow-growth-publication.test.js test/meadow-wind-continuity.test.js test/scenery-work-scheduler.test.js test/deferred-work-budget.test.js test/grass-coverage-gates.test.js test/perf-matrix-gates.test.js

# Run once on the final candidate after targeted validation.
npm run verify
```

Run the full hardware matrix, including water and the approaching construction corridor, in a native Windows terminal in this checkout on WSL systems:

```sh
npm run qa:perf:matrix -- --headed --warmup 8 --duration 12 --url http://localhost:5173
```

On a native platform with a working hardware WebGPU adapter, use `npm run qa:perf -- --headed ...` for individual captures instead of the Windows wrapper. Do not treat Linux software/WebGL fallback numbers as WebGPU evidence.

For visual acceptance, use the existing `scripts/run-world-visual-grass-qa.mjs` fixtures (`grass`, `lod`, `temporal`, and `paths`), `scripts/run-biome-appearance-qa.mjs`, and relevant first/third-person cases in `scripts/run-world-visual-motion-qa.mjs`. Read each runner's supported arguments and source-cleanliness checks before running; execute with the hardware-capable browser/runtime. Commit candidate runtime sources before runners that require a clean source state. Review saved images and motion, including a turn, eviction/revisit, floating-origin rebase, path/rock boundaries, thin biome strips, canopy and spell/body interaction. Do not substitute a single attractive screenshot for temporal validation.

## Completion criteria

- [ ] Current baseline and candidate use identical quality/configuration and recorded hardware/viewport, with stable source fingerprints and zero browser errors.
- [ ] At least three unprofiled standard/high-grass repetitions show a reproducible improvement in the targeted cost, with FPS, frame p95/p99, maximum dt, hitch count/rate, delivery and memory reported together. Differences within run-to-run spread are inconclusive.
- [ ] Exact deterministic compaction populations and used arrays match baseline fixtures. Complete settled render poses retain requested counts and detail; movement coverage does not regress. Reducing empty submissions is permitted, removing live stems is not.
- [ ] Existing matrix passes: WebGPU, collision readiness and existing collision p95 gate, frame p95 at most 33.3 ms, hitch rate at most 2%, density multipliers, construction residency and water behavior.
- [ ] Full scenery first becomes continuously ready within two seconds after stopping, using the existing 60-frame stable interval definition. Recovery ends with zero missing and zero below-density in-view grass tiles. Report grass-only readiness separately. Preserve movement-end and route coverage evidence even when recovery passes.
- [ ] Revisit/turn, edits, cancellation, worker failure, rebases, large coordinates and sustained travel retain correctness and bounded caches/buffers.
- [ ] Deterministic visual fixtures and motion have been inspected; all affected behavior tests and final `npm run verify` pass.
- [ ] Commit a concise result report under `docs/`, a machine-readable summary with source/config hashes under `docs/qa/`, and the successful code/tests. Keep large raw captures/profiles in ignored `tmp/` with their locations and hashes recorded. Commit and push `main`, leaving no task changes uncommitted.

If a phase does not improve its target, revert that experiment and record the result. If the final matrix still fails, identify the exact failed gate and remaining bottleneck; do not mark the overall performance objective complete or weaken the acceptance rules.
