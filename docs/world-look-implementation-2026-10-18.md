# World look implementation — October 18, 2026

Implementation of the [October 18 visual plan](plans/aaa-look-and-feel-plan-2026-10-18.md).
Status: in progress. Acceptance results below are updated only after execution.

The baseline world survey completed all 18 requested poses with matching biome
IDs, complete readiness, 29 valid tree atlases/batches, fixed source and zero
browser errors. Original media remain under `docs/qa/visual-audit-2026-10-18/`.
The first supplemental motion attempt exposed a harness call to a nonexistent
wind accessor; the script now uses the QA diagnostics and preserves that failed
attempt in its report. Capture validity is separate from visual acceptance.

## Delivery status

| Item | Implementation | Acceptance |
| --- | --- | --- |
| R0 evidence | Eighteen baseline world poses; source/config/map hashes; targeted tree surveys and labeled identity overlays | Baseline and final stills pass, 18/18 each, fixed source and zero browser errors |
| R1 plant motion | Explicit asset motion profiles; rooted rigid fallback for leaves/shrubs; matching normals and conservative bounds | CPU tests and 48 GPU comparisons pass; final movement review pending |
| R2 plant appearance | Lit conversion for unlit natural plant GLBs; explicit flower roles; restrained grading; procedural flowers use terrain stem pigments and correct normals, cloud shadow and mist | Final authored/procedural four-light review passes 44 checks across both backends, including blackout controls |
| R3 grass/ground | Persistent stand-weighted substrate occlusion; lighter sparse roots | CPU tests, 284 ground checks, 54 LOD checks, 6 temporal checks and combined layer controls pass |
| R4 tree shapes | Leafless dead state; living crown height retained; authored species no longer receive a second narrow/wide squeeze | CPU tests and 1,112 representation/alpha/lighting GPU checks pass; same-instance world replay passes |
| R5 surfaces/contact | Coherent sand ripple districts with quiet gaps; stronger cool mineral substrate in near/far recipes | 456 GPU surface checks pass across four lights and both backends |
| R6 habitat composition | World-stable flower colonies, biome petal palettes; meadow bouquets excluded from taiga/rainforest | Worker/main tests, 18-view rollout and true marine check pass; expanded positions pending |
| R7 atmosphere/composition | Restrained daytime dust glints/pollen; neighborhood/ID survey and persistent layer controls | Eight diagnostic views pass, including a true marine cell; source geography retained |
| R8 motion/interaction/HUD/sound | Pending | Pending |
| R9 release/performance | Frozen hardware baseline; strict native focus control | Final verify passes, 6,861 tests; hardware movement matrix pending |

## Diagnosed causes

- Leafy bushes and ground details shared the grass tuft's height-dependent bend.
  Assets without authored branch/leaf pivots now use a restrained whole-plant
  rotation. This preserves broad-leaf shape while retaining the shared wind
  field. Grass keeps flexible bending; aquatic plants retain their current path.
- Procedural flowers used a fixed view-space up normal and omitted the cloud
  and regional mist wrappers. Their roots also used a global color independent
  of the meadow's biome palette. Authored blossoms now explicitly distinguish
  stems, petals and centers, protecting yellow petals from the green mask.
- Both authored flower GLBs explicitly declare `KHR_materials_unlit` on stems,
  petals and centers. Preserving their Basic material type kept them bright
  independently of the scene lights. Natural foliage now promotes Basic
  materials to Lambert nodes while retaining color, maps, UV transforms,
  cutout and sidedness. Generic cloning still preserves intentional unlit
  materials for other callers. Actual asset blackout tests now read zero
  luminance for both flowers and the leafy ground plant on both backends.
- Sparse grass roots were much darker than their floor. Root shading is lifted
  while a bounded habitat-density contribution darkens the substrate of dense
  stands in both near shading and the CPU distant palette.
- The prominent odd tree in pose 06 is `tree:-15:99:85`, prototype 22,
  `broadleaf_tall`, age `dead`, about 11.14 m from the camera. Its crown scale
  was 0.4388 while its green foliage remained. Dead leaves now mask out in
  geometry representations. Living crowns retain their branch envelope.

## Resource and data contract

No new scene pass, screen-color/depth copy, terrain IDs, mesh population or
residency range is introduced by R1–R4. Rigid plant motion adds one three-float
instance root attribute (12 bytes per allocated instance) to affected batches,
updated only when placement or anchor changes. Shader profiles share graphs;
seeds remain instance data. Flower palette lookup adds a small nearest-filtered
table per slot and reads the slot's existing tile texture; disposal releases
the table. Runtime counters and hardware captures will quantify the complete
cost before acceptance.

