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

## 4. Mathematical spectrum and deterministic reference implementation

### 4.1 Single source of units and geometry conventions

Use SI metres for position, metre/second for wind, radians/metre for wave number, radians/second for angular frequency and seconds for `WaterVisualClock`. Axis convention must be **Drusniel canonical X/Z**, not Ponlai's island-specific ocean UV frame. Positive water height points up in world **Y**, even though [D12/D13] mesh local vertical is **local Z** because the water slot is rotated −90 degrees.

```text
k = (kx, kz)                         # 2D wave vector, radians/metre
|k| = sqrt(kx*kx + kz*kz)
L = waveTileSizeMeters
deltaK = 2*pi / L
kx = signedIndex(x,N) * deltaK
kz = signedIndex(z,N) * deltaK
signedIndex(i,N) = i < N/2 ? i : i-N

omega(k,d) = sqrt(g * |k| * tanh(|k|*d)), g=9.81
omega(k, deep) = sqrt(g*|k|)
```

Do not copy Ponlai's `depth=500m` into shore physics; it's a **reference finite open-ocean spectrum depth**, while Drusniel's shore depth is spatially variable and already drives refraction/breaking. For FFT high-frequency normals the initial open-water spectrum may assume deep water with a simple local damping gate; the current shallow-water surf model remains the nearshore authority.

Set `k=0` mode explicitly to zero. For real water height `h(x,z,t)`, Fourier coefficients must respect Hermitian symmetry. Treat self-conjugate Nyquist indices carefully (set zero or purely real as mathematically required), and verify the output IFFT imaginary residual is numerically close to zero.

### 4.2 Spectral energy, random phases and physical calibration [P1/P2]

The two standard wave systems are (a) local wind-driven sea, and (b) residual distant swell from previous weather, which need not align with local wind. In first PR I release the pre-existing five analytic carriers already *are* the long swell, so configure only **the local wind-driven short-band** in the FFT and explicitly suppress Fourier energy in overlapping lower frequencies.

[P2] models TMA-corrected JONSWAP power and directional spreading, with a Jacobian converting an angular-frequency density to two-dimensional wave-number density.

A source-aligned algorithm sketch:

```text
omega = sqrt(g*k*tanh(k*d))
sigma = (omega <= omegaPeak ? 0.07 : 0.09)
r = exp(-(omega-omegaPeak)^2/(2*sigma^2*omegaPeak^2))

jonswap(omega) =
    alpha*g^2/(omega^5)
    * exp(-1.25*(omegaPeak/omega)^4)
    * gamma^r

TMA(omega,d) = finiteDepthCorrection(omega*sqrt(d/g))
spread(kDirection,windDirection,omega/omegaPeak) =
    normalizedDirectionalDistribution(...)

P2D(kx,kz) =
    jonswap(omega)*TMA*spread*shortWaveFade(k)
    * dOmega_dK / max(k,epsilon)

P_residual = P2D * highPassBand(k) * cascadeBand(k)
```

When integrating cell discrete Fourier samples, multiply continuous spectral density by `deltaK_x*deltaK_z` **before** generating `h0`, and apply the inverse transform normalization exactly once. Verify numerical variance against integrated spectral energy; do not treat amplitude, RMS, variance and mean square slope as interchangeable.

**No hardcode of weather physics into render shader.** The pure CPU `SeaSpectrumModel` should compute cached spectral coefficients from validated wind speed/heading/fetch, existing storm level, depth reference and a seeded phase table, while GPU consumes uniform spectral parameters. [P2] `waveSystemTerms`, `createWaveSpectrum`, `slopeVariance` supply reference behavior.

Random initial modes use a stable seeded Gaussian pair from Box–Muller (or equivalent tested PRNG):

```text
u1 = max(rng(), 1e-9)
u2 = rng()
z0 = sqrt(-2*ln(u1))*cos(2*pi*u2)
z1 = sqrt(-2*ln(u1))*sin(2*pi*u2)

h0(k) = (z0+i*z1)*sqrt(P_residual(k)*deltaK^2/2)
h0MinusConj(k) = conjugate(h0(-k))  # use consistent paired Gaussian fields
```

Take care that the `h0(-k)` pair is generated deterministically from the **mirrored mode index**, not from a separately uncorrelated current-cell RNG call. Sample variance across 10+ stable seeds; analytic test expectations should not depend on one particularly calm/lumpy realization.

### 4.3 Evolution in absolute shared time, not frame integration

Classic Tessendorf wave synthesis:

```text
h(k,t) =
    h0(k) * exp(+i*omega(k)*t)
    + conjugate(h0(-k)) * exp(-i*omega(k)*t)

H(x,z,t) = IFFT_2D(h(k,t))

dH/dx = IFFT_2D(i*kx*h(k,t))
dH/dz = IFFT_2D(i*kz*h(k,t))
```

These formulas specify the **sign convention** for the chosen inverse transform. Ponlai's [P1] explicitly notes its positive IFFT `exp(+i*omega*t)` travels **against** the +k direction. Implement a unit test with one single travelling wave and a known expected east/west crest movement, otherwise the FFT sea will run upwind while existing nearshore breakers travel shoreward.

Do not increment the spectrum's phase by `deltaTime` alone. Use the **absolute** [D18] water clock, with phase reduced modulo 2π at uniform update; seek backward, freeze, restore and deterministic fixed capture must reproduce exactly. For very large `t`, reduce in double precision on CPU per frequency group or use bounded wave phase safely; shader float32 multiplication of hours by a high frequency will quantize and jitter.

### 4.4 Frequency split and RMS energy accounting

The existing analytic system has carrier wavelengths:

```text
analyticWavelengthMeters = [42, 26, 17, 11, 7.5]
analyticMinimum = 7.5 m
analyticLargestWaveNumber = 2*pi / 7.5
```

Design the first FFT residual with no power in modes of wavelength `λ≥7.5m`, i.e. `k≤2π/7.5m`. For transition safety, choose a soft high-pass gate only on the **already fine side** of that knee, for example 7.5m→5.5m equivalent wavelengths, so at the overlap knee FFT energy starts at zero. Exact filter is tuned with alias tests and is **not** a global physical constant.

```text
k0 = 2*pi / 7.5
k1 = 2*pi / 5.5
highPass(k) = smoothstep(k0,k1,k)

# the current authored five long carriers retain 100% of their amplitudes;
# do NOT apply the FFT inverse or FFT wave energy to their height.
```

Because current [D23/D24] already supplies medium/fine sea detail, **decide replacement vs addition by variance**, e.g.:

```text
V_currentDetail = mean(|gradient(originalDetail)|^2)
V_fftFiltered   = expected spectral slope variance at current pixel footprint

targetV = max(V_currentDetail, V_fftFiltered)
# if FFT is enabled, reduce overlapping original detail contribution
# so combined expected variance tracks targetV, not the sum of both.
```

A conservative first implementation can **replace** the overlapping medium/fine detail nodes whenever FFT active (while leaving rain ripple and interaction normal contributions), avoiding double-sampled textures. Preserve exactly the old detail if FFT cannot initialize. Future combined detail should report separately the variance by source and show that storm settings don't multiply spectral steepness and authored choppiness twice.

For a normalized surface slope `s=(dH/dx,dH/dz)` the mean square slope is approximately `E[s_x²+s_z²]`. [P2] gives Cox–Munk reference `0.003+0.00512 U` for wind speed U m/s over clean sea. **This is a reference prior, not a claim that authored Drusniel shaders should exactly match measured ocean slopes**. Compare source spectrum, filtered FFT, residual roughness and existing near detail before changing aesthetic.

### 4.5 Small CPU DFT oracle and analytic invariants

Implement a standalone tiny `N=8`, `N=16` reference in plain JS with a direct sum (no optimized FFT dependency) and compare to GPU sampled pixel results. It is **only a test fixture**; no O(N⁴) DFT in ordinary gameplay:

```text
IDFT2D(Hk, x,z) =
   (1/(N*N)) * sum_p sum_q
    Hk[p,q] * exp(+i*2*pi*(p*x+q*z)/N)

# note: h0 FFT coefficient scaling must use the same transform convention.
```

Test:

1. DC and Nyquist correct (zero mean, valid conjugate).
2. Hermitian spectrum → real spatial field; imaginary residual negligible.
3. Forward/inverse identity (with normalization exactly once).
4. Parseval's relation: spectral and spatial energy agree for chosen normalization.
5. One cosine mode travels in intended world compass direction under `time+Δt`.
6. Phase at `t=123.4` and time-scrub to `126.0` then back returns bitwise/epsilon same CPU reference.
7. All energy in excluded carrier wavelengths is **zero** in FFT, not just visually small.
8. Two cascade bands do not overlap; total expected variance equals sum of their disjoint contributions.
9. Finite-depth dispersion tends to deep-water formula as `k*d` grows and to shallow `ω≈k*sqrt(g*d)` as it shrinks.
10. `U=0`, zero amplitude, invalid fetch, degenerate heading, zero k, huge/negative XZ and extreme storm remain finite.
11. Seed same + identical parameters → exact same mode table and screenshot. Different seed changes details but **not** large statistical wave energy beyond accepted tolerance.
12. GPU derivative field matches finite difference of GPU reconstructed wave in small reference scene.

---

## 5. GPU architecture and staged compute kernels

### 5.1 The first compute version should be smaller than Ponlai

**Starting candidates for benchmarking**, not approved shipping sizes:

| Mode | FFT resolution | Cascades | Outputs | Use | GPU cost hypothesis |
| --- | --- | --- | --- | --- | --- |
| Off | none | 0 | none | All low devices and explicit off | No FFT work/allocations |
| Prototype | 64×64 | 1 | RG16F slope | Pure unit/visual smoke | Smallest numerical proving ground |
| Balanced candidate | 128×128 | 2 | RG16F or RGBA16F slope | Offshore spectral micro-chop | Measure native WebGPU vs detail-texture replacement |
| High candidate | 256×256 | 2 | RGBA16F slope | More slope detail with appropriate mips | Only if visible quality improvement |
| Ultra optional | 256×256 | 4 | Selected displacement/derivatives/velocity arrays | Future full Tessendorf sea | Not part of PR I core; high memory/dispatch |

**Important:** a two-cascade FFT should use *purpose-designed spectral tile sizes and non-overlapping frequency support*, not simply take Ponlai's first two [733,157] metre cascades, which are both long-wave ranges already owned by Drusniel. Initial residual should cover wavelengths **shorter than 7.5m**, with tile sizes and FFT grid spacing determined by the smallest *visible pixel-normal* length, filter footprint and mesh geometry. This is distinct from the long-wave canonical CPU system.

### 5.2 One renderer owner and no per-chunk FFT duplication

A small `OffshoreFftRuntime` owns:

- Validated seed and spectrum settings, spectrum generation counter.
- GPU Gaussian mode buffer / initial spectrum buffer (static until wind parameters meaningfully change).
- Minimal FFT ping-pong intermediate buffer(s) and one or two output 2D array texture(s).
- Current absolute water time + previous time/valid generation; staged parameter update.
- Stable TSL sampler node and texture reference, no shader rebuild on normal clock tick.
- Backend capability and feature/fallback state.
- Async/prewarm and disposal around the existing scene lifecycle.
- Optional diagnostic counters for spectral power/compute cost.

One runtime is created **once** from [D15] `StylizedSurfaceViewBase` or a narrowly owned water rendering integration, not from [D13] every `StylizedWaterSlot`. Same GPU source texture is read by all wet ocean material instances and reflection captures **without recomputing** it for each scene camera. On underwater rendering where terrain streaming is suspended, water still updates; FFT must remain valid if the water is visible.

Shader graph is still **one water material per refraction variant** through [D14]. New FFT texture nodes must be shared and stage-appropriate. No 49 separate FFT parameter uniforms with changing size per water slot, and no per-wave pipeline compilation when a storm intensifies.

### 5.3 GPU pipeline passes and state transitions

First implementation with **small regular radix-2 stages**:

```text
OFF / unsupported:
  legacy 5-wave+detail material
  0 FFT buffers / samplers / dispatches

READY:
  on sea-state parameter revision:
      compute spectrum coefficients once (stable seed)
  every rendered water clock update when offshore FFT visible:
      compute Fourier time evolution
      row IFFT stages, then column IFFT stages
      publish wave derivative/normal output texture
      generate needed mips once after full output written
  other systems:
      read current published texture generation; no extra FFT rendering

STORM CHANGE:
  change physical wind/shape values by bounded step or cross-faded source;
  DON'T rebuild large FFT pipelines on each tiny wind change
```

Use a result texture with **mips** and stable filtering. If the particular WebGPU backend cannot generate mipmaps for array storage without extra passes, measure the mip chain explicitly and choose a lower resolution/fallback; do not assume it is free.

### 5.4 Stockham FFT and workgroup optimization only after correctness

[P1] verifies 16 regular radix-2 Stockham steps for `N=256` and optimizes to **two workgroup passes**. General radix-2 for `N=2^m`:

```text
# for rows, then columns:
for axis in [x,z]:
  for stage in 1..log2(N):
      radix = 2^stage
      half = radix/2
      choose even/odd modes by stage Stockham permutation
      twiddle = exp(+i*2*pi*index/radix)
      output = a + twiddle*b
      swap ping-pong
```

This sketch requires exact sign/index verification with [P1] and CPU oracle. Never “optimize” in-place without safe workgroup barriers or read/write hazard rules.

When evaluating workgroup-memory path:

- [P1] `workgroupArray('vec4',256)` for three fields is ~12KiB and fits only when other workgroup memory overhead and backend limits do; query adapter and actual compiled pipeline.
- Use workgroup dispatch count, not global element count, with barriers: many GPU shader builders auto-insert early bounds checks that can skip barriers in some lanes and deadlock the group.
- Check actual Three r187 TSL `computeKernel`, storage buffer and array-texture semantics; do not downpin Three to upstream r186 just to avoid porting API usage.
- Compare all outputs vs the plain stages at fixed seed/FFT resolution and floating-point precision tolerance. A 2-dispatch version that is marginally faster but corrupts last two columns on one adapter is a failed optimization.
- If necessary, ship 64/128² regular stages and defer workgroup optimized 256² to ultra later.

### 5.5 Output, coordinate and stage ownership

A minimal **slope** output can be a single RG16F texture (or RGBA16F if storage/write requirements dictate). It represents the spatial derivative field of the spectral residual, **not** the water's real physical height at the player. Set colour space to NoColorSpace and wrap S/T repeat. Array layers represent cascades only if there is more than one; choose an explicit output format and verify actual TSL sampling with that renderer.

Shader UV for cascade with tile size `L`:

```text
chunkWorldCentreCanonicalXZ = CPU double precision
originUV = positiveMod(chunkWorldCentreCanonicalXZ, L) / L
localUV = chunkLocalXZ / L
uv = fract(originUV + localUV)

# do not sum a 4,200,000m centre into a float shader position:
# f32 precision there is too coarse for short wave normal periods.
```

One normal contribution for cascade `c` must be filtered at footprint `F`:

```text
lod = clamp(log2(max(F,baseTexelMetres)/baseTexelMetres),0,maxMip)
slope = sampleArrayTexture(slopeMap, uv, cascade=c, explicitLOD=lod)
slope *= offshoreWeight * cascadeSpectralGain
```

LOD is not simply distance: derive from screen-space derivative of **local metre coordinates**, per vertex surface pixel footprint and facing angle. Very distant reflections need to integrate lost spectral slope variance as microfacet roughness; dropping variance causes too-smooth silver horizon and shimmer when pixel footprint changes.

### 5.6 Wind updates without spectral popping

[P1] `setWind` rebuilds spectrum when wind direction/speed changes, preserving Gaussian seed. Drusniel storms ease continuously, potentially updating wind every frame. Recomputing `h0` for each tiny change can be expensive and visible as frequency-phase jumps.

Proposed:

- Wind input from existing authoritative weather [D30] and storm; apply small deadband or bounded update frequency to **parameters**, not to the visual water clock.
- Keep deterministic seeded mode phase pairs independent of wind direction. To change energy smoothly, interpolate **mode amplitudes** on the GPU over a configured transition; be explicit when changing wave direction: rotating distribution can move crests discontinuously if the same Fourier mode receives new weight, so crossfade spectral coefficients or validated two-source blend for major changes.
- Distinguish local wind sea (reacts quicker) and long-swell memory (current analytic waves stay on original direction). Do not rotate all the five deterministic CPU carrier directions when gusts swing 10°.
- If two full FFT result fields are crossfaded, memory/dispatch doubles; prefer one evolving field with per-mode amplitude crossfade or bounded inexpensive staging, and **benchmark**. Never silently allocate second 256×4 FFT on normal weather change.
- On quality switch/reseed, freeze/transition at a known absolute `t`, don't restart time at zero.
- On device loss, all GPU coefficients can be regenerated from CPU deterministic seed without changing the visible sea after recovery.

### 5.7 Resource lifetime and lazy initialization

No eager initialization at startup just because sea YAML exists. Create/compile only when H is active, actual ocean water visible and allowed tier is available. (The letter H here means *the higher FFT feature*, not prior PR H clouds; implementation should call it `offshoreFft`.)

- Use one owner with lifecycle `disabled → supported → compiling → ready → active → failed/unsupported → disposed`.
- Reject unsupported formats, storage texture types, mip array textures, sampler limits and workgroup memory with a clear once-per-transition warning; restore old packed sea-detail texture.
- Preserve old complete generated output while a new spectrum/texture is building; no black/flat one-frame sea.
- On renderer/device loss, mark outputs invalid before they can be sampled; do not issue GPU commands to disposed buffers.
- On resize, FFT **world tile resolution should not automatically scale with viewport**. Quality changes explicitly allocate a new target once; normal viewport resize updates only sampling footprint.
- Stop FFT work when no ocean water is visible; under water still visible so no premature stop when land streaming suspends. Use a known current scene/camera token to avoid duplicate compute during reflection capture.
- Deferral and prewarm must not steal budget from worker water pages, which are already expensive under streaming and edits.
- Mark buffer/target memory and dispatch count in diagnostics; dispose exact owned targets, shader nodes, kernels and staging resources.

---

## 6. Exact shoreline blending and water-surface integration

### 6.1 Composition order and normalized contribution

The existing sea uses three bands of *different* physics. Preserve that ownership:

```text
canonical_water_kind, depth, shoreDistance, exposure, shelter
         |
         +--- nearshore directional breakers + shoaling/refraction/diffraction
         |       (existing SeaSurf, SurfNodes and CPU water query)
         |
         +--- authored five-wave swell height + coarse slope
         |       (existing SeaSwell; CPU and shader use identical math)
         |
         +--- offshoreFFT spectral slope residual
                 (new, normal/roughness only; zero height in PR I MVP)
         |
     original sea foam / whitecaps / swash / impact / spray
         |
     normal + roughness + current sea optics + existing reflections/glints
```

The **geometry** returns the exact existing `sea.displacement`; the FFT does *not* change `material.positionNode`, `surfaceHeight` or the CPU query path. The offshore FFT's gain only affects surface slope/roughness/glint where ocean water is eligible. A wave crest rendered at shore continues to be the existing carrier, with original phase.

### 6.2 Field inputs available without worker modifications

[D12/D19/D29] already expose:

- `waterDepth`: max(field.b,0) metres, appropriate for protecting waterline and surf.
- `shoreDistance`: field.a metres, but [D22] source may be capped beyond a bounded distance; **must not** assume accurate kilometres.
- `waterCoverage`: field/coverage sample 0..1, zero on dry land.
- `oceanMask`: explicit appearance.ocean weight when available, unlike fallback sea-level/current heuristic.
- `exposure`: marine wave shelter/diffraction from the existing water appearance texture, 0..1, and meaningful in narrow coves/headlands.
- `seaStateUniforms.storm` and current quality.
- `ice.open`: frozen-water masking appears later in [D12] and can be used to suppress visible FFT.
- `water.refraction` / `seaOptics`: existing light response and viewport copy as separately gated.

Do **not** create new worker page channels, bitmap, water-kind enum, or ocean-shelf distance field solely for the initial spectral normal. Do not sample ocean-kind using only sea level: a lake can occur at the same level, and the [D17] water contract forbids that inference as authoritative.

### 6.3 Fade and ownership: continuous, bounded, never a hard step

Define two physically justified blend factors and multiply them with actual marine water:

```text
B_depth = smoothstep(depthBegin, depthFull, max(0, waterDepth))
B_shore = smoothstep(shoreBegin, shoreFull, max(0, shoreDistance))
B_exposure = existingMarineExposure(...) # 0..1 near shelter, may remain partial
B_kind = oceanMask * waterCoverage
B_open = ice.open when present, else 1
B_quality = 1 iff FFT tier permitted and resource generation valid

B_fft = clamp(B_depth * B_shore * B_exposure * B_kind * B_open * B_quality,0,1)

fftSlopeEffective = B_fft * fftSlopeFiltered
```

**Starting candidates, not fixed requirements:** `depthBegin=7m` (existing directional surf deep end) and `depthFull=12–15m`. `shoreBegin` and `shoreFull` must be **inside the actual guaranteed support** of [D22]'s capped shoreDistance, or the range must be expressed using a reliable alternative. For example 12–36m if [D22] proves its distance field actually reaches 36m at the chosen tile size. Do not propose a 200m smoothstep on a 48m-clamped field: it would **never reach full offshore FFT**.

Do not place a secondary hard blend threshold at 17m, where [D34] just removed a visibly abrupt ocean-bed material cutoff. Keep analytic derivative continuity at the deep-water transition, rather than abruptly switching a height or roughness value.

**Wave shelter policy:** the FFT source is global and has no geometry-aware cove scattering. Close to a headland, the existing `exposure` already suppresses/diffracts surf. Apply this **only to the FFT's local short-wind detail**, not to the authoritative long-travel analytic swell, which already has its own shelter/diffraction. In a sheltered cove, short chop decreases and the surface looks calmer while residual long breakers still curl toward the beach. Do not attenuate local short-wave detail twice if current `SeaDetailShading` already uses a shelter factor on the same band.

### 6.4 Preserve amplitude and derivative of the existing wave as mix changes

The mandatory normal-only mix cannot create a vertical ridge because height remains unchanged. But a visible bright/dark ring can still occur if the normal variance or Fresnel roughness changes abruptly. Ensure:

```text
rawAnalyticSlope = existing five-wave + directional surf geometry slope
legacyFineSlope  = existing packed fine/medium ripple slope
newFftSlope      = sampled highpass FFT derivative at chosen mip

replacement = mix(legacyFineSlope, spectralFineSlope, B_fft)
totalSlope  = rawAnalyticSlope + replacement + rainRippleSlope + interactionSlope
normal      = normalize(vec3(-totalSlope.x,1,-totalSlope.z))
```

This is an illustrative strategy; actual code in [D11] is:

- `slope = surf ? mix(displacedSurfaceSlope(), swellSlope, surf.offshore) : swellSlope`;
- `detailed = slope + detail.slope * storm detail gain`;
- `surfaceSlope = detailed + ripple`;
- `normal = normalize(vec3(-surfaceSlope.x,1,-surfaceSlope.y))`.

**Integration point:** where `detail.slope` currently enters [D11] at lines ~97–120, compute **FFT replacement**, not an addition after final normal. Avoid TSL sampling FFT inside the nearshore `createDirectionalSurfNodes` loop or multiplying it by the surf's breaker `skew`. If current detail lease is created even when FFT fully replaces it, avoid losing the expected disposal event and prefer compile-time elision only once the material variant is tested.

`smoothstep` is C1 continuous at its endpoints. If visually necessary, tune material LOD/normal variance transitions to also have limited second derivative. At just below/above the blend, compare mean square slope, horizontal energy and direct sun glint: no “flat ring” or “bright ring” at 7, 12, 15 or 17m.

### 6.5 Fragment normals, foam, reflection and crest transmission

- FFT adds only *short-wave orientation*. The [D11] coarse swell controls crest lift, per-wave shoreline whitecap and crest backlighting. Do not feed raw micro-slope into `height` normalized current crest threshold.
- The [D12] `sea.glint` uses sea normal and [D40] `skyLightUniforms.sunColor`. Changing the normal changes visible glint; calibrate FFT micro-variance so it doesn't create pinpricks of clipped white at far distance.
- `skyLightUniforms.reflectionTint` and [D37] `WaterReflectionController` still own environmental reflection. FFT can broaden/roughen the lobe through the **same** response, not a new independent clear-sky colour.
- Existing `SeaDetailShading` has packed donor slopes and second moments. When spectral source takes over, retain the ability to fallback to donor texture on unsupported renderer and avoid slope variance duplication.
- Rain and interaction normal fields are still summed separately; FFT should not interpret raindrop ripple energy as a change in underlying wind spectrum.
- Existing shore foam, swash foam, intersection foam, rock foam and spray are still combined using their existing max/composite chain. Additional offshore whitecaps, if ever added, must use a physically bounded metric (e.g. Jacobian/compression) and cross-fade into the existing sea whitecap channel; **do not** simply add a new white opacity full screen.
- Sea optics [D45] and refraction [D12] use sea normal to determine Snell path, diffuse depth/visibility. Fine wave normal effects should be damped/filtered on the transmitted underwater body if they yield unnaturally distorted seabed fragments in 1–3m water. Offshore FFT gate should already make that a rare problem.
- Frozen glacial/taiga lake/ocean water stays frozen: `ice.open` or actual ice source should turn FFT to zero without changing freeze/coverage logic.

### 6.6 Geometry as a separate gated architecture milestone

If later PR I phase adds far **vertex FFT displacement**, an arbitrary player/boat/simulation query can still sample that water; a distance-from-camera “it's visually far” heuristic does not satisfy [D17]. Two acceptable architectural strategies:

**Strategy A — authoritative deterministic CPU-evaluable long modes:** Build the offshore geometry from a *small finite* set of spectral low-frequency modes which can be evaluated synchronously in O(K) at any query, while the GPU computes their identical positions and derivative. This can be coupled with a separate FFT high-frequency normal field, but it is **not** a full 256² height FFT in geometry.

**Strategy B — shared deterministic precomputed low-res height field with guaranteed synchronous CPU sampling:** Generate a bounded spatial field from source Fourier coefficients on CPU at a safe cadence, store map/reference state and expose it without readbacks, with correct infinite canonical wrapping and snapshot timing. This must not require expensive per-query DFT nor cause stale physics during render time advances; test memory/CPU and field interpolation precisely.

Unacceptable: using the GPU FFT's height at all visible offshore vertices while leaving `seaSurfaceOffset` unchanged; syncing the GPU to CPU once per frame; computing a 256² DFT on every buoyancy sample; hiding height mismatch by changing camera water height; or making a boat gameplay contract depend on distant-only scene visibility.

**Release gate:** until one strategy is proven, the first PR I feature has no additional geometric displacement. It is still useful visually and remains a safe, independently reversible spectral normal renderer.

### 6.7 Direct CPU vs shader consistency tests

For selected canonical points (beach, reef, cove, open ocean, negative world), compare `getCanonicalWater` vs renderer's **actual displaced water** (not just surface static field). Before FFT and with FFT on, max height delta must remain the same original interpolation/field quantization tolerance. The current coast QA [D33/D34] demonstrates canonical page-field vs triangulated bed comparisons; follow this style.

If optional geometry is introduced, compare numerical wave at same clock over at least one full dominant wave period with float32/half precision and worker streaming. Include frozen time, forward/backward scrub, rebase, chunk edge and event timing.

---

## 7. Stable large-world phase, tiling and motion

### 7.1 One phase field over an unbounded world

[D6] correctly computes the five carrier phases at each **chunk centre in double precision** and the shader adds local delta. FFT texture coordinates must follow exactly the same principle, separately per cascade tile size.

```text
function positiveModuloDouble(x,L) {
    return ((x % L) + L) % L;
}

for each cascade c:
  originPhaseUv[c] = positiveModuloDouble(chunkCenterCanonicalXZ,L[c])/L[c]
  uv_c = fract(originPhaseUv[c] + chunkLocalXZ/L[c])
  # sample prefiltered 2D array texture layer c

# Never compute fract((worldPosRender + 4_200_000)/3.1) in GPU f32.
```

Update on resident slot descriptor change only. [D13] currently already updates `seaSwellPhaseOrigin` then; PR I may extend its per-slot `materialOptions` to include a **small array of FFT UV origin uniforms** with [D14] `onObjectUpdate`, without creating per-slot materials. This is one of the few legitimate slot edits.

Ensure negative modulo and seam continuity across actual shared chunk edges: two adjacent chunk centres map identical shared border UV despite center differences, to within texture sampling precision. Avoid tiny visible jump when wrapping the FFT tile phase. If a projected FFT normal is generated at finite resolution with bilinear filtering and standard RepeatWrapping, verify the texel 0/N boundary and spectral phase match.

### 7.2 Do not make a camera-following FFT field swim

A common shortcut is to draw a 128×128 FFT texture around the camera and shift sampling when camera moves. This causes the crest pattern to slide relative to the rocks/land. The Fourier source is a **world-periodic field**, sampled in canonical XZ independent of camera, not a world position derived from viewport UV.

A camera jump may affect **which resident chunks** sample the source, but not the source's random seed, global Fourier phase or water clock. Floating-origin snap translates render positions and camera together; UV from canonical chunk centres stays unchanged.

### 7.3 Wave tile repetition and cascade decorrelation

Small FFT grids repeat every tile size L. Multiple cascades with nonintegral ratios reduce synchronized repetition, but if only two short-wave cascades are used, obvious repeating crests can still appear at the horizon.

- Use separate seeded mode subsets/phase salts per cascade, disjoint frequency bands and ratios chosen not to line up over short distance.
- A very distant pixel needs fewer resolved fine slopes: mip/variance aggregation hides short tile repetition; do not increase tile size at the cost of wasting resolution on subpixel waves.
- Use current [D23] long-range packed ripple for remaining nonperiodic appearance when appropriate; if combined, its variance/energy must be counted once.
- A domain warp must not break the phase, gradient/wave propagation or match across chunks; avoid procedural random UV offsets per slot.
- At extreme distances, use **expected statistical roughness** rather than sample pointwise centimetre wave normals that cannot be resolved.

### 7.4 Wind and storm sign conventions

[P1] positive IFFT time sign moves opposite +k. [D6] five analytic waves use their own (+time) convention, and shore carriers are designed to move onshore. The FFT wind heading converter must be unambiguous:

- Normalize input weather direction in degrees 0..360, with explicit from/to convention and X/Z world axes.
- A known east wind should produce statistically eastward travel if declared “towards east”; test a single mode's crest at t0/t1.
- Distinguish *local wind sea* response from long-travel swell direction already in [D6]. No global wind rotation of CPU analytic carriers.
- Storm intensity currently multiplies analytic offshore amplitude by `stormScale` and influences choppiness. FFT's wind-energy control must be tuned so storm doesn't scale the same energy twice in residual normal/roughness.

---

## 8. Integration with the current frame lifecycle and render graph

### 8.1 The actual active rendering hooks

[D15] builds `SharedWaterMaterials`, `WaterReflectionController`, water slots, and attaches a `beforeMainRender` callback which prepares cascaded shadows and reflection schedule. Its `afterMainRender` runs bounded reflection capture using the existing deferred work scheduler. In `update(timestamp,camera)`, it updates sky and then water slots; when land streaming is suspended underwater, **water slots still update**.

Choose **one** owner point to prepare FFT once per app frame **after** [D18] water time has been published but **before** the first water scene draw. If water slot update sets the time as it currently does, add a single well-defined water-clock publication at the start of this owner update (without changing value) or prepare in the existing beforeMainRender callback after the clock is already set. Do **not** append a new hook that overwrites the existing reflection/shadow callback, and do **not** call compute separately for the reflection camera.

### 8.2 Atomic state publication

A compute operation cannot publish partially transformed rows or changed spectrum uniforms while the water shader still samples stale output. Use a generated output resource/validity state or a safe update order:

```text
read canonical water time once
update weather-derived spectral parameters only if revision changes
if spectrum rebuild needed:
    compute seeded mode amplitude buffer
if enabled and visible, update:
    evolve modes at current water time
    run row/column inverse
    publish complete output (and mips if required)
    update spectralRevision + timeGeneration
draw exactly one active water scene with published output
capture reflection using same published output, no compute again
```

