# Movement CPU performance — 2026-10-04

Status: runtime stages implemented; three standard runs exceed 144 FPS. The full hardware matrix passes. Strict frame-time acceptance remains open.

**The CPU bottleneck was substantial placement work inside movement updates.**
Preparing exact terrain and ecology samples in workers, sharing rock manifests,
and making nested jobs resume under one budget raised the standard route from
about 71 FPS to **173.55 / 176.47 / 174.12 FPS**, with a median of **174.12 FPS**.
This meets the average throughput target in all three final repeats. Frame p95
remains **7.5–7.7 ms**, above 6.94 ms; consistent 144 Hz presentation is still
an open acceptance item.

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
| Shared allowance | One adaptive allowance targets 144 FPS, with a 1.2 ms ceiling and one 0.25 ms progress floor. Actual jobs book deferred time; mandatory updates count toward fixed cost. Empty queues and readiness probes do not start the deadline. Nested stages share accounting; one consumer’s smaller cap does not shrink the global allowance. Candidate generation, shoreline finalization, assembly, uploads, and draw preparation participate. Atomic operations can still overrun a slice. |
| Residency | Prepared fields and manifests survive render-slot turnover. Caches retain up to 625 chunks, pin the current dependency window, cancel obsolete queued requests, and reject late results. Local terrain and forest edits invalidate their influence areas. |
| Grass | Meadow compactions share their exact stable stem sequence across bands. Lower density takes an accepted prefix; increased density appends new ranks. Ground changes still rebuild the data. Previous complete publications stay visible while replacements prepare. |
| Submission | Static instance matrices update when their transforms change. LOD plans reuse stable results between fade steps. Cached viewport height avoids repeated DOM layout reads. Water slots share one material graph per variant, with textures and pattern origins selected per object. |
| Material preparation | Terrain material baking uses the existing worker pool; at most one completed bake uploads per frame. Streamed meshes and material changes prepare in surface and underwater passes before publication. Prewarming uses the persistent underwater fog object and both sky visibility states. |
| QA | Settle includes vegetation, fields, variants, draw preparation, meadow work, and material jobs. The matrix rejects unsuccessful settle and incomplete captures. High-grass doubles the active meadow densities. CPU statistics include early rock preparation; GPU timing is explicitly unavailable. Reports record start/end readiness, post-stop recovery, procedural misses, and per-frame draw counts. |

The new arrays are derived data, separate from canonical persistence. Azgaar's
standard biome IDs `0–12` and custom terrain IDs remain unchanged.

## Standard movement

Three unprofiled baselines used `chunk-cross`, 8 s warmup, settle, and 12 s
running from `(0, 0)`. They reached **70.02, 70.80, and 71.88 FPS**. Vegetation
CPU averaged **8.77, 8.68, and 8.60 ms/frame**.

Baseline settle checked terrain, construction, and collision. Vegetation was
still incomplete. Current settle also waits for scenery dependencies; the
final runs needed another **11.8–12.1 s** beyond the 8 s warmup. This loading
cost is part of the result.

| Capture | FPS | Complete scenery average / p95 | Submission average | Frame p95 / p99 | Hitches >33.3 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `final-5.json` | 173.55 | 1.081 / 2.200 ms | 3.663 ms | 7.700 / 9.620 ms | 0 |
| `final-6.json` | 176.47 | 1.066 / 2.100 ms | 3.610 ms | 7.500 / 9.885 ms | 1 |
| `final-7.json` | 174.12 | 1.090 / 2.200 ms | 3.630 ms | 7.600 / 11.900 ms | 0 |

The median throughput is about **2.46 times the baseline median**. Complete
scenery update CPU fell by approximately **87.5%**. `sceneryUpdateCpu` sums
`placementPreparation` and `stylized` within each frame before calculating
percentiles. Earlier checkpoint reports omit the early preparation phase from
their `stylized` time; their FPS measurements still include it. Material graph
preparation performed during rendering remains in the render phase.

All three final runs measured **zero procedural tile/height misses and zero
collision-readiness stops**. The player reached approximately `z = -194.5 m`.
Final counts matched the baseline: **63 near trees, 668 impostors, 796 near
rocks, and 1,818 rock placement records**. The reports show 173 draws at the
final pose. Two runs ended with all queues clear; the third had one meadow
tile left and cleared it before the recovery observer's next frame.

The prepared arrays occupied **89,188,460 bytes (about 85 MiB)** for 306 retained
chunks. This measures typed arrays, not total JavaScript heap or GPU memory.

Earlier results are retained: `after-1/2/3.json` reached 149.10 / 148.48 /
148.47 FPS before exact meadow prefix reuse. `final-1/2/3.json` reached 173.02 /
139.47 / 174.79 FPS before the final budget accounting and object viewport
fixes. They are not substituted for the final three repeats.

## Sustained streaming and heavy scenes