Dead trees retain their existing identity and trunk/collision geometry. Species
selection and Azgaar IDs are preserved. Tree atlas source geometry/materials
remain unchanged; per-instance appearance is applied at runtime.

The final rainforest pose records 449,225,116 tracked bytes versus 446,659,674
in the baseline (about +2.45 MiB, +0.58%). These are bounded resource-accounting
snapshots, not driver VRAM measurements or proof of a leak. Flower resource
accounting now includes its previously uncounted node-only textures. Both
captures use `cinematic-god-rays`, one finishing application and 49 water slots.
Streaming and recovery acceptance remains a separate movement gate.
Across all eighteen matched views, tracked totals increase by 2.16–4.74 MiB
(0.51–1.39%). The first desert view's larger difference is mostly retained
placement arrays. All eighteen tree placement counts match the baseline.

## World review and scope

The [18-view gallery](qa/world-look-implementation-2026-10-18/worlds/index.html)
uses the original poses and shows the dead snag without a green puff, fuller
living crowns, deeper leafy understory, coherent mineral/sand colors and quieter
flower distribution. The [baseline gallery](qa/visual-audit-2026-10-18/index.html)
retains the original images. Ordinary clean/HUD frames remain consecutive live
frames, not exact animation-phase image comparisons.

The taiga survey identifies the actual nearby conifer assets rather than
inferring species from the camera's biome label. The greener band beyond the
tundra includes trees rooted in neighboring ID 4 cells. Imported Eldara taiga
is ID 9 in all forty neighborhood samples, with configured conifer prototypes.
The rainforest's conspicuous pale trunk is authored `tree-scene/tree-02.glb`,
placement `tree:101:12:21`, species `tropical_tall`, not a terrain-ID migration.

The final diagnostic set passes all eight poses, nineteen captures and zero
browser errors. `marine-cell` is at X −2045, Z 1731, camera cell ID 0. Its aerial
camera stays above the water; the original two coast cameras remain on ID 4.
Distance-fog controls at 01/04/05 improve tree separation but do not reveal new
ridges. At radius 1,024 m, sampled source maxima are 4.98, 14.46 and 10.81 m
respectively. These forty-point neighborhood surveys are directional samples,
not an exhaustive terrain search. Regional mist and sky haze remain active in
the distance-fog control, and wind/particles remain live.

R7's opt-in geography extension is explicitly a separate, conditional versioned
stage in the plan. This pass preserves procedural generator version 1, imported
Eldara elevations and existing saves. Surface shading does not add mountains or
change collision. Snow, rocks, water, HUD and sound receive regression review;
their existing systems are not silently replaced on the strength of stills.

## Validation

- Initial `npm run verify` passes: 6,854 tests, lint, production asset validation
  and build. This precedes the R5–R7 follow-up and is not final release approval.
- R1–R4 candidate replay passes all 18 views, readiness, atlas integrity and
  biome checks with zero browser errors. The targeted candidate motion record
  also passes with twelve sampled frames.
- Focused CPU tests currently pass for rigid root/shape preservation, stable
  instance anchors, substrate means/custom IDs and tree morphology/LOD.
- Repository ESLint passes for the initial R1–R4 implementation.
- Release `npm run verify` passes after the sand wrap correction: 6,857 tests,
  lint, generated UI, required production assets and build; zero failed/skipped
  tests. The build retains existing bundle-size/dynamic-import warnings.
- Rigid plant GPU checks compare the production shader with a CPU reference
  under yaw, nonuniform scale and million-metre placement. All 24 cases per
  backend have silhouette ratio 1 on WebGPU and WebGL.
- Ground continuity passes 142 checks per backend, including six new hot/cold
  substrate wrap controls. Maximum wrap mean error is 0.00001154 on WebGPU and
  0.00000956 on WebGL, below the 0.0005 limit.
- Intermediate world capture at production revision `b32eab78` passes all 18 views,
  fixed source, matching IDs, complete assets/readiness and zero browser errors.
  A later authored-lighting correction is frozen at `75fbb126`; its final replay
  and matrix are separate from that intermediate evidence.
- Remaining GPU lighting/movement/performance results are pending. Pending rows
  above are not release claims. Failed attempts remain labeled and retained.
- Final `npm run verify` after the authored lit conversion passes all 6,861
  tests, lint, generated UI, production assets and build. The added tests cover
  paint/cutout preservation, Basic-node promotion, intentional unlit callers and
  agreement between authored bush and proxy lighting.
- Final source `75fbb126` passes the repeated 18-view world capture, eight-view
  diagnostic set and low/balanced/high preset review at rainforest and tundra.
  Original media and earlier attempts remain retained separately.
