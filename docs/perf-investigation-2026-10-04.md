# Movement CPU performance — 2026-10-04

Status: runtime and grass corrections validated; three final standard repeats exceed 144 FPS. The final stress matrix is under validation. Strict frame-time acceptance remains open.

**The CPU bottleneck was substantial placement work inside movement updates.**
Preparing exact terrain and ecology samples in workers, sharing rock manifests,
and making nested jobs resume under one budget raised the standard route from
about 71 FPS to **152.73 / 172.74 / 180.12 FPS**, with a median of **172.74 FPS**.
This meets the average throughput target in all three final repeats. Frame p95
remains **7.3–10.845 ms**, above 6.94 ms; consistent 144 Hz presentation is still
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
| Shared allowance | One adaptive allowance targets 144 FPS, with a 1.2 ms ceiling and one 0.25 ms progress floor. Actual jobs book deferred time; mandatory updates count toward fixed cost. Queues share the frame cutoff, while deferred CPU consumes the allowance. Physics between early placement and later grass does not spend that allowance again. A late first job can use the one progress floor. Empty queues and probes do not start the deadline. Nested stages, shoreline finalization, assembly, uploads, and draw preparation participate. Atomic operations can still overrun a slice. |
| Residency | Prepared fields and manifests survive render-slot turnover. Caches retain up to 625 chunks, pin the current dependency window, cancel obsolete queued requests, and reject late results. Local terrain and forest edits invalidate their influence areas. |
| Grass | Meadow compactions share their exact stable stem sequence across bands. Lower density takes an accepted prefix; increased density appends new ranks. Preparation starts one tile ahead of a density boundary while the current band remains drawn. New ranks and first arrivals fade in over 350 ms on the GPU; existing ranks stay visible. Ground changes still rebuild the data. Previous complete publications stay visible while replacements prepare. |
| Submission | Static instance matrices update when their transforms change. LOD plans reuse stable results between fade steps. Cached viewport height avoids repeated DOM layout reads. Water slots share one material graph per variant, with textures and pattern origins selected per object. |
| Material preparation | Terrain material baking uses the existing worker pool; at most one completed bake uploads per frame. Streamed meshes and material changes prepare in surface and underwater passes before publication. Prewarming uses the persistent underwater fog object and both sky visibility states. |
| QA | Settle includes vegetation, fields, variants, draw preparation, meadow work, and material jobs. The matrix rejects unsuccessful settle, incomplete captures, and browser errors. High-grass doubles the active meadow densities. CPU statistics include early rock preparation; GPU timing is explicitly unavailable. Reports record start/end readiness, post-stop recovery, procedural misses, and per-frame draw counts. |

The new arrays are derived data, separate from canonical persistence. Azgaar's
standard biome IDs `0–12` and custom terrain IDs remain unchanged.

## Standard movement

Three unprofiled baselines used `chunk-cross`, 8 s warmup, settle, and 12 s
running from `(0, 0)`. They reached **70.02, 70.80, and 71.88 FPS**. Vegetation
CPU averaged **8.77, 8.68, and 8.60 ms/frame**.

Baseline settle checked terrain, construction, and collision. Vegetation was
still incomplete. Current settle also waits for scenery dependencies; the
final runs needed another **12.7–15.5 s** beyond the 8 s warmup. This loading
cost is part of the result.

| Capture | FPS | Complete scenery average / p95 | Submission average | Frame p95 / p99 | Hitches >33.3 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `grass-fair-standard-1.json` | 152.73 | 1.331 / 2.500 ms | 4.119 ms | 10.845 / 14.000 ms | 1 |
| `grass-fair-standard-2.json` | 172.74 | 1.182 / 2.300 ms | 3.674 ms | 7.800 / 9.930 ms | 0 |
| `grass-fair-standard-3.json` | 180.12 | 1.171 / 2.300 ms | 3.460 ms | 7.300 / 9.041 ms | 0 |

The median throughput is about **2.44 times the baseline median**. Complete
scenery update CPU fell by approximately **86%**. `sceneryUpdateCpu` sums
`placementPreparation` and `stylized` within each frame before calculating
percentiles. Earlier checkpoint reports omit the early preparation phase from
their `stylized` time; their FPS measurements still include it. Material graph
preparation performed during rendering remains in the render phase.

