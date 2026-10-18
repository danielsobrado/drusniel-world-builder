# World look implementation — October 18, 2026

Implementation of the [October 18 visual plan](plans/aaa-look-and-feel-plan-2026-10-18.md).
Status: implemented and validated. The final visual, movement and hardware
performance gates pass. Optional geography and subjective listening remain the
separate review limits described below.

The four reported defects have concrete fixes: leafy plants retain their shape
in the wind, flowers respond to scene lighting and biome pigments, grass roots
blend more gently into their substrate, and dead trees no longer carry compact
green crowns. The pass also improves sand/mineral separation, flower colonies
and daytime airborne effects.

[Before/after comparison](qa/world-look-implementation-2026-10-18/worlds/review-comparison.jpg) ·
[Final 18-view gallery](qa/world-look-implementation-2026-10-18/worlds/index.html) ·
[Original gallery](qa/visual-audit-2026-10-18/index.html)

## Delivery status

| Item | Implementation | Acceptance |
| --- | --- | --- |
| R0 evidence | Eighteen baseline poses; source/config/map hashes; targeted tree surveys and labeled identity overlays | Baseline and final captures pass 18/18 each, complete readiness, 29 valid tree atlases and zero browser errors |
| R1 plant motion | Explicit asset motion profiles; rooted rigid fallback for leaves/shrubs; matching normals and conservative bounds | CPU tests, 48 GPU reference comparisons and all ten movement clips pass |
| R2 plant appearance | Lit conversion for natural plant GLBs; explicit flower roles; biome pigments; correct procedural normals; cloud shade and regional mist | Final authored/procedural four-light fixture passes 44 checks across WebGPU/WebGL, including blackout controls |
| R3 grass/ground | Persistent stand-weighted substrate occlusion; lighter sparse roots | CPU tests, 284 ground checks, 54 LOD checks, 6 temporal checks and combined layer controls pass |
| R4 tree shapes | Leafless dead state; living branch envelope retained; authored species avoid a second aspect squeeze | CPU tests and 1,112 representation/alpha/lighting checks pass; same-instance world replay passes |
| R5 surfaces/contact | Sand ripple districts with quiet gaps; cooler mineral substrate in near/far recipes | 456 surface checks pass across four lights and both backends; existing snow/rock/contact systems retained |
| R6 habitat composition | Stable flower colonies and biome petal palettes; meadow bouquets excluded from taiga/rainforest | Worker/main tests, 18 original views, 24 additional land views and a true marine-cell check pass |
| R7 atmosphere/composition | Restrained daytime dust glints/pollen; neighborhood/ID survey and persistent layer controls | Eight diagnostic views and 19 captures pass; source geography retained |
| R8 motion/HUD/sound | Walk, sprint, turn, stop and return checks in both camera modes; HUD and audio lifecycle review | Ten clips pass 170 checks, including synthetic eviction/return; four HUD resolutions pass; listening quality remains a manual review |
| R9 release/performance | Frozen sources, hardware WebGPU and strict native/DOM focus checks | Full verify passes 6,862 tests; complete baseline and candidate matrices pass, including recovery, collision and water |

## Diagnosed causes and changes

Leafy bushes and ground details shared the grass tuft's height-dependent bend.
Assets without branch or leaf pivots now use a restrained, rooted whole-plant
rotation. This preserves broad-leaf shape and uses the shared world wind and
clock. Grass keeps flexible bending. The production shader matches a CPU
reference under yaw, nonuniform scale and million-metre coordinates on both
backends; all 24 silhouette comparisons per backend have ratio 1.

Procedural flowers used a fixed view-space up normal and omitted cloud shade
and regional mist. Their roots also used a global color independent of the
meadow palette. Flowers now rotate their real normals with placement and bend,
share terrain stem pigments, and use muted biome petal palettes. Authored stems,
petals and centers have explicit roles, protecting yellow petals from the green
stem mask.

