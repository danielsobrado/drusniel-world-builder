# Grass and streaming performance improvements — October 16, 2026

Implements the measured recommendations in the
[October 15 audit](performance-audit-2026-10-15.md). Grass density, draw distance,
geometry detail, habitat rules, wind, blade/card overlap, arrival fades,
body interaction and spell response retain their existing settings.

## Implementation

- Meadow ground filtering and wind preparation run in a two-worker pool using
  the same sampler and compactor as the main-thread path. Terrain pages,
  canopy grids, paths, rocks and growth definitions are serialized as job inputs;
  output buffers are transferred back. There are at most two dispatched jobs.
  Cards retain a worker turn while blades are busy. Invalidated results cannot
  publish, and worker failure returns work to bounded main-thread slices.
- Compatible unfinished builds retain their exact processed cursor, including
  rejected ranks, when movement requests a larger LOD prefix. Ground revision
  changes still invalidate those results.
- Every grass band uses bounded persistent packed pages with displacement-aware
  spatial bounds. Sparse bands share up to 16 tiles; the 65,536-stem ceiling
  still limits dense page capacity (a single oversized tile can progress). New
  pages add capacity without reallocating existing geometry;
  empty slots and unused tile tails do not enter the draw. Existing publications
  remain until their replacements are ready. Each blade/card layer publishes
  at most one buffer-changing tile per frame, within its existing byte
  allowance. Empty ground does not consume a GPU publication turn.
- Meadow parameters use shared frame uniform groups across compatible page
  draws. A broader foliage/wind/tuning experiment was reverted after slower
  valid captures; those values retain their established grouping.
- The early fair scheduler visits ready consumers until the shared allowance is
  spent. Sustained backlog gradually raises its floor from 0.25 ms to the
  existing 1.2 ms ceiling; no consumer can grant a second allowance. Grass
  buffer-copy work is booked as deferred preparation.
- Terrain commits run before optional scenery work on the same shared allowance,
  so finished terrain pages can unblock dependent preparation promptly. The QA
  report records construction separately from the terrain commit phase.
- Meadow matrix cases now require observed complete in-view grass and full
  scenery readiness within two seconds after stopping. The runner records
  grass-only recovery separately from full scenery recovery. A frame-rate pass
  cannot hide absent recovery observations or unfinished density.

## Correctness checks

The partial-promotion probe now samples 2,048 ranks instead of 2,304 for its
2,048-rank tile. Its 1,365 surviving stems retain byte-identical used position,
rotation and data arrays. Repeated promotions preserve exact ground samples;
a changed ground revision rebuilds them.

Worker tests exercise actual structured cloning and buffer transfer, exact
output parity with canopy/path/rock filtering, large canonical coordinates,
promotion of an in-flight request, bounded dispatch, cancellation ownership,
card fairness and worker failure. Existing batch tests verify populated draw
counts, companion-attribute alignment, pending writes across culled frames,
origin shifts and reuse of bounded pages through churn. Existing displacement
bounds tests cover auxiliary cameras, wind, live tuning and rebasing.

The complete `npm run verify` passed on the measured performance runtime
(`78f4e5b8`): lint, generated UI checks, production asset validation,
**6,775 tests**, and the production build.
All eight worker integration tests pass, including edited terrain retaining its
current publication while rejecting an older result delivered after a newer
edit, and cancellation when a cached lower LOD supersedes an in-flight
promotion. Publication tests require eventual complete density under the
per-frame turn limit and exempt initially empty ground. Existing bundle-size
and ineffective-dynamic-import build warnings remain.

After concurrent environment/workshop commits were integrated, the complete
verification passed again at `4788d37d`, with **6,792 tests**. This includes
worker parity for mixed biome silhouettes, thin grass islands and canopy
patches introduced by the newer environment work.

## Final hardware matrix

The performance runtime measured here is `78f4e5b8`. Captures use native Windows
headed Chromium,
NVIDIA RTX 4080 / Lovelace nonfallback WebGPU, 1280×720, DPR 1, 8 seconds warmup,
initial settle, 12 seconds movement, and up to 20 seconds recovery. All five
movement cases settled, with zero browser errors, worker failures, measured
procedural terrain misses or collision readiness misses. Collision p95 was
0.1 ms in every case. Requested density multipliers and construction residency
passed; water acceptance passed all behavior and frame gates.

**The matrix fails.** Full scenery readiness still exceeds the two-second
post-stop target in the four diagonal cases, and construction still exceeds
the 2% hitch-rate limit. Every case ended recovery with zero missing or
below-density in-view grass tiles. The gates remain unchanged after measurement.

