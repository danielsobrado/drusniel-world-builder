# Landscape appearance implementation — October 17, 2026

Implementation and acceptance record for the [18-view visual audit and plan](../../plans/aaa-look-and-feel-plan-2026-10-16.md). The visual fixes and release checks are complete. Runtime `cdbf0c15` passes all four vegetation profiles, the construction corridor and the full water route on hardware WebGPU, with native Windows foreground monitoring. Full scenery recovery is below two seconds in every movement case. The original audit and failed intermediate captures remain available for review.

The subsequent [split-waterline colour fix](../../waterline-color-fix-2026-10-18.md) covers submerged pixels before head immersion. Its captures and validation are separate from the October 17 record.

## Changes

| Package | Delivered behavior |
| --- | --- |
| Q0 — tree assets | Offline atlases rebuilt from current prototypes. Both procedural and Eldara runtime signatures match the manifest, with 29 prototypes, 29 loaded asset atlases and 29 render batches. Production validation now hashes relevant configuration, source geometry, textures and bake shaders. Visual QA rejects incomplete, duplicate, runtime-fallback or batch-less atlas sets. |
| Q1 — ground and grass | Litter/soil average color persists into the CPU far-material palette, including custom biome IDs. Near detail is normalized around that shared mean as its pattern fades. Loose sand and mineral desert no longer inherit polygonal dried-mud cracks. Hot desert receives filtered directional ripples; cold desert receives irregular mineral relief. Both use bounded canonical pattern coordinates, mean-preserving color gains and distance filtering. Grass gets a rounded cross-section, a restrained midrib/edge profile, configured transmission in near/card stages and less distant widening. Q1 adds no stems or residency radius. |
| Q2 — forest floor | Seasonal/temperate forest gets explicit litter/moss balances. Canopy suppression accepts validated per-biome overrides and honors zero values; open meadow and forest margins retain their existing populations. Existing instanced fern, shrub, sapling, deadwood and rooted/floating wetland asset systems remain the content kit. |
| Q3 — water | Includes the existing October 17 signed shoreline, stochastic slope, body/context, rock wake, reflection filtering, foam, wet bank and pooled interaction work. The follow-up gives coastal puffs short ballistic flight, growth and density erosion on the shared water clock. It preserves the 420-instance budget and breaking-depth habitat. The optical scene uses the existing plain surface variant and restores surface refraction after its pass. Underwater prewarming advances only preparation-frame identity so cached surface shadows cannot skip underwater variant preparation. The swash front uses filtered, bounded two-octave breakup with actual transparent gaps, shared by terrain and water; its authored feather narrows from 45 to 24 cm. See the [water implementation](../water-aaa-implementation-2026-10-17/README.md) for the earlier source and resource budgets. |
| Q4 — rocks | Weathered albedo and roughness use authored texture transforms, preserving the source material's UV mapping. The current mid-value painted pack uses 0.92 toning and restrained 0.2 underside darkening, so lighting/AO do not stack the old artificial darkening into black stones. Existing slope fit, deterministic groups, partial burial and local water contact remain authoritative. |
| Q5 — composition | A QA neighborhood survey records source height, biome and terrain elevation angles at eight headings over 16–4096 m, plus local forest habitat. This separates actual geography from fog/representation failures without rewriting imported worlds. New opt-in geography remains a separately versioned generation project, as specified in the plan. |
| Q6 — canopy light | Corrects a world/view coordinate mismatch in canopy rim shading. The offline atlas is regenerated with the same corrected material as near trees. It also fixes PNG transport of normal-atlas classification: zero-alpha trunk pixels lost their RGB normals through canvas premultiplication. Manifest v4 stores the classification in alpha 128–255 and decodes it explicitly. Production validation rejects missing/non-unit normals at covered pixels. Scene exposure and finishing values remain unchanged. |
| Q7 — HUD | The resting controls block leaves layout after its existing idle delay, so the scene label panel shrinks to its content. Existing keyboard, capture visibility and status behavior remain. |
| Q8 — QA | Retained-pose replay now requires loaded assets and stores neighborhood surveys. A production-node GPU fixture measures ground mean through 4/8/16/24/34/60 m fades on WebGPU and WebGL at local and million-meter pattern origins. Baking shares the hardware-browser lock with QA. Empty instanced prototype pools no longer enter renderer object/material work; preparation can still temporarily draw them and restore their empty state. A blocked dependency no longer consumes the single tree-manifest build turn before another ready job can run. Blocked scans defer each waiting job until the next flush. Unchanged failed rock dependencies are cached until their inputs change, and trees reuse an already-prepared rock halo. Rock and shore contact metadata use a lightweight water-surface query. Dry aquatic candidates reject before bed/shore sampling; wet candidates retain the complete canonical sample and all depth, current and anchoring rules. Sustained preparation pressure ramps after 150 ms and retains a 150 ms grace across dependency handoffs. The production burst ceiling is 3 ms; up to four cheap tree manifests can share that allowance. Density, ranges and the frame/recovery gates are unchanged. This deliberately spends more bounded preparation time to reduce visible recovery lag. |

