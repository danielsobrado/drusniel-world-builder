# PR I — Phase I.0: audit and deterministic QA baseline

**Status:** Phase I.0 complete. Audit, native capability probe and baseline only. No FFT shader, kernel, texture, config key or water displacement was added.
**Date:** 2026-11-21
**Specification:** [PR I far-offshore FFT ocean and coastal blending](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-21.md) (§14 I.0).
**Evidence:** [`docs/qa/ponlai-pr-i-phase-i0-2026-11-21/`](../qa/ponlai-pr-i-phase-i0-2026-11-21/README.md).

## 1. Source revision and implementation status

| Item | Value |
| --- | --- |
| Audited runtime source | `a6e09d596a433defa617fac245a2b08b6d8a79de` (served as an immutable snapshot, sha256 `a8bdc3df…c61a`, 2,395 files) |
| Changes since the spec's pinned `1ad7a890` | 7 commits, all under `docs/`. Every water, render and config file named in the spec is byte-identical to the pinned baseline, so every spec line reference still holds. |
| Landed while this audit ran | Phase I.1 by another session: `d304aa53` (first cut) and `c2360125` *complete PR I phase I.1 spectrum, Gaussian modes and Fourier oracle*, with its own report [`ponlai-pr-i-phase-i1-spectrum-and-reference-2026-11-21.md`](ponlai-pr-i-phase-i1-spectrum-and-reference-2026-11-21.md). Pure CPU modules under `src/editor/water/fft/`, not imported by any runtime path. `c2360125` already adopts this audit's corrections from its draft (§13). The runtime snapshot measured here (`a6e09d59`) is unaffected: I.1 touches no rendered code. |
| Ponlai reference | `cca905649fe657458697a9e1b179113c97ce5e6e` checked out locally. Upstream `HEAD` has moved on (`10353341`); the pinned commit is what was read. |
| Three.js | `0.187.0` installed (`package.json` `^0.187.0`). Ponlai pins `0.186.1`. |
| Renderer | `THREE.WebGPURenderer`, forced to the discrete GPU (`powerPreference: 'high-performance'`), device limits raised by `src/render/deviceLimits.js` to 32 sampled textures and 24 inter-stage variables when the adapter offers them. |
| Earlier Ponlai PRs A–H | Specifications only. No physical sky, cloud texture or probe API exists to import. |
| Offshore FFT in code before `d304aa53` | None: no `offshoreFft` key, no FFT node, no compute owner. |

Stop conditions in spec §14 I.0: none triggered. The water contract is explicit, the canonical transform reproduces, native WebGPU is available and the offshore shader is unchanged from the pinned plan.

## 2. Current water architecture and CPU/GPU contracts

### 2.1 Height sources and units

All heights are metres on world **Y**; the water mesh is a plane rotated −90° about X, so its local **Z** is world Y (`StylizedWaterSlot.js:117`, `positionNode = positionLocal + vec3(0,0,surfaceHeight)` at `StylizedWaterMaterial.js:724`).

| Layer | CPU (authoritative) | Shader twin | Inputs → output |
| --- | --- | --- | --- |
| Five analytic carriers | `sampleSeaSwellCpu(x,z,t,sharpness)` `SeaSwell.js:66` | `createSeaSwellNodes` `SeaSwell.js:88` | canonical x/z m, water time s → normalised height ≈ −1…1 and slope per metre |
| Amplitude envelope | `seaAmplitude(config,storm,depth)` `seaState.js:53` | `SeaSurfaceShading.js:90-96` | `amplitude·(1+storm·(stormScale−1))`, capped at `depth·depthRatio`, smoothstep to 0 below `shallowDepth` (1.5 m), × exposure → metres |
| Directional breakers (3 carriers) | `evaluateDirectionalSurfCpu` `SeaSurfMath.js:100`, `sampleSeaSurfDisplacementCpu` `SeaSurf.js:144` | `createDirectionalSurfNodes` `SeaSurfNodes.js:66` | shore distance phase + refraction + diffraction + shoaling/breaking; hands off to the five carriers by `smoothstep(fadeStart 2.5 m, fadeEnd 7 m, depth)` |
| Published offset | `seaSurfaceOffset(x,z,depth,shoreDistance,exposure)` `seaState.js:61` | `sea.displacement` `SeaSurfaceShading.js:138` | metres added to still water |
| Vertex waterline damping | — (CPU depth > 0 guard only) | `swing = smoothstep(0.25,1.2,depth)` `StylizedWaterMaterial.js:700` | sheet only; differs from CPU in the last 1.2 m of depth by design (`water-domain-contract.md:19`: mesh interpolation is assessed separately) |

The carriers are `[42, 26, 17, 11, 7.5] m` with weights `[0.53, 0.29, 0.10, 0.05, 0.03]`, directions spread ~70°, a sharpened sine `(s + sharpness(s²−½))/(1+sharpness/2)` with `sharpness = choppiness·0.075·(1+storm/2)`, and angular speed `0.55·√(g·k)` (`PHASE_SPEED_SCALE`, `SeaSwell.js:22`): the carriers move at 55 % of deep-water speed on purpose.

**How the shader reproduces CPU height.** Each slot computes every carrier's phase at its chunk centre in double precision, wrapped to [0, 2π) (`seaSwellPhaseOrigin`, `SeaSwell.js:52`), on descriptor change (`StylizedWaterSlot.js:239-243`). The shader adds only `localXZ·k` across the 128 m chunk and `(t·ω) mod 2π` (`SeaSwell.js:94-97`). The CPU sums the same terms in double (`SeaSwell.js:69-71`). Equality is asserted by `test/sea-swell.test.js` (*chunk phase origins reproduce the absolute swell far out on a planet-sized sea*, *continuous across a chunk border*) and `test/sea-surf.test.js` (*wrapped shader surf coordinates agree with swimming heights across distant chunk boundaries*, *directional surf retains exact legacy offshore displacement*).

### 2.2 Canonical coordinates and floating origin

- Canonical metres: `x` east, `z` with `cellZ = −worldZ / tileSize` (`TerrainWaterQueries.js:184-188`). The shader's `localXZ = ((u−½)·size, (½−v)·size)` is on canonical axes (`SeaSurfaceShading.js:83-86`, `StylizedWaterMaterial.js:154-157`).
- Precision-critical terms that read canonical coordinates only on the CPU: carrier phase origins (`seaSwellPhaseOrigin`), every surface pattern origin (`createWaterPatternOrigins(...).update(centerWorldX, centerWorldZ)`, `StylizedWaterSlot.js:251`), the waterfall pattern origin and the ripple origin (`:245-250`). The shader never sees an absolute canonical coordinate except `chunkCenter + localXZ` for low-frequency flow (`StylizedWaterMaterial.js:158`).
- Rebase: `getWorldWater(renderX, renderZ)` converts with `floatingOrigin.toCanonical` and delegates to the canonical query (`TerrainWaterQueries.js:191-195`). The slot copies the terrain slot's render position each frame (`StylizedWaterSlot.js:238`); its uniforms depend only on the descriptor, so a rebase changes nothing in the shader. Covered by `test/water-floating-origin.test.js` and the WebGPU `surf-rebased` / `underwater-rebased` parity captures (§8).

