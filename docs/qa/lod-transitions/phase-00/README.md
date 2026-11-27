# LOD transitions — Phase 0 baseline results

**Verdict: PARTIAL.** Hardware acceptance is **not** complete. The instrumentation is cheap and
does not measurably change frame or GPU time on the two routes that produced comparable runs.
Settlement and construction did not settle, so they have no comparison. Eight of the requested
interactive scenarios were not executed, and there are no motion recordings.

Plan: [`docs/plans/lod-transitions/00-baseline.md`](../../../plans/lod-transitions/00-baseline.md).
Structured data: [`metrics.json`](metrics.json). Run extracts: [`runs/`](runs/). Images: [`captures/`](captures/).

## What was measured

| | |
|---|---|
| Measured commit | `88257dfdf270e4bff9b58fada35e9552b38e4f82` (main at session start) |
| Instrumentation commit | `ff81dcbf4d85544f2f0296050da5ed52eec1a0e6` |
| Instrumentation parent | `b625625d3bd5f2c9ca6c3475af3f7aabb08e649a` (used for the pre-existing-failure checks) |
| Commits between instrumentation and measured commit | 10: location surface reclamation and staging, the adaptive surface GPU memory policy, and ground light. None of them touch the LOD planner. Ground light (`69a93b01`) touches `BushRenderAssets.js` and `AuthoredFoliageMaterial.js`. |
| Main when these results were committed | Main had three newer commits (`1eeccf3f`, `2944190f`, `ee036f9d`) covering location-transition GPU gating and foliage shading. They were **not** measured. |

Other sessions had uncommitted edits in the shared checkout during the session. To keep the
measured code fixed, every check and benchmark ran from an export of the commit made with
`git archive 88257dfd` into `F:/drusniel-cache/lod-baseline-88257dfd` (no branch and no worktree).
`node_modules` and `public/` were junctions to the main checkout. The parent was exported the
same way to `F:/drusniel-cache/lod-baseline-parent`. One exception: production asset validation ran
in the main checkout, because the export lacks untracked source GLBs (see below). Raw output is
in `tmp/lod-baseline/` inside the export and was not committed.

### Hardware and environment

| | |
|---|---|
| GPU | NVIDIA GeForce RTX 4080 16 GB, driver 617.14 (32.0.16.1714), PCIe gen 4 |
| CPU / RAM | Intel Core i7-13700KF / 64 GB |
| OS | Windows 11 Pro 10.0.26300 x64; primary display 3440×1440 @ 144 Hz |
| Browser | Playwright Chromium 151.0.7922.34, headed, native foreground checked every 100 ms |
| WebGPU adapter | `nvidia` / `lovelace`, not a fallback adapter, timestamp queries supported, renderer r187 WebGPU backend |
| Node | v22.21.1 (`package.json` engines `^22.13.0 \|\| >=24`) |
| World | seed 918273, `balanced` quality preset, default weather, 1280×720, device scale 1 |
| Harness | warmup 8 s, settle gate (120 s timeout), measure 20 s, GPU timestamps every 8th frame, hitch threshold 16.667 ms |

`node_modules` was broken at the start: package manifests were missing, so `npm ls` reported invalid
packages. `npm ci` fixed it.

## Static checks

| Command | Result | Classification |
|---|---|---|
| `node --test` (the six targeted files in the plan) | **pass**, 41/41 | — |
| `npm run lint` | **fail**, 4 `no-unused-vars` errors | Pre-existing. Each line was last changed before `ff81dcbf` (`scripts/run-wsc-pr0-capture.mjs:247-248`, `src/editor/stylized/rockWeathering.js:101`, `tests/snowRockPhases.test.js:3`). |
| `npm test` | **fail**, 5645/5655 | 8 failures reproduce on the parent. `tests/wscIncrementalRebuild.test.js` passes in isolation on both, so it is flaky under full-suite load. **1 is new since instrumentation:** `test/location-surface-residency.test.js` "adaptive pressure stops at recovery threshold and preserves anchor protection". It was added already failing in `475d29db` (surface GPU memory pressure). It is not LOD code and not caused by the instrumentation. |
| `npm run build` | **pass** | — |
| `npm run validate:assets:production` | **fail** at `validate:impostors:required`: "Tree impostor source changed: AuthoredFoliageMaterial.js. Run npm run bake:impostors." | Pre-existing: the parent fails the same way. All earlier steps and `validate:resident-lods` pass. A stale impostor bake can make an impostor look different from the mesh at the hand-off; the impostor bake was not regenerated, because that would change production assets. |

