# Grass-test additions to the world builder

Date: 2026-10-05. Implementation is present; integrated hardware acceptance is in progress.

The work follows [the remaining-value plan](plans/grass-test-remaining-value-plan-2026-10-04.md).
The donor was inspected at `95cc587`. The host started at `1a876ea` and was updated
to `origin/main` at `a4e2215` during implementation. Measurements from before that
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
- Captures run after the main draw using remaining shared deferred allowance
  reserved immediately before that draw. Main shadow maps, MRT, target face/mip,
  overlay visibility and auxiliary vegetation state are restored after failures.
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

## Verification

`npm run verify` after the merge passes production asset validation, all **3,141
tests**, the natural-UI check and the production build. Behavioral coverage
includes async diagnostic disposal, capture restoration, complete probe
publication, planar clipping/rebase cadence, conservative camera changes,
off-screen impostors, local road queries, resident-only lanterns, semantic
promotion/history/save and world-preserving quality handoff.

The controlled actual-WebGPU fixture passed all 29 post-processing variants
plus snow slopes, packed paths, cube/planar reflections, two cascades, night
and a 4096 m rebase with zero browser/shader errors. Its recorded adapter is
NVIDIA Lovelace, non-fallback, at 1280×720. Reports and images are in
`tmp/grass-test-remaining/feature-fixtures-hdr.*`.

Full-world all-features boot passed with zero errors before the merge. Integrated
movement, visibility comparisons, full water acceptance and imported-road
editing are being rerun on the combined checkout. These checks remain pending
until their hardware reports are complete. The strict 144 Hz / 6.94 ms target
is not established by the 33.3 ms stress gate.

## Reproduction

Use one hardware rendering browser at a time and freeze source files throughout
each capture. Run the existing [movement QA](perf-qa.md) harness for performance.
The additional small visual fixture is a dev-server page, not a benchmark:

```powershell
rtk proxy node scripts/run-render-enhancements-qa.mjs --url "http://127.0.0.1:5180/scripts/fixtures/render-enhancements.html?features=1&snapshots=1" --out tmp/grass-test-remaining/feature-fixtures.json
rtk proxy node scripts/run-render-enhancements-qa.mjs --url "http://127.0.0.1:5180/?profile=1&roadsideLanterns=1" --roadside --timeout 240000 --out tmp/grass-test-remaining/roadside.json
rtk proxy node scripts/run-perf-matrix.mjs --headed --url http://127.0.0.1:5180 --warmup 8 --duration 12
rtk proxy npm run verify
```

Copied Snowflow noise math retains its MIT notice in `THIRD_PARTY_NOTICES.md`.
Other additions adapt donor behavior to the host's existing resource and
semantic owners; already-published asset licenses remain in force.