All three final runs measured **zero procedural tile/height misses and zero
collision-readiness stops**. The player reached approximately `z = -194.5 m`.
Final counts matched the baseline: **63 near trees, 668 impostors, 796 near
rocks, 1,818 rock placement records, and 673 bush placements**. The reports retain 183 draws at the final pose. All three end gauges show zero
missing in-range or in-cone grass tiles and zero pending visible density
upgrades. Two ended with clear queues; the first had one meadow preparation job
remaining. That unused density-upgrade job blocked recovery for the full 15 s
observation despite complete drawable grass; the final cancellation fix removes
it. The other two recoveries remained ready for 60 frames. These end gauges do not establish zero delay on every frame.

The prepared arrays occupied **89,188,460 bytes (about 85 MiB)** for 306 retained
chunks. This measures typed arrays, not total JavaScript heap or GPU memory.

Earlier results are retained: `after-1/2/3.json` reached 149.10 / 148.48 /
148.47 FPS before exact meadow prefix reuse. `final-1/2/3.json` reached 173.02 /
139.47 / 174.79 FPS before the final budget accounting and object viewport
fixes. They are not substituted for the final three repeats.
The later `final-5/6/7.json` captures reported 173–176 FPS but lacked bush
publication because of the missing import. They are superseded, not evidence
for the complete scenery workload. Corrected pre-grass runs
`standard-frozen-1/2.json` reached 159.64 / 159.42 FPS; the third overlapped another
browser debug run and is excluded. Intermediate `grass-fixed-standard-*.json`
captures exposed grass starvation, including a 120 s settle timeout, before the
shared frame-cutoff fix. They remain failing checkpoints. The pre-priority `grass-final-standard-1/2/3.json` reached 172.00 / 171.69 /
165.13 FPS. The final three above include bushes, grass lookahead, arrival fades,
cached handoffs, viewing-direction priority, fair scenery turns, and the
scheduler correction.

## Forward grass popping

The density upgrade started only once a tile crossed its visible LOD boundary.
If compaction finished late, the additional blades appeared together. Grass now
prepares the next density eight metres ahead while drawing the existing band.
It publishes the cached prefix at the boundary, keeping positions and density
rules unchanged. First arrivals and added ranks use a 350 ms screen-door fade;
existing ranks keep their coverage. The publication time and retained rank share
the existing tile attribute, so this adds no vertex-buffer binding or extra draw.

Grass queues now prefer tiles in the camera’s horizontal viewing cone, then
nearest tiles, instead of giving equally close patches behind the player the
same priority. This affects preparation order only: off-camera work remains
queued, completed grass remains drawn, and turning redirects the next slice.
The cone includes tile corners conservatively and is not a renderer culling
change. A partial higher-density job is cancelled when a reduced target is
already satisfied; otherwise it can remain counted as pending after leaving
the runnable queue and prevent settle indefinitely. QA keeps both all-range and in-cone missing/density-lag counts.

The shared scheduler also used an early job's short deadline as a wall-clock
window across physics and other mandatory updates. That could starve later grass
work even when little deferred CPU had run. The shared cutoff now belongs to the
frame; actual deferred execution consumes its allowance. The global floor remains
single-use, and nested jobs cannot extend the cutoff or replenish the allowance.
Meadow work runs before cosmetic scenery rebuilds on three of every four frames,
after shared collision preparation. The fourth gives the other queues first
access to the same allowance, preventing continuous grass work from starving
rock/tree publication or draw preparation. Cached prefixes publish during band selection even when generation
has exhausted its time; only fresh sampling and compaction wait for the allowance.
The previous density remains drawn while additional preparation runs. Behavioral
coverage checks preparation before the boundary, cached handoff with no generation
time, exact prefix reuse, retained stems, the actual fade-node graph, mandatory
gaps between queues, and submerged suspension.

## Sustained streaming and heavy scenes

The final direction/fairness/cancellation capture (`grass-ready-sustained.json`) kept moving
for 60 s, covering approximately **972 m** at **168.97 FPS**. Complete scenery
CPU was **1.388 ms average / 2.500 ms p95**; frame p95 was **8.0 ms**, with one
hitch. It prepared 165 fields, 125 rock manifests, and 105 tree manifests during
measurement, with zero procedural terrain misses and zero collision-readiness
stops. It published 1,243 bush placements, 1,444 tree impostors, and 38 species
fallback impostors. Start and end preparation were complete; both whole-range
and viewing-cone grass missing/density-lag counts were zero at the end.

