# Performance audit — October 15, 2026

The next improvements should target scenery preparation throughput, CPU render
submission, and grass buffer management. Preserve the current grass population,
draw distances, silhouettes, blade/card overlap, colour, wind, arrival fades,
foot interaction, and spell response. This audit changes no runtime settings
or implementation; it adds evidence and a reproducible work-count probe.

## Current hardware evidence

Followed [the performance QA guide](perf-qa.md). Three sequential captures used
native Windows headed Chromium, NVIDIA Lovelace WebGPU, 1280×720, DPR 1,
`diagonal`, 8 seconds warmup, `--settle`, and 12 seconds measured movement.
Every capture settled, reported zero browser errors, and passed collision
readiness with 0.1 ms collision p95. Measured procedural terrain misses and
collision readiness misses were zero.

| Unprofiled capture | Average FPS | Frame p95 | Hitches >33.3 ms | Additional settle wait | Scenery recovery after stopping |
| --- | ---: | ---: | ---: | ---: | --- |
| Standard | 118.29 | 14.9 ms | 5 / 1,418 (0.35%) | 29.4 s | First continuously ready at 13.019 s |
| High grass | 102.50 | 15.3 ms | 2 / 1,229 (0.16%) | 65.3 s | Still incomplete after 20 s |

These two captures pass the matrix's frame thresholds, but do **not** establish
acceptable grass delivery. The end-of-movement diagnostic found 61 missing
drawable blade tiles and 27 tiles below their requested capacity in standard;
high grass had 146 missing drawable blade tiles. The conservative viewing cone
contained 38 and 59 missing blade tiles respectively. At 20 seconds of dense
recovery, 135 meadow work items remained and 14 missing tiles were in view.
The diagnostic is read shortly after the last measured frame, so its counts
can differ slightly from the report's exact endpoint gauges.

Higher FPS while grass is missing is not evidence of equivalent visual work.
Future comparisons must include coverage and recovery alongside frame timing.

The separate CPU/GPU diagnostic capture measured a 6.578 ms average CPU `render`
phase and 2.026 ms average sampled GPU render passes (3.097 ms GPU p95).
The CPU phase includes atmosphere updates and draw preparation as well as
submission. GPU timestamps exclude uploads, compute and CPU submission; they
are not a complete GPU-frame measurement. The CPU profile independently places
substantial time inside renderer binding/uniform work:

| Approximate final 12 seconds of CPU profile | Sampled time |
| --- | ---: |
| Renderer binding updates, inclusive | 2,642 ms |
| Uniform-group value checking/updates, inclusive | 1,244 ms |
| Uniform `writeBuffer`, self | 446 ms |
| Attribute `writeBuffer`, self | 85 ms |
| Meadow compaction, inclusive | 319 ms |
| Garbage collection, self | 111 ms |

Inclusive categories overlap and must not be added. The profile window includes
a small amount of post-measure report/diagnostic work. Profiled FPS is excluded
from the uninstrumented table. This is evidence for investigating CPU overhead,
not proof that the GPU never limits performance elsewhere.

The first two captures finished on `2d1f832d` before subsequent workshop edits.
The profile used `b159ad22`; before/after hashes of 1,454 runtime/config files
were checked for changes.
No source changed during that profile. Other desktop GPU activity was not
controlled, so these are diagnostic baselines, not an isolated speedup claim.

## Recommended changes, in order

### 1. Reuse unfinished grass preparation and increase useful throughput

[MeadowTileLayer.rebuildStaleTiles](../src/editor/stylized/meadow/MeadowTileLayer.js)
discards a partial job when movement promotes its preparation band to a larger
capacity, even when the terrain revision is unchanged. The existing compactor
already supports extending a completed prefix, but only published/prepared
output reaches that path.

The new [work-count probe](../scripts/benchmark-meadow-work.mjs) reproduces a
512 → 2,048-rank promotion after 256 ranks have been processed. The current
scheduler samples 2,304 ranks. Feeding the processed prefix into the existing
compactor samples 2,048, producing the same 1,365 surviving stems with
byte-identical used position, rotation and data arrays. This is one synthetic
case; route-wide discarded work has not yet been measured.

First preserve an exact processed cursor and reuse partial results across
compatible promotions. Keep invalidation for edited terrain, changed rocks,
growth/path definitions, and incompatible templates. Then move deterministic
ground filtering and wind preparation to workers using versioned page inputs
and transferable output buffers. Keep old publications visible until complete
replacements arrive, with identical sampling and ranks.

Scheduling also deserves a controlled experiment. The current shared allowance
targets 144 FPS, grants at least 0.25 ms, and caps deferred CPU work at 1.2 ms
across scenery consumers. A render-heavy frame can leave only the minimum for
preparation. Fair rotation guarantees turns, not enough throughput to catch the
player. Track oldest visible-job age and completed ranks per second; improve
throughput and prefetch lead without extending the drawn range or simply raising
the budget enough to introduce hitches. Blades and cards should both progress.

