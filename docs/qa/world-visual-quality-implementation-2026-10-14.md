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

| Task | Current result | Implementation / evidence |
| --- | --- | --- |
| VQ-01 | Passed focused tests and 20 long cuts | `ff5b9339`; [cuts](world-visual-quality-2026-10-14/runtime-cuts/report.json) |
| VQ-02 | Passed two fresh twelve-pose preparation runs | Runtime preparation and placement identity checks retained below |
| VQ-03 | Incomplete: resource peak baseline and final aggregate acceptance remain | Baseline route passed; baseline matrix failed and remains visible |
| VQ-04 | Passed hardware WebGPU and WebGL drift checks | [Surface evidence](world-visual-quality-2026-10-14/fixtures/drift/report.json) |
| VQ-05 | Passed 108 CPU/shader substrate checks | `4b9818c3`; evidence retained below |
| VQ-06 | Passed 276 tree/atmosphere checks and five world views | `5ae86e1f`; current VQ-09 atlas refresh still needs the final rerun |
| VQ-07 | Passed classification, import, height and persistence checks | `74bc616d`; frozen review manifest retained |
| VQ-08 | Passed 16 boundary captures and original-02 revisit | `c039c336`; [boundary evidence](world-visual-quality-2026-10-14/fixtures/grass-boundary/report.json) |
| VQ-09 | Growth and both-backend LOD checks passed; complete imported/coast acceptance pending | [Growth](world-visual-quality-2026-10-14/fixtures/growth-biomes/report.json), [LOD](world-visual-quality-2026-10-14/fixtures/meadow-lod/report.json) |
| VQ-10 | Implemented; bend/recovery units passed; original-08 browser sequence pending | `3e399cd2`, `e4bb82e4` |
| VQ-11 | Passed 25 HUD checks and 12 layouts; post-processing regression suites pending | `d032b386`; [HUD evidence](world-visual-quality-2026-10-14/fixtures/hud/report.json) |
| VQ-12 | 36 lighting views and both-backend temporal checks passed; motion acceptance pending | [Lighting](world-visual-quality-2026-10-14/lighting/report.json), [temporal](world-visual-quality-2026-10-14/fixtures/temporal/report.json) |
| VQ-13 | Incomplete; final verify, performance, resources and aggregate evidence required | No release-complete claim |

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

The [classification captures](world-visual-quality-2026-10-14/biomes/classification-world/report.json)
pass readiness and frozen expected-biome checks at original 11 (now biome 6) and
additional-11-1 (glacier 11), without browser errors. Inspection confirms that
the warm lowland ice patch has become ordinary vegetation; the new cold-climate
patch remains snowy. The [frozen review manifest](world-visual-quality-2026-10-14/biomes/procedural-review-poses.json)
contains 24 additional views, selected after 22,842 candidates, giving three
views per land biome with the required 512-metre additional-view separation.
The full suite passes 6,695 tests. VQ-07 acceptance is complete.

VQ-08 is implemented and accepted. Surface-mask G now stores the prescribed
8 m inward chamfer fringe; core and halo share snow classification, float32
height precision and half-float water precision. Worker preparation and the
synchronous fallback use that field, and edit invalidation includes its halo.
Meadow compaction bilinearly reads G and rejects candidates with the canonical
integer hash channel 1201 before writing buffers; accepted strength starts at
0.30 + 0.70 E. The far terrain bake reads the same bilinear coverage. The derived
material recipe is revision 5; canonical terrain and mask channel layout remain
unchanged.

The new coverage and compaction tests exercise half-plane/diagonal/island,
uniform, snow, water, negative-coordinate and edited-corner fixtures, exact
worker/fallback/overlapping-page bytes, 100000 candidates at four coverage
levels, reversed traversal, rebasing and independent forest rejection. The full
suite passes **6703/6703**, and the production build passes.

