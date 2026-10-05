# Grass-test additions to the world builder

Date: 2026-10-05. Implementation and acceptance runs are complete, with the
failed stress gates and unverified recovery/mobile paths recorded below.

The work follows [the remaining-value plan](plans/grass-test-remaining-value-plan-2026-10-04.md).
The donor was inspected at `95cc587`. The host started at `1a876ea` and was updated
to `origin/main` through `b12be2a` during implementation. Measurements from before that
merge are historical references, not a direct comparison with the merged runtime.

## Available behavior

| Addition | Ownership and behavior | Default |
| --- | --- | --- |
| Startup diagnostics | Existing startup report gains bounded spans, shader sizes, sampler counts and renderer creation timings. Enabled by `profile=1` or `assetQa=1`. | Off |
| Detail visibility | Ground detail and tropical plants use resumable conservative selections, with complete resident batches for large turns and auxiliary cameras. No placement or collision change. | Off; adoption requires measured benefit |
| Water reflections | Scene-owned pair of HDR cube targets; one face per eligible frame, publish only after all six faces complete. Flat lake/sea reflection adds one overscanned planar target. Rivers use cube/sky fallback. | Off |
| Sun shadows | Two fading cascades under the existing sun, with the main camera retained during captures. Mobile uses one map. | One map |
| Snow relief | Filtered wind-shaped relief, multiple texture scales, slope projection and packed paths/footprints. No authoritative height change. | On |
| Roadside lanterns | Indexed imported roads near settlements, paired 40 m stations, resident-only batched decoration, sparse semantic suppression and promotion to ordinary authored objects. | Off |

In edit mode, open **World details** to enable town-road lanterns, keep individual
lanterns as objects, suppress them, or change visual quality. Applying shader
quality reloads through the existing world-preserving scene-settings handoff.
Quality choices are saved with scene settings; roadside choices are saved with
the world and participate in undo/redo. Flat-water reflections extend the local
water-reflection mode and use its completed cube as fallback.

Configuration lives in `config/render-enhancements.yaml`. Development query
overrides include `enhancements=high`, `detailVisibility=1`, `waterCube=1`,
`waterPlanar=1`, `shadowCascades=2`, `snowRelief=0` and `roadsideLanterns=1`.
Mobile clamps reflection capture and cascades off. Disabled capture modes own no
targets; disabling roadside decoration releases its asset lease and batches.

## Resource and persistence contracts

- Reflections retain two fixed cube targets and at most one planar target. At
  resolution 256 their RGBA16F color storage is approximately 7 MiB including
  planar color, excluding depth, driver padding and renderer metadata. Capture
  CPU time and pass counts are reported separately from frame times.
- Captures receive a sparse early reservation from the single shared allowance
  and run after the main draw. The reservation debits the allowance immediately;
  completion books actual CPU time, including overruns. Main shadow maps, MRT, target face/mip,
  overlay visibility and auxiliary vegetation state are restored after failures.
  World/camera invalidation runs even without capture time. Underwater scene
  passes keep the same main-camera hooks. Disabled adaptive scheduling still
  permits captures; cancelled and stale reservations cannot run later.
- Visibility retains full resident buffers, increasing memory. Its eligible and
  submitted counts, CPU time, upload bytes and retained bytes are exposed in
  performance counters. The complete source manifests remain canonical.
- Lantern identity hashes source route identity and geometry, station and side;
  array reorder and different residency order preserve those keys. Generated
  meshes are absent from world documents. Promotion stores source provenance,
  fine position/height and yaw, and uses the normal object edit/history path.
- Standard Azgaar biome IDs and custom biome allocation are unchanged.

## Compatibility prerequisites

The initial checkout lacked required ignored runtime assets. Missing local
assets were restored from the donor and matching `SimCity-DnD` assets; runtime
paths refer only to this project. Production asset validation passes. Resident
LOD metadata and its binary were regenerated for the locked meshoptimizer 1.3
dependency. No dependency version was changed.

The pinned Three 0.186.1 backend emitted samplers for texture-load-only inputs,
exceeding the hardware limit in terrain materials. A small renderer adapter
removes only unused sampler declarations/bindings and renumbers all shader
stages without mutating cached groups. Terrain bake inputs use sampler-free
bilinear loads. The upstream tone-mapping fix was retained during the merge;
it handles computed DoF colors and the current RGBA tone-mapping return type.

