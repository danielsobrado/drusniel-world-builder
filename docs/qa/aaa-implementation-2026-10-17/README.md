# Landscape appearance implementation — October 17, 2026

Implementation and acceptance record for the [18-view visual audit and plan](../../plans/aaa-look-and-feel-plan-2026-10-16.md). Final validation is in progress; this record does not yet certify the release gates.

## Changes

| Package | Delivered behavior |
| --- | --- |
| Q0 — tree assets | Offline atlases rebuilt from current prototypes. Both procedural and Eldara runtime signatures match the manifest, with 29 prototypes, 29 loaded asset atlases and 29 render batches. Production validation now hashes relevant configuration, source geometry, textures and bake shaders. Visual QA rejects incomplete, duplicate, runtime-fallback or batch-less atlas sets. |
| Q1 — ground and grass | Litter/soil average color persists into the CPU far-material palette, including custom biome IDs. Near detail is normalized around that shared mean as its pattern fades. Loose sand and mineral desert no longer inherit polygonal dried-mud cracks. Hot desert receives filtered directional ripples; cold desert receives irregular mineral relief. Both use bounded canonical pattern coordinates, mean-preserving color gains and distance filtering. Grass gets a rounded cross-section, a restrained midrib/edge profile, configured transmission in near/card stages and less distant widening. Q1 adds no stems or residency radius. |
| Q2 — forest floor | Seasonal/temperate forest gets explicit litter/moss balances. Canopy suppression accepts validated per-biome overrides and honors zero values; open meadow and forest margins retain their existing populations. Existing instanced fern, shrub, sapling, deadwood and rooted/floating wetland asset systems remain the content kit. |
| Q3 — water | Includes the existing October 17 signed shoreline, stochastic slope, body/context, rock wake, reflection filtering, foam, wet bank and pooled interaction work. See the [water implementation](../water-aaa-implementation-2026-10-17/README.md) for its source and resource budgets. |
| Q4 — rocks | Weathered albedo and roughness use authored texture transforms, preserving the source material's UV mapping. The current mid-value painted pack uses 0.92 toning and restrained 0.2 underside darkening, so lighting/AO do not stack the old artificial darkening into black stones. Existing slope fit, deterministic groups, partial burial and local water contact remain authoritative. |
| Q5 — composition | A QA neighborhood survey records source height, biome and terrain elevation angles at eight headings over 16–4096 m, plus local forest habitat. This separates actual geography from fog/representation failures without rewriting imported worlds. New opt-in geography remains a separately versioned generation project, as specified in the plan. |
| Q6 — canopy light | Corrects a world/view coordinate mismatch in canopy rim shading. The offline atlas is regenerated with the same corrected material as near trees. It also fixes PNG transport of normal-atlas classification: zero-alpha trunk pixels lost their RGB normals through canvas premultiplication. Manifest v4 stores the classification in alpha 128–255 and decodes it explicitly. Production validation rejects missing/non-unit normals at covered pixels. Scene exposure and finishing values remain unchanged. |
| Q7 — HUD | The resting controls block leaves layout after its existing idle delay, so the scene label panel shrinks to its content. Existing keyboard, capture visibility and status behavior remain. |
| Q8 — QA | Retained-pose replay now requires loaded assets and stores neighborhood surveys. A production-node GPU fixture measures ground mean through 4/8/16/24/34/60 m fades on WebGPU and WebGL at local and million-meter pattern origins. Baking shares the hardware-browser lock with QA. Empty instanced prototype pools no longer enter renderer object/material work; preparation can still temporarily draw them and restore their empty state. |

## Source and baseline

The initial checkout was `6f85a102b42cd4efd7614d6a052298dae8c95132`. The restored-tree baseline is `063faa53729fe3f90e6ab87a93952d517ed51c68`. The old audit's cheaper proxy fallback is not an equivalent performance workload.

The signature investigation compared actual prototype construction on WebGPU and WebGL. Both produced `tree-impostor-v7-ddf715ab`; the shipped manifest had an outdated signature. The first rebake produced identical atlas pixels with corrected metadata. The rim-coordinate correction required a material rebake. The normal-transport repair required a versioned normal-atlas rebake; the final signature is `tree-impostor-v8-cb03408f`. No runtime gameplay baking was enabled.

Standard Azgaar IDs 0–12 and persisted custom IDs 32–254 are unchanged. No saved geography, collision representation, workshop state, mesh density, streaming radius or mandatory camera effects are changed by this pass.

## Validation

- `npm run verify` passes: lint, UI generation check, production asset validation, **6,828 tests** and production build.
- [Ground GPU fixture](fixtures/ground/report.json): **136 checks per backend**. Across eleven ground biomes, average linear luminance stays between 0.99545 and 1.00479 of its distant reference. Arid relief normals remain finite/unit-length at local and million-meter origins.
- [Four-light tree fixture](fixtures/trees/report.json): **1,112 passing checks**, 162 WebGPU and 116 WebGL checks under each of day, low sun, overcast and night. The formerly failing alpine variant passes every light direction. The new actual-baker trunk-normal round trip guards the premultiplication failure.
- [Albedo diagnostic](diagnosis/alpine-albedo/report.json) and [normal diagnostic](diagnosis/alpine-normals/report.json) isolate the old alpine failure. Their deliberately isolated views reuse lit comparison thresholds and are diagnostic records, not release approval reports.
- [Restored asset probe](diagnosis/tree-atlas-probe.json) verifies the initial repair on both worlds. [Source comparison](diagnosis/tree-source-comparison.json) separates the stale shipped signature from backend nondeterminism.

Final map replay, grass LOD/temporal, four-light surface/rock, HUD, movement and paired matrix results are added after their serialized hardware runs finish. Historical captures remain unchanged. Full-scenery recovery, frame pacing and artistic approval are separate from asset integrity.

Hardware: NVIDIA GeForce RTX 4080, 16,376 MiB reported memory, driver 617.14. Headed Windows Chromium uses hardware WebGPU; WebGL fixture runs verify fallback functionality and appearance, not authoritative frame time.

## Reproduction

Serve the desired committed revision in one terminal; run captures in a second terminal:

```sh
node scripts/serve-world-visual-snapshot.mjs 84399aef 5248
node scripts/capture-aaa-review.mjs --url http://localhost:5248 --out tmp/aaa-review
node scripts/run-world-visual-grass-qa.mjs --fixture ground-continuity --url http://localhost:5248 --out tmp/aaa-ground
node scripts/run-world-visual-trees-qa.mjs --lights all --url http://localhost:5248 --out tmp/aaa-trees
node scripts/run-world-visual-surfaces-qa.mjs --lights all --url http://localhost:5248 --out tmp/aaa-surfaces
node scripts/run-perf-matrix.mjs --headed --url http://localhost:5248 --warmup 8 --duration 12
```

Use native Windows Node from WSL for the hardware browser, as described in [perf-qa.md](../../perf-qa.md). Each browser harness holds the shared lock. Diagnostic tree runs accept `--diagnostic albedo` or `--diagnostic normals`; they isolate the alpine production prototype without changing the gameplay configuration.

## Remaining conditional work

A new procedural landform family, additional species/art packs, spectral ocean, hydraulic bank erosion and new sound assets require their own content and generation decisions. They were conditional follow-ups in the plan, not established defects in the screenshots. Existing movement, water traversal, soundscape and comfort behavior still require their functional review; no listening or manual interaction approval is inferred from still images.