The [hardware boundary fixture](world-visual-quality-2026-10-14/fixtures/grass-boundary/report.json)
passes eight poses on each of WebGPU and WebGL (interior/edge boundaries,
2/8/30/70 m, eye height 1.7 m), with zero browser errors. Both production
blade/card layers are fully prepared. Counts show zero ineligible roots and
zero full-strength roots inside the 8 m fringe; the closest full-strength root
is 9.0009 m inside eligibility. A separate grass-hidden render proves actual
visible grass in every screenshot (238543–648361 changed pixels on WebGPU).
An initial local capture incorrectly reset publication time to zero; those
invisible images are not acceptance evidence. The final fixture preserves the
publication fade and includes this visibility check.

The [original cold-desert revisit](world-visual-quality-2026-10-14/fixtures/grass-world/report.json)
also passes complete readiness with zero browser errors at the unchanged pose.
VQ-09 through VQ-13 and final performance/resource acceptance remain outstanding.

The user's 2026-10-15 path review exposed another meadow integration defect:
terrain renders the configured natural-trail contour, but the meadow's sampler
only read painted-road R. Near blades and far cards therefore survived in the
visible trail. The reference Gods' End repository removes excluded candidates
in `src/grass/compactGrassGeometry.js`, using a 0.5 m path clearance from
`src/grass/vegetationPolicy.js`.

Meadow placement now evaluates the existing canonical natural-trail contour,
uses its configured 0.42 clearing threshold, and applies that 0.5 m clearance
before publishing either representation. Painted tread is also rejected. The
remaining verge potential is passed to near-blade wear/pigment. No density,
terrain distribution, sampler texture or instance attribute is added. Sampling
normalizes settings once and reuses its result object; a gradient bound skips
clearance probes away from trails. The revision key includes this policy.
Focused tests pass, including 100000 near/card candidates with zero trail-core
roots, stable canonical identities after rebasing, and canonical contour parity
at large coordinates. Browser proof and streaming-sensitive performance remain
pending; this is not yet release acceptance.

The [path-clearing browser fixture](world-visual-quality-2026-10-14/fixtures/path-clearance/report.json)
now passes all six natural/painted-path views on each backend, with zero browser
errors. At 8, 30 and 70 m, both published representations contain zero roots in
natural or painted treads, with more than 199000 blades and 217000 cards where
eligible ground remains. The production terrain material and grass materials
are used in these controlled flat scenes; the screenshots show the clear tread.

The [first full VQ-09 composition attempt](world-visual-quality-2026-10-14/biomes/composition-before-path-fix/report.json)
is **failed**, preserved with its complete captured artifacts. It used immutable
source/atlas snapshot `7a7242b9`, before the user's subsequent path correction.
Thirteen poses settled, then `additional-10-2` exceeded 120 seconds with 112 tree
and 19 rock manifest jobs outstanding. Terrain and collision were ready and no
browser error was recorded. The readiness timeout is not waived; the remaining
composition/imported/marine acceptance still needs a successful run.

VQ-10's arc/recovery implementation is committed at `3e399cd2`. All 101×101
press/height sweeps for every profile, root/upright/rebase checks, equal-time
30/60/144 Hz recovery, float scrolling, final-empty upload and spell preservation
checks pass. The full suite at that stage passed **6720/6720**. Its real-world
stamped/recovered captures and final movement/performance gates remain pending.

VQ-11's presentation code is implemented: metrics default off with persistent
preference and no renderer sampling while disabled; F8/Escape/edit-mode capture
policy, modal/loading/error guards, presentation-only visibility, specified
legend/metrics backing and the fixed vignette/grain values. The focused state
checks pass; the new real-browser HUD suite verifies actual input, layout,
contrast, state preservation and cleanup. Browser acceptance is pending.

VQ-09's [isolated biome appearance fixture](world-visual-quality-2026-10-14/fixtures/growth-biomes/report.json)
passes all 49 existing rebase/backend/distinction checks, without relaxed
thresholds, and 13 numerical growth checks per backend. Each numerical check
reads 10000 actual production-node evaluations: height/width remain within the
specified row, density uniform matches the CPU profile, and card height equals
near height ×1.125. IDs 5/6/10 are included. The tree atlas refresh validates all
29 prototypes with signature `tree-impostor-v7-2e68faa7`; 54 of 58 PNGs are bit
identical. Four albedos differ in only 44 of 4194304 decoded channels in total
([raw differences](world-visual-quality-2026-10-14/fixtures/growth-biomes/atlas-pixel-differences.json));
there is no claim of an entirely bit-identical rebake. Final tree/LOD/world
acceptance still applies to these refreshed assets.