| Case | FPS | Frame p95 | Hitches | Missing / below-density in-view tiles at movement end | Grass first ready | Full scenery first ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| standard | 77.34 | 19.450 ms | 13 (1.40%) | 12 / 11 | 2.064 s | 5.891 s |
| dense-forest | 84.10 | 24.375 ms | 17 (1.69%) | 8 / 15 | 3.688 s | 9.138 s |
| high-grass | 80.40 | 22.980 ms | 13 (1.35%) | 7 / 12 | 1.971 s | 3.830 s |
| dense-mixed | 75.17 | 21.105 ms | 12 (1.33%) | 5 / 17 | 1.952 s | 5.199 s |
| construction-ring | 66.08 | 31.800 ms | 26 (3.29%) | 22 / 0 | 0.009 s | 0.312 s |

Grass-only and full scenery readiness require 60 consecutive qualifying frames;
the table reports the first frame of that stable interval. Endpoint gauges are
recorded on the final measured frame. The later detailed grass inspection is a
separate observation and can have fewer gaps while work continues.

Against the preceding pressure-only candidate (`66176d41`), standard full
recovery changed from 14.708 to 5.891 seconds and doubled-grass recovery from
7.030 to 3.830 seconds. Construction frame p95 changed from 34.7 to 31.8 ms and
hitch rate from 9.36% to 3.29%. Dense-forest recovery worsened from 7.106 to
9.138 seconds. Other desktop/GPU activity was not controlled; these captures
do not establish a general FPS gain. The incomplete movement-end grass also
prevents treating faster frames as equivalent visual workloads.

The separate same-browser revisit turns the camera 180° halfway through the
route. It settled, reported zero browser errors, and measured 91.44 FPS,
16.4 ms frame p95 and six hitches (0.55%). Its measured endpoint had two missing
and 13 below-density in-view tiles; grass recovered at 0.014 seconds and full
scenery at 0.450 seconds, with zero remaining in-view gaps. The initial pass in
that browser measured 97.18 FPS but still needed 7.529 seconds for full recovery.
The retained screenshot was inspected and shows dense foreground and distant
grass; it is not a fixed-camera pixel comparison or a motion-quality assessment.

## Buffer and output evidence

The captured standard grass configuration is exactly equal to the same-day
baseline,
including every meadow band, far cards, geometry detail, growth, colour,
interaction and distance setting. The final detailed endpoint contains
311,801 populated blade/card instances and submits exactly 311,801 slots.
The baseline contained 256,168 populated instances but submitted 556,767 slots.
This confirms removal of empty submitted work while preserving populated stems;
the endpoint scenes contain different populations.

| Standard capture observation | Same-day baseline | Final runtime |
| --- | ---: | ---: |
| Retained instance arrays | 70.94 MB | 44.13 MB |
| Largest sampled-frame new grass allocation | 24.69 MB | 3.47 MB |
| Largest sampled-frame marked grass attribute ranges | 3.18 MB | 4.51 MB |

Marked ranges describe queued attribute updates, not driver transfer bytes.
Page repacking and first-use costs can still exceed the source-publication
allowance; one publication per layer limits bursts but is not a global GPU
upload cap. An earlier four-tile page candidate retained 38.92 MB, but the
final layout permits up to 16 sparse tiles per page to reduce draw overhead.
The broader uniform-sharing experiment was discarded after slower valid runs;
only compatible meadow frame uniforms remain shared.

## Retained evidence

The matrix ran against an immutable ordinary copy of runtime/config sources at
`tmp/performance-improvements-2026-10-16/runtime/`; public assets were shared.
All 1,457 fingerprinted files remained unchanged through the matrix and revisit.
Concurrent environment and workshop commits through `0ba5312a` arrived in the
shared checkout during those captures. Their biome appearance and sampling
changes are outside the frozen performance measurements; the numbers above do
not describe that newer combined runtime.
The test server alone permits the shared Basis decoder dependency path. The first
frozen-server attempt lacked that permission and produced 96 browser errors;
it is preserved and excluded from acceptance. A separate initial-settle timeout
is also excluded. Neither capture contributes a final performance claim.

[Condensed measurements, verdict, source fingerprint and raw-file hashes](qa/performance-improvements-2026-10-16/summary.json)
are committed. Full reports, logs, the source copy and intermediate experiments
remain under ignored `tmp/performance-improvements-2026-10-16/`. The release
matrix log is `matrix-release.log`; raw final cases are in `matrix-release/`.
The extra capture and screenshot are `revisit-release.json` and
`revisit-release.png`.