### 2.3 Ocean versus lakes and rivers

- Authoritative kind: `WaterSample.kind` from the water domain. `sampleWorldStoreWater` treats an authored water tile without a generated body as ocean at `generator.seaLevel` (`TerrainWaterQueries.js:153-166`). Only `WATER_KIND_OCEAN` receives `seaSurfaceOffset` (`:111-114`).
- Shader: `oceanMask: appearance?.ocean` from the appearance texture's kind channel (`StylizedWaterMaterial.js:220`, encoded at `WaterField.js:280-282`). The sea-level/no-current heuristic `seaWaterMask` (`SeaSurfaceShading.js:57`) is only a fallback when no appearance texture is bound (standalone fixtures). Lakes at sea level are kept off the sea by the kind channel (`webgpu-sea-level-lake` parity capture).
- Rivers: kind 3, plus `currentStrength`; lake waves are added only where `1 − sea.mask` (`StylizedWaterMaterial.js:702-707`).
- Low water quality: `resolveWaterQualityFeatures(...).flow === false`, so the material builds no sea (`StylizedWaterMaterial.js:206`) **and** `main.js:1016-1018` calls `configureSea(null)`, so CPU queries also return a flat sea. CPU and GPU agree on every tier.

### 2.4 Shoreline distance, depth and exposure

| Field | Source | Range actually reachable | Shader read |
| --- | --- | --- | --- |
| `shoreDistance` | `WaterDistanceField` over ocean cells, `maxDistanceCells = ceil(shoreDistanceMeters / cellSize)` (`WaterTerrainModel.js:70-76`) with `waterDomain.shoreDistanceMeters: 48` (`config/water-domain.yaml:5`) | **0 … 48 m, hard cap.** Native survey: every open-sea sample saturates at exactly 48.0 (§8.3) | `max(waterField.a, 0)`, half-float (`StylizedWaterMaterial.js:140`) |
| `waterDepth` | `surface − bed`; bed from `oceanDepthProfile` (shelf 4 m at 20 m, linear to `maximumDepth` 24 m at 48 m, quadratic fillet, ±8 % value noise; `OceanBathymetry.js:16-31`) | 0 … ≈ 26 m. Survey: 20.8–24.8 m beyond 128 m offshore | `max(waterField.b, 0)` (`:139`) |
| `exposure` | `seaExposure(sd) = 0.3 + 0.7·smooth((sd−4)/32)` (`WaterAppearance.js:51-54`) × diffraction transmission (`SeaDiffraction.js:112-127`), 8-bit | `seaExposure` reaches 1 at `sd ≥ 36` m. The diffraction fade `smoothstep(40, 90, sd)` can only reach 0.069 at the 48 m cap, so **behind a headland exposure stays below 1 everywhere**; on open water the ray transmission is 1 | `appearance.exposure` |
| `oceanMask`, coverage | kind channel, `max(surfaceMask, field.r)` | 0/1 | `appearance.ocean`, `waterCoverage` |

Consequence for any shore-distance gate: thresholds must sit below 48 m. A 200 m fade would never reach full strength. The diffraction offshore fade is already a case of this (its 90 m end is unreachable); that is pre-existing and intended to keep shelter persistent, not a defect this phase should change.

### 2.5 Wind, storm and time

- Storm: `seaStormForWeather() = wind·(0.5 + 0.5·clamp((storm−0.5)·2))` (`main.js:1023-1026`) → `seaStateUniforms.storm` (0…1). It raises carrier amplitude (`stormScale` 2.6), sharpness, ripple strength `×(1+1.2·storm)` (`SeaSurfaceShading.js:117`), roughness `+0.09·storm` and lowers the whitecap threshold.
- Wind direction does **not** reach the sea today. Carrier directions are constants; `weatherSettings.weatherWindX/Z` feed `WorldWindPass` only (`main.js:1885-1891`).
- Time: one `waterVisualClock` uniform (`WaterVisualClock.js`). Published by `updateSeaState` (`main.js:1897`) and by every slot's `update` (`StylizedWaterSlot.js:206`) with the same value. `setWaterTimeOverride(seconds)` freezes it for QA (0–86,400 s). Live time is `frameTimestamp / 1000` and grows without bound.

### 2.6 Gameplay consumers

`getCanonicalWater` / `getWorldWater` / `…Navigation` (`TerrainWaterQueries.js:178-203`) are the only height sources for `PlayerController` (swim/wade/dive/surface), `WaterReflectionController` (planar height), `weather_terrain_adapters`, `RoadsideDetailsView` and QA. Rock impact and swash timing use the same CPU surf model. None reads back the GPU (`water-domain-contract.md:28`). **Invariant kept for PR I: the FFT adds no height; CPU stays authoritative.**

## 3. Rendering pipeline

### 3.1 Frame order (verified)

```text
main.js:1840  stylizedSurface.update(t)      → every StylizedWaterSlot.update publishes the clock, uploads pages, phase origins on descriptor change
main.js:1897  updateSeaState({ timeSeconds, storm, rain, seaLevel })
main.js:1992  terrainView.render(camera)
  InfiniteTerrainView.js:543  coastalSwash.update(camera, waterVisualClock.value)   ← existing per-frame compute
  InfiniteTerrainView.js:544  beforeMainRender(camera)    ← StylizedSurfaceViewBase.js:388 (cascades, reflection prepare)
  draw (post-processing / god-rays / renderer.render)
  InfiniteTerrainView.js:562/573  afterMainRender(camera) ← reflection cube/planar capture under the deferred budget
```

Under water, `isLandStreamingSuspended()` makes `update` return early **after** updating every water slot (`StylizedSurfaceViewBase.js:834-837`); `render` and both hooks still run every frame.

### 3.2 Materials, stages and binding

- **One graph per refraction variant.** `SharedWaterMaterials.get(options, enableRefraction)` builds at most two `MeshBasicNodeMaterial`s (`SharedWaterMaterials.js:17-39`). Per-slot values bind through `uniform(...).onObjectUpdate` for `waterSurfaceOrigin, chunkCenter, time, rippleOrigin, patternOrigin` and the five `seaPhaseOrigin` floats (`:22-29`), pattern origins through `surfacePatterns.perObject`, and the page textures through `perObjectTexture` / `bilinearLoad` (`:31-32`). The refractive variant is built lazily on first approach (`StylizedWaterSlot.js:110-114, 160-165`) and only for slots within `REFRACTION_CHUNK_RADIUS` of the focus chunk.
- **Vertex stage:** page field sample, carrier/breaker displacement, `positionNode`. Varyings already allocated by the sea: `seaSwellAmplitude`, `seaSwellHeight`, `seaSwellSlope`, `seaDirectionalAmplitude`, `seaCoastalSurfPhase0…2`, `seaRippleOrbit`.
- **Fragment stage:** sea detail ripples (texture reads), normal, glint, foam, optics, refraction (viewport depth + opaque mip only in the refractive variant), reflections, caustics.
- **Resident slots:** one per terrain slot (49 at the reference view distance), 65×65 vertices over 128 m (2 m spacing), field RGBA16F + flow RGBA8 + appearance RGBA8 (+ obstacle RG8) per slot.