VQ-11's [real-world HUD suite](world-visual-quality-2026-10-14/fixtures/hud/report.json)
passes **25/25 checks** with zero browser errors on hardware WebGPU. Twelve
screenshots cover sand, snow, woodland and the frozen marine coast at 1600×900,
1280×720 and 760×600. No legend/minimap/spell-dock/metrics boxes overlap; minimum
composited contrast is **7.1726:1** over white, black, sand and water backgrounds.
The actual DOM tests cover metrics persistence and zero sampling while disabled,
F8/repeat/text-focus rules, Escape restoring then pausing, edit-mode restoration,
modal/loading/error refusal, capture state preservation and listener disposal.
Metrics restore the renderer's original reset method when disabled. The existing
8-second introduction remains; the tagline is removed. The full suite passes
**6726/6726**, lint passes and production build passes. The separate legacy
post-processing command was attempted against an absent default server at 5173
and timed out before launching a browser; this is not an accepted render test.
Its required native-browser run remains pending.

The previously failing tundra pose settles successfully in a fresh session at
`282d1958`. That does not erase the failed ordered review: an ordered rerun now
records prepared-field windows/missing dependencies and resumable manifest
stages, so a cache/order-dependent stall can be distinguished from cold loading.

VQ-12 harness work is in progress. Motion input now runs immediately before the
real player update and samples after the successful world render. Its elapsed
clock uses the owner's actual update timestamp and the same 0.05 s delta clamp
as `stepPlayerPhysics`, with tests against actual movement distance. It records
canonical player/camera poses, contacts, input, queues, near eligible/published
meadow keys and interaction peak; it does not replace collision or movement.
The new lighting runner creates a fresh context for each of 36 pose/light pairs,
advances the real wetness clock for 20 seconds, checks static sky/light/fog
convergence for 60 frames below 0.001, then requires full scenery readiness.
These new motion/lighting captures have not yet passed browser acceptance.

## October 15 capture and movement validation progress

The ordered composition rerun at frozen runtime `282d1958` reached 36 settled
poses, including the previously failing tundra location. It then failed at the
aerial coast capture because the first DOM canvas was hidden. Terrain, scenery,
collision and browser-error gates were all clear at that failure. The [raw
failure report and screenshot](world-visual-quality-2026-10-14/biomes/capture-selector-failure/README.md)
are preserved. This is a capture-selector correction, not a proven explanation
for the earlier manifest-queue timeout. `40bfb889` captures the renderer's actual
canvas. The 17 remaining aerial/imported cases still require a rerun.

The permanent movement runner records after full preparation, using Playwright's
late-start screencast. It saves actual recorder frame times and verifies output
codec, dimensions and frame rate through FFmpeg metadata. Contact sheets select
recorded frames nearest the player simulation markers; wall-clock stalls do not
shift the simulation sequence. Unit tests reject stale setup, unreleased input,
nonfinite poses, disabled collision and scenery recovery beyond two seconds.

The authored synthetic fixture is exactly 256 m square, with flat height 24 m,
grassland ID 4 and temperate forest ID 6. It loads through ordinary document
overrides and real workers, residency and collision. It selects the first clear
straight lane from ascending 2 m candidates using production collision queries
with a conservative 1 m capsule. It does not disable colliders or raise budgets.
The runner visits distant regions until original terrain and source manifests
are evicted, then returns and compares sorted placement IDs and growth profiles.
These browser gates are implemented, not yet accepted.

New isolated fixtures measure the production meadow handoff over a fixed 8×8 m
projected ground rectangle at 40/45/50 m, and production cinematic output after
a one-second 180-degree tree pan. The temporal fixture collects both timed frames
before file/screenshot handshakes, freezes only wind/grain/particles, and compares
against a newly constructed stationary owner outside the prescribed two-pixel
silhouette dilation. Numerical surface/tree runners now support all four lighting
states without changing their existing thresholds.