The same-browser revisit turned 180° halfway through, returning near the spawn.
It reached **151.34 FPS**, with **9.2 ms frame p95**, two hitches, and scenery CPU
**1.262 ms average / 2.200 ms p95**. It generated zero new prepared fields,
rock manifests, or tree manifests, confirming cache reuse. Both grass missing
counts and both density-lag counts were zero at its end. All scenery queues were clear at both movement endpoints. Both post-stop
observations remained ready for 60 frames in approximately 0.35 s. Both legs exceed
144 FPS on average, while neither meets the strict frame-tail target.

Both legs retained 454 prepared chunks and 131,563,524 array bytes (about
125 MiB), below the 625-chunk limit, and had zero browser errors. End gauges
establish completion at that pose, not zero preparation delay on every frame.
The direction-only checkpoint (`grass-view-sustained.json`) reached
129.52 / 116.08 FPS before fair queue turns; five in-cone tiles were missing at
the revisit end and cleared during recovery. The cached-handoff-only long run
reached 160.39 / 134.01 FPS with clear end queues. Both are retained checkpoints.

The prior `grass-final-sustained.json` reached 164.16 / 139.83 FPS but left
131 missing visible grass tiles and 189 meadow jobs on the revisit. The
priority-only checkpoint (`grass-priority-sustained.json`) reduced that missing
count to 13 and recovered after stopping, but reached 154.37 / 120.55 FPS.
Its standard repeats were 175.40 / 141.36 / 150.81 FPS; one missed 144 FPS and
two ended with meadow work outstanding. The subsequent cached-handoff standard
repeats (`grass-handoff-standard-1/2/3.json`) were 159.85 / 166.89 / 112.49 FPS.
The third retained 84 missing in-range grass tiles, 126 meadow jobs, and 51
scenery jobs; it is a valid failing checkpoint. The older missing-tile gauge
counts the whole range, including tiles behind the camera. These remain
checkpoints, not passing acceptance. Publishing ready prefixes without waiting for generation budget
removed the remaining end backlog in the final long route. The earlier
`sustained-frozen.json` pre-grass capture reached 147.57 / 143.65 FPS and remains
an earlier complete-workload checkpoint.

The earlier `sustained-diagonal.json` reported 169.65 FPS. It had no published
bush placement counts, before the missing builder import was fixed. Its speed
is not comparable evidence for the corrected scenery workload; retain it only
as an earlier checkpoint, not as sustained-route acceptance.

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
The earlier construction recheck (`construction-recheck.json`) settled and
reported a 6.67 s recovery, but precedes the bush fix. It is a checkpoint rather
than acceptance for the final workload. The corrected matrix construction case
settled after an additional **42.5 s**, reached **91.11 FPS**, and passed the
stress gates with **16.920 ms frame p95**, five hitches, and collision acceptance.
It still ended with 110 queued jobs, 162 meadow tiles, and 27 draws pending.

The pre-grass corrected matrix (`matrix-frozen.json`) passed every gate with
zero browser errors. Its checkpoint results are:

| Case | FPS | Frame p95 | Hitches >33.3 ms | Settle |
| --- | ---: | ---: | ---: | --- |
| Standard diagonal | 171.58 | 7.600 ms | 0 | Passed |
| Dense forest | 169.30 | 7.800 ms | 0 | Passed |
| High grass, active meadow ×2 | 127.40 | 12.890 ms | 22 | Passed |
| Dense mixed | 125.12 | 12.710 ms | 15 | Passed |
| Approaching construction | 91.11 | 16.920 ms | 5 | Passed |
| Water | 178.05 | 8.200 ms | 4 | Passed |