## Source and baseline

The initial checkout was `6f85a102b42cd4efd7614d6a052298dae8c95132`. The restored-tree baseline is `063faa53729fe3f90e6ab87a93952d517ed51c68`. The old audit's cheaper proxy fallback is not an equivalent performance workload.

The signature investigation compared actual prototype construction on WebGPU and WebGL. Both produced `tree-impostor-v7-ddf715ab`; the shipped manifest had an outdated signature. The first rebake produced identical atlas pixels with corrected metadata. The rim-coordinate correction required a material rebake. The normal-transport repair required a versioned normal-atlas rebake; the final signature is `tree-impostor-v8-cb03408f`. No runtime gameplay baking was enabled.

Standard Azgaar IDs 0–12 and persisted custom IDs 32–254 are unchanged. No saved geography, collision representation, workshop state, mesh density, streaming radius or mandatory camera effects are changed by this pass.

## Capture provenance

The full 18-view replay is from `683648d8`, after the tree, ground, grass and rock fixes. Later coastal changes are validated separately; this record does not present the older coast pixels as the final foam/spray result. Every suite retains its runtime source identity and capture hashes.

| Evidence | Runtime revision |
| --- | --- |
| 18 map poses, grass LOD/temporal, four-light rocks | `683648d8` |
| Four-light trees and normal-atlas repair | `833edc19` |
| Ground continuity and arid relief | `9ea9dc39` |
| HUD and recorded first/third-person movement | `203c77a7` |
| Coastal ballistic spray | `24d46bd1` |
| Coastal foam gap/seam fixture | `64ad66b2` |
| Refreshed coastal/imported views and water fixtures | `f0b3481e` |
| Native foreground performance and production optical scene | `cdbf0c15` |
| Final imported wetland refresh | `259170f8` |

## Validation

- [`npm run verify`](verification.json) passes on `cdbf0c15`: lint, UI generation check, production asset validation, **6,845 tests** and production build. The compressed complete log is retained in [verify.log.gz](verify.log.gz).
- [Ground GPU fixture](fixtures/ground/report.json): **136 checks per backend**. Across eleven ground biomes, average linear luminance stays between 0.99545 and 1.00479 of its distant reference. Arid relief normals remain finite/unit-length at local and million-meter origins.
- [Four-light tree fixture](fixtures/trees/report.json): **1,112 passing checks**, 162 WebGPU and 116 WebGL checks under each of day, low sun, overcast and night. The formerly failing alpine variant passes every light direction. The new actual-baker trunk-normal round trip guards the premultiplication failure.
- [Albedo diagnostic](diagnosis/alpine-albedo/report.json) and [normal diagnostic](diagnosis/alpine-normals/report.json) isolate the old alpine failure. Their deliberately isolated views reuse lit comparison thresholds and are diagnostic records, not release approval reports.
- [Restored asset probe](diagnosis/tree-atlas-probe.json) verifies the initial repair on both worlds. [Source comparison](diagnosis/tree-source-comparison.json) separates the stale shipped signature from backend nondeterminism.

- [Map replay](worlds/report.json): all **18 poses / 36 PNGs**, matching biomes, 29 loaded asset atlases and batches, full preparation, stable source, zero browser errors. [Contact sheet](contact-sheet.jpg).
- [Grass LOD](fixtures/grass-lod/report.json): **54 checks** across both backends; [temporal](fixtures/grass-temporal/report.json): **6 checks**.
- [Four-light surface/rock review](fixtures/surfaces/report.json): **456 checks** across both backends, including all eleven production rock prototypes in dry, wet and albedo views.
- [HUD](fixtures/hud/report.json): **25 checks**, four habitats and three viewport sizes, including resting layout, capture visibility and input/modal behavior.
- [Motion](motion/report.json): **32 checks** on the original grassland route in first and third person. Walk, sprint, turns/stops, collision, audio ownership and interaction state pass. Recorded video overhead is excluded from performance numbers. These are functional checks, not listening or subjective comfort approval.
- [Coastal spray](fixtures/water-spray/report.json): **12 checks per backend**, retaining dry/deep rejection controls, four eye-level time samples, and actual GPU birth/apex/landing/quiet-state probes.