### 3.3 Water texture and resource inventory (existing)

| Resource | Size | Owner / lifetime |
| --- | --- | --- |
| Page field + flow + appearance | 65²×16 B = 67,600 B per slot; **3,312,400 B for 49 slots** (matches the coastal review logs) | `StylizedWaterSlot`, disposed in `dispose()` |
| Obstacle RG8 | 65²×2 = 8,450 B per slot (414,050 B / 49) | same |
| Sea detail donor | 512² RGBA8 = 1 MiB (+mips) | `acquireSeaDetailTexture` lease, released on material `dispose` (`StylizedWaterMaterial.js:717-723`) |
| Reflection cube ×2 | 256²×6×RGBA16F = 3 MiB each | `WaterReflectionController` |
| Reflection planar | 512×256 RGBA16F = 1 MiB | same |
| Coastal swash state + scratch | `size²×8 B` each, high/ultra only | `CoastalSwashField` (InfiniteTerrainView) |

## 4. Ponlai reference audit (pinned `cca90564`)

### 4.1 `packages/render/ocean/OceanFFT.ts` (658 lines)

| Aspect | Ponlai |
| --- | --- |
| Resolution / cascades | `FFT_N = 256`, `CASCADE_SIZES = [733, 157, 33.3, 7.1]` m (`:107-112`); band of cascade c from `6·Δk_c` to `6·Δk_{c−1}` (`BAND_FUNDAMENTALS`, `:114, 121-130`) |
| Random modes | `gaussianPairs(seed, count)`: `mulberry32` stream, Box–Muller **cosine branch only**, one independent normal per float, uploaded once (`:186-199`) |
| Spectrum | GPU kernel `waveEnergy` (`:152-182`): TMA-corrected JONSWAP (σ 0.07/0.09), Donelan-style spreading with polynomial normalisation, `exp(−fade·k²)`, Jacobian `dω/dk / k`; two systems (wind sea + distant swell) summed; `h0 = gauss·√(E·Δk²/2)·amplitude/√2`; mirror index `((N−j)%N, (N−i)%N)`; Nyquist lines excluded (`:313-339`) |
| Phase / time | `exp(+iωt)` with **positive IFFT, so waves travel against +k** (`:355-360, 368-369`); `ω·time` evaluated in float32 **without modulo** |
| Fields | 6 packed complex fields in 3 `vec4` storage buffers: displacement, derivatives, Jacobian terms, orbital velocity (`:20-60, 346-390`) |
| IFFT | Stockham radix-2: 16 stage dispatches (`:395-427`) or two workgroup passes, 256 threads, 3×256 `vec4` workgroup arrays (12 KiB), `computeKernel([N])` with `dispatchSize` so no early-return bounds check precedes the barriers (`:430-479`) |
| Dispatches / frame | spectrum kernel only on wind change; evolve 1 + IFFT 2 (or 16); then **12 render-quad passes** into three `RenderTarget(N,N,{depth:C})` arrays, mip chain generated on the last layer only (`:482-506, 621-631`) |
| Ownership | `OceanFFT` owns kernels, buffers, targets; `dispose()` frees targets, quad materials, kernels (`:637-655`); no device-loss handling |
| Memory (256²×4) | ≈ 37 MiB logical before driver overhead (spec §9.1) |

### 4.2 Other files

- `OceanSpectrum.ts` (203 lines): `waveSystemTerms`, `seaState(windSpeed)` presets (fetch, choppiness, foam bias), `slopeVariance` numeric integral, Cox–Munk `0.003 + 0.00512·U`. **Reusable** as reference math; I.1 already re-derived its own pure version.
- `WaveDamping.ts` (64 lines): per-cascade depth attenuation (`d0 = min(40, 0.08·L)`), lee and rock damping. **Concept only**: Drusniel's surf, refraction and diffraction already own the coast.
- `UnresolvedSlopes.ts` (377 lines): LEAN-style table of slope variance lost to mip/anisotropic filtering, per cascade and footprint. **Deferred** (I.7); a scalar `variance → roughness` term (which Drusniel already has at `SeaSurfaceShading.js:134-135`) suffices for I.4.
- `SeaDetail.ts` (244 lines): gust patches, slicks, windrows. **Deferred**; would duplicate the current ripple layer.
- `Water.ts` (1,491 lines): complete physically lit displaced sea. **Not portable**: it would replace Drusniel's unlit material, optics, refraction, foam and swash (spec §1.4).

### 4.3 Source-to-source mapping

| Concern | Drusniel owner | Ponlai counterpart | Decision |
| --- | --- | --- | --- |
| Long waves / height | `SeaSwell` five carriers, `SeaSurf*` breakers | cascades 0–2 (733/157/33 m) | Keep Drusniel. No Ponlai long cascades. |
| Short-wave slope | `SeaRippleShading` donor-texture trains | cascade 3 (7.1 m) + near ripples | FFT replaces the in-band ripple trains (Decision A/D) |
| Spectrum math | I.1 `OceanSpectrum.js` (CPU, double) | `waveEnergy` GPU kernel + `OceanSpectrum.ts` | CPU table, uploaded (Decision G) |
| Time | `waterVisualClock` | `update(dt, time)` | Absolute clock, quantised period (Decision E) |
| IFFT | none | Stockham radix-2 | Adapt algorithm, slope-only single complex field |
| Output | none | 3 RGBA16F arrays, 12 quads | 1 RG16F array, 1 quad per cascade (Decision B) |
| Coast damping | depth/exposure/kind fields | `WaveDamping`, `ShoreWaveField` | Use Drusniel fields only (Decision F) |
| Filtered roughness | `detail.variance → roughness` | `UnresolvedSlopes` | Extend the existing scalar term |
| Reflection | `WaterReflectionController` | `SeaReflection`, `ScreenReflection` | Keep Drusniel |
| Quality | `WaterQuality` tiers | `Quality.ts` | Keep Drusniel tiers (Decision G) |

## 5. Native GPU capabilities (measured)

Probe: [`scripts/probe-ocean-fft-capabilities.mjs`](../../scripts/probe-ocean-fft-capabilities.mjs), run headed against the frozen snapshot on the app's **own** WebGPU device (raw WebGPU calls under validation error scopes; no FFT). Result: [`capabilities.json`](../qa/ponlai-pr-i-phase-i0-2026-11-21/logs/capabilities.json).