Both authored flower GLBs declare `KHR_materials_unlit` on all their parts.
Keeping Basic materials made them bright independently of scene lights. Natural
foliage now promotes Basic materials to Lambert nodes while retaining paint,
maps, UV transforms, cutout and sidedness. Generic cloning preserves intentional
unlit materials for other callers. Both flowers and the leafy ground plant
record zero luminance in actual-asset blackout controls on both backends.
Authored understory, bush meshes and bush proxies also share the existing cloud
shadow wrapper; it attenuates direct sun while retaining ambient light.

Sparse grass roots were much darker than the floor. Root brightness rises from
0.6 to 0.8 and root lift from 0.28 to 0.60; canopy depth drops from 0.5 to 0.35.
A bounded habitat-density contribution adds substrate depth beneath dense stands
in both near shading and the distant CPU palette. Sparse habitats remain open.
The pigment field is world-stable rather than following the camera. Ground
wrap error remains below 0.000012 on both backends against a 0.0005 limit.

The prominent odd tree in pose 06 is `tree:-15:99:85`, prototype 22,
`broadleaf_tall`, age `dead`, about 11.14 m away. It had crown scale 0.4388 with
green foliage. Dead leaves now mask out across geometry representations and
canopy aggregates. Living crowns retain their branch envelope. Species profiles
account for authored crown aspect before ecological flattening; this avoids
squeezing an already narrow or broad asset a second time. Incompatible dead or
sparse states do not use a misleading green impostor. Original tree geometry,
materials and atlas inputs are unchanged; all 29 atlases remain valid.

Sand uses two coherent lattice directions, bounded ripple districts and quiet
gaps. Cold desert uses a stronger cool mineral tint in both near and far recipes.
A coarse-noise period correction removes district wrap discontinuities. Flower
placement uses stable 18 m colonies, shared by workers and main-thread fallback,
with patch-level variety and bounded candidates. Meadow bouquets are excluded
from rainforest and taiga without changing canonical biome IDs. Sunny daytime
diamond dust and pollen are quieter; population budgets are not inflated.

## Resource and data contract

No new scene pass, screen-color/depth copy, terrain IDs or residency range is
introduced. Rigid motion adds one three-float instance root attribute: 12 bytes
per allocated affected instance, updated only when placement or anchor changes.
Shader profiles share graphs. The flower palette uses a nearest-loaded 256 × 3
RGBA float texture, 12 KiB per slot, alongside the 16 KiB ground palette; disposal and
resource accounting include these node-only textures.

The final rainforest pose records 449,278,780 tracked bytes versus 446,659,674
at baseline: about +2.50 MiB, +0.59%. Across the eighteen matched views, tracked
totals increase by 2.16–6.05 MiB (0.51–1.77%). The desert maximum includes retained
placement arrays, whose exact occupancy varies between captures. These are
resource-accounting snapshots, not driver VRAM readings or a leak measurement.
Both captures use `cinematic-god-rays`, one finishing application and 49 water
slots. All eighteen tree placement counts match the baseline. The complete
[resource comparison](qa/world-look-implementation-2026-10-18/world-review.json)
retains the individual components.

Dead trees retain their identity, trunks and collision geometry. Azgaar IDs 0–12,
custom biome definitions/IDs, species selection and existing save semantics are
preserved. No legacy terrain remapping is added.

## World review and limits

The original random poses remain uncurated, including exposed paths and sparse
habitats. Final stills show a bare dead snag, fuller living crowns, deeper leafy
understory, quieter flowers and clearer cold-mineral/sand separation. Clean/HUD
frames and before/after captures have live wind and particles; they are not
exact animation-phase pixel comparisons.

The additional 24 views combine with the frozen October 14 manifest and the new
random set to provide at least three separated positions for each land biome.
A biome label describes the camera cell, not every visible plant. The tundra's
green distant band includes trees rooted in neighboring ID 4 cells. Imported
Eldara taiga is ID 9 in all forty neighborhood samples and uses its configured
conifer prototypes. The rainforest's pale trunk is authored
`tree-scene/tree-02.glb`, placement `tree:101:12:21`, species `tropical_tall`.