- [Coastal foam](fixtures/water-foam-current/report.json): **39 checks per backend**, including genuine gaps/patches at three origins and adjacent-chunk equality. The authored breakup field has about 11.6–11.8% fully clear pixels and 11.6–11.7% solid pixels at the tested footprint, with soft coverage between.
- [Water appearance](fixtures/water-appearance-current/report.json): **50 checks per backend**, covering body kind, surf coverage, origin seams and advection continuity.
- [Refreshed coast](final-coast/report.json) and [imported views](final-imported/report.json): four poses / eight PNGs on `f0b3481e`, complete readiness, loaded assets, stable source and zero browser errors. The [final wetland refresh](final-query-world/report.json) repeats the imported wetland after the dry-query optimization on `259170f8`.
- [Current contact sheet](final-contact-sheet.jpg): the 18 retained poses, with refreshed coastal, taiga and wetland cells. [Composition provenance](final-contact-sheet.json) lists each original image and source; only resizing and labels are applied.
- [Water parity](diagnosis/water-sample-parity.json): **3,600 complete water samples match the previous implementation exactly**, covering dry land, ocean, imported lake/river and incomplete river beds. The static contact query avoids dry bed interpolation; it preserves edited water identity and contact levels.

The [final matrix](performance/final/matrix.json) passes. [Artifact integrity](artifact-integrity.json) verifies all 1,780 declared images. Full recovery, frame pacing and artistic approval remain separate from image integrity.

Hardware: NVIDIA GeForce RTX 4080, 16,376 MiB reported memory, driver 617.14. Headed Windows Chromium uses hardware WebGPU; WebGL fixture runs verify fallback functionality and appearance, not authoritative frame time.

[Production optical scene and backend parity](fixtures/optical-environment/report.json): **78 checks pass**. The four underwater shelf/Snell/deep/rebased views assert zero viewport copies on each backend and restoration of the original surface material. The shadow-preparation regression test also preserves animation time.

## Reproduction

Serve the desired committed revision in one terminal; run captures in a second terminal:

```sh
node scripts/serve-world-visual-snapshot.mjs cdbf0c15 5248
node scripts/capture-aaa-review.mjs --url http://localhost:5248 --out tmp/aaa-review
node scripts/run-world-visual-grass-qa.mjs --fixture ground-continuity --url http://localhost:5248 --out tmp/aaa-ground
node scripts/run-world-visual-trees-qa.mjs --lights all --url http://localhost:5248 --out tmp/aaa-trees
node scripts/run-world-visual-surfaces-qa.mjs --lights all --url http://localhost:5248 --out tmp/aaa-surfaces
node scripts/run-perf-matrix.mjs --headed --url http://localhost:5248 --warmup 8 --duration 12
```

Use native Windows Node from WSL for the hardware browser, as described in [perf-qa.md](../../perf-qa.md). Each browser harness holds the shared lock. Diagnostic tree runs accept `--diagnostic albedo` or `--diagnostic normals`; they isolate the alpine production prototype without changing the gameplay configuration.

## Remaining conditional work

A new procedural landform family, additional species/art packs, spectral ocean, hydraulic bank erosion and new sound assets require their own content and generation decisions. They were conditional follow-ups in the plan, not established defects in the screenshots. Existing movement and water traversal have automated functional evidence. New sound assets, listening approval and subjective comfort approval are not inferred from still images or automated state checks.

## Performance acceptance

The final [matrix](performance/final/matrix.json) uses frozen runtime `cdbf0c15`, headed hardware WebGPU at 1280 × 720, 8-second warmup, complete settle, 12-second measured movement and up to 20 seconds of recovery observation. Density, collision and render ranges are unchanged. All original gates pass: frame-time p95 ≤33.3 ms, hitch rate ≤2%, collision readiness/p95, complete scenery recovery ≤2 s, and zero missing or below-density in-view grass tiles after recovery. The matrix verifies the requested tree/candidate and active meadow density multipliers.

| Case | Frame-time p95 | Worst frame | Hitch rate | Full recovery | Collision p95 | Native foreground |
| --- | --- | --- | --- | --- | --- | --- |
| Standard | 8.80 ms | 48.6 ms | 0.06% | 1.053 s | 0.10 ms | pass |
| Dense forest | 9.80 ms | 48.4 ms | 0.18% | 1.258 s | 0.10 ms | pass |
| High grass | 14.50 ms | 48.1 ms | 0.54% | 1.276 s | 0.10 ms | pass |
| Dense mixed | 12.00 ms | 78.1 ms | 0.26% | 1.371 s | 0.10 ms | pass |
| Construction corridor | 20.97 ms | 220.9 ms | 0.96% | 0.110 s | 0.10 ms | pass |

The first dense-forest launch timed out in the DOM focus preflight before measurement, although native window focus passed. The [rejected launch](performance/final-preflight-interrupted/status.json) remains retained. A [fresh retry](performance/final/setup-retry.json.gz) passed with the same frozen runtime and unchanged harness. The final matrix combines that capture with the other successful cases and applies the unchanged matrix gate evaluator. The [assembly script](performance/final/suite-assembly.mjs.txt) retains the exact retry and gate calculation.