Hardware: Windows 11 Pro 26300, Intel Core i7-13700KF, NVIDIA GeForce RTX 4080 (adapter `nvidia` / `lovelace`, not a fallback adapter), Chromium 151.0.7922.34 headed, backend `webgpu`, **core** feature level (`compatibilityMode: false`, `core-features-and-limits` present).

| Capability | Result |
| --- | --- |
| Compute pipelines, storage buffers | Yes. Device: 8 storage buffers / stage, 128 MiB binding, 256 MiB buffer (adapter offers 16 / 2 GiB; not requested) |
| Workgroup memory + barriers | Yes. Device `maxComputeWorkgroupStorageSize` **16,384 B** (adapter 32,768, not raised), 256 invocations. A 3×256 `vec4` (12 KiB) shader with 16 `workgroupBarrier`s compiled and ran. |
| Texture arrays with mips | Yes: 128²×2-layer×8-mip textures created for `rgba16float, rg16float, r32float, rg32float, rgba32float` with render + sample + storage usage. Device `maxTextureArrayLayers` 256. |
| Half-float storage | `rgba16float` (core) and `rg16float` (needs `texture-formats-tier1`, present on this device; **not** guaranteed elsewhere) |
| Filterable float | `float32-filterable` present; half floats are filterable in core |
| Sampled textures / samplers / varyings | 32 / 16 / 24 per stage on the device (raised by `deviceLimits.js`; WebGPU default 16 / 16 / 16) |
| `shader-f16`, `subgroups` | Present (unused) |
| Compute GPU timing | **Supported.** `timestamp-query` present; compute-pass `timestampWrites` resolved: 24 samples of a 256-workgroup probe kernel, 5.1–13.3 µs, quantised to 1,024 ns steps (browser timer quantisation). Adequate for ≥ 0.05 ms budgets. |
| Three.js support | r187 exports `computeKernel`, `workgroupArray`, `workgroupBarrier`, `storageBarrier`, `textureStore`, `StorageTexture`, `StorageArrayTexture`, `Storage3DTexture`; `WebGPUBackend.beginCompute` initialises `TimestampQuery.COMPUTE` (`WebGPUBackend.js:1878-1892`); `renderer.resolveTimestampsAsync('compute')` exists (`Renderer.js:3369`) |
| Device loss | `renderer.onDeviceLost` is installed (`RendererStartupGuard.js`, Three `WebGPUBackend.js:277`). No runtime resource rebuild path exists for water today. |
| WebGL fallback | Exists (`forceWebGL`); no compute. FFT must be off there. |

**Existing GPU profiler gap.** `GpuPassProfiler` wraps only `backend.beginRender` and resolves `'render'` timestamps (`GpuPassProfiler.js:23-35, 54`), and reports its scope as excluding compute (`:79`). The coastal swash already dispatches compute every frame (`CoastalSwashField.js:259-260`) and is therefore unmeasured today.

## 6. FFT integration points (decisions)

### Decision A — Spectrum split

- Carriers own every wavelength **≥ 7.5 m** (`SEA_SWELL_COMPONENTS`, verified). The FFT residual owns **< 7.5 m** with the soft knee 7.5 → 5.5 m already in `d304aa53` (`HIGH_PASS_K0 = 2π/7.5`, `HIGH_PASS_K1 = 2π/5.5`). No FFT power at or above the shortest carrier; carriers keep 100 % of their amplitude.
- Candidate cascades in I.1 (`CASCADE_CANDIDATES`): 48 m tile for λ 7.5 → 2 m and 12 m tile for λ 2 → 0.5 m, disjoint half-open bands. Keep them: they are below the 2 m mesh Nyquist (normal-only) and above the existing fine ripple train.
- **Overlap with existing detail (correction to the I.1 test).** `seaDetailLayers` (`SeaDetailPolicy.js:25-40`) produces three ripple groups. Ripple length `1/(4f)` with `f = scale·(1|1.13)/textureWorldScale`:

  | Layer index | Names | Ripple length | Weight in `SeaRippleShading.js:25-26` | In FFT band 0.5–7.5 m? |
  | --- | --- | --- | --- | --- |
  | 0 | `seaDetail0/1` | 2.00 m, 1.77 m | 0.78 × `mediumStrength`, medium fade | **Yes** |
  | 1 | `seaDetail2/3` | 0.95 m, 0.84 m | 0.22 × `mediumStrength`, medium fade | **Yes** |
  | 2 | `seaDetail4/5` | 0.35 m, 0.31 m | 1 × `fineStrength`, fine fade | No (above k_max = 2π/0.5) |

  The first I.1 cut (`d304aa53`) asserted only index 1 as in-band. Index 0, which carries 78 % of the medium weight, is also inside the FFT band. **I.4 must replace both index 0 and index 1 (the whole medium group) and keep index 2**, otherwise the 2 m band is double-counted. `c2360125` now marks the whole medium group in-band in its test.
- Storm: the medium group is currently multiplied by `1 + 1.2·storm` (`SeaSurfaceShading.js:117`). Wind energy in the FFT replaces it; do not apply that multiplier to the FFT term, or storms scale twice.
- Phase speed: carriers and ripples run at 0.55× deep-water speed (`SeaSwell.js:22`, `SeaDetailPolicy.js:35`). Use the same factor for FFT evolution so the short waves do not outrun the swell they ride; keep the CPU oracle on the same scaled ω. (`c2360125`: `CARRIER_PHASE_SPEED_SCALE`, read back from `SEA_SWELL_COMPONENTS` so it cannot drift.)

### Decision B — FFT output

- Output **slope only**: `(∂H/∂x, ∂H/∂z)` of the residual, no height, no displacement, no velocity, no Jacobian.
- Both slopes are real fields, so pack them into one complex spectrum per cascade, `C(k) = i·kx·h(k) − kz·h(k)`, whose inverse transform is `sx + i·sz`: **one complex IFFT per cascade** instead of Ponlai's three `vec4` fields.
- Target: one `RenderTarget(N, N, { depth: C, type: HalfFloatType, format: RGFormat, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, wrapS/T: RepeatWrapping, depthBuffer: false })`, colour space none, written by **one full-screen quad per cascade** that reads the final storage buffer, with `generateMipmaps` enabled only on the last layer's pass (Ponlai's proven r186 pattern, `OceanFFT.ts:621-631`). `rg16float` is core-renderable and filterable, so this path does not need `texture-formats-tier1`, unlike a `textureStore` into `rg16float`.
- Alternative rejected for I.2: `StorageArrayTexture` + `textureStore` + compute mip chain. It needs tier-1 formats for RG16F (or wastes RGBA16F) and a hand-written mip pass.

### Decision C — Compute ownership

