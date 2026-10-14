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

The [substrate fixture](world-visual-quality-2026-10-14/fixtures/substrates/report.json)
passed 108 numerical checks across WebGPU and WebGL, with zero browser errors.
The [twelve original map views](world-visual-quality-2026-10-14/fixtures/substrates-world/report.json)
also reached full readiness with zero browser errors at `dec9f127`; all selected
camera poses matched the baseline and every HUD root was hidden for clean images.
The earlier interrupted twelve-view attempt produced no report and remains local;
it is not used as acceptance evidence.

Before VQ-06, concurrent commit `8f236795` supplied fair early preparation turns
for placement fields and manifest queues. Its completion accounting is preserved;
the redundant local draft of that repair was not applied. Final performance
acceptance still requires fresh measurements.

## VQ-06 atmosphere and representation implementation

Jungle optical depth now scales with the validated region weight. The selected
mist defaults and YAML settings agree; colour remains lit by the existing sun
and hemisphere and is nonnegative. Output composition wraps prior effects once
and preserves their alpha. Near trees, proxies, clusters, understory, CPU/GPU
impostors, rocks, bushes and opaque ground/aquatic detail receive that composer.
Water sheets retain their own atmosphere path. Impostor normals are converted
from reconstructed world space into view space through their shared factory.
Pocket coordinates remain canonical across render-origin shifts.

The permanent tree fixture uses the existing production prototype extractor,
LOD mesh factories and checked-in atlas loader, with the complete prototype
order and source-signature validation. Wind is zero only in this prescribed
fixture. It records fitted camera distance, alpha coverage, shared interior
pixel counts and linear RGB/luminance errors. Neutral cards isolate mist from
geometry; a separate fixed-world-normal card tests rotating camera views.
Browser acceptance is pending; no tree-parity pass is claimed yet.

The [pre-change fixture](world-visual-quality-2026-10-14/fixtures/trees-before/report.json)
reproduced both defects on WebGPU/WebGL without browser errors: nonzero weights
0.25, 0.5 and 1 yielded identical optical depth; rotating the fixed-normal card
changed linear brightness by 0.068864. Its failed verdict is intentional baseline
evidence, not an acceptance pass.

Focused atmosphere/LOD checks pass (27 tests), and the required atlas validator
accepts all 29 existing prototypes. A new authored-cutoff check exposed that
Three's node-material copy skips the inherited `alphaTest` accessor. The shared
authored-material adapter now preserves that cutoff explicitly when composing
effects; no cutoff values are lowered. Production browser acceptance follows.

The [first post-fix tree fixture](world-visual-quality-2026-10-14/fixtures/trees-prebake/report.json)
passes all atmosphere, output-composition and normal-rotation checks on both
backends with zero browser errors. The fixed-normal rotation error is now zero;
the large-origin mist difference is 0.0000302 linear RGB on WebGPU. It fails
actual tree atlas parity: prototypes 16/15 retain only 62.6%/66.1% alpha coverage,
and all three impostors are too dark. Inspection found two baker contract bugs:
linear albedo bytes were labelled sRGB, and canvas elevation rows were written
top-down while runtime atlas UV rows are bottom-up. The repair uses a dedicated
sRGB albedo target, a separate linear normal target, and reverses canvas row
placement. Runtime alpha thresholds and atlas dimensions remain unchanged.
The bake recipe signature is incremented to reject old derived atlases.

The full suite before this baker repair passes 6,685 tests and the production
build passes. An earlier broad run also discovered temporary draft test files;
those drafts were renamed so they are not auto-discovered. Their import failures
were harness noise, not production test failures; the clean rerun is the result
quoted above. The focused baker/manifest/pixel suite passes 20 checks. Existing
assets are backed up locally before rebaking all 29 original prototypes.

The first rebake also warned that authored bark lacked its `instanceDither`
input. Offline bake geometry now supplies the neutral `[1,0.5,1]` appearance
record without modifying source meshes. The final rebake includes this repair.
The production tree fixture now additionally bakes a known linear-colour swatch
and samples its resulting tagged texture; this checks actual colour round-trip
rather than relying only on target configuration. A stopped stale-server launch
and the earlier pre-seed bake are retained locally and are not final evidence.

The [first rebaked fixture](world-visual-quality-2026-10-14/fixtures/trees-first-rebake/report.json)
still fails some material ratios. It exposed missing authored-crown lighting on
impostors and a reconstruction basis that used the upright billboard axis rather
than the bake camera's up direction. Both paths now share the unchanged near
fill/transmission function; derived atlas metadata marks textured graded crowns,
so vertex-painted alpine foliage does not receive a different lighting recipe.
Normal reconstruction uses the camera basis independently of billboard geometry.