### 2. Share frame-level uniforms across compatible draws

The profile makes renderer binding work a stronger steady-frame candidate than
collision or terrain commits. In [meadowUniforms.js](../src/editor/stylized/meadow/meadowUniforms.js),
the app shares JavaScript uniform nodes, but the pinned Three implementation
defaults `UniformNode.groupNode` to `objectGroup`. The engine already offers
`frameGroup` and `renderGroup` for appropriately shared data.

Prototype explicit groups for world time, wind, palette, and other values that
are identical across draws. Separate genuinely per-object and per-camera data,
and validate nested reflection, shadow, and preparation passes. Split constant
look parameters from frequently changing state where the backend can reuse the
result. Measure binding CPU and actual uniform writes, rather than assuming
that fewer JavaScript assignments eliminate GPU uploads. The profile's binding
cost spans the scene; it is not all attributable to grass.

### 3. Bound grass allocation/upload bursts and stop submitting empty slots

[MeadowStableBandBatch](../src/editor/stylized/meadow/MeadowStableBandBatch.js)
starts with 32 tile slots and doubles the entire geometry when full. During the
standard capture, one growth allocated **24,690,176 bytes**. That frame spent
5.2 ms committing meadow batches and 14.7 ms in the CPU render phase; the next
frame interval was 24.8 ms. It was a spike below the 33.3 ms hitch threshold,
not one of that run's counted hitches.

The current 4 MiB allowance is per blade/card layer and counts new publications.
It excludes full-buffer growth, retirement, repacking, and delayed first-use
uploads. The standard run marked 160.24 MB of meadow attribute updates over
movement, excluding the full new-buffer upload. These counters describe queued
ranges, not a direct measurement of bytes transferred by the driver.

Use bounded persistent pages or preallocated capacity with staged growth, and
account for actual first-use and repacking costs in one upload schedule. The
existing dense-family pages are a useful starting point, but moving every sparse
band to tiny pages could increase draw and uniform overhead. Tune the layout
against both CPU and GPU measurements.

At the standard endpoint, sparse batches submitted **522,895 instance slots for
211,042 populated blades/cards** and retained 70.94 MB of instance arrays.
`instanceCount = used × stride` includes holes and unused tile tails; the shader
rejects them. These batches also disable frustum culling. Preserve every live
stem while avoiding empty instance work, and use conservative spatial page
bounds that include wind and body displacement for each render camera.

Both batch implementations repeat a tile's origin and reveal metadata in a
16-byte `instanceTile` record for every stem. An indexed tile metadata table
could reduce that duplication and origin-shift uploads while preserving exact
positions and arrival fades. That is a layout experiment, not a claimed FPS gain.

### 4. Make coverage part of performance acceptance

The current matrix checks initial scenery readiness, frame time and collision,
but permits large movement-end grass gaps. Add route coverage and bounded
post-stop recovery to acceptance, including the existing two-second motion
recovery goal. Track job cancellations and discarded processed ranks, actual
buffer creation/upload bytes, and CPU render subphases separately from GPU time.
Retain normal and dense captures, revisit/turn tests, and first/third-person
visual comparisons with fixed camera, wind and lighting.

Do not obtain a pass by reducing density, shortening distance, changing the
blade/card handoff, weakening wind/interaction, or relaxing readiness criteria.

## Checks and reproduction

The existing collision/visibility microbenchmark still shows the October 13
scaling fixes functioning: local queries about 0.000185 ms, composition about
0.000149 ms, replacing 64 of 16,384 colliders about 0.121 ms, and visibility for
10,000 opportunities about 2.475 ms per call on this host. These isolated Node
measurements are not gameplay FPS. Further collision tuning is lower priority
for the captured route, whose collision p95 is already 0.1 ms.

The new benchmark passed ESLint. All 14 targeted existing tests passed across
compaction reuse, batch uploads, publication budgets and scenery scheduling.
A full release matrix and full application verification were not run for this
audit; no runtime implementation changed.

```sh
npm run dev
npm run qa:perf:windows -- --qa diagonal --warmup 8 --duration 12 --settle --drain-seconds 20 --grass-diagnostics --out /absolute/path/to/standard.json
# Repeat with --density high-grass and a distinct output path.
# Separate diagnostic run: add --gpuTimings 1 --cpu-profile /absolute/path/to/profile.cpuprofile.
node scripts/benchmark-meadow-work.mjs
node scripts/benchmark-runtime-hotpaths.mjs
```

[Retained measurements, capture metadata and raw-file hashes](qa/performance-audit-2026-10-15/summary.json)
are committed. Full reports, logs and the sampled profile remain in the ignored
`tmp/performance-audit-2026-10-15/` directory.