- **Owner:** `StylizedSurfaceViewBase` constructs exactly one `OffshoreFftRuntime` in its constructor next to `this.sharedWaterMaterials = new SharedWaterMaterials(this.reflections)` (`StylizedSurfaceViewBase.js:386`), only when `offshoreFft.enabled`, the tier permits it, the backend is WebGPU and `!this.impostorBakeMode`. It is passed into `SharedWaterMaterials` (so both variants bind the same texture node) **before** the slots are created (`:425`). It is disposed in `dispose()` immediately after `this.sharedWaterMaterials.dispose()` (`:1200`).
- **Prepare point:** the first statement of the existing `terrainView.beforeMainRender` closure (`StylizedSurfaceViewBase.js:388`), as `this.offshoreFft?.prepare(waterVisualClock.value)`. It runs once per `InfiniteTerrainView.render` (`InfiniteTerrainView.js:544`), after the clock and sea state are published (`main.js:1840, 1897`), before the main draw, also while under water. Reflection captures in `afterMainRender` render the same scene and therefore sample the same completed output with no second dispatch.
- Rejected: per-slot ownership (49 instances); `InfiniteTerrainView` beside `CoastalSwashField` (it does not own the water materials, so the texture would have to be smuggled through a module global as `setCoastalSwashTexture` does); a new render hook (would overwrite the existing callback).

### Decision D — Water shader ownership

- **Function:** `createSeaSurfaceNodes` (`SeaSurfaceShading.js:62`). **Expression:** line 117, `const detailed = detail ? slope.add(detail.slope.mul(storm.mul(1.2).add(1))) : slope;`.
- Change in I.4: have `createSeaRippleNodes` (`SeaRippleShading.js:7-35`) return the medium group (`layer.index < 2`) and fine group separately, then

  ```text
  detailed = slope + fine + mix(medium·(1+1.2·storm), fftSlope, B_fft)
  ```

  with `B_fft` from Decision F and `fftSlope` sampled in the **fragment** stage. Leave `ripple` (rain + interaction, line 118) untouched.
- Roughness: add the FFT's unresolved variance where `detail.variance` enters (`SeaSurfaceShading.js:134-135`), mixed by the same `B_fft`, so the medium group's variance is replaced rather than summed.
- Never sample the FFT inside `createDirectionalSurfNodes` or the vertex `displacement`; never add viewport textures.
- The FFT UV needs no new varying: it is computed in the fragment from the existing `uv()`-derived `localXZ` and per-object uniforms.

### Decision E — Coordinates and time

- Per cascade `c` with tile `L_c`: in `StylizedWaterSlot.update`'s descriptor-change block (`:239-252`), compute in double `originUv_c = (posMod(centerWorldX, L_c), posMod(centerWorldZ, L_c)) / L_c` into a `vec2` uniform per cascade, added to `materialOptions` and to the `SharedWaterMaterials` per-object binding list (`SharedWaterMaterials.js:22`). Shader: `uv_c = fract(originUv_c + localXZ / L_c)`. This is exactly how carrier phases already work; no float32 sum of a 4,226,432 m coordinate.
- The FFT spatial axes must be Drusniel canonical (+X east, +Z = canonical z, the same `localXZ` the carriers use). I.1's convention (waves travel toward +k, heading measured from +X toward +Z) is the opposite time sign to Ponlai and must be kept consistently in the GPU kernel.
- **Time precision.** Live water time is unbounded (`frameTimestamp/1000`). `ω·t` in float32 loses phase: at t = 86,400 s and ω ≈ 11 rad/s (λ 0.5 m) the phase is ~10⁶ rad with a ULP of ~0.06 rad and growing. Ponlai has this problem (`OceanFFT.ts:356`). Use a **repeat-period quantised dispersion**: `ω_q = round(ω·T/2π)·2π/T` with `T = 512 s`; the CPU passes `τ = (t mod T)/T` computed in double; the GPU evaluates `phase = 2π·fract(m·τ)` with integer `m = ω_q·T/2π` (≤ ~1,000 for the 0.5 m band, error < 10⁻⁴ cycle). Relative frequency error ≤ 0.2 % at λ = 7.5 m (≤ 0.5 % with the 0.55 speed scale). The CPU oracle must use the same `ω_q` so it stays comparable with the GPU; `c2360125` does this (`createWaveFrequencies`, `repeatFraction`, `evolveSpectrum`).

### Decision F — Coastal fade

```text
B_depth    = smoothstep(7, 14, depth)           # 7 m = surf fadeEnd; 14 m is reached ~33 m offshore
B_shore    = smoothstep(24, 40, shoreDistance)  # inside the 48 m cap; 40 m reached on every open coast
B_exposure = exposure                           # appearance.exposure; 1 on open water, < 1 in lee
B_kind     = appearance.ocean · waterCoverage
B_fft      = B_depth · B_shore · B_exposure · B_kind   (× ice.open where the ice term is composed)
```

- All thresholds are reachable: survey depth beyond 128 m offshore 20.8–24.8 m and shore distance exactly 48 m (§8.3).
- Starts at 7 m, the depth where the breakers have fully handed off to the carriers (`fadeEnd`), so there is no FFT under breaking surf. Saturates at 14 m, below the terrain's 10–17 m seabed-appearance fade end, so no new transition sits on the 17 m contour the coastal fix removed; both ramps are C¹ smoothsteps.
- Exposure is applied once to the FFT term (short wind chop calms in a cove). The legacy medium group already scales by `mix(0.35, 1, exposure)` (`SeaSurfaceShading.js:101`); the `mix` in Decision D swaps one for the other, so shelter is not applied twice.
- Never infer ocean from sea level (`seaWaterMask`) for the FFT; standalone fixtures without an appearance texture get `B_kind = 0`.

### Decision G — Quality and capability

| Profile | N × cascades | Use | Logical memory (slope-only packing) |
| --- | --- | --- | --- |
| Verification | 64² × 1 (48 m tile) | I.2 GPU-vs-CPU DFT oracle, never shipped | h0 64 KiB, ping-pong 64 KiB, output 16 KiB (+mips) |
| Candidate | 128² × 2 (48 m, 12 m) | high / ultra opt-in | h0 512 KiB, ping-pong 2×256 KiB, output 128 KiB (+mips ≈ 171 KiB) → **≈ 1.2 MiB** |
| High (later) | 256² × 2 | ultra only after measured benefit | ≈ 4.7 MiB |

`h0` stores `(h0(k), conj h0(−k))` as `vec4 f32` built on the CPU from I.1's table; no Gaussian buffer and no GPU spectrum kernel.

- Tiers: `low` off (no sea exists on low); `medium` off; `high` opt-in 128²×2; `ultra` opt-in 128²×2 (256²×2 only after I.8 shows a visible gain).
- Required: WebGPU backend, not the WebGL fallback; `rg16float` renderable (core); workgroup ≤ 16 KiB (a 128-wide line of one complex `vec2` field needs 1 KiB, so the shared-memory pass fits easily). Otherwise effective state `unsupported` and the legacy medium ripples stay.
- Spectrum rebuild cost on this CPU (Node, wind 10 m/s, both cascades): first cut `d304aa53` `createModeTable` 7.5 ms median for 128²×2. Current `c2360125` caches the Gaussians and rebuilds only power + `h0` + packing: **1.66 ms median (1.84 max)** for 128²×2, 1.24 ms for 64², 3.90 ms for 256²; the one-off Gaussian draw is 1.5 ms (128²×2). Rebuild only on a wind-revision change with a deadband, inside the view's existing `reserveDeferredWork` budget, and publish the new `h0` atomically while the previous generation keeps rendering.

