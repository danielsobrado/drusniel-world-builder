# Dense meadow hitches and test fixes — 2026-10-07

The 21 pre-existing failures are corrected. `npm run verify` passes lint,
the natural-UI check, production asset validation, all **6,346 tests**, and
the production build. Twelve new meadow tests cover GPU attribute publication,
page reuse, and conservative spatial bounds. Three high-grass repeats, a
camera-turn revisit, and the final full hardware matrix pass.

## Test corrections

Eighteen construction tests still assumed a whole module finished in one
frame or supplied incomplete camera/origin doubles. They now drive the
resumable builder through bounded frames, use actual `PerspectiveCamera` and
`FloatingOrigin` objects, and advance the LOD clock when testing repeated
evaluations. The checks still exercise appearance compilation, preview
handoff, LOD transitions, queued band changes, and ivy retention/invalidation.

Two meadow fixtures omitted the interaction upload cadence or bypassed the
layout's cancellation of obsolete compactions. The migration fixture deleted
cohorts behind the cached state query; it now removes their live population
through the supported entity update API while retaining its creation and
conservation checks. Construction and simulation runtime behavior did not
need changes for these failures.

## Grass submission

The former single buffer per band reserved full-template slots, uploaded
their unused tails, and submitted holes and rejected stems. Growing a band
replaced four large buffers. A sampled baseline CPU profile attributed about
1.86 seconds of its final 12 seconds to attribute `writeBuffer` calls; GPU
timestamps were unavailable.

Dense families now retain small GPU pages. Each page packs completed, accepted stems
together and submits their exact count. Tile positions, rotations, ranks,
wind variation, and publication fades move together. Stable tiles retain
their page; empty pages are reused. Source attributes upload only populated
ranges, and an origin shift updates only tile metadata. Pending ranges survive
until the renderer consumes them.

A dense page holds at most four tiles and 65,536 template stems, except when
one tile alone exceeds that ceiling. Dense bands consequently use one tile per
page, preventing a new high-density tile from allocating four tiles' buffers
and avoiding repacks of its neighbors. Pages retain capacity up to the peak
resident membership. This exchanges the original five meadow draws for more
bounded draws in dense scenes; it does not change sampling, density, LOD
distances, or shaders.

Families whose largest template has at most 16,384 stems retain one stable
batch per band. Their tile ranges do not move when neighbors leave or rebuild.
Only populated source data, retired positions, and changed origin metadata
upload. Unused stems inside occupied slots stay hidden in the shader; trailing
empty slots are excluded from the draw. This avoids the
copying and extra draw overhead of packing ordinary-density scenes. Capacity
starts at 32 tiles and doubles as required, replacing the geometry so the
renderer rebuilds its attribute bindings correctly.

A partial matrix with a four-tile limit for all families passed its first two
cases but exposed draw overhead: standard movement reached 126.70 FPS with
241 endpoint draws. It was stopped to correct sparse-family grouping; its
active third capture was interrupted and excluded. The completed checkpoint
reports are retained as `small-pages-matrix-standard.json` and
`small-pages-matrix-dense-forest.json`. Enlarging sparse pages reduced draws to
187 but increased copying and did not recover throughput (118.75 FPS);
`packed-sparse-matrix-*.json` preserves that second partial checkpoint. Both
batches were stopped before completion; neither is full matrix acceptance.
Dense-family page sizes are identical before and after the stable sparse
batch correction.

The new behavioral tests simulate consumed GPU ranges and check density
changes, coherent removal/repacking, floating-origin shifts, pending writes,
page reuse under repeated churn, allocation of dense tiles, stable sparse
neighbors, tail retirement, and geometry replacement on sparse growth.

## Hardware comparison

These captures follow [the movement QA guide](perf-qa.md): headed Windows
Chromium through WSL, NVIDIA RTX 4080/Lovelace hardware WebGPU without
fallback, 1280 × 720, diagonal running, 8-second warmup, successful scenery
settle, and 12 seconds of measurement. High grass doubles the active meadow
blade and card densities. Sources were frozen and browser runs were serial.
Every tabulated capture has zero browser errors and a complete frame buffer.

| Capture | FPS | p95 / p99 (ms) | Hitches | Hitch rate | Additional settle |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline 1 | 107.73 | 17.310 / 77.477 | 41 | 3.18% | 42.3 s |
| Baseline 2 | 104.41 | 15.800 / 55.501 | 25 | 2.00% | 41.8 s |
| Baseline 3 | 106.76 | 18.015 / 59.792 | 41 | 3.21% | 66.1 s |
| Bounded pages 1 | 112.86 | 14.455 / 44.210 | 25 | 1.85% | 47.6 s |
| Bounded pages 2 | 113.99 | 13.070 / 29.422 | 10 | 0.73% | 48.9 s |
| Bounded pages 3 | 113.30 | 14.715 / 58.158 | 26 | 1.91% | 45.0 s |
| Culled pages 1 | 113.89 | 12.680 / 47.544 | 25 | 1.83% | 46.2 s |
| Culled pages 2 | 112.65 | 12.355 / 43.502 | 21 | 1.56% | 46.7 s |
| Culled pages 3 | 111.97 | 13.995 / 44.095 | 25 | 1.86% | 46.5 s |