Weather acceptance exposed another renderer compatibility issue: custom
`fragmentNode` outputs bypassed the scene pass's normal, velocity and material
attachments. Weather now supplies shared color/opacity nodes through the
standard material path, preserving those outputs and particle metadata. A small
actual-renderer regression fixture reproduces the original missing-output
failure and passes both single-output and four-output rendering after the fix.

## Verification

`npm run verify` after the merge passes production asset validation, all **3,148
tests**, the natural-UI check and the production build. Behavioral coverage
includes async diagnostic disposal, capture restoration, complete probe
publication, planar clipping/rebase cadence, conservative camera changes,
off-screen impostors, local road queries, resident-only lanterns, semantic
promotion/history/save and world-preserving quality handoff.

The controlled actual-WebGPU fixture passed all 29 post-processing variants
plus snow slopes, packed paths, cube/planar reflections, two cascades, night
and a 4096 m rebase with zero browser/shader errors. Its recorded adapter is
NVIDIA Lovelace, non-fallback, at 1280×720. Reports and images are in
`tmp/grass-test-remaining/feature-fixtures-final.*`. The translated fixture keeps
the hemisphere-light direction fixed; its world position is not a light anchor.

Three standard movement repeats on the merged runtime passed settle, collision,
recovery and error gates:

| Run | FPS | Frame p50 / p95 / p99 (ms) | Hitch rate | Settle wait |
| --- | ---: | --- | ---: | ---: |
| 1 | 146.93 | 6.6 / 9.0 / 11.417 | 0.06% | 27.2 s |
| 2 | 150.91 | 6.4 / 8.7 / 10.892 | 0% | 22.8 s |
| 3 | 149.87 | 6.5 / 8.8 / 11.608 | 0.06% | 26.9 s |

Reports are `tmp/grass-test-remaining/merged-standard-{1,2,3}.json`. Their runtime
was `2c429b7` plus the saved `merged-runtime.patch`; the same rendering changes
were subsequently committed in `f52cb9e`. The later underwater-hook correction
does not change their dry-land path. GPU timestamps were unavailable; renderer
API timings are CPU wall time.

The merged stress matrix **failed**. Every movement case settled, but high grass
and dense mixed had 2.87% and 2.56% hitches against the unchanged 2% limit.
Construction passed at 19.94 ms p95 and 0.65% hitches. Water completed all route
transitions with zero GPU errors, but a 64.9 ms caustic post-effect draw failed
its 4 ms gate. This failure excludes the scene pass; the corresponding pipeline
maximum was 67.5 ms. Preserve `merged-matrix.json` as a failed result regardless
of later isolated rechecks. The strict 144 Hz / 6.94 ms target remains unmet.

Imported-road browser acceptance passed with 22 generated lanterns in five
batches, promotion, undo/redo and save/load, with zero errors on the same adapter.
The fixture imports the real bundled map at an explicit 512 km width, settlement
240, and canonical coordinates near (-178 km, 50 km). This bounds loading cost;
it does not validate the map's original campaign-scale import time. The original
scale attempt was cancelled before acceptance. Report: `roadside-bounded-final.json`.

Visibility stays **off**. Three alternating dense-forest diagonal pairs all
settled on hardware WebGPU without errors, but did not establish a repeatable
frame-time benefit:

| Pair | Off p95 / p99 (ms) | On p95 / p99 (ms) | Off / on settle (s) | Off / on recovery within 15 s |
| --- | --- | --- | --- | --- |
| 1 | 9.1 / 13.090 | 16.345 / 29.316 | 22.6 / 45.4 | Yes / No |
| 2 | 15.1 / 28.964 | 10.8 / 13.842 | 38.7 / 52.3 | No / No |
| 3 | 8.8 / 13.264 | 8.7 / 11.784 | 23.1 / 28.6 | Yes / Yes |

Median p95 was 9.1 ms off and 10.8 ms on, with wide variation in both modes.
Uploads rose from 0.694–0.727 MB to 1.111–1.143 MB per run. Full resident copies
retained 4,472,876 bytes at the initial density. End-of-motion snapshots prove
that selections reduced submitted ground detail to 109 of 651 and tropical
plants to zero in one pair; another ended in conservative tropical fallback.
Fewer instances did not justify adoption. Keep the configuration/query option
as an explicitly disabled experiment. Reports: `merged-visibility-{0,1}-{1,2,3}.json`.