When output is not ready, use original donor detailed texture seamlessly. Do not sample an uninitialized FFT target, a partially updated row buffer, or a texture from a previous renderer generation. When toggling feature on/off, compile the appropriate shared water variant once, not per chunk.

### 8.3 Avoid other expensive render features

- [D12/D13] only use the refractive near-water material around the focus chunk, because any viewport-opaque/depth texture sampler triggers a **full scene colour/depth/mipmap copy**. Do not add viewport sampling to FFT, and ensure far ocean FFT continues using the nonrefractive shared variant.
- FFT does **not** justify a new global ocean skydome, depth prepass, water MRT or separate TAA. It should supply stable normal data into existing surface shader.
- [D37] reflections read current ocean normal. Keep existing water refraction and scene reflection ownership; if FFT makes normal more detailed, reflection lobe should follow filtered roughness, not one new reflection pass per slope band.
- Existing water material is unlit and applies sky light/glint manually. Do not port Ponlai's full `Water.ts` physical shading and thus double sun/sky in this phase.
- Existing screenshots/profilers already depend on a precise render-path lifecycle. The FFT runtime must not advance the clock again for cinematic god-rays, direct editor, postprocess or scene reflection.

### 8.4 Shader and GPU binding limits

Before passing FFT slope textures into [D12], query actual portable limits and inspect generated shaders for the **high/ultra ocean material**:

- Existing waterField, waterFlow, waterAppearance, surface mask, per-object obstacle, packed normal/noise, reflection plus optional refractive viewport nodes may already be near the 16 sampler binding limit.
- Prefer reusing the one sea detail sampler already present **if** format/binding and lease semantics can be swapped safely. A 2D array texture may count as a new sampled binding; it is not “free” because cascades share one sampler.
- Extra `varying` for FFT UV origins can exceed 16 interstage variables. Compute per-cascade UV from per-object uniforms + local XZ instead of allocating many vertex-to-fragment varyings.
- Verify WebGPU vertex/fragment sampler budgets and actual Three shader compilation on a 16-sampler/16-varying device profile, even if development NVIDIA exposes larger limits.
- Keep the old unfiltered source if a capability fails; do not silently expand the device's required limits beyond browser portability.
- Use a small pooled immutable data object for FFT output metadata to avoid per-frame JS allocations in the hot loop.

---

## 9. GPU memory, performance and scheduling acceptance

### 9.1 Memory is more than just one FFT texture

The following are **derived logical byte counts**, *not measured VRAM use*. Driver alignment, staging, backend render targets, compiler, mips, in-flight frames and synchronization increase peak residency. The original [P1] implementation has significant temporary storage:

```text
N = FFT dimension per side
C = number of cascades
M = N*N*C Fourier mode positions

Gaussian paired seed buffer (vec2 float32):  M * 8 bytes
h0 paired coefficient buffer (vec4 f32):    M * 16 bytes
IFFT ping-pong, 3 complex-packed vec4:
       2 pingpong sets * 3 fields * M * 16 bytes
One RGBA16F array texture:                 M * 8 bytes, before mips
One RG16F array texture:                   M * 4 bytes, before mips
Full 2D mip chain ≈ 4/3 base payload per array.
```

| Configuration | Modes | Seed pairs | h0 pairs | 2×3×vec4 ping-pong | One RG16F slope output | Context |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 64²×1 | 4,096 | 32 KiB | 64 KiB | 384 KiB | 16 KiB | Very small proof only |
| 128²×2 | 32,768 | 256 KiB | 512 KiB | 3.00 MiB | 128 KiB | Balanced candidate before shader optimization |
| 256²×2 | 131,072 | 1.00 MiB | 2.00 MiB | 12.00 MiB | 512 KiB | High candidate |
| 256²×4 | 262,144 | 2.00 MiB | 4.00 MiB | 24.00 MiB | 1.00 MiB | Full upstream-style engine |

For the full upstream 256²×4 outputs, three RGBA16F arrays (displacement, derivatives, velocity) are 3×2 MiB=6 MiB before mips. With mips on the first two only, about **7.33 MiB**. Add the 24MiB ping-pong, 4MiB h0 and 2MiB Gaussian: approximately **37.33 MiB** of counted logical payload, **before** other resources/driver memory. The simpler 128²×2 one-output version can be much smaller, and can potentially use **fewer than three packed complex fields** if generating slope only.

If a 128²×2 implementation simply copies the entire source three-field compute pipeline but publishes only two useful channels, its temp budget still includes the 3 MiB ping-pong. Refactor to compute only the genuinely required fields, then re-measure. Avoid a large unused velocity output or 12 render-quad passes during normal gameplay.

### 9.2 GPU dispatches, graphics submission and mip cost

[P1] may execute:

- One spectrum rebuild compute on weather changes.
- One Fourier-time evolution compute every active wave frame.
- 2 optimized shared-memory FFT dispatches **or** up to 2 log₂N radix-2 stages per field/axis depending design.
- One output conversion/render per cascade/texture (full Ponlai 12 render quads) plus optional mips.
- Water shader samples/LOD and extra scalar work per pixel.
- GPU synchronization and memory barriers between passes.

**Do not use rendering GPU timestamp alone:** [D35] explicitly says its native GPU pass profiler sampled *render passes*; FFT compute and transfers are not included in that number. Require a timestamp-capable compute profiler or a representative GPU-complete measured frame benchmark where isolated timestamp queries cannot be obtained. If unavailable, label compute GPU duration **unavailable**, not 0ms.

No unconditional compute dispatch when there is no ocean water in view, FFT feature off, low tier unsupported or app paused with unchanged time and spectrum. A paused camera plus unchanged time must reuse generated GPU textures, not loop FFT 60 times a second.

### 9.3 Performance budget: hypotheses, not fake results

Benchmarks must use the same machine, backend, pose, weather, water clock, config, resolution, warm state and foreground validation as [D35], with A/A reproducibility before B comparisons.

Provisional candidate targets for **balanced** FFT normal-only offshore mode @native RTX 4080, 1600×900:

- **Off**: truly zero FFT pass work and no new FFT target allocation or shaders; maintain same legacy scene performance.
- **Balanced on**: aim for **≤0.5ms isolated average FFT compute + output processing** when sea visible, and **≤0.2ms ocean fragment/sampler delta**; these are design targets, not measured achievable values.
- **Coastal scenes**: target ≤5% additional frame median and ≤10% additional frame p95 **after warmup**, matching recent comparison gates. If the feature exceeds them but offers substantial visible benefit, keep it opt-in and document cost and reason; do not quietly mark it passed.
- **Open-sea vistas**: may be allotted an explicitly larger cost if the visual improvement is large and FPS frame budget still satisfies the current target; show the before/after image and measured per-pass cost.
- **No visible ocean**: negligible additional CPU and no FFT GPU dispatch; do not keep drawing unseen wave tiles in forest/town.
- **Low/mobile**: default fallback to current analytic/packed detail, unless native hardware proves a small 64² system worthwhile.
- **Wind-change spike**: source spectrum rebuild and shader compile must not introduce main-thread or GPU hitch; throttle/reuse or stage updates, record rare spikes.
- **Moving camera/streaming**: never allocate extra FFT textures per new water chunk; page gen and worker backlog must remain unchanged.
- **Underwater**: no new expensive refraction/copy as a side effect of FFT; swimming route, caustics and underwater visibility preserved.

This phase will **not** reduce the existing RTX 4080 numbers into simplistic “GPU render ≤5ms” assumptions: the full application can be CPU-limited, sampling incomplete, or work may be outside the sampled render pass.

### 9.4 Requested metric names and support metadata

```text
offshoreFft.enabled
offshoreFft.effectiveState        # disabled, compiling, active, unsupported, failed
offshoreFft.quality
offshoreFft.resolutionN
offshoreFft.cascades
offshoreFft.outputChannels
offshoreFft.spectralRevision
offshoreFft.sourceSeedHash
offshoreFft.windSpeed, windDirection, fftClockTime
offshoreFft.cameraFrameToken, waterTimeGeneration
offshoreFft.bufferBytes, outputBytes, stagingBytes, peakKnownBytes
offshoreFft.computeEvolveDispatches
offshoreFft.computeFftDispatches
offshoreFft.outputDraws, mipBuilds, spectraRebuilds
offshoreFft.gpuComputeTimeMs       # null when unavailable
offshoreFft.gpuConvertMipTimeMs    # null when unavailable
offshoreFft.cpuPrepareMs
offshoreFft.fragmentSamplersAdded, varyingCount
offshoreFft.fftSlopeRms, fftRoughnessResidual, detailReplacementRms
offshoreFft.coastBlendMinMax, activeWaterSlots
offshoreFft.fallbackReason, lostDeviceCount
frameMedianMs, frameP95Ms, frameP99Ms
gpuBackend, adapterName, fallbackAdapter, gpuTimingAvailable
```

Frame counters may be sampled/gauged to avoid per-frame heap allocation. No logging every frame on GPU success. One warning per failure transition, clear status for unsupported device and QA metadata capturing source revision, config and compiler backend.

---

## 10. Configuration, validation and safe feature switch

### 10.1 Correct owner: water-visual YAML

The real `water.sea` is in [D2] `config/water-visual.yaml`. [D3] clones it into `config.stylizedSurface.water` and [D4/D5] validate. PR I should **not** add a separate parsed JSON or another mutable config state.

Proposed **minimal** opt-in schema:

```yaml
water:
  sea:
    offshoreFft:
      enabled: false
      quality: balanced
      outputMode: normals
      bandMode: shortResidual
      seed: 124593
      windSource: weather
      geometry: false
      debugView: off
```

These are proposed defaults/keys, not existing implementations. Numbers requiring art direction (band cutoff, wind gain, FOV mip bias, shore fade, sampling count, spectral update interval) should live in one well-defined **quality/constant profile** or optional validated advanced nested YAML only when tested. Do not put 30 freely configurable performance-critical knobs into the first user-facing YAML.

**Hard prohibition:** `geometry: true` cannot be enabled in this MVP. Validator should reject it with an actionable message until both the GPU-height/CPU-query contract and water collision QA are proven and merged. Do not accept the flag and silently create a height mismatch.

### 10.2 Quality policy

- `low`: FFT off, old deterministic swell + packed detail.
- `medium`: default off unless 64/128² measured safe; may opt in explicitly.
- `high`: opt-in balanced 128²×2 starting candidate, actual supported FFT profile based on benchmark.
- `ultra`: opt-in high quality, 256²×2 only if worth cost; full 256²×4 still an optional future profile.
- On mobile/constrained WebGPU: query actual capabilities, prefer analytic fallback; don't force a user-visible disable of water reflections/foam just to pay for FFT.
- Renderer uses one canonical effective mode after quality/capability decisions. Avoid quick quality oscillation and repeated texture reallocation every frame.

### 10.3 Validate at boundary

Reject:

- Non-boolean `enabled`/`geometry`, unsupported enum `outputMode`/`bandMode`, non-integer/negative seed and invalid quality.
- FFT N not power of two, outside measured 64/128/256 candidate set, or array-layer count exceeding device limits.
- Wrong orientation convention, zero/NaN/Inf wave-number cell, negative wave energy, negative depth/fetch, zero/singular spectral peak.
- Config that adds wave height while water-domain CPU parity is absent, or any force-enable fallback on unsupported WebGPU.
- Unsupported format filterability, storage binding and sampler budget; these are **runtime state failures** with legacy fallback, not configuration silently rewritten.

On shader compilation failure, avoid leaving water invisible or storing a stale node graph. No catastrophic crash just because a high-tier optional spectrum is unsupported; fail back to original shared material and free partially allocated GPU resources.

### 10.4 Explicit effective states

```text
disabled
  legacy water shader and CPU, FFT resources never allocated
requested
  validate YAML, quality and renderer capability
initializing
  deterministic seed, cached initial spectrum, compile/warm one shader group
ready
  known valid FFT output texture for correct water clock/seed/generation
active
  shared water material reads FFT slope and preserved analytic height
paused
  clock unchanged, reuse result texture, 0 FFT dispatches
weather-changing
  controlled spectrum/gain transition without reusing incomplete outputs
failed / unsupported
  original SeaDetailShading and five-sine heights, clean device recovery
disposed
  no surviving FFT storage buffers, targets or callback registrations
```

The runtime may be **ready** without being **active** if no ocean water currently draws. A missing future cloud/physical sky PR is **not** an FFT failure: original sky reflection still works.

---

## 11. Proposed small source modules and exact code edit targets

### 11.1 Modules to add, each with one responsibility

