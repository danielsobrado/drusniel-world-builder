# Landscape appearance implementation — October 17, 2026

Implementation and acceptance record for the [18-view visual audit and plan](../../plans/aaa-look-and-feel-plan-2026-10-16.md). The original 18-view replay and the material, HUD, movement and coastal fixes are complete. Refreshed coastal/imported views and both water appearance fixtures pass on `f0b3481e`. Its full matrix fails dense-mixed recovery and the caustic CPU limit. Runtime `b3586db4` increases the sustained preparation ceiling to 6 ms, but its focused dense-mixed probe still takes 2.529 s and fails recovery. A CPU profile is investigating the remaining delay; release acceptance remains pending.

## Changes

| Package | Delivered behavior |
| --- | --- |
| Q0 — tree assets | Offline atlases rebuilt from current prototypes. Both procedural and Eldara runtime signatures match the manifest, with 29 prototypes, 29 loaded asset atlases and 29 render batches. Production validation now hashes relevant configuration, source geometry, textures and bake shaders. Visual QA rejects incomplete, duplicate, runtime-fallback or batch-less atlas sets. |
| Q1 — ground and grass | Litter/soil average color persists into the CPU far-material palette, including custom biome IDs. Near detail is normalized around that shared mean as its pattern fades. Loose sand and mineral desert no longer inherit polygonal dried-mud cracks. Hot desert receives filtered directional ripples; cold desert receives irregular mineral relief. Both use bounded canonical pattern coordinates, mean-preserving color gains and distance filtering. Grass gets a rounded cross-section, a restrained midrib/edge profile, configured transmission in near/card stages and less distant widening. Q1 adds no stems or residency radius. |
| Q2 — forest floor | Seasonal/temperate forest gets explicit litter/moss balances. Canopy suppression accepts validated per-biome overrides and honors zero values; open meadow and forest margins retain their existing populations. Existing instanced fern, shrub, sapling, deadwood and rooted/floating wetland asset systems remain the content kit. |
| Q3 — water | Includes the existing October 17 signed shoreline, stochastic slope, body/context, rock wake, reflection filtering, foam, wet bank and pooled interaction work. The follow-up gives coastal puffs short ballistic flight, growth and density erosion on the shared water clock. It preserves the 420-instance budget and breaking-depth habitat. The swash front uses filtered, bounded two-octave breakup with actual transparent gaps, shared by terrain and water; its authored feather narrows from 45 to 24 cm. See the [water implementation](../water-aaa-implementation-2026-10-17/README.md) for the earlier source and resource budgets. |
| Q4 — rocks | Weathered albedo and roughness use authored texture transforms, preserving the source material's UV mapping. The current mid-value painted pack uses 0.92 toning and restrained 0.2 underside darkening, so lighting/AO do not stack the old artificial darkening into black stones. Existing slope fit, deterministic groups, partial burial and local water contact remain authoritative. |
| Q5 — composition | A QA neighborhood survey records source height, biome and terrain elevation angles at eight headings over 16–4096 m, plus local forest habitat. This separates actual geography from fog/representation failures without rewriting imported worlds. New opt-in geography remains a separately versioned generation project, as specified in the plan. |
| Q6 — canopy light | Corrects a world/view coordinate mismatch in canopy rim shading. The offline atlas is regenerated with the same corrected material as near trees. It also fixes PNG transport of normal-atlas classification: zero-alpha trunk pixels lost their RGB normals through canvas premultiplication. Manifest v4 stores the classification in alpha 128–255 and decodes it explicitly. Production validation rejects missing/non-unit normals at covered pixels. Scene exposure and finishing values remain unchanged. |
| Q7 — HUD | The resting controls block leaves layout after its existing idle delay, so the scene label panel shrinks to its content. Existing keyboard, capture visibility and status behavior remain. |
| Q8 — QA | Retained-pose replay now requires loaded assets and stores neighborhood surveys. A production-node GPU fixture measures ground mean through 4/8/16/24/34/60 m fades on WebGPU and WebGL at local and million-meter pattern origins. Baking shares the hardware-browser lock with QA. Empty instanced prototype pools no longer enter renderer object/material work; preparation can still temporarily draw them and restore their empty state. A blocked dependency no longer consumes the single tree-manifest build turn before another ready job can run. Blocked scans defer each waiting job until the next flush. Unchanged failed rock dependencies are cached until their inputs change, and trees reuse an already-prepared rock halo. Rock contact metadata uses a lightweight water-surface query while the complete bed/shore query remains unchanged. Sustained preparation pressure ramps after 150 ms and retains a 150 ms grace across dependency handoffs. The production burst ceiling is 6 ms, matching the existing stylized-work ceiling; up to four cheap tree manifests can share that allowance. Density, ranges and the frame/recovery gates are unchanged. This deliberately spends more bounded preparation time to reduce visible recovery lag. |

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
| Final performance | `b3586db4` — acceptance in progress |