All three bounded-page repeats meet the unchanged **33.3 ms p95 / 2% hitch**
limits, but a subsequent full matrix recorded **2.18%** high-grass hitches.
That checkpoint therefore does not establish reliable acceptance. Its median
repeat hitch rate is 1.85%, versus 3.18% before. It does not establish zero
hitches or strict 144 Hz presentation. Grass preparation still lags movement:
blade in-view missing/under-density tiles were 5/3,
0/0, and 4/2. Far cards had 14 missing in-view tiles at each endpoint. All
three recovered to sustained readiness after stopping in 8.61, 6.91, and
10.12 seconds. These endpoint gauges do not establish complete coverage on
every measured frame.

Raw reports and the first bounded-page screenshot are in
`tmp/test-grass-fix/baseline-high-grass-{1,2,3}.json` and
`tmp/test-grass-fix/bounded-high-grass-{1,2,3}.json` / `bounded-high-grass-1.png`.
Upload-only and fixed-stride page experiments remain failed checkpoints;
their `candidate-*` and `pages-*` reports are retained. Packed four-tile
pages passed two captures but had larger grass preparation backlogs; their
`packed-*` reports are also retained. An initial baseline capture interrupted
by HMR was excluded and rerun against a server with HMR disabled.

The full hybrid matrix, preserved in `tmp/test-grass-fix/unculled-hybrid-matrix.json`,
recorded standard / dense forest / high grass / dense mixed / construction FPS
of 137.74 / 147.45 / 111.40 / 114.10 / 100.76, with hitch rates of
0.12% / 0% / 2.18% / 1.54% / 0.08%. All movement captures settled and had
zero browser errors. Water transitions passed, but the caustic CPU peak was
71 ms against its separate 4 ms gate, so the full matrix failed both high
grass and water acceptance.

The latest change adds render-space bounds to dense pages. Accepted stem heights
are accumulated during compaction and retained conservatively across prefixes.
Blade and card bounds include shader displacement, live tuning, and origin
shifts. Every camera uses its own frustum; residency and sampling stay unchanged.
Tests cover a 180-degree turn, an auxiliary view, origin rebasing, and a wind-bent
card whose tip remains inside the view while its ground bounds are outside.

Initial culling captures did not reach measurement and are excluded. The browser
reported D3D12 GPU allocation failures while Windows had less than 2 GB of free
committed memory. A stopped capture left an owned GPU child process that was
explicitly cleaned up. These failures cannot be used as performance evidence
for or against the culling change.

The three valid culled-page captures pass the same hitch and p95 limits. Their
median hitch rate is 1.83%, versus the baseline's 3.18%; median FPS is 112.65,
versus 106.76. This is a combined page/upload/culling comparison, not an isolated
measurement of culling. Host-memory pressure invalidated intervening starts;
ambient host load was not controlled beyond serial browser runs. Blade in-view
missing/under-density tiles at movement
stop were 4/4, 43/0, and 2/0; far cards had 14 missing in-view tiles each time.
The second capture's larger backlog means its cheaper endpoint workload must
be considered when comparing throughput. Recovery passed in 5.50, 13.90, and
6.06 seconds. The first screenshot shows dense, coherent grass after recovery.

The third capture includes a separate revisit with a 180-degree turn halfway
through measurement. It records 103.28 FPS, 13.745 ms p95, and 21 hitches
(1.70%), with successful settle and zero browser errors across both legs.
The turned route ended with 45 missing in-view blade tiles and 6 missing card
tiles, then recovered in 5.61 seconds. Its screenshot shows grass after recovery;
it does not establish full coverage at the turn itself. Reports are
`tmp/test-grass-fix/culled-high-grass-{1,2,3}.json`, with screenshots
`culled-high-grass-1.png` and `culled-high-grass-3-turn.png`.

Large individual frames remain: the valid captures reached 182–310 ms maximum
dt, and the revisit reached 372.5 ms. Large source publications and new page
allocations still coincide with expensive render submission. Passing the 2%
hitch rate gate does not establish hitch-free movement or strict 144 Hz.

## Final full matrix

`tmp/test-grass-fix/final-matrix.json` records `gate.passed: true`, no failures,
and zero browser errors in every case. All movement cases settled, retained
complete frame buffers, used hardware WebGPU, passed collision readiness, and
proved their configured density multipliers.

| Case | FPS | p95 (ms) | Hitches | Hitch rate |
| --- | ---: | ---: | ---: | ---: |
| Standard | 158.13 | 8.600 | 0 | 0% |
| Dense forest | 152.18 | 8.600 | 0 | 0% |
| High grass | 99.21 | 15.800 | 11 | 0.93% |
| Dense mixed | 116.03 | 11.200 | 13 | 0.93% |
| Construction approach | 97.39 | 14.375 | 3 | 0.26% |
| Water route | 152.25 | 9.900 | 8 | 0.10% |

Construction retained 96 wall modules and 426 masonry instances. The water
route passed dry entry, swimming, diving, surfacing, and dry exit. Its projected
caustic post-effect peak was 0.30 ms against the unchanged 4 ms limit; total
pipeline CPU peak, including its scene pass, was 9.20 ms. The earlier 71 ms
caustic checkpoint remains recorded above; this successful recheck does not
identify the cause of that transient.

The matrix's high-grass and dense-mixed endpoints had 67 and 60 missing in-view
grass tiles, respectively. Their p95 and hitch gates pass, but these runs do
not establish fully prepared grass throughout movement. The standalone
repeats provide separate endpoint and recovery observations. Individual
movement reports are `tmp/test-grass-fix/final-matrix-<case>.json`; the complete
water report is `tmp/test-grass-fix/final-water-acceptance.json`.