### Decision H — Performance instrumentation

- Extend `GpuPassProfiler` to wrap `backend.beginCompute` as it wraps `beginRender` and to resolve `'compute'` timestamps alongside `'render'`, reporting a separate `compute` section. `renderer.compute([evolve, ...stages])` runs as one compute group with one timestamp pair, so FFT compute is attributable without per-stage queries. This also starts measuring the existing coastal swash compute.
- Extend `measureCoastalFrame` (`scripts/lib/coastal-review-browser.mjs`) to emit `gpuCompute` next to `gpuRender`, `null` (not 0) when unsupported.
- Count `offshoreFft.*` gauges through `PerfCounters` as the swash field does (`CoastalSwashField.js:273-278`).
- A/B with `scripts/run-coastal-review.mjs --perf` on this report's poses, same snapshot server, same warm-up, A/A first.

## 7. GPU sampler, buffer, compute and memory budget

| Item | Existing | Added by the candidate (I.2–I.4) |
| --- | --- | --- |
| Water fragment sampled textures | field, flow, appearance, obstacle, surface mask, sea detail, world-noise array, reflection cube + planar, swash state; + viewport depth/colour in the refractive variant | +1 (RG16F array). Device limit 32. Verify the generated WGSL in I.4 and also under the runner's `--minimum-interstage-limit` profile. |
| Samplers | per binding as above | +0 if the existing linear repeat sampler is shared, else +1 (limit 16) |
| Varyings | 10 sea varyings listed in §3.2 plus base | +0 (Decision D) |
| Storage buffers in compute | swash uses storage textures | 3 (h0, ping, pong) |
| Compute dispatches / frame | swash 2–2·`maxStepsPerFrame` | 1 evolve + 2 IFFT line passes (or 2·log₂N = 14 regular stages first) |
| Render passes / frame | — | 2 output quads (one per cascade) + mip generation |
| Paused clock | — | 0 dispatches when `t` and spectrum revision are unchanged |
| Water GPU payload | ≈ 3.7 MB pages + 1 MiB detail + 7 MiB reflections | ≈ 1.2 MiB (128²×2) |

## 8. Deterministic visual baseline

Server: `node scripts/serve-world-visual-snapshot.mjs a6e09d59 5217` (frozen source; never reads the working tree). Fixed water clock via `window.__worldVisualQa.setWaterTime` / `advanceCoastalClock` (start 110 s → 123.4 s, then 124.6 / 126.0 / 127.6 s), 1600×900, device scale 1, headed hardware WebGPU, lighting `hour 12`, weather `off` / `wind` / `storm`.

### 8.1 Captures

Two runs, both exit 0 with 0 failures, 0 browser errors and 0 GPU/network alerts on NVIDIA Lovelace hardware WebGPU. Manifests record pose, adapter, source revision and snapshot hash, per-target CPU water samples, quality tier, reflection state and frame counters for every frame: [coastal](../qa/ponlai-pr-i-phase-i0-2026-11-21/logs/captures-coastal.json) (23 frames; its offshore frames are superseded, see below) and [offshore](../qa/ponlai-pr-i-phase-i0-2026-11-21/logs/captures-offshore.json) (17 frames).

| # | Required scene | Frames (`screenshots/…`) | Water at targets (kind / depth m / shore distance m) |
| --- | --- | --- | --- |
| 1 | Calm offshore | `01-offshore/{high,ultra,medium,low}.png`, `calm-motion{,-124.60,-126.00,-127.60}.png` | ocean / 23.4–24.8 / 48 |
| 2 | Windy offshore (`weather: wind`) | `01-offshore/windy{,-124.60,-126.00,-127.60}.png` | ocean / 23.0–25.3 / 48 |
| 3 | Storm offshore (`weather: storm`) | `01-offshore/storm{,-…}.png`, `storm-ultra.png` | ocean / 22.7–25.9 / 48 |
| 4 | Exposed beach | `02-exposed-beach/high.png` | ocean / 3.8 / 17.9 |
| 5 | Curved coastline | `03-curved-coast/high.png` | ocean / 7.8 / 22.6 |
| 6 | Sheltered cove | `04-sheltered-cove/high.png` | ocean / 1.5 / 12 |
| 7 | Headland | `05-headland/high.png` | ocean / 4.4 / 19.7 and 1.4 / 12 |
| 8 | Rocky shore + impact spray | `06-rocky-shore/high-impact.png` (impact found at 130.53 s), `high-decay.png` (+0.5 s) | ocean / 0.5 / 2.8 |
| 9 | Underwater and surfacing | parity `09-parity/webgpu-underwater-{shelf,rebased}.png`; native swim/dive/surface route in §9 | — |
| 10 | Large negative coordinates | parity `09-parity/webgpu-surf-{off,on,rebased,moving}.png` (canonical −4,226,432 / 278,528) | fixture field |

The depth at a fixed offshore target varies across 123.4–127.6 s because the CPU query includes the swell: direct evidence that the CPU surface is the drawn one.

**Rejected captures (kept in the coastal manifest, not committed as images).** The first run placed the offshore camera at `heightAboveGround: 24`; over the sea that height is measured from the **seabed** (~25 m down), so the camera sat about 1 m under the water and filmed the underside of the surface. The poses now use 50 m (camera ≈ 25 m above the sea) and were recaptured; all other poses were unaffected.

**Determinism limit.** The water clock is frozen per capture, but cloud and sky animation is not part of it: `calm-motion.png` and `high.png` (same tier, same water time, consecutive jobs) show identical waves but different cloud reflections. Pixel-exact A/B in I.4 must therefore compare frames from the same job order on both arms, or freeze the cloud clock; a per-pixel diff of the sea under a moving sky is not a valid regression signal.

### 8.2 Negative canonical coordinates, rebase, underwater

`node scripts/run-environment-parity-qa.mjs --url http://127.0.0.1:5217` ran the WebGPU backend through all 52 environment fixtures with zero browser errors, including `SeaSurfFixture` (canonical centre −4,226,432 / 278,528, clock 127.3 s: `surf-off`, `surf-on`, `surf-rebased`, `surf-moving`), `deep-sea`, `deep-sea-storm`, `sea-level-lake`, `underwater-shelf/deep/snell/rebased` and the waterline set. Selected WebGPU frames are kept in `screenshots/09-parity/`. The run then **failed on the WebGL backend** with a pre-existing error, recorded in §10.

### 8.3 Offshore depth survey

