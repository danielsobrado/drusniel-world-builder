# Runtime locality and worker fixes — 2026-10-07

The supplied runtime review was checked against the working tree following the
21 fixture corrections and dense-meadow fixes. Its edited-world locality,
construction residency, worker queue, and degraded-mode concerns were valid.
The grass visibility finding described the earlier implementation: the dense
meadow pages now have conservative frustum bounds, as recorded in
[the dense-grass report](dense-grass-test-fixes-2026-10-07.md).

## Changes

- `SpatialOverrideMap` retains the existing persistence Map interface while
  indexing sparse numeric local indices by chunk. Both positive and negative
  block misses are cached. Sampling, water queries, and placement preparation
  use this index; an edit elsewhere does not add world-cell string lookups or a
  global override scan. Restoring/loading maps rebuilds the index. Prepared
  edited samples are excluded from the procedural memo so undo reveals the
  procedural value again.
- Terrain worker requests carry only local and halo edits. The worker applies
  them before generating water, render pixels, and vegetation scatter. Completion
  checks local edit versions and world epochs, including edits while content
  loads. Paint/sculpt keeps the previous visual while the replacement is built,
  then uses the terrain commit queue. Canonical authored values remain available
  immediately to sampling and gameplay.
- Browser construction geometry, growth, and merging execute in a dedicated
  worker. Canonical ground vertices are gathered in steps of at most 16 samples,
  with a 0.75 ms yield check. The worker returns typed attributes, indices,
  semantic material slots, and computed bounds. Publication attaches these
  buffers. Decoration changes retain masonry. Worker failure retains the shell.
  Node tests retain the existing resumable CPU backend.
- Construction record and module bounds use spatial indices. Render entries
  are created for the camera neighborhood and selected/previewed records.
  Distant render entries are disposed while canonical records remain in the
  store. Long paths query local modules. Record hydration starts at most four
  entries per evaluation with a 2 ms yield check. LOD evaluation was extracted
  from `ConstructionView` into `ConstructionLodController`.
- Terrain worker dispatch uses an indexed, stable min-heap. Reprioritization and
  cancellation take logarithmic time. Exhausted browser worker pools pause
  streaming and show a status message; they do not start synchronous terrain
  generation in a Promise callback. The non-browser CPU backend remains usable.
- `gpuTimings=1` enables sampled asynchronous WebGPU timestamp queries for QA.
  Reports identify render contexts and distinguish depth/shadow passes, offscreen
  passes, and screen output. Production rendering does not read timestamps.
  These measurements exclude CPU submission, uploads, and compute work; they
  are pass measurements, not per-object grass measurements.

## Edited-world hardware comparison

The deterministic `edited-world` route authors Taiga biome and height patches before
warmup, adds a distant unrelated override, and paints/sculpts every three seconds
while moving diagonally. Both runs used the same 8 s warmup, settle gate,
12 s motion, and 15 s recovery observation on the NVIDIA Lovelace hardware
WebGPU adapter. Runtime sources were frozen and no tests/build ran during captures.

| Metric | Before | After |
| --- | ---: | ---: |
| Average FPS | 136.65 | 141.77 |
| Frame p95 | 9.30 ms | 9.00 ms |
| Hitches | 6 / 0.37% | 0 / 0% |
| Largest edit phase | 57.50 ms | 0.20 ms |
| Total measured edit phase | 170.10 ms | 0.50 ms |
| Scenery recovery after stopping | 10.05 s | 2.92 s |
| Browser errors | 0 | 0 |

Both settled before measurement and recovered afterward. Collision p95 was
0.20 ms in both, but collision readiness was incomplete at the measured endpoint
because the route continuously invalidates authored terrain dependencies. Both
reports therefore fail the existing endpoint collision readiness gate; these
are edit-cost comparisons, not passing collision acceptance runs. Movement
retains its previous valid position while collision rebuilds, so identical input
does not guarantee identical traveled distance.

Raw reports are retained in `tmp/review-fixes/edited-baseline.json` and
`tmp/review-fixes/edited-after.json`. A single before/after pair demonstrates the
removed synchronous edit work; it does not establish a universal FPS improvement
or a hard wall-clock ceiling under browser scheduling and GC.

## Regression coverage

Tests cover numeric override lookup without string Map probes, direct Map
mutation, negative borders, save/load/restore, undo after prepared sampling,
worker-derived water/mask parity, shared height vertices, edits during generation
and content loading, unrelated edits, large heap bursts, nearby-only record
residency, long-wall module residency, transferred geometry parity, and opt-in
GPU timing with asynchronous readback.

Final hardware matrix and GPU timing results are added after validation.