The true marine diagnostic is X −2045, Z 1731, camera-cell ID 0, captured from
above water. The original coast cameras remain on ID 4. Distance-fog controls at
01/04/05 improve tree separation without revealing new ridges. At radius 1,024 m,
sampled source maxima are 4.98, 14.46 and 10.81 m. These forty-point neighborhood
surveys are directional samples, not an exhaustive terrain search. Regional mist
and sky haze remain active in the distance-fog control.

R7's optional geography extension remains a separate, conditional versioned
stage. This pass preserves generator version 1, imported Eldara elevations and
existing saves. Snow, rocks, water, HUD and sound retain their existing owners;
their regression evidence does not imply new mountains, new rock assets, a new
HUD or a completed subjective sound-mix review. Automated audio checks establish
finite settings, one context/owner and preserved mute state. Listening to
footstep, brush and ambience balance still requires a human review.

## Validation and provenance

Final rendering source is `3e20d11595ee7a89d2c2fd785855afb3c4e716a5`; the immutable
source archive SHA-256 is
`695667ed953dcdc257e186379c37c9fa66cbe012c901e51269eafdacfa79fe73`.
The baseline is `74bb4b07da02acd78f2c1f05d4475130f5b7a8a3`.
Final captures use headed Windows Chromium on NVIDIA Lovelace hardware WebGPU.
WebGL fixtures establish correctness only.

| Evidence | Revision | Result |
| --- | --- | --- |
| [Plant motion](qa/world-look-implementation-2026-10-18/fixtures/plant-motion/report.json) | `c620a987` | 48 checks pass; motion implementation unchanged afterward |
| [Ground](qa/world-look-implementation-2026-10-18/fixtures/ground/report.json), [grass LOD](qa/world-look-implementation-2026-10-18/fixtures/grass-lod/report.json) | `b32eab78` | 284 and 54 checks pass |
| [Surfaces](qa/world-look-implementation-2026-10-18/fixtures/surfaces/report.json), [trees](qa/world-look-implementation-2026-10-18/fixtures/trees/report.json) | `b32eab78` | 456 and 1,112 checks pass across four lights and both backends |
| [Grass temporal](qa/world-look-implementation-2026-10-18/fixtures/grass-temporal/report.json) | `75fbb126` | 6 checks pass; zero changed pixels outside the grass silhouette at 0.25/1 s after the pan |
| [Plant appearance](qa/world-look-implementation-2026-10-18/fixtures/plant-appearance-final/report.json) | `3e20d115` | 44 checks pass, including actual GLB blackout and procedural normal negative controls |
| [Worlds](qa/world-look-implementation-2026-10-18/worlds/report.json), [diagnostics](qa/world-look-implementation-2026-10-18/diagnostics/report.json), [quality presets](qa/world-look-implementation-2026-10-18/quality/report.json), [extended biomes](qa/world-look-implementation-2026-10-18/extended-biomes/report.json) | `3e20d115` | 18, 8, 2 × 3 and 24 poses pass respectively |
| [HUD](qa/world-look-implementation-2026-10-18/fixtures/hud/report.json), [1080p HUD](qa/world-look-implementation-2026-10-18/fixtures/hud-1080p/report.json) | `75fbb126` / `3e20d115` | 760 × 600, 1280 × 720, 1600 × 900 and 1920 × 1080 pass |
| [Movement acceptance](qa/world-look-implementation-2026-10-18/motion-acceptance.json) | `75fbb126` / `3e20d115` | Ten clips, 170 checks pass; zero missing eligible near-grass tiles throughout; synthetic terrain/manifests evicted before identical return |
| [Performance comparison](qa/world-look-implementation-2026-10-18/performance-comparison.json) | baseline / `3e20d115` | Complete accepted matrices pass all existing gates; individual retries and original failures retain provenance |
| [Full verify](qa/world-look-implementation-2026-10-18/verification-release.json) | `3e20d115` | 6,862 tests, zero failed/skipped; lint, generated UI, required assets and production build pass |