The 60 s route and 60 s same-browser revisit with a midpoint 180-degree turn
passed settle, collision, frame and error checks. Frame p95 was 12.4 / 11.4 ms;
hitch rates were 0.14% / 0.06%. Post-stop readiness took 9.45 / 1.22 s. Report:
`merged-revisit.json`.

An isolated default-water recheck after the underwater-hook correction passed
every water gate with zero GPU errors. Keep the earlier matrix failure visible;
one successful retry does not establish that the caustic spike cannot recur.

The high-quality full water route also passed every gate with zero errors and
complete preparation at both ends. Frame p50/p95/p99 was 7.0/9.8/13.0 ms, with
0.04% hitches; the post-effect maximum was 0.2 ms and the pipeline maximum 6.7 ms.
Its counters recorded 549 cube-face renders and 82 planar captures across boot,
settle and measurement, proving that refresh work runs under the shared budget.
During measurement, capture CPU time per frame containing capture work was
3.1 ms p95 and 5.8 ms maximum. Individual renderer calls are atomic and can
overrun the 1.2 ms reservation; actual CPU time is charged, not hidden.
The isolated default recheck had p95 9.3 ms. These single runs describe costs;
they do not establish a repeatable incremental speed difference. Keep reflections
and cascades opt-in. Reports: `merged-water-default-recheck.json` and
`merged-water-high.json`.

Imported-asset acceptance passed 144 catalog entries and ten GPU fixtures,
including albedo/normal uploads, with zero shader errors. Procedural-texture
acceptance also passed. Reports: `merged-assets.json` and `merged-textures.json`.

Startup diagnostics passed two fresh browser contexts with HTTP cache disabled
and two visits sharing a context with HTTP cache enabled. Navigation to first
frame was 52.50 / 53.77 s with cache disabled, and 51.77 / 48.62 s for first/repeat
cached visits. Assets had zero failures. These records distinguish browser
cache policy; OS and GPU-driver caches were not cleared. Reports:
`merged-startup-cold.json` and `merged-startup-repeat.json`.

Exploration acceptance passed the scenic tour, imported settlement, residents
and serpents. Device-loss recovery released owned resources and began a new
boot, then made no visible progress after reaching prewarm for over 14 minutes.
That run was cancelled. Recovery and its later mobile phase remain unverified;
there is no completed exploration report. Preserve `merged-exploration.log`.

Full-scene weather acceptance passed all six modes on hardware WebGPU at
1280×720 after the MRT correction: `merged-weather-final.json`. Each mode has
a captured image and zero shader/runtime errors. The minimized hardware
regression also passes all six weather modes with zero
errors: `weather-mrt-before.json` preserves the failure and
`weather-mrt-after.json` records the fixed path. The original full-scene failure
is retained in `weather-profile-failure.json`. It overlapped another worktree's
GPU QA, so its timing is not performance evidence. Earlier movement, matrix,
water, visibility and startup captures finished before that other browser began.

## Reproduction

Use one hardware rendering browser at a time and freeze source files throughout
each capture. Run the existing [movement QA](perf-qa.md) harness for performance.
The additional small visual fixture is a dev-server page, not a benchmark:

```powershell
rtk proxy node scripts/run-render-enhancements-qa.mjs --url "http://127.0.0.1:5180/scripts/fixtures/render-enhancements.html?features=1&snapshots=1" --out tmp/grass-test-remaining/feature-fixtures.json
rtk proxy node scripts/run-render-enhancements-qa.mjs --url http://127.0.0.1:5180/scripts/fixtures/weather-mrt.html --out tmp/grass-test-remaining/weather-mrt.json
rtk proxy node scripts/run-weather-shader-qa.mjs --headed --url "http://127.0.0.1:5180/?profile=1" --width 1280 --height 720 --timeoutMs 240000
rtk proxy node scripts/run-render-enhancements-qa.mjs --url "http://127.0.0.1:5180/?profile=1&roadsideLanterns=1" --roadside --timeout 240000 --out tmp/grass-test-remaining/roadside.json
rtk proxy node scripts/run-perf-matrix.mjs --headed --url http://127.0.0.1:5180 --warmup 8 --duration 12
rtk proxy npm run verify
```

Copied Snowflow noise math retains its MIT notice in `THIRD_PARTY_NOTICES.md`.
Other additions adapt donor behavior to the host's existing resource and
semantic owners; already-published asset licenses remain in force.