| Proposed file | Purpose | Contract |
| --- | --- | --- |
| `src/editor/water/fft/OceanFftConfig.js` | Resolve and validate flags/tiers | Pure, no GPU or DOM |
| `src/editor/water/fft/OceanFftConstants.js` | Spectral units, mode bands, quality constants | Export frozen values, no runtime state |
| `src/editor/water/fft/OceanSpectrum.js` | Seeded JONSWAP/TMA spectrum, band cut, expectation integrals | Pure CPU counterpart to GPU |
| `src/editor/water/fft/OceanFourierReference.js` | Tiny pure CPU reference DFT, seeded mode fixtures | QA-only module; not imported by hot path |
| `src/editor/water/fft/OceanFftCoordinates.js` | Canonical modulo and chunk-local origin data | Pure CPU, plus tiny TSL helper if justified |
| `src/editor/water/fft/OceanFftKernels.js` | GPU mode evolution/Stockham IFFT and output | TSL, no DOM/weather clocks |
| `src/editor/water/fft/OceanFftTextures.js` | Target formats, mip lifecycle, resource leases | One renderer owner |
| `src/editor/water/fft/OceanFftRuntime.js` | Feature state, time, mode generation, prewarm, update/dispose | Small per-renderer coordinator |
| `src/editor/water/fft/OceanFftBlendNodes.js` | Texture slope read, LOD, marine gate and variance blend | TSL pure node builder |
| `src/editor/water/fft/OceanFftDiagnostics.js` | Pass timing, counters, status and debug modes | No per-frame debug allocations |
| `test/ocean-fft-spectrum.test.js` | CPU spectral and DFT invariants, seed, band exclusion | Test only |
| `test/ocean-fft-coordinates.test.js` | Tile seams, negative world, chunk rebase | Test only |
| `test/ocean-fft-integration.test.js` | Material/quality/CPU-height invariants | Test only |

Avoid creating all modules if some can be safely combined without a huge file. Keep no 659-line direct port of `OceanFFT.ts` or new general-purpose GPU abstraction for just one effect. Optimize source size after behavior and numerical tests; no premature class hierarchy or 6 extra YAML files.

### 11.2 Current files that should actually change

| Existing source | Minimal extension | Preserve |
| --- | --- | --- |
| [D2] `config/water-visual.yaml` | `sea.offshoreFft` under existing `water` | All surf/optics/foam/coast defaults |
| [D4/D5] `WaterQuality.js` / `SeaConfig.js` | Small normalized profile + strict validation | Four tiers, legacy quality toggle |
| [D11] `SeaSurfaceShading.js` | Optional spectrum slope replacement in current `detail.slope` composition | Existing analytical height, shader foam and glint |
| [D12] `StylizedWaterMaterial.js` | Pass coherent FFT sampler/texture metadata only to sea branch | Lake/river kind/flow, optics, refraction, foam, frozen water and positionNode |
| [D13] `StylizedWaterSlot.js` | Optional per-cascade **double-precision UV origin uniforms** updated on descriptor change | Existing 5 wave phases, upload, bounds, dry skip |
| [D14] `SharedWaterMaterials.js` | Extend stable per-object bindings if new UV origins needed | One shared shader per refraction variant |
| [D15] `StylizedSurfaceViewBase.js` | Own and dispose exactly one FFT runtime; one before-draw update | Existing reflection and cascaded shadow callback |
| [D18] `WaterVisualClock.js` | No new clock; read existing time | QA override for deterministic capture |
| [D30] `WorldWindPass.js` | Read only its resolved wind/heading if available; avoid new field | Existing global wind simulation |
| [D31/D42] GPU fixtures / water acceptance | FFT toggles and per-tier photos, timing | Existing negative-world water and swim acceptance |
| [D43] `GpuPassProfiler.js` | Optional computed FFT stage timings with accurate fallback | Existing render GPU pass timing |
| [D17] water-domain architecture docs | Record **no geometric FFT initially** and explicit later CPU-query gate | Canonical water/sea-level contract |
| `docs/rendering/offshore-fft-ocean.md` | Final implementation, provenance, supported tiers, native perf results | New document **on implementation**, not now |

**Do not touch by default:** [D6/D7/D8/D9/D10] actual nearshore wave CPU model, [D19/D20] worker water domain, [D21/D22] global coastal distance fields, [D25–D27] swash/rock spray event physics, [D37] reflection pipeline, terrain masks, edited page history and postprocess scene graph. If a real test uncovers a necessary seam, make that change small and separately review it.

### 11.3 Tiny runtime contract to other renderers

Conceptual (not yet implemented):

```text
OffshoreFftFrame {
    clockSeconds, frameToken, spectrumGeneration,
    seed, windSpeedMps, windDirectionRad, quality,
    previousTimeSeconds, rendererGeneration
}

OffshoreFftOutput {
    status, generation, snapshotTime,
    spectralBandKMinKMax,
    slopeMap, cascadeTilesMetres, samplerValid,
    expectedSlopeVariance, roughnessResidual,
    bindingStatus, fallbackReason, diagnostics
}

OffshoreFftRuntime {
    ensureReady(renderer, config)  # asynchronous/compilation-safe
    prepare(frame)                # idempotent for same frameToken
    getOutput()                   # stable completed generation
    invalidate(reason)
    dispose()
}
```

There is no `heightMap` field in the required output. If a future optional geometric feature genuinely implements CPU parity, define a separate shared wave-height provider and test before extending the runtime output.

### 11.4 Error and lifecycle handling

- Log one contextual error when shader build fails, giving FFT profile, backend and source revision; never print huge console spam every frame.
- On device lost, dispose FFT handles and mark sampled output invalid before water material can use it. Keep legacy water visible.
- On invalid YAML configuration, throw clear field path at load time; do not ignore `geometry:true` silently.
- On spectrum rebuild, keep last valid texture until a new coherent generation is complete, and avoid stale flow/clock data in reflection pass.
- Use signal/version token to cancel old async compile result after scene changes or renderer restart.
- Performance counters are bounded/aggregated, debugging is opt-in. Avoid `Date.now` random phases, global mutable unowned GPU singleton or per-water-slot FFT allocation.
- Startup and current world generation are async and recoverable; a missing optional FFT must never block loading the map or entering water.

---

## 12. Release readiness and performance tradeoff

A correct implementation of PR I may use **just one or two small FFT cascades and improve offshore normals** while preserving the existing five authoritative swell waves. The full Ponlai four-cascade 256² Tessendorf renderer is a **different, larger project**, with extra displacement, velocity, complex slope filtering, depth-aware foam and possibly new collision/query contracts. Do not conflate them.

The user-visible implementation proposal must state exactly which effects are available: short-wave offshore spectral variation, filtered roughness and a subtle wind/sea response. If wave geometry is *not* FFT-driven, explicitly say so; do not market the result as a full geometric FFT ocean. The minimum improvement should still materially beat the current analytic-only image in controlled open-sea captures, otherwise reject and keep the original simpler shader.

---
