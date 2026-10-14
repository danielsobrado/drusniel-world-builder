# World visual quality implementation — 2026-10-14

Status: implementation in progress. Release acceptance is not yet established.
Specification: [world visual quality plan](../plans/world-visual-quality-plan-2026-10-13.md).
Original evidence: [biome screenshot audit](visual-audit-2026-10-13/README.md).

## Runtime foundation

Camera cuts replace destination chunk descriptors before changing the origin and
pose. Object queries now cover individual resident chunks rather than a rectangle
spanning distant chunks. Overlapping query results and selection are deduplicated.
The cut coordinator blocks movement until the destination collision is ready.
Unit verification includes superseded asynchronous cuts and negative/large world
coordinates. A browser check exposed a collision-status field mismatch; the
coordinator now reads the production nested `collision.ready` field.

The required 120-second stationary cold-desert reproduction at canonical
`(501,-2833)` produced **120 ready samples**, zero pending bush work, and zero
browser errors on the runtime loaded from `b9cbea08`.
[Raw preparation timeline](world-visual-quality-2026-10-14/bush-before.json).
The original October 13 stuck bush entry did not reproduce at this location on
the current branch, which includes the independent `31b73999` preparation fix.
This observation does not establish that all twelve locations settle.

Preparation now reports staged replacements, in-flight/apply-pending assets and
known failures. It counts iterator advancement rather than just scheduling a
job. Scenery first turns rotate through six consumers within the existing shared
allowance. Animated meadow/layout updates remain per frame, while compaction is
budgeted. Chunk focus is copied into resumable work so a mutable focus object
cannot conceal an obsolete generation.

The permanent dev-only visual adapter uses the camera-cut transaction, full
readiness checks, original canonical poses, hardware adapter verification,
source/config hashes, and lossless captures. Unavailable later suites fail
explicitly. No unimplemented suite is represented as passing.

The focused runtime/capture tests pass. The full Node suite passed **6,664 tests**
after updating the old scenery scheduling fixture to exercise the new scheduler.
Lint and whitespace checks passed. Full hardware gates and appearance work are
pending; no visual or frame-rate improvement is claimed yet.

## Task status

| Task | State |
| --- | --- |
| VQ-01 | Implemented; 20 alternating long cuts passed |
| VQ-02 | Implemented; both fresh twelve-pose runs settled with matching placements |
| VQ-03 | Runtime baseline collected; clean-capture correction and resource accounting still being validated |
| VQ-04 | Passed production drift fixtures on hardware WebGPU and WebGL |
| VQ-05 | Substrate responses implemented; CPU/shader swatch parity pending |
| VQ-06 | Pending substrate gate |
| VQ-07–10 | Pending surface/atmosphere gates |
| VQ-11 | Capture visibility core implemented; public HUD settings/finish pending |
| VQ-12–13 | Pending implementation and release verification |

## Repeat-capture failure and correction

The first twelve-location run at `1460f951` completed scenery preparation on
hardware NVIDIA Lovelace WebGPU, with zero browser errors. A second fresh-context
run failed at original pose 01 after the 120-second settle deadline. Terrain and
collision were ready, but 40 tree manifest jobs and 44 rock manifest jobs remained
queued. [Raw failed report](world-visual-quality-2026-10-14/failed-runtime-repeat.json).

The repeat exposed work from an obsolete terrain focus being advanced by an
early preparation turn. The old tree plan could schedule or reactivate manifests
whose blocker dependencies lay outside the new window. Resumable publications
now reject an obsolete terrain focus before invoking their iterator. Tree
manifest scheduling and activation are constrained to the dependency window,
which cancels old pending builds on a camera cut. Pending manifest outcomes are
now distinct from completions; a blocked job runs once per flush rather than
immediately polling the same dependency again.

Image inspection also found the spell dock and Scenic tour button in the supposed
clean capture. Both owners now register capture visibility explicitly. The first
run and failed repeat are retained under local `tmp/world-visual-quality/pre-window-fix/`;
they are **not the accepted appearance baseline**. Fresh captures are required
at the corrected source revision.

## Settled runtime and baseline performance

