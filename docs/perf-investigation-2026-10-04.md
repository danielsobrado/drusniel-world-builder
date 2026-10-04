# Movement CPU performance — 2026-10-04

Status: runtime changes implemented; final hardware validation in progress.

**The CPU bottleneck was substantial placement work inside movement updates.**
Preparing exact terrain and ecology samples in workers, sharing rock manifests,
and making nested jobs resume under one budget raised the standard route from
about 71 FPS to the 168–180 FPS range in the latest captures. Frame-time tails
still need separate validation; a high average does not establish a consistent
144 Hz presentation rate.

The implementation follows the
[movement CPU plan](plans/movement-cpu-performance-plan-2026-10-04.md) and
[performance QA guide](perf-qa.md). The reference adapter is an NVIDIA RTX 4080
(Lovelace), hardware WebGPU without fallback, headed Windows Chromium through
WSL, 1280 × 720 at device scale 1. The world seed, scenery density, LOD distances,
collision rules, and visual preset remain the comparison workload.

## What changed

| System | Runtime behavior |
| --- | --- |
| Precise terrain | Workers generate Float64 base heights and canonical tile values. Main-thread placement reads prepared arrays. Editor overrides still take precedence; Float32 render heights do not become the placement source. |
| Ecology | Workers evaluate the existing candidate coordinates, canopy grids, density grids, water/path distance fields, and rock cluster nodes. Packed typed arrays preserve existing precision, categorical values, grid origins, and random sequences. |
| Rocks and blockers | `RockManifestStore` owns complete chunk records. Base scatter, riverbank, coast, and seabed generation all resume between units. Rendering, tree exclusion, bushes, and collision share these records and cached neighbor signatures. A lookup schedules missing data and returns pending. |
| Trees and collision | Tree generation waits for prepared terrain and complete rock blockers. Planted evaluation and root fitting resume within the manifest job. Collision providers preserve the readiness contract instead of treating pending data as empty space. |
| Shared allowance | One adaptive allowance targets 144 FPS, with a 1.2 ms ceiling and one 0.25 ms progress floor. Nested work shares its accounting and deadline. Candidate generation, preprocessing, shoreline stages, instance assembly, terrain material uploads, and draw preparation participate. |
| Residency | Prepared fields and manifests survive render-slot turnover. Caches retain up to 625 chunks, pin the current dependency window, cancel obsolete queued requests, and reject late results. Local terrain and forest edits invalidate their influence areas. |
| Grass | Meadow compactions share their exact stable stem sequence across bands. Lower density takes an accepted prefix; increased density appends new ranks. Ground changes still rebuild the data. Previous complete publications stay visible while replacements prepare. |
| Submission | Static instance matrices update when their transforms change. LOD plans reuse stable results between fade steps. Cached viewport height avoids repeated DOM layout reads. Water slots share one material graph per variant, with textures and pattern origins selected per object. |
| Material preparation | Terrain material baking uses the existing worker pool; at most one completed bake uploads per frame. Texture resources prepare during loading. Underwater caustics prepare with the same fog object used during diving. |
| QA | Settle now includes vegetation, dependency fields, variants, draw preparation, meadow work, and material jobs. Reports distinguish CPU submission from GPU time, record preparation state, and count procedural terrain misses during measurement. Draw counters are captured after rendering. |

The new arrays are derived data, separate from canonical persistence. Azgaar's
standard biome IDs `0–12` and custom terrain IDs remain unchanged.

## Measurements so far

Three unprofiled baselines used `chunk-cross`, 8 s warmup, settle, and 12 s
running from `(0, 0)`. They reached **70.02, 70.80, and 71.88 FPS**. Vegetation
CPU averaged **8.77, 8.68, and 8.60 ms/frame**.

Baseline settle checked terrain, construction, and collision. Initial
vegetation was still incomplete. The revised gate also waits for the scenery
dependency window; report its additional loading time when comparing results.