The 8 failures that reproduce on the parent are in `azgaar-world-guidance`, `location-extra-props`,
`location-structure-prefetch`, `rock-formations`, `terrain-material-bake-lod`,
`terrain-material-family-lod`, `variant-installation` and `StylizedVariantResidency`.

## Vegetation LOD acceptance suite

`npm run qa:vegetation:lod -- --headed --url http://localhost:5173 --out tmp/lod-baseline/vegetation-lod`
(Vite listens on `localhost`, so the script's default `127.0.0.1` URL is refused.)

**124/125 checks.** The failing check is `configured-runtime-prototype-counts`: trees 40/40,
**bushes 0/22**. The parent fails identically
([`runs/vegetation-lod-parent-b625625d.txt`](runs/vegetation-lod-parent-b625625d.txt)). The bush
near and proxy galleries render empty, so **bush LOD visuals are unverified**. Full report:
[`runs/vegetation-lod-report.json`](runs/vegetation-lod-report.json).

## Benchmark protocol

The commands are exactly the ones in the plan, from the root of the export, plus `--lodBaseline 0|1` and a unique `--out`:

```sh
npm run qa:perf -- --qa bog-cross --warmup 8 --duration 20 --settle --gpuTimings 1 --hitchMs 16.667 --headed --lodBaseline <0|1> --out tmp/lod-baseline/bog-cross-<off|on>-NN.json
npm run qa:perf -- --qa chunk-cross --x -1869 --z -4003 --yaw 142.55359 --pitch -4.58366 <same flags> --out tmp/lod-baseline/grassland-<arm>-NN.json
npm run qa:perf -- --qa settlement-approach <same flags> --out tmp/lod-baseline/settlement-<arm>-NN.json
npm run qa:perf -- --qa construction-ring <same flags> --out tmp/lod-baseline/construction-<arm>-NN.json
# readiness-gated publication experiments, instrumented arm only:
npm run qa:perf -- --qa <bog-cross|settlement-approach> <same flags> --lodBaseline 1 \
  --url "http://localhost:5173/?initialInstanceUploadSlicing=1&slicedInstancePublication=1&rendererAdmissionBudget=1"
```

Order: three repetitions. Within each repetition every route ran off→on, except repetition 2, which
ran on→off (ABBA). The six readiness runs came after the matrix. The report URL (`href`) of every
run was checked: the arm flags and the experiment flags are present, and the slice and publication
counters populate only in the experiment runs.

Before each run, a guard waited until no other session's Playwright Chromium was alive. After each
run, it marked the run contaminated if one had appeared. A run that lost the foreground (exit 3) or
was contaminated was retried, and its rejected copy was kept.

### Routes (all automated, seed 918273, speed `run`, keys W+Shift for the whole run)

| Route | Spawn (world x, z) | Yaw / pitch (°) | Floating-origin offset | Notes |
|---|---|---|---|---|
| `bog-cross` (dense forest) | −3534792, 1471060 | 146 / 0 | −3534720, 1470976 | Grukmar swamp forest |
| grassland `chunk-cross` | −1869, −4003 | 142.55359 / −4.58366 | 0, 0 | reaches broadleaf forest edge |
| `settlement-approach` | 2366324.12, −2373880.92 | 19.875 / 0 | 2366208, −2373760 | Cyvazin gate approach |
| `construction-ring` | 0, −24 | 0 / 0 | 0, 0 | ends at z ≈ −342; the ring is behind the end camera |

No route crossed a floating-origin rebase during measurement (`originSnapCount = 0` in every run).

### Rejected runs

All rejected runs are listed in `metrics.json`; there are compact extracts in [`runs/rejected-attempts-extract.json`](runs/rejected-attempts-extract.json).

1. **Pass 1 (9 runs, discarded).** Another session's `run-wsc-ground-continuity-qa.mjs` Chromium
   rendered concurrently. That script does not take the perf lock. Most pass-1 runs also failed to
   settle.
2. **Pass 2 (2 runs, discarded).** After an incomplete stop of pass 1, two matrix loops overlapped.
3. **Focus loss (3 attempts, retried).** The Claude desktop app took the foreground around 150 s
   into the run.
4. **Settle timeout (10 runs in the final matrix, kept as rejected).** Every `construction-ring`
   run (6/6), `settlement-approach` off 3/3, and on 1/3 hit the 120 s settle timeout with blocker
   `vegetation` (`stylizedSurface.getPreparationStatus().ready`). The report shows `ready: true`
   at measurement start, so preparation finishes just after the gate or flips back and forth. This
   reproduced in both arms and in both passes, so it is not caused by the instrumentation.

## Results (medians of accepted runs)

The GPU column is the WebGPU timestamp-query total for the frame, sampled every 8th frame: actual
GPU execution time. The CPU columns come from the CPU-side profiler: whole-frame CPU update and
render submission (CPU only). Draw counts are the per-frame `renderDraws` increment for the whole
renderer.

| Route / arm | valid | FPS | p50 | p95 | p99 | p99.9 | max | >16.67 ms | CPU update p50 | submit CPU p50 | GPU p50 | draws/frame |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bog-cross off | 3/3 | 92.30 | 10.7 | 13.80 | 28.05 | 35.65 | 44.1 | 51 | 10.2 | 5.5 | 5.360 | 206 |
| bog-cross on | 3/3 | 92.69 | 10.6 | 14.09 | 27.65 | 37.45 | 51.5 | 56 | 10.1 | 5.5 | 5.391 | 205 |
| bog-cross ready, on | 3/3 | 96.01 | 10.4 | 12.80 | 26.51 | 35.02 | 42.7 | 53 | 9.8 | 5.2 | 5.366 | 205 |
| grassland off | 3/3 | 71.41 | 12.3 | 27.50 | 33.87 | 223.21 | 289.1 | 175 | 11.4 | 6.7 | 4.193 | 220 |
| grassland on | 3/3 | 71.19 | 12.3 | 26.69 | 34.46 | 237.17 | 306.7 | 195 | 11.4 | 6.7 | 4.149 | 220 |
| settlement off | 0/3 | — | | | | | | | | | | |
| settlement on | 2/3 | 69.46 | 13.1 | 28.31 | 36.77 | 83.50 | 100.4 | 135 | 12.45 | 7.65 | 7.058 | 376 |
| settlement ready, on | 3/3 | 71.14 | 13.0 | 25.27 | 34.36 | 88.78 | 98.2 | 127 | 12.3 | 7.5 | 6.871 | 363 |
| construction off / on | 0/3 / 0/3 | — | | | | | | | | | | |

All times are in ms. Frames ≥ 16.67 ms are counted per 20 s window. At 1400–1900 frames per run,
p99.9 rests on 1–2 frames per run and is noisy.

### Diagnostics on vs off

| Route | FPS | p50 | p95 | p99 | GPU p50 | GPU avg | Sampler CPU (amortised) |
|---|---|---|---|---|---|---|---|
| bog-cross | +0.42% | −0.94% | +2.10% | −1.44% | **+0.58%** | −0.22% | **0.024 ms/frame** |
| grassland | −0.31% | 0.00% | −2.95% | +1.74% | **−1.05%** | −0.37% | **0.030 ms/frame** |

Per-arm spreads overlap:

- bog GPU p50: off 5.347–5.422, on 5.346–5.414 ms.
- grassland GPU p50: off 4.105–4.313, on 4.084–4.539 ms.
- grassland FPS: off 71.1–72.2, on 67.0–73.1.

Both GPU deltas are below the proposed 2% threshold and smaller than the run-to-run spread. With
3 runs per arm that is **not proof of equivalence**. The amortised sampler cost is 0.021–0.042 ms
per frame in every instrumented run, against the proposed 0.25 ms ceiling.

One spike stands out: a single 100 ms sample took **22.1 ms** of sampler CPU (grassland-on-02).
Other per-sample maxima are 0.5–3.6 ms. Sampling is amortised, but a single sample can still add
a visible hitch when chunk maps are large.

The readiness experiments ran after the alternating matrix, not interleaved with it, so their gain
is confounded by run order. On bog they gave +3.6% FPS and −9% p95. On settlement all 3 runs
settled, against 2/3 without the flags. These are suggestive, not conclusive.

### Planned LOD activity (instrumented runs, 100 ms sampling)

The columns are: samples with any transition / max chunks transitioning / max overlapping bands /
max chunks waiting on data / max data-wait age / sampled reversals.

| Route | tree | rock | bush |
|---|---|---|---|
| bog-cross | 41–45 / 17–20 / 6 / 22–29 / **10.1–10.9 s** / 0 | 6–8 / 14 / 0 / 0 / — / 0 | 5–6 / 16 / 6 / 0 / — / 0 |
| grassland | 37–43 / 13 / 6 / 13 / 3.4–3.8 s / 0 | 8–10 / 14 / 0 / 0 / — / 0 | 8–9 / 16 / 6 / 0 / — / 0 |
| settlement | 40–42 / 17 / 6 / 11 / 4.6–5.0 s / 0 | 6–7 / 14 / 0 / 0 / — / 0 | 4–6 / 16 / 6 / 0 / — / 0 |
| construction (unsettled) | 30–34 / 13 / 6 / 7 / 2.7–2.8 s / 0 | 4–5 / 14 / 0 / 0 / — / 0 | 3–4 / 16 / 6 / 0 / — / 0 |

- Every route exercised real planned tree, rock and bush transitions.
- Up to 6 tree and 6 bush chunks held two physical bands at once.
- Rocks never overlapped.
- No reversal was sampled. That is a lower bound, and none of these routes reverses direction.
- Handoff deferral, timeout, abandoned-draw and capacity-drop counters showed **no observed delta**
  in any run, including the experiment runs (null; not proof of zero).
- Aggregate attribute upload, queued (not fade-only):
  - bog: about 48 MB per 20 s
  - grassland: about 389–407 MB per 20 s
  - settlement: about 31–33 MB

## Visual inspection

Evidence is limited to end-of-route stills with `?spatialPerformanceOverlay=1`, taken in separate
overlay runs that were not used for timing, plus the static near/proxy galleries from the vegetation
suite. **No motion recordings were made**, so popping, flicker, synchronised transitions and
transition resets could not be judged from video. The overlay grid shows estimated cost far above
the local target in the visible window: top cells 38× (bog), 29× (grassland), 29× (settlement),
18× (construction). The per-cell planner panel was not opened in these stills.

| Item | Observation | Where |
|---|---|---|
| Incorrect tree silhouettes | Tree proxies are visibly narrower and more conical than their near meshes for several conifers (for example gallery positions 1, 2 and 5). Combined with the stale impostor bake, this is the likeliest place for a visible pop. | `captures/vegetation-gallery-tree-{near,proxy}-00-08*.png` |
| Missing geometry / bush LOD | Bush gallery empty (0/22 prototypes); bush LOD transitions are visually unverified. | `captures/vegetation-gallery-bush-near-DEFECT-empty.png` |
| Delayed geometry after streaming | Tree chunks wait on data for up to 10.9 s in bog-cross; data wait, not GPU readiness. | bog-cross from spawn above, first ~10 s of measurement |
| Streaming hitches (not LOD-specific) | Every grassland run, in both arms, has exactly 4 frames of 216–329 ms, while CPU phases inside those frames are only 6–13 ms. They coincide with meadow publication (0.4–0.8 MB), staged geometry allocation (1.7 MB) and streamed-draw initial uploads, consistent with buffer creation or pipeline compilation outside the profiled phases. They drive grassland p99.9. | grassland route, about 4 s and 17–19 s into measurement (grassland-off-01) |
| Construction route coverage | The construction ring is behind the camera at the end pose; the route mostly measures vegetation. | `captures/construction-ring-end-overlay-construction-behind-camera.png` |
| Bare rings, floating vegetation, detached snow caps, shadow/reflection discontinuities, abrupt canopy height | None seen in the stills; **not assessed** in motion. Snow, coast and reflection routes were not run. | — |

## Scenarios not executed

The harness has no automated route for the following, and they were not driven by hand:

- rapid approach/retreat across LOD boundaries
- repeated camera direction changes
- high-speed flight
- mountain ascent/descent
- snow-covered vegetation and rocks
- coastal rock transitions
- cold-region entry and revisit
- floating-origin rebasing

The tree mesh→impostor and impostor→canopy transitions were exercised by the planner on the
forest routes and in the static galleries, but were not recorded in motion. A clean manual session
needs the test machine to itself: in this session, other sessions' browsers and the desktop app
competed for the GPU and the foreground.

## Acceptance

| Gate | Status |
|---|---|
| No new unit test failures | **Fail**: 1 new failure (`475d29db`, location surface residency). Not LOD, not instrumentation. |
| No new lint/build failures | Pass (lint failures are pre-existing) |
| No new GPU validation errors | Pass, with limits: 0 page errors in every accepted run; no dedicated `onuncapturederror` audit |
| Valid WebGPU measurements | Pass |
| Comparable settled runs | **Partial**: bog-cross and grassland only |
| LOD transitions exercised | Pass (planned transitions, all forest routes) |
| Diagnostic overhead vs 0.25 ms/frame | Pass (≤ 0.042 ms/frame amortised; one 22 ms single-sample spike noted) |
| Steady-state GPU vs 2% | Pass (investigated): +0.58% / −1.05%, within noise |
| Invalid runs identified | Pass |
| Visual defects documented | **Partial**: stills and galleries only |
| Missing measurements documented | Pass (see `metrics.json` → `missingMeasurements`) |
| **Hardware acceptance** | **Not complete** |

Measurements that were not available, all recorded as null in `metrics.json`:

- renderer-accounted memory bytes
- per-frame triangles (the counter is a gauge, so only the value at stop is reported)
- transition extra triangles and draws
- pinned bytes
- fade-only upload bytes
- GPU readiness age
- visible missing coverage
- published (as opposed to planned) representations
- per-LOD-layer GPU cost

## Recommendation

Phase 1 can begin **for work validated on bog-cross and grassland**. On those two routes the
instrumentation is shown to be cheap and neutral, and transitions are exercised. Before Phase 1
claims an improvement on settlements, construction, snow, coast or rebasing, Phase 0 should be
completed for those cases:

1. Fix or extend the settle gate for `settlement-approach` and `construction-ring`, and point
   construction at the ring (the plan's documented `--x 0 --z -100 --yaw 180` pose).
2. Re-bake impostors (`npm run bake:impostors`) so that impostor and mesh comparisons are valid.
3. Restore bush prototypes in the vegetation gallery.
4. Record motion video for the interactive scenarios on an otherwise idle machine.
5. Interleave the readiness experiments with their baseline.

Treat the 10 s tree data wait in bog-cross and the about 220–330 ms grassland streaming stalls as
existing defects that Phase 1 must not hide.
