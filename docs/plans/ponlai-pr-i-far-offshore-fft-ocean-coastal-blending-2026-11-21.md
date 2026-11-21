# Ponlai integration — PR I: far-offshore FFT ocean and coastal blending

**Status:** DETAILED IMPLEMENTATION SPECIFICATION ONLY — this commit does not implement the FFT, change rendering, or report new hardware QA.  
**Date:** 2026-11-21  
**Drusniel inspected baseline:** [`1ad7a8902517a6926ee79edf9e98bc62d2f404cd`](https://github.com/danielsobrado/drusniel-world-builder/tree/1ad7a8902517a6926ee79edf9e98bc62d2f404cd), immediately after the coastal diagnostics commit.  
**Ponlai reference:** [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e), immutable commit.  
**Roadmap:** PR I after [PR H](ponlai-pr-h-volumetric-clouds-and-shadows-2026-11-21.md), before the following integration PR.  
**Implementation policy:** re-read latest `main`, commit directly to `main` (no branches, worktrees or GitHub Actions), preserve all newer shoreline/ocean/grass changes. Use KISS/YAGNI/SOLID, small source modules, YAML config and separate constants; correct error/logging practices; run native headed WebGPU.

> **Critical project fact:** Drusniel already has five long deterministic sine swell components, directional breaking surf, finite-depth refraction, headland diffraction, persistent swash, wet sand and rock-impact foam/spray. The visible water height is *also used by canonical CPU water queries for swimming/wading*. Ponlai's FFT contains overlapping wavelengths. Blindly adding its full FFT geometric waves would double wave energy, break CPU-vs-GPU water level consistency and alias short waves on the 2m mesh grid.

> **Earlier plans status:** Ponlai PRs A–H in inspected Drusniel are **specifications**, not implemented rendering systems. PR I must not import hypothetical PR E physical-sky or PR H cloud-texture APIs. Integrate with the current sky light, sea state and water reflection owner.

---

## 1. Desired outcome and strict boundaries

### 1.1 Visual and engineering targets

- Offshore water must have believable **irregular wind-wave and distant-swell variation**, not only a handful of regular wave trains; short-wave slope detail responds to changing wind without glittering across distant horizons.
- Near shore, existing breakers must still shoal, refract/diffract around headlands, produce persistent foam, surge across sand, wet it and strike rocks. No new waterline displacement or broad regular FFT lines across beaches.
- Calm vs windy vs storm sea must vary in spectrum and *filtered* roughness, not merely height gain or whitecap opacity; existing authored palette and optical transport remain.
- One shared GPU spectral field per renderer, not per terrain chunk. Correct at giant and negative canonical world coordinates, after origin rebasing and time scrubs.
- Preserve the exact original water surface query for player movement, buoyancy and collision in the safe first release. No GPU readbacks during ordinary runtime.
- Protect sea reflection, glints, refraction, underwater caustics, foam, snow/ice, river and lake surfaces.
- With the new flag off: no new FFT buffers, shaders, sampler bindings, compute dispatches, initialization work or visual differences.
- Native WebGPU GPU compute cost, memory, CPU frame pacing, visual improvement and fallback limits must be measured, not inferred from only rendered pass timestamps.

### 1.2 Minimum viable implementation

1. Pure seeded directional Fourier spectrum and tiny **CPU DFT** verification oracle.
2. Native WebGPU half/float FFT computation of a **non-overlapping short-wave spectral residual**, first for *offshore slopes and filtered roughness*, **not vertex height**.
3. Stable canonical coordinates and one existing `WaterVisualClock`, with no per-chunk FFT instances.
4. Existing `SeaSurfaceShading` and shared `StylizedWaterMaterial` integrate optional FFT normal field while keeping authored five-sine height authoritative.
5. Offshore gate uses actual marine water-kind, water depth and existing exposure/shelter with a continuous transition beyond breaker ownership.
6. Strict YAML config, quality tiers, zero-off path, capability checks, safe device-loss fallback and complete disposal.
7. Native visual benchmark, test suite and all water navigation and coastal QA gates.

### 1.3 Optional later extension: true FFT geometry

Wave height/displacement/velocity may only be added if synchronous CPU water-height querying becomes **mathematically consistent** with the visible mesh for arbitrary world positions **without runtime GPU readback**. A deterministic CPU sparse-low-frequency spectrum companion or fundamentally redesigned authoritative wave source are possible, but require their own tests, performance and resource contracts. Do not claim full FFT geometry in the first slice without that proof.

### 1.4 Exclusions

Do not replace the ocean domain with a flat plane; alter water geography, biome IDs, terrain chunks, sea levels, navigable water kinds or the nearshore breaker timing; introduce a new storm/wind/clock simulator; change scene HDR/IBL, sky exposure or all refraction pipelines; or copy Ponlai's 1492-line water material over Drusniel's existing 747-line shared material.

---

## 2. Existing Drusniel architecture and important constraints

| Domain | Inspected Drusniel file | PR I rule |
| --- | --- | --- |
| Water YAML owner | [D2] `config/water-visual.yaml` | Add `water.sea.offshoreFft` here; not a duplicate `editor.config.yaml` tree |
| YAML assembly | [D3] `WaterVisualConfig.js` | Uses compiled water YAML and `applyWaterVisualConfig`; preserve precedence |
| Sea validation | [D4/D5] `WaterQuality.js`, `SeaConfig.js` | Strict bounded enums/numbers and low/medium/high/ultra policy |
| Analytic swell | [D6] `SeaSwell.js` | Five 42/26/17/11/7.5m component lengths; CPU canonical phase and TSL exact twin |
| Shared sea state | [D7] `seaState.js` | One storm/sun/tint/water-level/time authority and `seaSurfaceOffset` |
| Three nearshore carriers | [D8/D9] `SeaSurf.js` and `SeaSurfMath.js` | Keep their finite-depth refraction, diffraction, breaking, foam and CPU match |
| Surf shader handoff | [D10] `SeaSurfNodes.js` | Existing 2.5–7m **depth** blend from breakers to five-sine offshore; no FFT here in MVP |
| Sea shading | [D11] `SeaSurfaceShading.js` | Extend only sea slope/normal with bounded spectral high-frequency residual |
| Water material | [D12] `StylizedWaterMaterial.js` | Keep water kind masks, refraction, foam, glint, sea optics, height/ice and shader sharing |
| Shared water slots | [D13/D14] `StylizedWaterSlot.js`, `SharedWaterMaterials.js` | Existing 65×65 grid per 128m page; one FFT source, not 49 new shaders |
| View/lifecycle | [D15] `StylizedSurfaceViewBase.js` | Own FFT resource once and schedule before draw, including underwater |
| Gameplay queries | [D16/D17] `TerrainWaterQueries.js` and water-domain contract | Arbitrary-position canonical CPU query is authoritative; no GPU readbacks |
| Shared water time | [D18] `WaterVisualClock.js` | FFT phase must use same absolute clock and QA freeze |
| Page water fields | [D19/D20] `WaterField.js`, `WaterTerrainModel.js` | Preserve kind, coverage, depth, shore distance and bounds |
| Shore geometry | [D21/D22] `OceanBathymetry.js`, `OceanDistanceField.js` | Don't assume shore distance valid beyond its bounded reach |
| Existing micro ripples | [D23/D24] `SeaDetailShading.js` and `SeaDetailPolicy.js` | Avoid stacking duplicate slope variance in matching high frequencies |
| Swash and impacts | [D25–D27] swash forcing/shading and rock impact | Unchanged initial CPU wave heights and foam event timing |
| Wind | [D30] `WorldWindPass.js` | Reuse resolved weather heading/speed; separate local wind sea and long-travel swell if desired |
| Hardware fixtures | [D31–D36] surf fixture, wave tests and coastal QA | Extend source-pinned capture/QA, preserve latest shoreline fix |
| Water reflections | [D37] `WaterReflectionController.js` | Reuse existing reflection owner; do not run second FFT for capture |
| Current sky | [D40] `skyLight.js` | Preserve sea sun-glint and sky tint |
| Acceptance | [D41–D43] package scripts, water acceptance and GPU profiler | Capture independent **compute** time as existing render timings exclude it |

### 2.1 Why FFT vertex waves cannot be inserted directly

`docs/architecture/water-domain-contract.md` [D17] explicitly requires that normal water query operation does **not** read back the GPU. [D16] `toCanonicalWorldSample` adds `seaSurfaceOffset` to all ocean surface heights. Its CPU implementation reads the current five-sine/three-breaker model. If the sea mesh adds extra FFT height without updating the CPU response, swimmers can intersect the water sheet, rocks emit spray on the wrong crest and wading depth becomes wrong.

**Required first step:** use FFT only for **fragment/vertex-normal spectral detail** without changing the actual sea `displacement` output. A later geometric FFT requires a synchronous deterministic CPU twin, with tested arbitrary canonical queries and no expensive full FFT per query.

### 2.2 Existing water grid and texture budgets

The live water geometry is a 65×65 vertex grid over 128m, giving 2m spacing: mathematical height Nyquist wavelength 4m, but conservative visible/accurate vertex wave detail starts nearer 8–12m. The shortest spectral FFT waves are **centimetres**, so sampling them into vertex Y causes aliasing regardless of FFT resolution. Fine band belongs in **normal/specular roughness** after footprint filtering.

Current `StylizedWaterSlot` shares source materials through `SharedWaterMaterials` and owns per-resident water page textures and a **six-metre geometry bounding allowance**. Any later vertical FFT beyond that must update conservative bounds/culling. Current near-water refractive variant samples viewport color/depth; adding viewport texture nodes can turn on a frame-wide render copy, and must be avoided for FFT.

### 2.3 Coastal QA baseline and shore-cutoff warning

The latest `docs/qa/coastal-fix-review-2026-11-21/findings.md` [D34] fixed an angular seabed wetness band at a **17m depth sampling cutoff**. Its [D35] hardware comparison captures beach, curve, headland, cove and storm. **Do not create a new spectral blend ridge at 7m or 17m.**

RTX 4080 headed WebGPU @1600×900 has real frame pacing and water-swim data; its GPU render-pass timing **excludes compute dispatch time**. PR I must add isolated FFT profiling and keep end-to-end frame A/B timing. The recent water acceptance traversed enter water → swim → dive → surface → return dry; every PR I geometry/normal path must preserve that behavior.

---

## 3. Verified Ponlai modules and adaptation decisions

| Source | Actual behavior | Adapt | Avoid |
| --- | --- | --- | --- |
| [P1] `ocean/OceanFFT.ts` | 659 lines, FFT modes, two wave systems, Fourier time evolution, IFFT, output textures | Seeded spectral setup, Stockham transform, stable phase, owned buffers | Full 4×256 field engine and 12 output layer draws by default |
| [P2] `ocean/OceanSpectrum.ts` | JONSWAP/TMA finite-depth waves, directional spreading and CPU numerical integrals | Small CPU reference and units, energy-vs-wavenumber tests | Blind use of tidewater wind presets as Drusniel art direction |
| [P3] `ocean/WaveDamping.ts` | Attenuation by seabed, coast lee and rock distance | Consistent attenuation concept | Replacing proven nearshore surf diffraction |
| [P4] `ocean/Water.ts` | 1492-line complete FFT-displaced physically lit water | Texture-array sampling, slope/normal convention | Full renderer/material replacement |
| [P5] `ocean/UnresolvedSlopes.ts` | Spectral slope variance lost in mip/trilinear filtering | Anti-glitter roughness from filtered slopes | Huge table machinery before simple band works |
| [P6] `ocean/SlopeLobe.ts` | Sun/sky glint probability from microfacet slopes | Optional later lobe quality | Duplicating current glint/IBL response |
| [P7] `ocean/SeaDetail.ts` | Gust patches, slicks, windrows | Optional large-scale weather link | New duplicate packed detail in current sea shader |
| [P8] `ocean/StormSea.ts` | Persistent storm foam and ocean spray | Optional later storm effects | Doubling current coastal foam/spray |
| [P9] `ocean/WaveMaps.ts` | FFT caustic/wave maps | Optional future effects | Replacing existing underwater/projected caustics |
| [P10] `ocean/ShoreWaveField.ts` | Reconstructed shore distance and shelter | Research only | Parallel coast worker and water-domain field |
| [P11] `ocean/ShoreWaves.ts` | Near-rock wave reaction | Reference only | New competing surf timing |
| [P12] `ocean/SeaReflection.ts` | Ocean-only reflection and trace | Reference for optional lobe | Replacing WaterReflectionController |
| [P13] `ocean/SeaOptics.ts` | Spectral water transport | Compare existing optic model | Double absorption and sea tint |
| [P14] `ocean/FoamPattern.ts` | Whitecap texture | Deferred | Duplicate shore/surf whitecaps |
| [P15] `ocean/ScreenReflection.ts` | Sea screen-space tracing | Deferred | Extra full-scene view depth/colour copy |
| [P16] `ocean/Refraction.ts` | Depth-aware water refraction | Deferred | Undo tested near-water refraction |
| [P17] `Quality.ts` | Renderer quality tiers | Adapt idea | Unbounded high-end default |

### 3.1 Specific FFT implementation we are taking inspiration from

[P1] has `FFT_N=256`, four metre tile sizes `[733,157,33.3,7.1]`, and **band-separated** cascades using six Fourier fundamentals. It builds a single seeded Gaussian mode field, two directional spectral energy systems (wind sea + persistent distant swell), reconstructs the six packed complex fields, and produces **three four-layer RGBA16F texture arrays**: displacement/Jacobian, derivatives, orbital velocity.

It includes Stockham radix-2 IFFT with **16 regular stage dispatches** or **two optimized workgroup line passes** using 256 threads and 12KiB workgroup scratch, within WebGPU's 16KiB minimum. Both are followed by up to **12 render-quads for outputs** and mip generation. This is impressive but is not automatically fast in Drusniel's heavily loaded water/scene. Start small, verify correct TSL under Drusniel's installed Three, measure and only then optimize.

### 3.2 No frequency/energy duplication

Drusniel's existing analytic wavelength list `[42,26,17,11,7.5]` overlaps Ponlai FFT bands. Blindly adding the FFT height/slope means extra variance in exactly the same bands. Keep existing waves for authoritative geometric height. FFT MVP is a high-pass **shorter than the 7.5m carrier** and replaces/reduces matching `SeaDetailShading` normal detail rather than adding a second copy.

If the cutoff changes for art quality, make the blend **power/variance-aware**, not merely averaging arbitrary sines. All FFT contributions are zero for non-ocean water, ice, beaches, surf band and underwater modes where the small slopes cannot be resolved reliably.

### 3.3 Attribution and licensing

[P1/P2/P3/P4/P7] attribute substantial techniques to **tidewater**, Daniel Greenheck / DRG Software Solutions LLC, under MIT; [P4] includes additional David Hoskins MIT hash attribution. Preserve exact source/file SPDX notices if copying/adapting, check upstream ancestors separately and record immutable source hashes. An FFT's seeded Fourier modes are computed from code: no unverified noise texture binary is required. Do not drag all Ponlai ocean shaders or framegraph into this repository.

---