The 12 authored wall constructions retain **96 wall modules** and non-zero masonry. The water route passes entry, swimming, dive, surface, dry exit, stable water identity, origin and caustic checks: **9.00 ms p95**, **0.06% hitches**, and **0.20 ms maximum caustic post-effect CPU** against its unchanged 4 ms limit. The final fresh-browser water route records an **8.90 ms maximum complete underwater pipeline**, including its scene pass; the worst water-route frame is 51.5 ms. The [additional pipeline gate](performance/final/water-pipeline-gate.json) requires a complete-pipeline peak of at most 33.3 ms. All final cases have zero browser errors and passing native foreground records.

[Runtime source stability](performance/final/source-stability.json) and [harness source stability](performance/final/harness-source-stability.json) pass. Compressed raw cases and the water report are retained beside the matrix, with [artifact hashes](performance/final/artifacts.json). These are individual acceptance captures; no repeated-round FPS speedup or material-cost claim is inferred. Passing the p95 and hitch-rate limits does not establish zero stutter: the construction capture still contains an isolated 220.9 ms frame. Its full raw record remains available.

Recovery starts at the last retained movement frame, before key release. Compact movement-end snapshots stay in the page; the large frame report transfers after recovery observation. This removes report-transfer blocking without granting free recovery time. Older observer-entry recovery figures are not directly comparable.

The [native focus control](diagnosis/native-focus-control.json) proves both successful activation and rejection of a background browser whose emulated DOM focus still reports true without a blur event. The final captures check the owned Windows foreground PID every 100 ms as well as DOM focus. Earlier DOM-only focus records cannot establish native foreground ownership. The trial 6 ms preparation allowance was removed; production uses a shared 3 ms sustained-work allowance, with the existing low idle floor and one allowance across consumers.

## Historical captures and diagnosis

The restored-atlas baseline `063faa53` and first candidate `203c77a7` retained production density and the original gates. The old audit's proxy fallback is not an equivalent workload. Their recovery clock began at observer entry, and neither recorded native foreground ownership. Keep these as historical observations rather than the release verdict.

| Case | Baseline p95 / hitch rate | First candidate p95 / hitch rate | Baseline / candidate old-clock recovery |
| --- | --- | --- | --- |
| Standard | 10.20 ms / 0.06% | 9.00 ms / 0.06% | 2.65 / 2.27 s |
| Dense forest | 22.13 ms / 3.54% | 9.23 ms / 0.06% | 11.50 / 2.43 s |
| High grass | 13.17 ms / 0.34% | 12.72 ms / 0.26% | 2.65 / 2.90 s |
| Dense mixed | 35.73 ms / 7.02% | 10.83 ms / 0.38% | 11.13 / 2.56 s |
| Construction corridor | 16.40 ms / 1.14% | 15.80 ms / 0.71% | 0.010 / 0.006 s |

The first candidate fails four recovery gates. Raw records remain under [baseline](performance/baseline/) and [candidate](performance/candidate/). Later [interrupted captures](performance/interrupted-matrix/), [dependency-cache controls](performance/focused-before-dependency-cache/), [stress probes](performance/stress-probes/manifest.json) and the [complete 3 ms matrix](performance/budget-three-matrix/matrix.json) retain their failures. The latter includes 2.465 s dense-mixed recovery and a 95.7 ms caustic CPU spike. The later [aligned CPU profile](diagnosis/aaa-water-scene.cpuprofile.gz) identifies redundant underwater viewport copying; the [plain-water profile](diagnosis/plain-aaa-water-scene.cpuprofile.gz) and [cold-build names](diagnosis/plain-aaa-water-cold-builds.json.gz) identify cold tree/rock shadow builds. The plain-water optical scene and separate shadow preparation frames address those paths. The failed captures remain retained, and the final native-monitored fresh-browser route passes the unchanged CPU/frame gates plus the complete-pipeline peak check.

The [foreground-policy diagnosis](performance/foreground-policy-diagnosis/status.json) records why a later DOM-focused matrix was stopped. A [CPU profile](diagnosis/aaa-budget6-recovery.cpuprofile.gz), captured with diagnostic overhead, identified full dry-water sampling in ground-detail placement. That led to the dry aquatic rejection and lightweight shore-contact query. Profiling timings are excluded from release evidence. Complete water-query parity, wet placement rules, erased rivers and unchanged shore clustering have separate tests.

Capture artifacts are retained in this workspace. New files under `docs/qa/` follow the checkout's `.gitignore`; large captures and videos are not forced into Git. The tracked report and runtime changes remain on `main`.
