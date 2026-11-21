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