Later authored lighting/cloud changes affect the three plant material owners
listed in [the source comparison](qa/world-look-implementation-2026-10-18/final-production-differences.json).
Earlier ground, surface, tree and grass fixture owners remain unchanged.
The synthetic QA helper follow-up `a049436b` corrects invalid capsule dimensions
(radius 1 m requires height greater than 2 m). The motion runner records that
helper as a separate hashed overlay; engine and rendering imports remain frozen.
The eight ordinary clips precede only the final cloud-shade hook; two corrected
synthetic clips use the final rendering archive. Ordinary scenery recovery after
stops is at most 1.121 seconds; the synthetic routes additionally verify flat
feet, unobstructed travel, actual eviction and identical IDs/growth on return.
Recorded video is 1600 × 900 at 25 FPS, with sampled frames aligned to actual
simulation states. Recording overhead is excluded from performance measurements.
Final follow-up lint and nine focused synthetic/matrix/coverage tests pass.
Build output retains existing bundle-size and dynamic-import warnings.

The performance matrix initially rejected the standard run at its DOM focus
gate before measurement. A later retry lost native foreground ownership despite
reported DOM focus and is also excluded. The accepted retry retains both native
and DOM focus throughout. Chromium can leave keyboard focus in browser chrome;
the helper now uses a temporary inert input target only when programmatic focus
does not select the page, then removes it before measurement. Positive and
deliberately backgrounded negative controls pass, including rejection when DOM
focus is emulated. No foreground or timing gate is relaxed.

The matrix's old standard output was stale and is excluded; the runner now
removes old outputs before launch. Accepted matrix reports replace only failed
launches with matched successful retries, preserving original executions and
report hashes. The [artifact index](qa/world-look-implementation-2026-10-18/artifact-index.json)
records 18 selected passing reports. The [local evidence guide](qa/world-look-implementation-2026-10-18/README.md)
links originals, derivatives and failed attempts.

## Matched hardware performance

Both matrices use 1280 × 720, an 8-second warmup plus settled preparation,
10 measured movement seconds, active meadow density multipliers and a separate
20-second recovery allowance. The existing limits remain p95 ≤33.3 ms, hitch
rate ≤2%, full scenery and grass recovery within 2,000 ms, complete recovered
coverage, collision gates and water acceptance. Every accepted case has hardware
WebGPU, zero browser errors and valid native foreground ownership.

| Case | Baseline p95 (ms) | Final p50 / p95 / p99 (ms) | Final hitches | Final worst (ms) | Full recovery (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard | 9.60 | 7.0 / 9.00 / 12.43 | 0 | 29.8 | 105.1 |
| Dense forest | 9.80 | 7.5 / 10.50 / 13.76 | 0 | 31.8 | 163.4 |
| High grass | 11.91 | 7.5 / 10.00 / 15.93 | 1 | 46.0 | 114.0 |
| Dense mixed | 10.90 | 7.5 / 10.10 / 12.53 | 1 | 44.3 | 119.9 |
| Construction approach | 21.60 | 10.6 / 16.65 / 34.21 | 12 | 222.7 | 122.5 |

The construction hitch rate is 1.42%, compared with 1.71% at baseline. Its
222.7 ms worst frame remains a visible limitation; passing the matrix does not
establish hitch-free movement. Dense-forest p95 rises 0.7 ms in this pair while
the other cases decline. One accepted matched capture per case establishes the
existing gates, not performance equivalence or a speedup. Full per-case counts,
phase timings, recovery and resource/upload counters remain in the raw reports.

Water passes every route/body/origin/caustic gate: final p95 8.9 ms versus
11.5 ms baseline, hitch rate 0.01%, zero GPU validation errors. Maximum projected
caustic post-effect CPU is 0.4 ms; its full scene-plus-effect pipeline reaches
14.2 ms and remains reported separately. All movement collision p95 values are
0.1 ms. Source/config/map identity and all recovered grass coverage checks pass.

Failed attempts, setup errors and superseded captures are retained with their
original verdicts under the local QA archive. Screenshots/video/logs remain
local under the existing `docs/qa/` ignore rule; the plan, manifest, scripts,
implementation and this report are versioned.