| Capture | Average FPS | Vegetation average / p95 | Frame p95 / p99 | Frames >33.3 ms |
| --- | ---: | ---: | ---: | ---: |
| Baseline repeats | 70.02 / 70.80 / 71.88 | 8.60–8.77 ms average | See saved captures | See saved captures |
| Stage 11, prepared dependencies | 166.02 | 1.210 / 2.600 ms | 7.800 / 9.911 ms | 0 |
| Stage 12, tighter allowance | 171.03 | 1.140 / 1.500 ms | 7.300 / 10.450 ms | 0 |
| First three integrated repeats | 149.10 / 148.48 / 148.47 | See saved captures | Approximately 11.4 ms p95 | 1 / 3 / 2 |
| Stage 13, exact meadow reuse | 168.08 | 1.056 / 1.600 ms | 7.700 / 11.400 ms | 1 |
| Matrix, standard diagonal | 179.97 | See saved capture | 6.900 / 8.000 ms | 0 |
| Matrix, dense forest | 175.09 | See saved capture | 7.100 ms p95 | 0 |

The first integrated repeats failed the stricter frame-time gates. Correct
meadow readiness reporting exposed about 142 pending tiles at the end of a
moving route. Exact compaction reuse reduced that to 16 in stage 13 and 7 in
the diagonal capture. The earlier `building` gauge counted tiles processed in
that frame, which could report zero while stale tiles still waited.

Stage 11 and stage 13 measured **zero procedural tile/height misses and zero
collision-readiness stops**. The standard player reached about `z = -194.5 m`
in 12 s. Final tree and rock counts matched the baseline: 63 near trees, 668
impostors, and 1,818 rock placement records. The prepared arrays occupied
89,188,460 bytes (about 85 MiB) for 315 retained chunks. This measures typed
arrays, not total JavaScript heap or GPU memory.

The water route now reaches its deep target and completes dry entry, swimming,
diving, surfacing, and dry exit with active caustics and no WebGPU validation
errors. The first valid run reached 203.11 FPS, but failed the caustic CPU gate:
first-use fog material preparation caused approximately 198 and 300 ms stalls.
The subsequent change prepares the persistent underwater fog graph during
loading. The final matrix must verify that fix.

## Evidence and reproduction

The starting HEAD, tracked working-tree patch, and status are preserved in
`tmp/movement-cpu/starting-*`. The checkout already contained migration changes;
HEAD alone does not reproduce the baseline. Those files do not snapshot the
contents of originally untracked migration files.

Reports, separate sampled CPU profiles, logs, and the current scene screenshot
are in `tmp/movement-cpu/`. `before-1/2/3.json` are baselines;
`stage-*.json` are implementation checkpoints. `after-1/2/3.json` are the first
integrated repeats, before meadow reuse. Do not present them as final passing
results. Stage 2 ran alongside tests and is excluded from throughput claims.
The sampled attribution captures are also excluded from throughput comparisons.

```bash
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --speed run --settle --out tmp/movement-cpu/final-1.json
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 60 --speed run --settle --out tmp/movement-cpu/sustained.json
npm run verify
```

Run captures sequentially, with other app rendering tabs closed and without
concurrent builds, tests, or runtime edits. On WSL the full matrix must use
native Windows Node/Playwright, as documented in the QA guide. The matrix now
uses settle and approaches the construction corridor from `z = -100`, yaw 180.

## Remaining acceptance

- Complete three final unprofiled `chunk-cross` repeats and the sustained route.
- Complete the density/construction/water matrix, including the caustic CPU gate.
- Confirm that moving scenery backlog stays bounded and drains when movement stops.
- Keep the strict 6.94 ms p95 / 10 ms p99 / zero-hitch target open wherever captures fail it.
- Complete integrated verification after the final runtime changes and record the results here.

Behavioral tests cover nested accounting, shoreline resumption, precise edited
and negative-coordinate sampling, stale worker results, cache eviction,
retained manifests, local edits, collision pending semantics, complete instance
publication, exact meadow prefixes, and water's per-object bindings. The last
full `npm run verify` passed 3,066 tests, asset/configuration checks, and the
production build; newer meadow/fog changes have passed focused checks.
