# Performance hitch remediation — hardware acceptance instructions

## Scope and implementation status

Compare the **original audit baseline** `3aa63757124ce78624d192efd5080b98c60c2498` with the current `main`.
The intermediate baseline `507d788bb81255f495bcc4e33fb549a42dd8b08d` isolates the second pass.
Record the actual candidate SHA before every run. Do not compare results from a moving branch.
Do not use GitHub Actions. Perform all checks locally on the RTX 4080 Windows machine.

Implemented since the original audit: fair scheduling, coherent resident town tier updates, shared hierarchy registry, budgeted dirty-range geology uploads, progressive cells, large compatible geometry/index/storage-attribute staging, predictive draw and biome priorities, ordinary texture prewarming, reflection GPU queue-completion backpressure, auxiliary-view conservative bounds, sliced biome/overlay scans, and tail-latency telemetry.

The optional spatial geology LOD is implemented but **disabled by default** in
`config/render-enhancements.yaml`; use `?geologyLod=1` for its separate acceptance pass.
Near geometry is unchanged; distant archetypes use lower subdivision/ring density and spatial sectors.
Do not enable the production default until the visual and hardware acceptance gates below pass.

Limitations to verify, not mark complete:

- Staged geometry deliberately excludes interleaved/padded/unsupported attributes and ordinary instance matrices or colors that Three may wrap in another buffer. Large compatible index buffers support 4-byte alignment, including odd Uint16 tails.
- Texture prewarming admits an entire texture at a time and estimates its size. It does not slice compressed mip chains or image rows; nested TSL textures may only appear at real draw preparation. A single indivisible oversized upload still has the existing progress exception.
- Shader preparation still requires the real synchronous render context. Prediction and observed batch cost do not preempt an individual compile.
- Queue-completion latency measures outstanding GPU work, not the isolated reflection pass. Auxiliary detail culling is coarse batch-level, not independent per-instance compaction.
- CPU scheduling is cooperative. Terrain commits, initial allocations, individual generators, large interior commits, disposal and renderer calls can still exceed a frame allowance. Overlay late retags are discovered by a bounded reconciliation scan, not immediate mutation events. Blocked cells use fair retry, not dependency notifications.
- Geology remains capped and compacted per kind; spatial LOD partitions into conservative far sectors rather than an unbounded per-cell mesh hierarchy. Full npm, browser and hardware tests have not been run in the editing environment.

## 1. Create immutable control and candidate worktrees

Run from the repo root in PowerShell. Use directories outside the live checkout.
If the paths exist already, choose new paths. Do not reset the user's working tree.

```powershell
git fetch origin main
$base = "3aa63757124ce78624d192efd5080b98c60c2498"
$head = (git rev-parse origin/main).Trim()
git worktree add --detach ../hitch-control $base
git worktree add --detach ../hitch-candidate $head
$head
```

In each worktree, install dependencies with the same Node version and lockfile.
Record Node, npm, Chrome/Playwright versions, GPU driver, Windows build, display
refresh rate, viewport, device pixel ratio, rendering profile, quality flags,
world seed, browser backend/adapter and exact SHA. Plug in the PC, close other
GPU workloads, disable background capture and overlays, and keep the test
browser focused. Do not move the mouse to another browser during measurement.

```powershell
npm ci
npx playwright install chromium
npm run lint
npm test
npm run build
npm run validate:assets:production
```

Run the same commands on the control. If a fixture or atlas is stale on both,
record it separately; do not silently bypass it or claim the suite is green.
A failure introduced only by the candidate blocks acceptance.

## 2. Focused tests first

```powershell
node --test test/staged-geometry-uploads.test.js test/performance-hitch-followup.test.js test/geology-lod-batches.test.js test/performance-hitch-scheduling.test.js test/instance-dirty-span.test.js test/towns/town-budgeted-tier-publication.test.js
node --test test/budgeted-attribute-initialization.test.js test/streamed-draw-budget.test.js tests/streamedMaterialPreparation.test.js test/staged-draw-publication.test.js test/deferred-work-budget.test.js test/reflection-capture-schedule.test.js test/reflection-shadow-registry.test.js test/detail-visibility.test.js test/stylized-variant-residency-cache.test.js test/towns/town-split-lod.test.js test/towns/town-sparse-publication.test.js test/towns/town-streaming-locality.test.js tests/alpineRockSnow.test.js tests/TerrainCommitQueue.test.js tests/sceneryScheduling.test.js
```