The same fixture's WebGPU bake swatch revealed padded readback rows: central
colour bytes were correct, but raw GPU row padding was treated as image pixels,
producing diagonal black lines. The shared pixel helper now packs those rows
before atlas dilation; a synthetic three-row test checks every byte. WebGL's
tightly packed data is returned unchanged. The fixture's alpha gate now uses the
baker's matching orthographic view; perspective FOV 35 remains the material
comparison view. Thresholds, source identities and appearances are unchanged.
Rotating-normal checks additionally cover elevations 0, 12 and 58 degrees.
The focused baker/manifest/LOD checks pass 31 tests before the final rebake.

The [compressed-atlas fixture before supersampling](world-visual-quality-2026-10-14/fixtures/trees-before-supersample/report.json)
passes all atmosphere, rotating-normal and actual baker colour round-trip checks
on both backends without errors. Remaining failures are broadleaf prototype 16
alpha coverage (0.80489 of the matching mesh), and alpine prototype 27 at sun
azimuth zero (median luminance ratio 0.72329). Other material/alpha cases pass.
The full suite at that source passes 6,689 tests and the build passes.

Offline capture now renders four samples per axis and downsamples premultiplied
linear albedo and normalized normals into the unchanged 128-pixel atlas tiles.
It uses the existing coverage-preserving foliage rule at cutoff 0.5. A new test
found that the old mip search could reduce opaque alpha to 128; the lower bound
now prevents that reduction. Foliage classification is zero outside the visible
alpha footprint. An intermediate supersampled bake failed the required mask
validator and is retained locally; the validator was not relaxed. The corrected
focused supersample/coverage/baker/manifest checks pass 26 tests.

The corrected supersampled rebake passes the required validator for all 29
original prototypes (`tree-impostor-v7-855b7394`). Runtime atlas dimensions and
source identities match the original manifest. Final browser parity is pending.

The [final compressed-atlas fixture](world-visual-quality-2026-10-14/fixtures/trees/report.json)
passes all 276 checks: 161 on hardware NVIDIA Lovelace WebGPU and 115 on WebGL,
with zero browser errors. Both backends use compressed albedo. Alpha coverage
ratios are 1.05391 (broadleaf), 0.97984 (narrow conifer), and 0.96756 (alpine),
inside the unchanged 0.85–1.15 gate. Every material luminance/RGB comparison,
neutral-card mist check, colour round-trip and camera-normal check passes.
The full suite passes 6,691 tests. The five prescribed real-world atmosphere
views remain the final VQ-06 capture step before biome composition.

The [five real-world atmosphere views](world-visual-quality-2026-10-14/fixtures/trees-world/report.json)
pass readiness and source-stability gates with zero browser errors. They include
original 07 in both prescribed directions and originals 06/08/09. Inspection shows
consistent lit canopies and distance atmosphere; the former washed-out cutout
contrast is reduced without retuning exposure. The current production build also
passes. VQ-06 acceptance is complete; VQ-07–13 remain to be implemented.

## VQ-07 climate and cold-biome composition

Procedural glaciers now require the prescribed cold, humid and elevated climate.
The remaining climate branches, base heights, river/sea geometry and imported
classification are unchanged. Tundra cover is 0.35, with meadow eligibility added;
glacier remains fully snowy and bare. Existing green forest-pack crowns prefer
taiga, and snow-painted alpine assets are limited to tundra. Terrain-material
recipe revision 4 invalidates derived pages without rewriting saved terrain.
Unedited procedural cells regenerate with the corrected current recipe on load.
The actual checkout's world format stays at version 6 and generator at version 1.

The focused classification/snow/persistence suite passes 15 tests.
[Source-contract verification](world-visual-quality-2026-10-14/biomes/source-contracts.json)
finds zero base/final height mismatches across 4,096 samples for each of the three
seeds and zero changes to 4,096 real imported IDs. Synthetic tests cover all
thirteen standard IDs, custom 32, its definition, and explicit height/tile edits
across the old glacier pose through save/load. Of the twelve old views, only
original 11 changes: glacier 11 becomes temperate deciduous forest 6.
The existing atlas signature includes variant eligibility, so all original assets
were refreshed with its new signature; every albedo/normal PNG is bit-identical
to the accepted VQ-06 pixels. No source asset or atlas dimension changes.
The frozen additional manifest and grounded classification captures are next.