At `ff5b9339`, both fresh original-pose contexts reached complete readiness at
all twelve locations, with matching biome IDs and sorted tree/rock/bush identities.
The [20-cut report](world-visual-quality-2026-10-14/runtime-cuts/report.json)
passed with valid destination collision and zero browser errors.

The three [baseline route reports](world-visual-quality-2026-10-14/perf/baseline-run-1.json)
recorded zero post-warmup hitches, no sampling misses and post-stop recovery below
2 seconds. The full [baseline matrix](world-visual-quality-2026-10-14/perf/baseline-matrix.json)
**failed**: high-grass hitch rate 3.38%; dense-mixed did not settle before
measurement and recorded 4.97% hitches. Those failures remain required release
checks. Dense-mixed retained five old manifest jobs despite prepared fields
being ready; manifest consumers are being checked for scheduling starvation.

The original-suite images still exposed a capture-root scope bug: the spell dock
is mounted outside `#app`. The visibility owner now registers from the document,
and the runner asserts that every registered root is hidden. The earlier images
are retained locally but are not represented as fully clean final captures.
The full suite at this foundation passed 6,667 Node tests and the production build.

## Dry-ground streak correction (VQ-04)

The user identified the repeated foam-like streaks on cold-desert ground.
The [pre-change diagnostic views](world-visual-quality-2026-10-14/fixtures/drift-before/report.json)
include default, drift-off, direct-light-off and flat-normal states at original
01/02. Turning drift off removes the long bright lines. Source inspection confirms
that the old combined drift mask fed white emission, independently of surface light.
The direct-light/flat-normal captures are descriptive diagnostics: ambient weights
were easing after the preceding switch, so they do not establish an isolated
quantitative lighting contribution.

The new graph clamps separate sand/snow masks, blends their configured colours
into albedo after rain shading, and retains footprints and frost above the blend.
The ambient driver owns strength once. Fully wet or snowy ground excludes sand;
packed paths suppress snow drift. Other spell and snow-scattering emission remains
independent. The production noise uses continuous canonical wind coordinates,
not chunk-relative repeating tile coordinates. No texture, particle, mesh or
render pass is added to the world.

The focused surface/ambient tests pass (31 tests). Production WebGPU/WebGL
bounded-albedo and night-darkness fixtures are the next gate; no browser pass
or appearance outcome is claimed before those finish.

## VQ-04 browser acceptance and compatibility repair

The [production surface fixture](world-visual-quality-2026-10-14/fixtures/drift/report.json)
passed on hardware NVIDIA Lovelace WebGPU and WebGL, with zero browser errors.
Both sand and snow stayed exactly black with lighting and independent emission
off. Maximum linear albedo changes were 0.002036 for sand and 0.001639 for snow
on WebGPU, below their 0.16/0.22 bounds; both backends exercised a nonzero drift
mask. [Full-world post-change pairs](world-visual-quality-2026-10-14/fixtures/drift-world/report.json)
retained original 01/02 and reached complete readiness without browser errors.
The broad white bands are absent in their ordinary post-change views.

The first fixture run was invalid because optional fixture configuration was
missing. A later run exposed the existing physical-material DFG lookup pushing
WebGL to 17 texture units. The diagnostic fixed-wind dependency uses the same
production drift graph. Wetness/shoreline and canopy/water now share an RGBA8 GPU
allocation and restore their original logical RG channels in the node reader.
All seven CPU bake channels remain unchanged; allocation and upload bytes remain
22 bytes per texel, while one texture binding is removed. Disposal deduplicates
the shared allocation. The final report above retains actual shader bindings.
Earlier invalid fixture runs remain local under `tmp/world-visual-quality/after/fixtures/`.

## VQ-05 exposed-ground responses

The four substrate profiles and selected detail settings are implemented.
Selection uses exact terrain IDs, canopy, wetness and shoreline; tint applies
only to the exposed dirt share and excludes painted paths. Near/mid composition
and the CPU far-colour encoder consume the same profiles. A recipe/config/pigment
fingerprint changes derived material cache keys without changing source terrain
or saved edits. The focused material/cache tests pass (35 tests).
The six production swatches are being compared at 3, 20, 60 and 140 metres on
both backends; independent stochastic/genome/weather offsets are disabled only
in the numerical recipe fixture to isolate substrate and quantization parity.