## Validation

- [`npm run verify`](verification.json) passes on `b3586db4`: lint, UI generation check, production asset validation, **6,839 tests** and production build. The compressed complete log is retained in [verify.log.gz](verify.log.gz).
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

- [Coastal foam](fixtures/water-foam/report.json): **39 checks per backend**, including genuine gaps/patches at three origins and adjacent-chunk equality. The authored breakup field has about 11.6–11.8% fully clear pixels and 11.6–11.7% solid pixels at the tested footprint, with soft coverage between.
- [Water parity](diagnosis/water-sample-parity.json): **3,600 complete water samples match the previous implementation exactly**, covering dry land, ocean, imported lake/river and incomplete river beds. The static contact query avoids dry bed interpolation; it preserves edited water identity and contact levels.

The final post-scheduling performance comparison is recorded below after its serialized run completes. Historical captures remain unchanged. [Artifact integrity](artifact-integrity.json) verifies all 1,664 declared images in the retained material/map/HUD suites. Full-scenery recovery, frame pacing and artistic approval are separate from asset integrity.

Hardware: NVIDIA GeForce RTX 4080, 16,376 MiB reported memory, driver 617.14. Headed Windows Chromium uses hardware WebGPU; WebGL fixture runs verify fallback functionality and appearance, not authoritative frame time.

## Reproduction

Serve the desired committed revision in one terminal; run captures in a second terminal:

```sh
node scripts/serve-world-visual-snapshot.mjs b3586db4 5248
node scripts/capture-aaa-review.mjs --url http://localhost:5248 --out tmp/aaa-review
node scripts/run-world-visual-grass-qa.mjs --fixture ground-continuity --url http://localhost:5248 --out tmp/aaa-ground
node scripts/run-world-visual-trees-qa.mjs --lights all --url http://localhost:5248 --out tmp/aaa-trees
node scripts/run-world-visual-surfaces-qa.mjs --lights all --url http://localhost:5248 --out tmp/aaa-surfaces
node scripts/run-perf-matrix.mjs --headed --url http://localhost:5248 --warmup 8 --duration 12
```

Use native Windows Node from WSL for the hardware browser, as described in [perf-qa.md](../../perf-qa.md). Each browser harness holds the shared lock. Diagnostic tree runs accept `--diagnostic albedo` or `--diagnostic normals`; they isolate the alpine production prototype without changing the gameplay configuration.

## Remaining conditional work

A new procedural landform family, additional species/art packs, spectral ocean, hydraulic bank erosion and new sound assets require their own content and generation decisions. They were conditional follow-ups in the plan, not established defects in the screenshots. Existing movement and water traversal have automated functional evidence. New sound assets, listening approval and subjective comfort approval are not inferred from still images or automated state checks.

## Performance acceptance in progress