The original-08 interaction runner retains untouched, cleared, stamped and
one-second recovery captures, published strength and habitat distributions, and
CPU patch-height references. Its controlled stamp uses the configured body
radius. Production settings are restored in a finally block. Motion also
observes the existing AudioContext and ambience owner, stored mute state, and
finite advancing wind; listening quality is explicitly not automatically graded.

New reports identify Node harness source hashes separately from the immutable
browser runtime source. A frozen server now rejects source modules absent from
its archive, preventing a newly added live file from masquerading as old source.
The focused motion/synthetic tests pass 10/10; lint and whitespace checks pass.
Full repository verification and the browser gates above remain outstanding.

## October 15 completed lighting, LOD and temporal checks

The [lighting run](world-visual-quality-2026-10-14/lighting/report.json) passed all
36 fixed pose/light pairs on hardware WebGPU with zero browser errors. Its
immutable runtime is `8411c8e2`; the Node runner was launched at `40bfb889`, before
separate harness provenance was added. Each pair used a fresh context, the actual
20-second wetness response, 60 stable lighting frames and complete scenery
readiness. These images establish successful capture and convergence; they do
not replace the four-light numeric surface/tree checks still required.

The [meadow LOD fixture](world-visual-quality-2026-10-14/fixtures/meadow-lod/report.json)
passed 27 comparisons on each backend at runtime `dc13a2e8`. It renders the actual
production blades/cards for all nine growth biomes over the same projected
8×8 m ground rectangle at 40, 45 and 50 m. Every comparison satisfies the original
five-percentage-point occupancy and 12-byte median RGB limits. The 54 images and
raw per-comparison values are retained.

The [temporal fixture](world-visual-quality-2026-10-14/fixtures/temporal/report.json)
also passed both backends at `dc13a2e8`, with zero browser errors. A measured
180-degree pan takes one second; samples at 0.25 and 1 second after stopping
compare the actual cinematic owner against a new stationary owner. Both have
zero changed pixels outside the prescribed two-pixel tree silhouette dilation.
The pan timing check is recorded separately. Wind, grain and particles alone are
frozen for this measurement.

The initial motion smoke run is not accepted. Its browser revision predates
new foot-height fields expected by the runner, and its screencast timestamps
were incorrectly treated as seconds rather than milliseconds. Schema version 2
now rejects that mismatch and contact-frame alignment uses the recorder's actual
millisecond timestamps. The run also exposed a real meadow preparation bug:
third-person cameras can occupy a neighbouring chunk while streaming follows the
player. `b58043b0` checks the captured streaming-focus generation instead of
requiring the camera and focus chunks to match. The actual field regression test
passes, including cancellation after a focus mutation; hardware motion and
performance acceptance still require fresh captures.

## Ocean repetition follow-up

The user's aerial ocean image prompted fixed-pose layer isolation at
`(-2077,1731)`, with the water clock held at 123.4 seconds. Inspection found that
the sea foam sampled the periodic wave-height channel of the normal texture,
repeating it every 5.263 m. Whitecap breakup also sampled sub-four-metre sine
patterns at vertices on the two-metre water grid. `1eb2203b` gives surf and
whitecaps a shared, domain-warped world field evaluated per fragment. It uses
bounded chunk origins, adds no texture, geometry or pass, and preserves the CPU
and rendered wave-height formulas.

The [production shader fixture](world-visual-quality-2026-10-14/fixtures/water-foam/report.json)
passed 27 checks on each hardware backend with zero browser errors. Checks cover
range/variation, both former tile offsets and twice those offsets, adjacent
chunk origins, an eight-million-metre render-origin shift and animation. Maximum
absolute correlation at the former repeat offsets is 0.209; maximum seam error
is 0.000112, below the fixed 0.001 limit. Origin shifts change no sampled values.

The first full-scene isolation shows the small white shapes remain with foam
disabled. They must not be reported as fixed by the foam-field tests. Expanded
water, sea, reflection, refraction, caustic and sun-highlight controls are being
captured to identify their visible source. Scene-level acceptance and performance
checks for this follow-up remain pending.