Native `getCanonicalWater` along rays from the coastal poses (16 m steps, [`capabilities.json`](../qa/ponlai-pr-i-phase-i0-2026-11-21/logs/capabilities.json) `oceanSurvey`). East of the curved-coast pose (z = −10,604): depth 13.7 m / shore distance 32.6 m at 64 m out, then 23.5–24.8 m / **48.0 m** from 128 m to at least 640 m. The offshore poses therefore sit over deep, fully exposed water where `B_fft` would be 1.

## 9. Performance baseline

Native headed Chromium 151, RTX 4080, 1600×900, device scale 1, frozen `a6e09d59` snapshot, `scripts/run-coastal-review.mjs --perf` with this phase's poses: 5 s minimum settle after ground and camera readiness, then 8 s of measured frames, live water clock, native foreground focus verified for every measurement (all 14 passed). Two complete runs (A, B) with identical options, back to back. Values are A → B, median / p95 (/ p99) in ms. Logs: [`perf-a.json`](../qa/ponlai-pr-i-phase-i0-2026-11-21/logs/perf-a.json), [`perf-b.json`](../qa/ponlai-pr-i-phase-i0-2026-11-21/logs/perf-b.json).

| Scene | Tier | Frame interval p50 / p95 / p99 | Render CPU (submission) | GPU render passes | Draws / frame (p50) | Wet / refractive slots | Swash dispatches / 8 s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Offshore calm | high | 3.90 / 5.00 / 7.30 → 3.90 / 5.20 / 7.80 | 3.10 / 4.10 → 3.10 / 4.10 | 3.61 / 4.72 → 3.60 / 3.65 | 154 → 154 | 40 / 22 | 0 |
| Offshore calm | ultra | 4.00 / 5.20 / 6.60 → 4.00 / 5.50 / 8.30 | 3.10 / 4.10 → 3.10 / 4.20 | 3.64 / 3.92 → 3.64 / 3.89 | 154 → 154 | 40 / 22 | 488 → 482 |
| Offshore calm | medium | 3.50 / 4.70 / 6.50 → 3.50 / 4.70 / 6.50 | 2.70 / 3.70 → 2.70 / 3.70 | 3.35 / 3.89 → 3.37 / 3.57 | 154 → 154 | 40 / 22 | 0 |
| Offshore calm | low | 2.90 / 4.00 / 5.10 → 2.90 / 4.00 / 5.20 | 2.20 / 3.00 → 2.20 / 3.10 | 2.83 / 3.34 → 2.83 / 3.02 | 149 → 154 | 40 / 22 | 0 |
| Exposed beach | high | 4.40 / 8.40 / 9.60 → 4.30 / 8.60 / 9.90 | 3.40 / 6.80 → 3.40 / 7.00 | 4.06 / 4.27 → 4.06 / 4.17 | 187 → 187 | 47 / 24 | 488 → 486 |
| Curved coast | high | 5.00 / 7.20 / 9.70 → 5.00 / 7.50 / 9.90 | 4.10 / 6.00 → 4.00 / 6.30 | 4.76 / 5.32 → 4.73 / 5.25 | 221 → 218 | 40 / 22 | 484 → 484 |
| Sheltered cove | high | 5.20 / 6.80 / 9.90 → 5.20 / 6.70 / 10.00 | 4.40 / 5.80 → 4.30 / 5.70 | 4.89 / 5.14 → 4.90 / 5.02 | 180 → 180 | 35 / 18 | 490 → 490 |

**A/A repeatability.** Frame-interval medians agree within 0.1 ms in every scene; p95 within 0.3 ms; p99 within 1.7 ms (offshore ultra). GPU render medians agree within 0.03 ms. Use median and p95 for I.4 gates; p99 at 8 s is too noisy for a ±5 % gate.

**Reading these numbers.**

- The application is CPU-bound by submission at the coast (render CPU ≈ 85 % of the frame interval) and close to balanced offshore.
- **GPU render** is `GpuPassProfiler`'s sampled render-pass timestamps. **GPU compute duration: not measured** by the existing harness (scope string: "excludes CPU submission, uploads and compute work"). The coastal swash compute already runs ≈ 61 dispatches/s at ultra and at the coast and is outside every number above. Compute timestamps *are* supported on this device (§5), so this is a harness gap closed by Decision H, not a hardware limit.
- Draws include shadow and reflection-capture passes. The p99 draw count (251 offshore) is the frames with a reflection capture.
- **Water texture upload:** `waterUploadBytes` is a cumulative session counter; it rises by exactly **3,312,400 B per scene change** (a full 49-page residency of field + flow + appearance), and is 0 in steady state.
- **Water memory estimate:** §3.3 (≈ 3.7 MB page textures for 49 slots + 1 MiB detail donor + 7 MiB reflection targets).
- **Material variants:** two shared water graphs (non-refractive, refractive); 18–24 slots used the refractive variant. `waterRefractionSlotsPrewarmed: 23`.
- **First-use / streaming:** preparation after a camera cut waited 9.7 s for 49 resident pages and 60 ready frames (`preparation.groundPreparation` in the logs; `streamedDrawPreparationMs` 7.4 s cumulative, `waterGenerationMs` 3.1 s cumulative worker time). These are cold-start values on the reference machine, not gates.
- **Discarded measurements:** none from the final runs. An earlier perf run started with the under-water offshore pose (§8.1) was stopped before it wrote any result and was deleted; its data was never used. A per-frame compute-dispatch counter added to the harness read 0 while the swash counter showed ~61 dispatches/s, so it was removed rather than reported.

## 10. Tests and existing failures