The restored-atlas baseline and first candidate used identical 1280 × 720 hardware WebGPU matrix settings: 8-second warmup, complete settle, 12-second movement, 20-second recovery observation. Both retained production density, collision, ranges and the original gates.

| Case | Baseline p95 / hitch rate | First candidate p95 / hitch rate | Baseline / candidate full recovery |
| --- | --- | --- | --- |
| Standard | 10.20 ms / 0.06% | 9.00 ms / 0.06% | 2.65 / 2.27 s |
| Dense forest | 22.13 ms / 3.54% | 9.23 ms / 0.06% | 11.50 / 2.43 s |
| High grass | 13.17 ms / 0.34% | 12.72 ms / 0.26% | 2.65 / 2.90 s |
| Dense mixed | 35.73 ms / 7.02% | 10.83 ms / 0.38% | 11.13 / 2.56 s |
| Construction corridor | 16.40 ms / 1.14% | 15.80 ms / 0.71% | 0.010 / 0.006 s |

The first candidate is `203c77a7`. Its frame pacing and water acceptance pass; its **matrix fails** because four scenery recoveries exceed two seconds. Grass-only recovery does not replace that gate. These are individual paired observations, not a repeated-round speedup claim. Compressed full reports and immutable runtime source identities are retained under [performance/](performance/). A fresh standard-route control measured 2.15 s recovery; the dependency-wait correction alone measured 2.35 s. Both pass frame pacing. That was not accepted as closing the recovery issue. Recovery traces attribute about 200 ms of queued CPU work to rock fitting/contact. The subsequent static contact-plane query avoids unnecessary dry bed sampling; its complete water-query parity and edited-world contact equivalence pass. A subsequent full-matrix attempt recorded 57.7 FPS and 9.71 s recovery in its first case and was stopped for diagnosis; its partial report is retained under [interrupted-matrix](performance/interrupted-matrix/). In that run queued rock fitting/contact took 6.5 ms rather than the preceding 222.1 ms observation, but the render phase took 11.05 ms instead of roughly 4.8 ms. A foreground CPU-profiled run returned to 5.33 ms average render time; its profiling overhead excludes it from release evidence. An unfocused test window was observed during diagnosis. The harness now activates its own window and records/rejects lost focus; [activation and rejection controls](diagnosis/focus-preflight.json) pass. This is a capture-policy correction, not an engine speedup claim. The focused `669f53dd` run passes standard recovery at 1.90 s, but dense forest and high grass still take 2.39 / 2.35 s. It was stopped and retained under [focused-before-dependency-cache](performance/focused-before-dependency-cache/). `ca584581` additionally caches unchanged failed rock dependencies and avoids repeated tree prepared-halo checks while those dependencies are blocked. Its worst-density recovery remained above the gate. Subsequent pressure scheduling and budget changes are tested with a stricter clock: recovery starts at the last retained movement frame, and large frame-report transfer happens after observation. This removes 0.87 s of blocking transfer observed in one diagnosis. These timing changes make older recovery figures unsuitable for direct comparison with final captures. The 2 ms candidate still took 2.076 s and failed; the bounded 3 ms candidate takes 1.556 s in the focused dense-mixed probe, with 16.335 ms p95, 0.55% hitches, zero browser errors and passing collision. The subsequent complete 3 ms matrix fails dense-mixed recovery at 2.465 s; water traversal and frame gates pass, but a 95.7 ms post-effect spike fails the 4 ms caustic CPU limit. [The complete failed matrix](performance/budget-three-matrix/matrix.json) is preserved. The 6 ms candidate also fails its first dense-mixed probe at 2.529 s (15.8 ms p95, 0.41% hitches). A diagnostic CPU profile is investigating the expensive preparation work. The preceding passing 3 ms stress probe does not override these failures or the caustic spike.

Capture artifacts are retained in this workspace. New files under `docs/qa/` follow the checkout's `.gitignore`; large captures and videos are not forced into Git. The tracked report and runtime changes remain on `main`.