The valid 60 s diagonal route (`sustained-diagonal.json`) kept moving throughout,
covering approximately **972 m** at **169.65 FPS**, with complete scenery CPU
**1.222 ms average / 2.000 ms p95**. It prepared 165 fields, 125 rock manifests,
and 105 tree manifests during measurement, with **zero procedural terrain
misses and zero collision-readiness stops**. It retained 454 prepared chunks
and 131,563,524 array bytes (about 125 MiB), below the 625-chunk limit. Its end
backlog was two meadow tiles and two draws; it cleared before the recovery
observer's next frame. This capture precedes the final accounting/viewport fixes.

The straight 60 s capture (`sustained.json`) reached 186.49 FPS but hit a natural
obstacle at about 498 m after 31 s, then remained stationary. Its full-run FPS
is not evidence of uninterrupted streaming. It also recorded four height misses
that did not recur in the diagonal run or the subsequent 30 s attribution run.
Keep that result as a known unresolved sampling observation. QA now captures
bounded call-stack diagnostics if such misses recur.

The earlier integrated matrix (`matrix-final.json`) failed construction.
Construction had timed out waiting for draw preparation and its timing is
invalid for acceptance, even though the old matrix gate reported only the
2.08% hitch-rate failure. The gate now rejects unsuccessful settle explicitly.
The corrected construction recheck (`construction-recheck.json`) settled with
all scenery ready, reached **99.14 FPS**, and passed the stress gates:
**15.055 ms frame p95**, **0.51% hitches**, and collision acceptance. Its heavy
moving backlog took **6.67 s** to clear after stopping. This is measurable
progress under load, but it exceeds the plan's provisional near-job latency
objectives and needs further work.

The final matrix (`matrix-integrated.json`) passed every gate:

| Case | FPS | Frame p95 | Hitches >33.3 ms | Settle |
| --- | ---: | ---: | ---: | --- |
| Standard diagonal | 167.41 | 7.900 ms | 1 | Passed |
| Dense forest | 167.98 | 7.700 ms | 0 | Passed |
| High grass, active meadow ×2 | 129.88 | 12.040 ms | 18 | Passed |
| Dense mixed | 126.09 | 13.010 ms | 17 | Passed |
| Approaching construction | 98.11 | 16.405 ms | 10 | Passed |
| Water | 197.72 | 6.900 ms | 1 | Passed |

These are the existing matrix regression gates: frame p95 at most 33.3 ms,
hitches at most 2%, correct workload activation, and collision/water acceptance.
They do not establish 144 FPS in the dense or construction stress scenes.

## Water

The actual water route reaches its deep target and completes entry, swimming,
diving, surfacing, and dry exit with active caustics. `water-integrated.json`
passed all acceptance gates with **197.72 FPS**, **6.9 ms frame p95**, one hitch,
and no WebGPU validation errors. Start and end preparation were complete.

The original 300 ms dive stalls involved scene/material preparation. Streamed
pass prewarming reduces that first-use work. The final water run still contains
a **44.5 ms maximum full-pipeline CPU cost** and a **43.2 ms maximum frame**;
those remain visible as a frame-tail failure. The **0.3 ms maximum observed
caustic CPU** measures only the post-effect. Separate scene and full-pipeline
gauges retain the rest. The former counter measured the entire scene plus
effect, so its old and new values are not directly comparable. Passing the
effect's 4 ms gate does not establish hitch-free diving.

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
`attribution-final.cpuprofile` precedes the final accounting/viewport fixes; its
remaining CPU work is in renderer submission/buffer updates, meadow bookkeeping,
object updates, and garbage collection. It identified the remaining object
viewport layout read. Raw evidence lives in ignored `tmp/` and is local to this
checkout; preserve it separately if another checkout needs to reproduce the audit.

```bash
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --speed run --settle --drain-seconds 15 --out tmp/movement-cpu/reproduce-standard.json
npm run qa:perf:windows -- --qa diagonal --warmup 8 --duration 60 --speed run --settle --drain-seconds 15 --out tmp/movement-cpu/reproduce-sustained.json
npm run verify
```

Run captures sequentially, with other app rendering tabs closed and without
concurrent builds, tests, or runtime edits. On WSL the full matrix must use
native Windows Node/Playwright, as documented in the QA guide. The matrix now
uses settle and approaches the construction corridor from `z = -100`, yaw 180.

## Remaining acceptance

- Standard average FPS and mean scenery CPU targets pass. Frame p95 exceeds
  6.94 ms, one repeat exceeds 10 ms p99, one has a hitch, and scenery p95 is
  2.1–2.2 ms against the 2 ms goal. Strict acceptance remains open.
- Stress construction still builds a moving backlog that needs seconds to drain.
  The provisional 250 ms readiness / 500 ms near-job limits are not established.
- The four straight-route height misses remain an unresolved observation.
- Hardware camera-turn/revisit, edit-during-motion, and floating-origin exercises
  remain follow-up checks. Behavioral tests cover retention, edits, and seams.

`npm run verify` passed **3,078 tests**, asset/configuration validation, and the
production build after the final runtime changes. Tests cover nested accounting,
one progress floor, lazy deadline activation, consumer limits, real shoreline
resumption, precise sampling, edited/negative/large coordinates, stale workers,
eviction, retained manifests, collision pending semantics, complete publication,
exact meadow prefixes, water bindings, CPU metric scopes, and QA validity gates.