Verify exact buffer data, cancellation, source version changes, shared geometry
publication, odd index alignment, slot coverage, door animation and collision
consistency, reflection state restoration, rebase precision, no repeated
failed uploads, and no device loss.

## 3. Repeatable headed WebGPU captures

Start the app in the chosen worktree in one terminal:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

In a second terminal in the **same worktree**, run the following. Each command
writes a separate report. Preserve the output directory per SHA/run. Stop the
dev server before switching worktrees. Do not run the two browsers in parallel.

```powershell
New-Item -ItemType Directory -Force tmp/hitch-qa | Out-Null
npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 20 --settle --gpuTimings 1 --resources --out tmp/hitch-qa/chunk-cross.json
npm run qa:perf -- --headed --qa chunk-cross --density dense-forest --warmup 8 --duration 20 --settle --gpuTimings 1 --resources --out tmp/hitch-qa/dense-forest.json
npm run qa:perf -- --headed --qa chunk-cross --density dense-mixed --warmup 8 --duration 20 --settle --gpuTimings 1 --resources --out tmp/hitch-qa/dense-mixed.json
npm run qa:perf -- --headed --qa settlement-approach --warmup 8 --duration 20 --settle --revisit --turn-on-revisit --gpuTimings 1 --resources --out tmp/hitch-qa/settlement.json
npm run qa:perf -- --headed --qa object-town --buildings 256 --warmup 8 --duration 20 --settle --gpuTimings 1 --out tmp/hitch-qa/object-town.json
npm run qa:perf -- --headed --qa edited-world --warmup 8 --duration 20 --settle --gpuTimings 1 --out tmp/hitch-qa/edited-world.json
npm run qa:perf -- --headed --qa construction-ring --x 0 --z -100 --yaw 180 --warmup 40 --duration 12 --settle --gpuTimings 1 --out tmp/hitch-qa/construction.json
npm run qa:perf:matrix -- --headed
npm run qa:water:acceptance
```

If running from WSL use the documented `npm run qa:perf:windows -- ...` wrapper;
the Windows browser must be installed. See [perf-qa.md](perf-qa.md).
Use `--screenshot` with a path for visual evidence where the runner supports it.
For cold streaming, repeat selected commands without `--settle` and preserve
them under separate filenames; label them cold diagnostics, not settled gates.
For each route, run A/B/A/B at least twice (four runs total per route) with
identical hardware/settings and fresh browser processes. Repeat at 720p and
the normal desktop resolution. Keep GPU timestamp runs separate from
unprofiled timing runs if query overhead changes frame pacing.

Discard captures with software adapters, WebGL fallback, lost foreground focus,
missing world workload, unsuccessful settle, device errors or incomplete
frame buffers. Save the rejected report and reason; rerun rather than deleting
evidence.

## 4. Manual and fixture-specific stress routes

The generic movement harness alone does not prove the snow or coastal features
were exercised. Use the existing `qa:look`, `qa:biomes:appearance` and
`qa:water:acceptance` fixture tooling; refer to their runner help/configuration
and existing QA documents for scene IDs. Also record these interactive routes
with the browser performance trace and the exact canonical start/end poses:

| Route | Required evidence |
| --- | --- |
| Cold approach to large city | Staged geometry bytes, no missing buildings, doors/collision correct |
| Same city revisit + 360° turn | Warm shader/asset reuse, no stale LOD or duplicate instances |
| Rapid coast approach, swim and dive | Reflections, waterline, no frozen or black cube faces |
| Snow mountain traverse | Alpine and glacier cells progressive, rocks grounded, no camera-edge cull errors |
| Cold sea flyover | Iceberg archetypes intact and arch openings retained |
| Geology LOD A/B | Open same pose with `?geologyLod=0` and `?geologyLod=1`; match weather/time, capture near/far, traverse LOD thresholds in both directions |
| Teleport and floating-origin snap | No stale priority, no wrong-world geometry, canceled detached GPU buffers freed |
| 30-minute traversal | Memory plateaus after warm residency; no progressive queue or buffer leak |

Use 10 seconds of stationary recovery after each route. Repeat with rapid
turning and the quality profiles actually used in production. Check reflection
captures for stale overlays, incorrect auxiliary culling, persistent fallback
and terrain/vegetation missing from mirrors. Inspect water queue latency
without confusing it with isolated GPU pass duration.

## 5. Acceptance thresholds

These are proposed goals for the 144 Hz RTX 4080 target, not prior measurements.

| Metric | Target |
| --- | --- |
| Frame dt P50 | <= 6.94 ms |
| Frame dt P95 | <= 8.33 ms |
| Frame dt P99 | <= 12 ms |
| Frame dt P99.9 | <= 20 ms |
| Streaming frames > 33.3 ms | 0 |
| Full scenery recovery | <= 2 s on settled movement cases |
| GPU/device/browser errors | 0 |
| Visual/collision regressions | 0 |
| Staged buffer write slice | <= 768 KiB; shared publication budget also respected |
| Individual deferred unit | Investigate > 0.5 ms; report any > 1.2 ms |
| Memory | No monotonic growth over comparable repeated routes |

Report absolute values and delta against the control. If the baseline misses an
absolute target, the candidate must not be accepted solely because it is
slightly faster. Require a meaningful tail improvement, no material median or
P95 regression, and a documented root cause for every remaining hitch.
Inspect `frameMaxDeferredUnitMs` as the largest outer deferred invocation, not
a guaranteed individual micro-operation. The existing anti-starvation floor
and oversized-job exception are intentional and must be reported separately.

## 6. Counters and evidence

From each JSON report retain summary dt/phase timings, hitch frames and their
counter deltas, settle/recovery, configuration, adapter/focus proof, GPU timing
samples and resource snapshots. Compare at least:

- `stagedGeometryUploadBytes`, `stagedGeometryAllocationBytes`, `stagedGeometryAllocationMs`
- `streamedTextureWarmupBytesEstimated`, `streamedTextureWarmupMs`
- `streamedDrawInitialUploadBytes`, `streamedOversizedPublicationBytes`,
  `streamedDrawPreparationEstimatedMeshMs`, draw failures and queue age
- `framePublicationUploadBytes`, `frameDeferredCpuMs`, `frameMaxDeferredUnitMs`,
  `framePeakFixedCpuMs`, `framePreparationBacklogAgeMs`
- `townInstanceRowsCopied`, `townLodPlacementsEvaluated`, `townPreparationCpuMs`
- `reflectionGpuDeferredFrames`, `reflectionGpuQueueLatencyMs`,
  `reflectionGpuQueueErrors`, `waterReflectionCpuMs`, `waterProbeFaces`

Texture and publication counters are estimates where named; the frame total
includes mixed estimates and measured staged writes, not authoritative total
driver traffic. Use browser traces/GPU diagnostics to validate any suspected
driver-side spike. Record visual screenshots and error logs next to the JSON.

## 7. Deliverable and release decision

Create `docs/qa/performance-hitch-YYYY-MM-DD/` with a short Markdown report and
the compact comparison table; keep large raw traces in the local
`tmp/hitch-qa/<sha>/<run>/` directory. Include rejected captures, baseline and
candidate SHAs, machine/configuration, commands, tests, numerical results,
screenshots, remaining defects and an explicit PASS/FAIL per route.

Do not promote `geologyLod` to the default or claim hardware acceptance until
these checks pass. If a regression is found, fix it on top of the newest main
without overwriting unrelated commits, rerun the affected focused tests and
the complete A/B route. No GitHub Actions.