| Command | Result |
| --- | --- |
| `npm test` (before this phase's test) | **4,982 / 4,982 pass**, 0 fail, 239 s |
| `node --test test/water-visual-clock.test.js` (new) | 3 / 3 pass |
| `npm run lint` | Exit 0, no issues |
| `npm run build` | Exit 0; existing chunk-size warnings only |
| `node scripts/run-environment-parity-qa.mjs` | WebGPU: 52 fixtures, 0 errors. **WebGL: exit 1** — `FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)` while rendering the `terrain-full-*` fixtures. Pre-existing: the server serves the frozen `a6e09d59` snapshot with no local changes, and `deviceLimits.js` documents that the terrain fragment stage needs 17 textures. Not a water shader. |
| `npm run qa:water:acceptance -- --headed --url http://127.0.0.1:5217` | **Exit 0** on NVIDIA Lovelace hardware WebGPU, `performanceAuthoritative: true`. All 13 gates true: route found, entered water, reached swimming, submerged (max depth 8.38 m, 65 submerged frames, full underwater blend), surfaced, returned dry, stable body identity, origin stable (0 snap violations), projected caustics active and CPU-bounded, frame p95 7.9 ms, hitch rate 0.0001; 0 GPU validation errors. [Log](../qa/ponlai-pr-i-phase-i0-2026-11-21/logs/water-acceptance-headed.json) |
| `run-coastal-review.mjs` captures (2 runs) and `--perf` (A, B) | All exit 0; 0 failures, 0 browser errors, 0 GPU/network alerts, focus verified on every timing |
| `npm run qa:world:visual`, `npm run qa:look` | Not run. Neither covers the sea beyond what the coastal review, environment parity and water acceptance above capture; their world/look fixtures do not touch any code this phase changes (none of `src/`). |
| `npm run qa:perf -- --headed` | Not run. That harness measures streaming over a land route; the ocean baseline uses the coastal runner's sea poses instead (spec §13.4), which is what I.4 must A/B against. |

Invariant coverage (existing tests unless marked new):

| Invariant | Evidence |
| --- | --- |
| Deterministic sea-height sampling | `sea-swell` *chunk phase origins reproduce…*; `water-domain` *procedural water queries are deterministic*; new `water-visual-clock` |
| CPU ↔ shader wave equations | `sea-swell`, `sea-surf` *wrapped shader surf coordinates agree with swimming heights…*, *directional surf retains exact legacy offshore displacement* |
| Chunk continuity | `sea-swell` *continuous across a chunk border*; `water-field-continuity`; `water-pattern-precision`; `sea-diffraction-integration` *pages share identical exposure along negative and positive chunk borders* |
| Large negative coordinates | `sea-surf`, `water-pattern-precision` *wave origins reproduce a plane wave exactly at planet scale*; WebGPU `SeaSurfFixture` captures |
| Floating-origin rebase | `water-floating-origin`, `coastal-swash` *camera-local texel addressing…*; `surf-rebased`, `underwater-rebased` |
| No waterline discontinuity | `water-field-continuity` *dry shoreline vertices inherit…*; `surface-mask-waterline`; `underwater-waterline`; waterline parity captures |
| Lake / river / ocean isolation | `water-lakes`, `river-surface`, `sea-diffraction-integration` *inland appearances…*; `sea-level-lake` capture |
| Surf refraction / diffraction | `sea-refraction*`, `sea-diffraction*`, `sea-surf` |
| Swash and rock impact | `coastal-swash`, `coastal-shelter-swash`, `coastal-rock-impact`, `coastal-shelter-rock-impact` |
| 17 m shoreline band | coastal-fix probes (`docs/qa/coastal-fix-review-2026-11-21`); this phase changes no shader, so no new band can exist; the curved-coast capture here is the reference for I.4 |
| Water time paused / advanced / reset | **new** `test/water-visual-clock.test.js` (freeze holds through live frames; any order of seeks gives identical heights; QA range validated) |
| Swim / dive / surface | `player-swimming-physics`, `character-swim`, `underwater-*`; native route in §9 |

## 11. Licensing and attribution

- Ponlai repository: MIT, © 2026 Hubery (`LICENSE`), with `LICENSES/MIT.txt` and `REUSE.toml`.
- `OceanFFT.ts`, `OceanSpectrum.ts`, `SeaDetail.ts`, `Water.ts` (and the tidewater-derived parts of `WaveDamping.ts`) carry `Portions adapted from tidewater by Daniel Greenheck … SPDX-FileCopyrightText: Copyright (c) 2026 DRG Software Solutions LLC, SPDX-License-Identifier: MIT`. `Water.ts` additionally carries David Hoskins' MIT "Hash without Sine" (© 2014).
- Any Drusniel file that adapts Ponlai code (e.g. the Stockham stage indexing or the workgroup line pass) must keep both notices in its header: Ponlai's MIT notice and the tidewater SPDX lines, plus the immutable source URL at `cca90564`. Re-deriving from the published equations (Tessendorf, JONSWAP, TMA, Donelan–Banner) needs no notice; I.1 did this.
- No binary noise or texture asset is needed: all modes come from a seeded hash.

## 12. Risks, mitigations and blockers

| Risk | Mitigation |
| --- | --- |
| Double-counted 2 m ripple energy (index-0 ripple group) | Decision A/D replaces the whole medium group; extend the I.1 test |
| Float32 phase drift after long sessions | Decision E quantised period |
| Wind-change hitch (1.7 ms rebuild at 128²×2) | Deadband, deferred-work budget, atomic generation swap |
| Storm scaling twice | No `1+1.2·storm` on the FFT term |
| `rg16float` storage not portable | Write via render quad, not `textureStore` |
| Device loss samples freed buffers | Runtime invalidates output (B_quality = 0) on `onDeviceLost`, rebuilds from the CPU table |
| Compute cost invisible in profiles | Decision H |
| Concurrent edits to `src/editor/water/fft/` by another session | Only the I.1 session edits those files; this phase touched none |

**Blockers:** none. Native hardware WebGPU, compute timestamps and all required formats are available on the reference machine.

## 13. Phase I.1 / I.2 handoff

I.1 has landed (`d304aa53`, `c2360125`). The two corrections this audit raised against the first cut are already in `c2360125`: ω quantised to the 512 s repeat period at the carriers' 0.55× phase speed, evolved from `τ = (t mod T)/T` (Decisions A, E), and the whole medium ripple group asserted in-band (Decision A). Nothing in I.1 needs to change before I.2.

| Phase | Files | Functions / exact points |
| --- | --- | --- |
| I.2 runtime | new `src/editor/water/fft/OceanFftRuntime.js` (state, prepare, dispose), `OceanFftKernels.js` (evolve + Stockham line passes, slope-only single complex field), `OceanFftTextures.js` (RG16F array target, output quads, mips) | owner/prepare: `StylizedSurfaceViewBase` constructor `:386`, `beforeMainRender` `:388`, `dispose` `:1200` |
| I.2 profiling | `src/editor/performance/qa/GpuPassProfiler.js`, `scripts/lib/coastal-review-browser.mjs` | wrap `beginCompute`, resolve `'compute'` |
| I.3 coordinates | `StylizedWaterSlot.js` `:91-108` (materialOptions), `:239-252` (origin uniforms); `SharedWaterMaterials.js:22` (binding names) | per-cascade `originUv` vec2 |
| I.3 config | `config/water-visual.yaml` `water.sea.offshoreFft` (spec §10.1 schema); validator `validateSeaConfig` in `src/editor/water/SeaConfig.js:19` (reject `geometry: true`) ; tier policy next to `resolveWaterQualityFeatures` (`WaterQuality.js:94`) | — |
| I.4 shader | `SeaRippleShading.js:7-35` (split medium/fine), `SeaSurfaceShading.js:97-135` (Decision D expression at `:117`, roughness `:134-135`), `StylizedWaterMaterial.js:206-225` (pass FFT output + `appearance.ocean` + exposure) | `B_fft` per Decision F |
| QA | `docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json` with `scripts/run-coastal-review.mjs` (captures and `--perf`), `scripts/probe-ocean-fft-capabilities.mjs`, `run-environment-parity-qa.mjs`, `qa:water:acceptance -- --headed` | A/A against `a6e09d59` |

**Readiness:** Phase I.1 is implemented on `main` and consistent with these decisions. Phase I.2 can begin without rediscovering the water architecture.
