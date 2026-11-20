# Ponlai integration — PR G: ground bounce, ambient relighting and material receivers

**Status:** IMPLEMENTATION SPECIFICATION ONLY. No production feature code or QA results are claimed by this document.  
**Date:** 2026-11-21  
**Drusniel baseline:** [`3e418938f8d57c67bcb56cf9082233b291054210`](https://github.com/danielsobrado/drusniel-world-builder/tree/3e418938f8d57c67bcb56cf9082233b291054210)  
**Ponlai baseline:** [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e)  
**Roadmap:** PR G, Phase 4 of A–L; follows [PR F streamed SH visibility probes](ponlai-pr-f-streamed-ambient-sh-probes-2026-11-20.md); next is PR H volumetric clouds.  
**Project rules:** work on latest `main`, commit directly, no GitHub Actions, no branch/worktree, preserve concurrent changes. KISS/YAGNI/SOLID, YAML config, correct error/logging, measured performance, Azgaar IDs unchanged.

> **Critical dependency:** PR F is a specification, not yet implemented on the inspected `main`. The directory `src/editor/lighting/probes/` was absent. Any PR G implementation must first verify and, where necessary, complete PR F's actual worker/SH/streamed GPU/material contract. **Do not import proposed F class names as if they existed.** Writing PR G's document is not implementing G or F.

## 1. What the renderer should achieve

Extend a verified PR F outdoor **sky visibility SH9** pilot to deliver *coherent coloured indirect light*, preserving direct sunlight, existing shadows, water appearance, HDR and atmosphere.

- **Ground bounce:** shaded faces next to warm soil, sunlit paving, rock or pale sand receive local, normal-dependent reflected illumination, not a flat universal warm hemisphere.
- **Sky-bounced colour:** terrain, wet litter, limestone, snow and green undergrowth reflect different colours when lit by the broad sky. A clear opening is brighter than a covered cliff base; directional sky SH remains meaningful.
- **Sun/moon changes:** sky-source colour and key direction can change without retracing static probe geometry. A rock behind a cliff does not glow as though the sun shines through it.
- **Coastal return:** only if validated, shallow water casts restrained blue/green indirect light on near-coastal stone; deep/turbid water does not create a glowing turquoise wall. The existing sea surface and foam shader remain.
- **Multiple eligible receivers:** the terrain from F and at least one additional outdoor class, preferably stone/boulders, use the same radiometric source. Tree bark/leaves, grass and town structures are additional gated integrations.
- **No double light:** the project already has artistic sky/ground fill as `emissiveNode`; physical bounced irradiance must replace/rebalance those terms for participating materials, not simply add over them.
- **Streaming-safe:** world remains unbounded, negative world coordinates and floating origin work, and probes never hold up terrain visibility.

### Scope and deliverables

1. Worker-baked **static RGB SH9 one-bounce transfer** from diffuse surfaces under a known white-sky reference, with canonical source versioning and low-priority scheduling.
2. One coherent **relit RGB irradiance** field combining existing F visibility/sky with G static bounce; bounded resident GPU output.
3. Optional **local dynamic sunlit-ground** bounce target, updated only on actual shadow/sky/camera/terrain changes, with strict GPU and shadow-source gate.
4. Optional coastal **diffuse waterbody/seafloor reflected radiance**, separately validated and initially off.
5. PBR ambient integration that preserves the project's current custom `SnowLightingModel`, foliage direct-light wrappers, specular IBL and the two main rendering paths.
6. Correct handling of old canopy/rock/building fake fills and camera-global town hemisphere bounce.
7. Source-referenced CPU SH tests, synthetic geometry fixtures, visual A/B and movement/GPU QA with rollback.

### Explicit exclusions

No recursive GI/path tracing, whole-world 3D texture, material-wide monkey patch, duplicate sky rig, new exposure controller, terrain-worker hot-path rays, whole-screen viewport texture fetch, forced material-recompile per slot, universal per-pixel SH9 reads on every grass blade, generic blue sea emissive, new Azgaar save schema, or mixing dedicated underground location light bakes into the outdoor renderer. Do **not** copy Ponlai's 2 m finite-island grid, magic gains or 256×256 island bounce map as-is.

## 2. Exact architecture comparison — which code owns each problem

| Concern | Actual Drusniel owner | Actual Ponlai owner | Adaptation |
| --- | --- | --- | --- |
| PR dependency | [D1] PR F specification | [P1–P3] probe bake/relight/sample | Verify real F API first, do not create a parallel GI manager |
| World geometry | [D2/D3] YAML and `src/main.js` | [P1] island `AmbientProbes` | `world.chunkSize=64` × `map.tileSize=2` → **128 m streamed chunks**, up to 49 resident slots |
| Slot/material sharing | [D4/D5] `InfiniteTerrainView` and `TerrainSlotBindings` | [P8] `AmbientVolume` | One shared terrain material, no new sample-sampler count beyond WebGPU limits |
| Static albedo | [D25/D26] terrain CPU bake and TSL material family | [P9] `BounceGround` source | Derive verified **linear diffuse** reflectance; never read display pixels as albedo |
| SH projection | PR F proposed SH basis | [P6/P7] `Harmonics`/`ProbeFormat` | **Same SH9**, y up, Gaunt angular product, cosine convolution once |
| Static bounce | [D27] edited canonical terrain; F worker | [P1] `hitRadiance` | Worker-side one bounce, memoized hit visibility, bounded trace + halo, separate cache |
| Relighting | [D8/D9] sky/look/environment | [P2/P4] `AmbientRelight`/`AmbientGrade` | One sky source and one output, geometry and sky generations separate |
| Key/shadow | [D8/D10/D29] directional sun, cloud shadows and CSM | [P5] `GroundBounce` | Bounded local emitter map; **prove shadow API** before enabling |
| Ocean | [D21–D24] sea optics, depth and state | [P5/P2] sea return | Depth/Fresnel/attenuation-informed, not global turquoise fill |
| Terrain/snow | [D6/D7] terrain and snow model | [P11] indirect model | Compose existing direct and new indirect hooks, avoid losing snow glints |
| Rock/fill | [D11/D17] rock emission, surface weathering | [P3] sample | Preferred second receiver; fade fake sky/ground fill only when valid |
| Trees/bark | [D11–D15] trees and foliage model | [P3/P10] vegetation receiver | Preserve transmission, wet sparkle, normal maps, snow and LOD clones |
| Grass | [D16] double-sided Lambert instancing | [P10] meadow canopy | Optional, low-resolution/vertex sampling only if cost/quality justifies |
| Towns | [D18/D19/D20] town emission and global hemisphere re-tint | [P9] island palette | Distinguish **camera-global** legacy town colour from physical per-object bounce |
| Occlusion | [D30/D31] GTAO/cinematic contact | [P3/P4] diffuse/specular occlusion | No doubled canopy, contact or IBL suppression |
| Dedicated locations | [D32/D33] location indirect surfels/vertex bake | [P1/P5] outdoor bounce | Remain separate loading-screen lighting architecture |
| Performance | [D34–D39] native WebGPU QA & scripts | [P2/P5/P8] compute/RTT and staged writes | No terrain stall or 49 shader compilations |

**Important code facts from current main:**

- [D3] constructs `WorldChunkWorkerClient` and `WorkerBackedWorldStore` with `config.world.chunkSize` and `config.map.tileSize`. Even though `map.chunkSize` separately says 32, **terrain chunks are 128 m**, not 64 m.
- [D5] reports one shared terrain material for all 49 slots; a per-slot material program formerly took ~0.6 s to build and triggered very large first-player-frame stalls. It also explicitly documents the portable 16-fragment-sampler limit.
- [D7] sets `material.setupLightingModel = () => new SnowLightingModel(...)` to preserve shadowed direct snow glints. G must **compose**, never overwrite it.
- [D13] wraps `setupLightingModel` and delegates `model.direct` for foliage transmission, wet highlights and relief. G cannot replace this method blindly.
- [D11] contains `treeFoliageEmission`, `treeBarkEmission`, `rockShadeEmission`, `understoryShadeEmission` and `buildingShadeEmission`. These *already* add sky/ground fill to material emission and must not be added again via GI.
- [D20] `SettlementGroundBounce` alters `HemisphereLight.groundColor` based on the **nearest town to the viewer**. This is a legacy art-directed approximation, **not** a spatial bounce field.
- [D9] `scene.environment` supplies diffuse IBL **and metallic reflections**. Do not disable it globally.
- [D10] `applyCloudShadow` modifies `material.receivedShadowNode`, attenuating *direct* sunlight. A separate ground emitter pass must sample cloud transmittance **once at the emitting patch**.

## 3. Ponlai: exact reusable design and deliberate exclusions

### 3.1 Static one-bounce transfer [P1]

`packages/island/world/AmbientProbes.ts` traces fixed-order spherical Fibonacci directions (`RAYS=128`), with a second set of cosine-weighted hit rays (`SECONDARY=16`). Each opaque surface hit's `hitRadiance(v)` computes its outward normal, estimates sky visibility by tracing another hemisphere, multiplies by the material's **linear albedo**, and memoizes the response. The result is then projected to **nine SH coefficients** in a fixed order. Sea and foliage in-scatter are separate channels.

**Reuse:** the *principle* that baked coloured reflected-light transfer is geometry/material dependent, but **sky-colour independent**; stable basis, deterministic accumulation, memoized hit visibility, relocation and invalidity.

**Reject for G:** the finite island geometry, 2 m voxel/probe sampling, fixed level count tied to bamboo/sea-zero, literal island albedos, entire 80-float probe layout, open-sea edge column, and 128×16 rays over 1,156 high-tier F probes × 49 chunks. All have different costs/scales here.

### 3.2 Relighting [P2] and SH math [P6/P7]

Ponlai's `AmbientRelight.ts` separates **four components** before cosine convolution:

1. **Sky:** sky RGB SH9 angularly multiplied by probe sky visibility using `shProduct` (Gaunt triple integral).
2. **Sky-bounced RGB:** pre-baked reflected-sky transfer times the broad sky's mean radiance.
3. **Key-bounced light:** directional sun/moon bounce lobe, attenuated by scene/cloud visibility.
4. **Sea-reflected light:** depth/sea-visibility-dependent sky + key term.

It computes a final SH9 RGB irradiance field, optionally applies a directionality boost and deringing, then packs **seven RGBA16F slabs** per probe for materials.

**Mathematical contract:**

```text
radianceSH_i = ∫ L(ω) Y_i(ω) dω
visibilitySH_j = ∫ V(ω) Y_j(ω) dω
angularProductSH_k = Σ_i Σ_j skySH_i * visibilitySH_j * Gaunt(i,j,k)
Gaunt(i,j,k) = ∫ Y_i Y_j Y_k dω

E(n) = Σ_i cosineLobe[band(i)] * radianceSH_i * Y_i(n)
cosineLobe = [π, 2π/3, π/4] for bands 0,1,2
```

**Never** multiply matching coefficients `skySH[i] * visibilitySH[i]` to approximate the product; that is not spherical-harmonic multiplication. Never cosine-convolve twice; raw transfer source and irradiance output have distinct units.

### 3.3 GroundBounce [P5] — different from static sky bounce

The upstream `GroundBounce.ts` is explicitly annotated:

```text
Adapted from tidewater by Daniel Greenheck
SPDX-FileCopyrightText: Copyright (c) 2026 DRG Software Solutions LLC
SPDX-License-Identifier: MIT
```

It draws a `256×256` half-float map of **sunlit ground response per unit key**, using surface albedo, ground/sea depth, sun shadow-map visibility and cloud input. It applies a binomial blur, reads the map under downward-facing receivers with a height/surround attenuation, and injects through `builder.context.irradiance` in `GroundBounceLightingModel`. It updates only when sun-shadow steps, sea/field inputs or mapped coordinates change.

**Reuse:** separation of dynamically illuminated *emitters* from passively illuminated *receivers*, correct shadow-domain attenuations, local height and normal response, update-on-change, diffuse BRDF injection.

**Do not copy:** `sunShadow.currentPCFVisibility`, `shared.shoreXform`, `WaveMaps.bounceLayer`, fixed 256² target, arbitrary ``BOUNCE_GAIN=9.4`/`SURROUND=0.6`, sea level 0 or exact water Fresnel coefficients. Those belong to Ponlai/tidewater's rendering architecture, not ours. Retain licence attribution in any adapted code.

### 3.4 AmbientSample/Grade/Volume [P3/P4/P8]

- [P3] replaces environment **diffuse** for participating receivers while preserving specular. It samples SH9 with normal/view bias, trilinear neighbourhoods and a receiver-specific weight, differentiating sky visibility from local bounced irradiance. Metal/specular correction uses a bounded ratio with an environmental floor.
- [P4] is an *art direction* table layered over calculated sky and bounce; do not copy fixed gain keys and call them physics. Start energy-neutral and tune by evidence.
- [P8] swaps resource nodes/texture targets only **after preparation**, without rebuilding existing shader graphs; its single island 3D volume itself is not suitable for an unbounded world.
- [P9] sources bounce albedo from the island's real material palette. [P10] separately models meadow canopy direct-key attenuation. [P12] has its own GGX split-sum lookup, **not** a required dependency for Drusniel's current Three.js BRDF.
- [P13] provides local bounded solid-occlusion ideas; use F's canonical scene snapshot rather than implementing a competing geometry ray-tracer.

## 4. G.0 — mandatory prerequisite audit

Before code, inspect **latest** `main` and require:

- [ ] Actual F CPU probe sample format, stable SH basis, static world/canopy geometry revision and halo rules.
- [ ] F GPU residency and **one neutral fallback** with chunk slot generation checks and bounded pages.
- [ ] F sky SH source, coherent published sky generation, **unconvolved radiance or explicit conversion**, and terrain pilot in the ambient diffuse lighting stage.
- [ ] F worker lane isolated from terrain critical jobs; real native WebGPU performance evidence.
- [ ] Confirm PR E physically based atmosphere exists **as code** or else use current [D8/D9] authored sky/HDR fallback. Earlier PR E document is not a runtime implementation.
- [ ] Inspect installed Three.js PhysicalLightingModel and Lambert lighting methods for exact indirect diffuse/specular placement and compatible composability.
- [ ] Audit [D7] snow direct override, [D13] foliage model wrapping, [D20] town hemisphere mutation, [D11] existing faux bounced emission.
- [ ] Confirm source-geometry edit revision is **independent of sky/look generation**.
- [ ] Save baseline from current commit with source hashes, display backend, raw shader compile count and world dimensions.

**Hard stop:** if F is missing, not diffuse-correct or debug-only, first complete a separately reviewed F implementation. Do **not** make one giant PR that introduces F and G and claims all steps passed without evidence. A detailed blocker report counts as analysis, not G completion.

---