The later grass/frame-cutoff matrix (`matrix-grass-final.json`) **failed**:
construction reached 70.16 FPS, frame p95 32.7 ms, and 27 hitches (3.86%, over
the 2% gate). It settled successfully but ended with 112 queued jobs, 210 meadow
jobs, and 31 draws pending. Standard, dense forest, high grass, dense mixed,
and water passed their regression gates; this does not make the full matrix pass.
The cached-handoff matrix (`matrix-grass-handoff.json`) also failed construction:
settle timed out at 120 s and its hitch rate was 2.05%. Its 87.96 FPS is not
valid construction acceptance because scenery was incomplete at measurement
start. Other movement cases and water passed; water reached 175.48 FPS. This
exposed category starvation and motivated the one-in-four scenery turn. The
viewing-direction/fairness combination needs another comparable matrix.

These are the existing matrix regression gates: frame p95 at most 33.3 ms,
hitches at most 2%, correct workload activation, and collision/water acceptance.
They do not establish 144 FPS in the dense or construction stress scenes.

## Water

The actual water route reaches its deep target and completes entry, swimming,
diving, surfacing, and dry exit with active caustics. `water-frozen.json`
passed all acceptance gates with **178.05 FPS**, **8.2 ms frame p95**, four hitches,
and no browser or WebGPU validation errors. Start and end preparation were complete.

The original 300 ms dive stalls involved scene/material preparation. Streamed
pass prewarming addresses that first-use work. The corrected water run still contains
a **125.1 ms maximum full-pipeline CPU cost** and a **126 ms maximum frame**;
those remain visible as a frame-tail failure. The **0.3 ms maximum observed
caustic CPU** measures only the post-effect. Separate scene and full-pipeline
gauges retain the rest. The former counter measured the entire scene plus
effect, so its old and new values are not directly comparable. The earlier
`water-integrated.json` reported a 44.5 ms pipeline maximum but lacked the bush
fix and general browser-error check. It is retained as a checkpoint. Passing the
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

The follow-up uses a detached snapshot at `9968f5c`, with the performance-only
changes from `84d81fc` applied through `validated-performance.patch`, plus the
bush streaming import fix and browser-error reporting. The snapshot is in
`tmp/movement-cpu/validated-runtime`, with subsequent grass lookahead, arrival
fades, priority, cached handoff, frame-cutoff accounting, and QA validity fixes
preserved in `validated-runtime.patch`. Its SHA-256 is recorded alongside the
base in `validated-runtime-source.json`. The active checkout has concurrent
weather, terrain-transition, asset, and underwater changes; these captures do
not validate those later feature changes.
The snapshot copies the same runtime assets and permits its shared `node_modules`
decoder path in its temporary Vite configuration.

Two follow-up attempts are excluded. `sustained-integrated.json` experienced
concurrent HMR runtime changes. `sustained-isolated.json` had a blocked Basis
decoder, fallback tree impostors, and a missing bush builder import. Neither is
comparable throughput evidence. The latter exposed the import error; behavioral
coverage now exercises real bush manifest creation, dependency waiting, slicing,
and retained completion. The runner preserves a bounded browser-error list and
rejects a capture when an exception or console error occurs.

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

- Standard averages exceed 144 FPS. Frame p95 remains 7.3–10.845 ms against
  6.94 ms; the first p99 is 14 ms against 10 ms and has one hitch. Scenery p95
  is 2.3–2.5 ms against the 2 ms goal; the first mean is 1.331 ms against
  the 1.20 ms allocation. Strict acceptance remains open.
- The latest construction stress case fails the hitch-rate gate and ends with
  a moving backlog. The provisional 250 ms readiness / 500 ms near-job limits
  are not established.
- The final long turn-back capture reaches 151.34 FPS and ends with complete
  drawable grass and clear queues. Both long legs still miss the strict
  frame-time target.
- The four earlier straight-route height misses remain an unresolved observation.
  Edit-during-motion and floating-origin hardware exercises remain follow-up
  checks; behavioral tests cover retention, edits, and seams.

`npm run verify` passed **3,094 tests**, asset/configuration validation, and the
production build on the frozen snapshot including grass direction priority,
fair queue turns, the cached handoff, frame-cutoff accounting, and shared
browser-lock checks. Tests cover
nested accounting, one progress floor, lazy deadline activation, consumer limits,
shoreline resumption, precise sampling, edited/negative/large coordinates, stale
workers, eviction, retained manifests, collision pending semantics, complete
publication, exact meadow prefixes, arrival fades, water bindings, CPU metric
scopes, and QA validity gates.
