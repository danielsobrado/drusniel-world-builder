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

No eager initialization at startup just because sea YAML exists. Create/compile only when `offshoreFft` is enabled, actual ocean water is visible and the requested quality tier is supported.

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

## 13. Rigorous testing matrix — CPU, shader, coastal and native hardware

### 13.1 Pure reference and spectrum tests

A GPU FFT screenshot by itself is insufficient; require the following precise independent assertions:

1. **FFT/DFT oracle:** tiny 8² and 16² seeded complex spectra: CPU direct inverse DFT vs GPU Stockham result within a documented float32 tolerance; verify each axis order and inverse normalization.
2. **Hermitian and realness:** mode `H(-k)` is conjugate of `H(k)` at correct wrapped mirror index; zero/Nyquist handling yields near-zero imaginary spatial output.
3. **Parseval and RMS:** integrated expected power matches measured spatial variance, factoring inverse normalization and spectral cell area once. Vary seed and N.
4. **Directional dispersion:** single-mode eastward wave travels in declared direction for `t=0,1,10`; verify Ponlai positive IFFT opposite-`k` sign correction.
5. **Stable absolute time:** evaluating at `t=123.4,124.6,126.0,127.6` in any call order gives the same FFT slope field for that fixed t; QA freeze repeats hash after reload.
6. **Deterministic seeded input:** same seed, N, spectra and wind = same Gaussian pairs, h0 and final texture; different seed changes positions but comparable statistical energy, not scale.
7. **Zero energy guard:** no Fourier energy at DC, invalid directions, negative wave energy, zero wind under the chosen physical cut, excluded wavelengths ≥7.5m, out-of-band cascade cells.
8. **Band closure:** sum over all cascade masks and expected power equals the intended high-pass residual, with no mode included twice or silently dropped at band borders.
9. **Finite dispersion:** as `kd→0` shallow formula agrees; as `kd→∞` deep formula agrees; zero/small k does not generate NaN.
10. **Derivative parity:** FFT slope sample equals finite-difference derivative of FFT height in the small synthetic oracle. Unit checks prevent radians-vs-degrees wind drift.
11. **Shader norm after filtering:** reconstructed normal length 1, finite even with zero amplitude, grazing camera, massive pixel footprint and texture seam.
12. **Filtered energy:** at increasingly distant footprint, pointwise slope variance falls and mean *unresolved* variance is transferred to bounded roughness; it must not vanish mysteriously or double.
13. **Climate/weather:** a storm increases short-wind response smoothly without multiplying its existing analytic long-swell height again; wind rotates based on correct convention.
14. **Ocean-kind isolation:** FFT output contributes **exact zero** for lakes at sea level, rivers with zero flow, frozen water, dry pages, and when `sea.enabled=false`.
15. **Legacy identity:** flag off means no new compile shader branches, FFT resource allocs or changes in `SeaSwell` canonical CPU or TSL values.
16. **No height mismatch:** with FFT **on** in normal-only mode, canonical CPU water surface height equals original rendered height at tested positions to preexisting tolerance.
17. **Chunk seams and rebase:** same world point sampled from two adjacent 128m water slots and across −4,226,432m canonical positions gives same FFT UV/sample/normal within precision.
18. **Seam at FFT wrap:** at repeat tile left/right/top/bottom and mips, no high-contrast visible line; compare fractional phase under negative modulo.
19. **Random scene transition:** camera/water slot reassignment does not reseed FFT, restart phases, allocate new FFT instance or change measured world wave.
20. **No texel alias:** high frequencies shorter than 2m mesh spacing are never converted to new vertex vertical displacement; normals are footprint-filtered.
21. **Capability fallback:** missing WebGPU/texture2DArray, insufficient workgroup memory, RG16F format limit, low binding count and shader failure leave existing sea and gameplay intact.
22. **Device recovery:** after simulated lost/reinit, same seeded sea at same water time reconstructs expected wave field and old GPU buffers are not sampled.
23. **Disposal:** repeated quality change, world unload/reload, body diving/surfacing and renderer recreation leaves one owned FFT resource set or zero when off.
24. **No readback:** the normal running route never calls synchronous GPU texture read or `mapAsync` to update water heights; CPU queries remain bounded and deterministic.
25. **Reflection:** reflection render uses identical completed FFT generation and no second compute; no recurrent mip build caused by reflection capture.

### 13.2 Shader build and binding tests

Test the real [D12] `StylizedWaterMaterial` generated by both [D14] shared variants, not a synthetic isolated FFT quad alone. Validate:

- All four existing `water.qualityTier` values, FFT off and effective on where permitted.
- High/ultra with refraction enabled/disabled; the near refractive branch still lazy-compiled only when a near wet chunk is visible.
- 16 sampled texture binding and 16 shader interstage varying limits; backend negotiated device limit and actual adapter must be recorded.
- 1, 7 and 49 visible resident water slots: one FFT resource and stable material program count, not linear N slots FFT shader creation.
- Water source and terrain page RGBA field are **unchanged** by FFT toggle; no new pages committed, water worker CPU unaffected.
- Texture mip LOD generated once per completed FFT output, no stale layer when a cascade is off, no wrong orientation on water mesh rotation.
- First-offshore animation after startup does not block for a multi-second shader compilation.
- Existing shader wave/CPU tests continue to pass at off; addition of FFT must not alter old regression constants, source data or snapshots.

### 13.3 Synthetic visual fixtures

| Fixture | Specific acceptance |
| --- | --- |
| Flat synthetic ocean, no existing waves, known one FFT mode | Displacement disabled in MVP; normal stripes travel correct way, finite and smooth |
| Pure analytic five-wave ocean control | Exactly old look/height with FFT off |
| Shore at 0–3m water depth | FFT amplitude exactly zero, no waterline shift, normal/foam from current surf |
| Surf blend at 2.5–7m | No FFT contribution while nearshore carriers hand off to authored five-sine swell |
| Mid shelf 7–15m | FFT slope smoothly ramps, no rim of higher glint, no hard band at 17m |
| Deep ocean beyond capped shore distance | FFT enabled only if real marine-kind/depth tests pass; not permanently stuck in fade |
| Sheltered cove behind a headland | Short chop attenuated by existing exposure; long swell and breakers remain |
| Open windy headland | More statistically irregular high-frequency glint than current five-wave, no noisy salt shimmer |
| Storm sea | Correct fine-wave broadening/whitecaps without extra sharpness/height blackout |
| Twilight and moonlit water | Sky light/glint uses existing resolved look; no permanently white Fresnel spray |
| Lake at sea level / river with zero flow | No FFT wave/sampler work on those surfaces beyond shared material compile |
| Frozen water | No FFT normals on ice, no new water animation through ice |
| Negative canonical X/Z and distant island | No f32 swimming, no wave tile seam at rebase/chunk boundary |
| Camera turn from cliff down to offshore | Stable filtered specular response; no screen-space repetitive diagonal bands |
| Fast camera travel/teleport | FFT world field stays fixed, only visible region changes; same t repeated image unchanged |
| Paused water clock plus live world clock | Water FFT and current swash both frozen by WaterVisualClock override |
| Wake/rain ripple over sea | Existing interaction/rain effects still visible once; not double-calculated |
| Underwater looking up | Valid water mesh, correct surface height, no new copied framebuffer or FFT per camera |

### 13.4 Real world screenshots: use existing 2026-11-20/21 coastal QA poses

The best verified reference is the recent actual coast QA data, **not an invented list of coordinates**. Load the manifests and poses from [D33–D35], preserving their exact source/seed/time and currently measured setup:

- `docs/qa/coastal-review-2026-11-20/poses.json` and `manifest.json`: exposed beach, curved coast, cove/lee, headland, rocky shore, medium/high/ultra/low variants and surf shelter control.
- `docs/qa/coastal-fix-review-2026-11-21/poses.json` and `manifest.json`: shoreline, wire, raw depth, seabed wetness and GPU comparison, includes fixed original repro.
- `docs/qa/coastal-fix-review-2026-11-21/logs/water-acceptance-headed.json`: true GPU water navigation route; don't claim pass based on an unrelated static ocean screenshot.
- [D31] `SeaSurfFixture` fixed `clock=127.3` and canonical world centre `[-4,226,432, 278,528]`, plus `surf-moving` and rebased shots.

**Minimum A/A/FFT-on** image set:

1. Calm sunny offshore from high cliff, source visual no FFT vs FFT.
2. Moving sea from the same camera at clocks 123.4/124.6/126/127.6s.
3. Exposed gentle beach at eye level with foreground foam and far sea visible in one image.
4. Curved shore with 10–17m shelf and original visual angular-band region.
5. Sheltered cove onshore and offshore view showing lee difference in short chop.
6. Headland looking down at water normals, both with high and ultra.
7. Rocky coast waves and spray events (preserve previously measured particle lifetime).
8. Deep ocean/clear horizon at low sun; no repeated FFT tiles or bright horizon.
9. Storm and nighttime moon/town coast with existing water tint.
10. Underwater and surfacing from acceptance route, preserving opacity, refraction and seam.

For every capture: log exact git SHA, seeded mode coefficients hash, water clock, camera canonical pose, FOV, quality, FFT N/cascades/bands, device backend, resource generation, screenshot and diagnostic render modes. Control weather, wind, day/night and all reflections consistently. A screenshot with a low FFT blend of zero is **not proof that FFT works**; include at least one explicitly deep offshore probe where blend=1 and the FFT output is actually sampled.

### 13.5 Required visual debug output

Support a bounded QA-only debug view for:

```text
fft-spectrum-density-k-space
fft-initial-gaussian-phases
fft-after-ifft-height-oracle
fft-derivative-x-and-z
fft-filtered-slope
fft-footprint-mip
fft-expected-slope-variance
fft-unresolved-roughness
fft-offshore-depth-mask
fft-shore-distance-mask
fft-shelter-exposure-mask
fft-water-kind-mask
fft-effective-contribution
fft-cascade-bands
fft-seed-and-generation
fft-compute-timing-availability
```

Never leave these expensive debug samplers compiled into production material when off. Use one debug-mode enum to compile optional QA views.

### 13.6 Actual test commands available in package.json

```bash
git branch --show-current
git status --short
git log -15 --oneline

npm test
npm run lint
npm run build

npm run qa:water:acceptance
npm run qa:world:visual
npm run qa:look

npm run qa:perf -- --headed
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --settle
```

These are verified package script names. The exact supported flags on QA runners must be rechecked in `--help` before using a nonstandard option. Water acceptance should use native headed Windows Chromium when available: [D34] documents the headless runtime sometimes failing with `dxil.dll` and only full Chromium selecting the NVIDIA native WebGPU device correctly. Record whether the test was foreground/headed, GPU adapter, focus and fallback status.

### 13.7 Numeric acceptance gates

- FFT off: pixel-identical legacy screenshot where deterministic fixture permits; zero new FFT GPU work/allocations.
- No height changes from FFT normals: zero added displacement; original CPU-vs-GPU surf height/shoreline tolerance remains.
- At any shared vertex, FFT slope sampling is continuous across chunks; numerical discontinuity tolerance explicitly determined by RG16F/mip precision.
- GPU-FFT vs CPU tiny DFT passes tolerance tests; no data-dependent holes, NaN or abnormal Fourier imaginary component.
- Visible improvement at sea: repeated FFT-on still and motion comparisons must show irregular offshore detail **without** introducing bright/hard lines, shimmer, aliased normals or nearshore foam changes.
- No large source remap on wind or QA clock seek, no texture flicker or extra output conversion render each reflection capture.
- Shader sampler/varying compile success under portability limits, device failure fallback and release/dispose leak check.
- Target balanced FFT GPU compute ≤0.5ms average and fragment delta ≤0.2ms on benchmark hardware as provisional aspirations; record real measurements or label unavailable. Explicit on/off frame median/p95 and quality ROI determine release.
- Water acceptance route and coastal QA must pass with no added waterline/caustic/foam issue or new CPU stall.

---

## 14. Phased implementation plan and stop conditions

### I.0 — New-main audit and deterministic QA baseline

- [x] Pull latest `main` and review git log since baseline `1ad7a890`. Don't overwrite fixes in coastal swash, water QA, GPU sampler allocation or other commits.
- [x] Follow [D1], inspect [D17] water-domain contract, and compare E/F/G/H actual code status. Do not assume planned features are present.
- [x] Reconfirm [D2/D3] YAML assembly and [D4/D5] validators; no alternate FFT config loader.
- [x] Record native adapter, Three installed/lock version, TSL storage buffer/texture array/computeKernel capabilities and actual sampling limits.
- [x] Benchmark on/off baseline **before** any FFT code, using recent native coastal evidence manifests/poses and water acceptance.
- [x] Capture current five-wave offshore look, full nearshore/rock/foam and all four quality tiers for A/A repeat.
- [x] Verify current CPU `seaSurfaceOffset` and shader height agreement at far and near sea; identify exact coordinate transform from per-slot centre to canonical metre.
- [x] Check effective shoreDistance maxima and actual blend source; no planned far shore fade requiring 200m if capped at 48m.
- [x] Decide initial 64² proof and 128²×2 production candidate, with device limit test and memory plan.

**I.0 result:** [Phase I.0 audit and baseline](ponlai-pr-i-phase-i0-audit-and-baseline-2026-11-21.md) — architecture verified against `a6e09d59`, native RTX 4080 capability probe, coastal/offshore captures, A/A performance and water acceptance on hardware WebGPU, decisions A–H and the I.2 handoff.

**Stop:** water-domain/query contract unclear, unsigned canonical transform not reproducible, no native WebGPU reference, source differences from this pinned plan, or existing offshore shader already changed radically.

### I.1 — Pure spectrum model and test oracle

- [x] Add `OceanSpectrum` pure model, JONSWAP/TMA terms, time dispersion and directional spread, explicit sea-vs-swell units.
- [x] Implement seeded normal-pair mode generator, Hermitian index, zero/Nyquist handling and stable same-seed reproducibility.
- [x] Implement tiny 8²/16² direct inverse DFT and mathematical invariants `13.1`; confirm normalization, Parseval and travel direction before GPU.
- [x] Add high-pass short residual excluding wavelengths ≥7.5m, with a band/taper table and expected slope variance computation.
- [x] Compare analytic current five-wave energy and existing detail source variance; choose replacement strategy for overlapping detail.
- [x] Test U=0, unusual fetch/depth, extreme storm, signed large canonical coordinate seed, and time seek.
- [x] Keep mode constants in separate file; actual tuning in approved quality profile.

**I.1 result** — full report and I.2 handoff: [Phase I.1 spectrum and reference](ponlai-pr-i-phase-i1-spectrum-and-reference-2026-11-21.md). Modules in `src/editor/water/fft/` (`OceanFftConstants`, `OceanSpectrum`, `OceanGaussianModes`, `OceanFourierReference`); tests `test/ocean-fft-{spectrum,fourier,determinism}.test.js`. Band cut-offs and cascades are provisional until the I.0 report lands.

- Convention: `h(k,t) = h0(k)e^{-iωt} + conj(h0(-k))e^{+iωt}` with synthesis `Σ h e^{+ik·x}`, so modes travel toward +k (downwind); this is the opposite time sign to Ponlai [P1]. Wind direction is the heading the wind blows toward, radians from +X toward +Z.
- `h0 = (z0+iz1)·sqrt(PΔk²)/2`, not `/√2`: the conjugate partner contributes the other half, and the seed-averaged variance test confirms `E[H²] = ΣPΔk²`. DC and both Nyquist lines are zero. Each mode's Gaussian pair is hashed from (seed, cascade, signed index), so it is independent of scan order and N.
- Spreading is Donelan–Banner sech² (closed-form normalisation); TMA is Kitaigorodskii; fetch-limited α and ω_p follow Hasselmann.
- Candidate cascades: 48 m tile for λ 7.5→2 m and 12 m tile for λ 2→0.5 m, disjoint half-open bands. At fetch 50 km the residual RMS height / mean-square slope is 0.040 m / 0.0084 (U=3), 0.054 m / 0.0147 (U=10), 0.064 m / 0.0200 (U=20), each below the Cox–Munk whole-spectrum prior; the five carriers at amplitude 0.9 carry 0.39 m RMS / 0.0057 slope.
- Detail overlap: the whole medium detail group (index 0, ~2 m, and index 1, ~0.95 m ripples) lies inside the FFT band, so FFT **replaces** it in I.4; the fine group (~0.35 m) lies above the 0.5 m band top and stays. The test fails if either moves.
- Evolution runs at the carriers' 0.55× phase speed with ω quantised to a 512 s repeat period, so the GPU can take `τ = (t mod T)/T` from double precision (reconciled with the I.0 draft's Decisions A and E).

**Stop:** inconsistent Fourier sign, seed non-determinism, overlapping energy with five carrier modes, unbounded variance, invalid TMA small-depth behavior or CPU oracle disagreement.

### I.2 — Minimal native WebGPU FFT and output buffers

- [x] Create one isolated 64² FFT GPU proof fixture with a known synthetic mode and compare complete wave/slope output to tiny DFT oracle.
- [x] Build 2D Stockham row/column stages with stable ping-pong and explicit normal/derivative output; correctness before optimized shared-memory version.
- [x] Verify texture array layer semantics, storage buffer alignment, compute barriers, mip generation and colour space under installed Three.
- [x] Implement one renderer-owned runtime and feature states, resource accounting, device-lost fallback, safe shutdown and lazy warmup.
- [x] Benchmark 64²×1 and 128²×2, including compute, conversion and mip cost **outside** render pass timings.
- [x] Evaluate two-dispatch shared-memory optimization only after reference parity, if measured GPU benefit pays for complexity.
- [x] Do not allocate velocity/displacement/Jacobian output textures unless actually used and proved by a feature.

**I.2 result:** [Phase I.2 WebGPU FFT](ponlai-pr-i-phase-i2-webgpu-fft-2026-11-21.md). Isolated GPU runtime (`OceanFftRuntime` + layout/resources/kernels), verified on a native RTX 4080 against the I.1 oracle with a worst relative error of 8.0e-7 (f32). The output is an RG16F array; the hardware's f32→f16 conversion rounds toward zero, so the half tolerance is one ulp. At 128²×2, timestamped GPU time is 0.055 ms of compute plus 0.008 ms of output passes; mips are bounded only by throughput (0.23 ms for all work, CPU-bound). Memory is 1.29 MiB. Time is an exact u32 tick (τ = tick/2²²) in place of f32 `fract(cycles·τ)`. The shared-memory variant was evaluated and not built. Not wired into the scene.

**Stop:** any GPU validation error, unbounded 256² allocation, output NaNs, missing float filter support, render-target restore failure, poor hardware FFT runtime versus existing packed detail or missing compute time evidence.

### I.3 — Canonical world sampling and stable quality tiers

- [x] Implement CPU double precision positive modulo for each cascade and per-slot centre, GPU chunk-local UV; verify ±million metres and shared chunk edges.
- [x] Extend per-object water material options/shared bindings with **small stable** cascade UV origins; no per-slot FFT/CPU DFT.
- [x] Determine 128² candidate cascade tile sizes based on short-wave frequency limits, not blindly Ponlai's [733,157].
- [x] Generate derivative mips and footprint LOD, record expected unresolved slope variance and roughness correction.
- [x] Test texture repeat seam, nonintegral cascade period, camera movement, origin snap and high-altitude view. (Camera movement covered by the rebase and multi-view cases; no moving-camera sequence.)
- [x] Check sampler and varyings under portable limits; if failed, reduce/reuse bindings before changing tier. Plain high/ultra water: 15 textures, 12 samplers, 12 varyings; the FFT adds 1 + 1 and no varying. The app already requests 32 sampled textures because terrain needs 17, so the FFT does not raise the minimum.
- [x] Ensure quality change yields one clean target rebuild and no 49 material re-compiles or lost sea level.

**I.3 result:** [Phase I.3 world sampling](ponlai-pr-i-phase-i3-world-sampling-and-quality-2026-11-21.md). One FFT per surface view on high/ultra behind `?oceanFft=1`; per-chunk f64 cascade UV origins (42 chunks, max error 0); shared binding and `sampleOceanFftSlope` with footprint LOD and an unresolved-slope table. Tiles 57.3 / 15.45 m (band variance within 0.14 % of a 512² reference; no common 48 m period). GPU QA: seams at −4.2 Mm differ by 0, rebase and teleport pixel-identical, no v-flip, 15 scenario/debug captures. Water shaders byte-identical with the flag on and off on all four tiers; the material does not sample the FFT until I.4.

**Stop:** seam at −4.2 million-metre position, floating origin ripple swimming, physical waves moving upwind because inverse sign, thin glitter and repeating diagonals at distant horizon.

### I.4 — Offshore normal-only material integration

- [x] Add `offshoreFft` YAML/validator but default off, and one optional `OceanFftBlendNodes` call inside [D11]'s sea detail slope composition.
- [x] Use marine kind, depth and capped shore distance + exposure to create `B_fft` C1 fade; choose verified shore gate reachable with existing field.
- [x] Replace matching medium/fine [D23] donor detail slope contribution rather than stacking wave energy; keep rain, interactions and authored waves.
- [x] Preserve `sea.displacement` and all waterline/foam/crest geometric calculations, [D8–D10] nearshore CPU/shader waves.
- [x] Make a supported high/ultra shared water shader compile/compileAsync on real WebGPU with 16 sampler/varying profile, refractive and nonrefractive. Plain: 16 textures, 13 samplers, 12 varyings. Refraction: 21 textures, 14 samplers, 12 varyings, within the 32 the app already requests for its 17-texture terrain.
- [ ] Measure slope/roughness before and after; ensure true deep water samples the FFT, and no 7m or 17m shelf band. **Partly:** deep water samples it, and there is no shelf band (off/on/A-A captures, the weight's continuity); slope and roughness were not measured numerically in-app.
- [x] Verify existing reflection/glint/optics, underwater refraction, whitecap/rock impact and rain without a second sea shading model.
- [x] Feature off or unsupported uses exact old shader nodes and zero FFT work.

**I.4 result:** [Phase I.4 offshore normal integration](ponlai-pr-i-phase-i4-offshore-normal-integration-2026-11-21.md). FFT slopes replace ripple groups 0 and 1 (`mix(medium·g, fft, B)`); group 2, swell, surf, rain and wakes are kept. Unresolved FFT variance replaces the medium variance in `0.16·√var`. B = smoothstep(7,14,depth)·smoothstep(24,40,shore)·exposure·ocean·coverage·available. Off: water WGSL byte-identical on all tiers. On: +1 texture, +1 sampler, 0 varyings; about +0.1 ms GPU render p50. The GPU parity check of the ripple split is within 7.5e-9. Water acceptance passes all functional gates with the FFT on. Shipped off until I.5 drives the spectrum from the weather.

**Stop:** water height changes from FFT when geometry=false, new shoreline cutoff, water kind leak into lake/river, double rain/swell energy, memory/sampler overflow, old donor texture still actively sampled twice or foam appears offshore unrelated to waves.

### I.5 — Weather, visual stability and reflection integration

- [x] Read current resolved weather wind and storm, normalize heading signs, keep existing long-swell authoritative.
- [x] Rebuild h0 coefficients only on meaningful weather revisions; smooth gain/direction changes with deterministic seed and bounded transition.
- [x] Use absolute water time for deterministic pause, rewind, time seek and replay. Never advance FFT once per reflection capture.
- [x] Compare calm/windy/storm across dawn/day/evening/night; no permanently bright offshore sparkle or upwind windrows.
- [ ] Preserve existing `WaterReflectionController` captures/skyLightTint; test underwater camera and post/cinematic render routing. **Partly:** reflections reuse the frame's single FFT output (no change to the controller), and underwater was covered by I.4's water acceptance; post/cinematic routing was not exercised.
- [x] Check short-wave spectral content is actually visible and valuable at 1600×900 after appropriate mip filtering.
- [x] If ROI poor, stop here and keep existing simpler approach. ROI passes (I.5 §9).

**I.5 result:** [Phase I.5 weather and stability](ponlai-pr-i-phase-i5-weather-and-stability-2026-11-21.md). The spectrum follows `WorldWindPass`'s resolved wind: speed = 10 m/s × intensity (0.45 calm … 2.4 storm), heading normalized; weather off is the I.4 reference. Rebuilds happen past a 0.5 m/s / 3° deadband, one cascade per frame (~1.2 ms). Transitions interpolate per-mode power over 2 s with phases fixed, so there is no flash, reset or mid-turn calm; the GPU spectrum and roughness table move together. Spectra are deterministic and bit-equal to `buildCascadeSpectra` at fixed wind. No shader changed. The calm/moderate/reference/wind/storm × dawn/day/evening/night captures show no excess sparkle or streaking from the FFT. Afterwards enabled by default (`offshoreFft.enabled: true`; high and ultra WebGPU only).

**Stop:** 1s spectrum rebuild hitch, flash when wind changes, double compute on reflection, reflection sky disconnected from waves, FPS drop without corresponding quality improvement.

### I.6 — Optional geometric FFT *only after CPU parity* (independently approved)

- [x] Produce a formal design for authoritative CPU-evaluable low-frequency wave source available at **arbitrary canonical ocean positions**.
- [x] Prefer a sparse deterministic Fourier mode field for geometry with O(K) synchronous CPU queries; keep dense FFT for fragment normals.
- [x] Compute precise `height(x,z,t)` and `slope(x,z,t)` from identical modes/clock and ensure nearshore/surf blend in both CPU and shader.
- [x] Add conservative bounds (waterSlot culling, shadows, collisions, reflection) accounting for max displacement at sea state.
- [x] Establish source-frequency energy split with the five existing analytic carriers: either retain them and add disjoint nonoverlapping long modes with CPU twin, or migrate them to a new authoritative set atomically. Retained; long modes 48–160 m.
- [ ] Test swimmers, wading, camera crossing waterline, dynamic boats/AI future arbitrary queries and 100km player travel. **Partly:** water acceptance (enter, swim, dive, surface, exit) passes with the swell on, but its route is coastal, where the swell weight is 0. Arbitrary queries and ±4.2 Mm are covered by exact CPU/GPU parity. No boats exist yet, and no recorded 100 km walk was made.
- [x] Do **not** activate geometry until the full water-domain contract [D17] passes without runtime GPU readbacks, height lag or network-affecting nondeterminism. No readback, same-frame arrays; network replication of eased amplitudes noted (I.6 §5).

**I.6 result:** [Phase I.6 long swell geometry](ponlai-pr-i-phase-i6-long-swell-geometry-2026-11-21.md). User-approved. 16 seeded Fourier modes at 48–160 m (disjoint from the carriers and the FFT normals); only the amplitudes follow the I.5 wind (JONSWAP band energy, 0.2 %). The CPU `seaSurfaceOffset` and the vertex shader read the same per-frame amplitudes and absolute-clock time phases, with per-chunk f64 origins. GPU vs CPU: 5.8e-7 m. Offshore only (the I.4 blend), never gated on GPU availability. Bounds +3.34 m; 0 new varyings; ≈ +0.05–0.1 ms GPU. Enabled.

**Stop:** any GPU-only geometric FFT with unchanged CPU source. This whole phase may remain unimplemented while first PR I release is valid.

### I.7 — Optional high-end spectral optics after measured benefit

- [x] Consider [P5] unresolved slope variance table or simplified single-parameter roughness model; inspect current donor packed detail variance first.
- [x] Consider [P6] physical glint lobes only when current water reflection specular physically/visually needs them; no second sun.
- [x] Consider offshore foam from Jacobian threshold **only if** separate, measured and distinct from existing whitecap, swash and impact foam.
- [x] Consider [P7] cat's paws and windrows only if they can reuse current WorldWind and detail noise without extra world-wide noise pass.
- [x] Consider [P9] FFT-derived underwater caustics in a **separate follow-on PR**, due current water acceptance/caustics timing sensitivity.
- [x] No mandatory 256²×4 FFT, 12 render-quads, motion velocity array or extra SSR pipeline just because Ponlai includes them.

**I.7 result:** [Phase I.7 optics evaluation](ponlai-pr-i-phase-i7-optics-evaluation-2026-11-21.md).
- **Decisions:** P5 was already delivered (I.3/I.4). P6, Jacobian foam and windrows were declined with reasons, and P9 is deferred to its own PR. P7 cat's paws was prototyped and measured: no patchiness gain at 0.35 or 0.7, so it was removed under the stop rule.
- **Fixed during review:**
  - **Contour bands:** the planar reflection was gated on the displaced surface, drawing the swell's height contours as ribbons, and it was captured at the instantaneous swell height. Both now use the still water level.
  - **Whitecaps:** they reshape about 3× faster.

**Stop:** no demonstrated improvement, cost > quality ROI, duplicated foam or second water refraction copy.

### I.8 — Full QA, performance, visual review and rollout

- [x] Run `13.1` math and `13.2` real shader build tests, plus water-on/off equivalence.
- [x] Run package `npm test`, `npm run lint`, `npm run build`, existing water acceptance and world visual QA.
- [x] Capture at least ten `13.4` real scenes with matched seed/clock/pose, plus synthetic/negative positions and island/cove control.
- [x] Run native hardware A/A/FFT-off/FFT-on timing in water/beach/cove/headland/open sea, across four quality tiers; publish actual compute cost.
- [x] Measure full GPU buffer/resource residency and dispatch counts. Confirm no extra per-slot work at 1 vs 49 resident water chunks.
- [x] Validate runtime first load, water time freeze, speedup, downgrade, camera rebase and renderer/device recovery.
- [x] Perform two code-review rounds for numerical correctness, shader sampler complexity, resource lifecycle and performance. Fix issues then rerun authoritative benchmarks.
- [x] Retain rejected measurements and screenshots in report, including focus failures or software/WebGL adapter.
- [x] Record source/FFT assets and downstream derivative licensing in THIRD_PARTY_NOTICES only if code is actually adapted.
- [x] Keep opt-in default if any functional gate fails or quality delta insufficient.

**I.8 result:** [Phase I.8 QA and rollout](ponlai-pr-i-phase-i8-qa-and-rollout-2026-11-21.md). Frozen snapshot of `8bb0106b`.
- **Scenes:** 19 captures per side across 8 places, FFT on vs off, with 0 failures; nearshore is unchanged.
- **Shaders:** on uses 16/13/12 (plain) and 21/14/12 (refraction) textures, samplers and varyings; off is back to the pre-PR I 15/12/12 and 20/13/12.
- **GPU timing:** A/A′ agree within 0.07 ms; the cost is 0.07–0.19 ms at offshore and open-coast poses, 0.33–0.35 ms in the cove, and 0 on medium and low. FFT compute is 0.055 + 0.010 ms, with one transform per frame.
- **Fixture:** all cases pass, including device-loss recovery and the zero-work disabled path.
- **Water acceptance:** an authoritative 13/13 pass.
- **Licensing:** the Ponlai MIT notice is recorded.
- **Decision:** keep enabled.

**Stop:** hardware compute unmeasured, CPU water-height mismatch, invisible quality improvement, scene sampler overflow, nearshore look regression, missing water acceptance route or broken device recovery.

### I.9 — Acceptance decision, direct-main commits and handoff

- [ ] Commit small changes directly to current `main`, without overwriting unrelated concurrent commits, force pushing or GitHub Actions.
- [ ] Publish final README-style `docs/rendering/offshore-fft-ocean.md` with exact implementation status, pinned source and licenses, measured performance, supported tiers/backend, fallback and optional future geometry.
- [ ] Confirm `water.sea.offshoreFft.enabled:false` returns exact original five-wave/surf/rock/foam/reflection behavior.
- [ ] State **precisely** that first release is normal/roughness-only FFT unless the optional full CPU-parity geometry phase was separately implemented.
- [ ] Provide integration contract to next PR without imposing new global ocean, weather, atmosphere or simulation data models.

Suggested **future code commit** (not this document):

```text
feat(ocean): add optional band-limited offshore FFT wave detail
```

---

## 15. Definition of done, stop/go decisions and unacceptable results

### 15.1 Required source/physics correctness

- [ ] Verified spectral Gaussian seed, conjugate symmetry, complex normalisation, energy budget and travel sign.
- [ ] Normal/roughness FFT band **does not overlap** the five 42–7.5m authoritative height carriers or duplicate existing short-wave slope energy.
- [ ] FFT spectrum evolves at absolute `WaterVisualClock` time and reproduces frozen/replayed frames exactly.
- [ ] No vertex FFT height in MVP; water canonical CPU height and player/boat/swim physical contract unchanged.
- [ ] No water-kind/sea-level/biome data modifications; only actual ocean fragments receive the feature.
- [ ] Stable double-precision origin/UV across chunk edges, negative planet positions and floating-origin snaps.
- [ ] Surf, refraction, diffraction, swash and rock impacts remain on original timing and physical height.
- [ ] No broken coastline contour, foam or roughness bands at old 7m/10–17m depth transitions.

### 15.2 Required renderer and performance

- [ ] Exactly one renderer-level FFT source and bounded buffers; no per-slot FFT, no extra full scene render.
- [ ] FFT off compiles and behaves exactly as before, without allocations/dispatches/texture binding changes.
- [ ] Current water shared material/near refraction remain performant and compile under portable 16 sampled texture/interstage varying profile.
- [ ] Runtime wind/reseed/quality transitions have correct generation management, no shader rebuild storm, no NaN/black/uninitialized wave.
- [ ] GPU compute and mip/render conversion cost measured **separately** from render-pass GPU time, or honestly reported unavailable.
- [ ] Native headed RTX/WebGPU A/A/FFT A/B report full CPU/GPU frame p50/p95/p99 and perf/quality ROI.
- [ ] Water acceptance enter/swim/dive/surface/dry passes, plus all existing unit/regression tests.
- [ ] No GPU readbacks or expensive CPU full FFT in ordinary water sampling.
- [ ] Startup/teardown/device loss cleanup and unsupported backend safely recover original sea.

### 15.3 Quality and documentation

- [ ] Clear visual improvement offshore, statistically less repetitive detail, stable reflection/glint in sun and storm with no excessive distant sparkle.
- [ ] At sea, the short-wave spectrum smoothly fades in and away from authored surf; sheltered cove retains physically calmer detail.
- [ ] All current water optical colour/refraction/foam and snow/lake/river surfaces unchanged at fixed source/clock.
- [ ] Exact source SHA/code and third-party MIT notices retained if code/asset adapted, with no made-up license claims.
- [ ] Optional FFT geometry, velocity and unresolved-slope advanced pipeline clearly marked **not implemented** if not delivered.
- [ ] User-visible flag off provides immediate rollback and correct water query/scene.

### 15.4 Reject despite attractive screenshots if any of these occur

- Only 2D FBM noise called “FFT” with no actual Fourier spectrum/transform.
- Four full 256² cascades added without proving workload and shader budget.
- FFT wave **height** added GPU-only while CPU swimming query still follows five waves.
- New surf frequency/phase unrelated to shore waves makes front leave foam/rock impact behind.
- A permanent bright/dark ring between surf and offshore from depth or capped distance thresholds.
- Additive duplicated wave energy makes storm sea twice as tall/rough or near water glitter aliased.
- Copying Ponlai water shader disables current real refraction, spectral absorption, swamp/lake rules, or persistent sand swash.
- Frame time increase explained away because render pass GPU time does not include FFT compute.
- Per-chunk FFT buffer creation, GPU readbacks in water queries, invalid texture sampled after device loss, or a second scene render per water reflection.
- Declaring FFT geometry/swimmer parity implemented merely because the plan contains a speculative future phase.

**PR I document completion is not renderer implementation.** Do not merge claims of code passing until the actual source work, named native QA evidence and all required gates are delivered.

---

## 16. Immutable source appendix — Drusniel D1–D50

Code pointers here are from exact inspected revision [`1ad7a8902517a6926ee79edf9e98bc62d2f404cd`](https://github.com/danielsobrado/drusniel-world-builder/tree/1ad7a8902517a6926ee79edf9e98bc62d2f404cd). Line ranges refer to that pinned commit; before implementation inspect newest `main` and record any moved ownership. D# labels match the table in `2`.

- **[D1]** [`AGENTS.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/AGENTS.md) — project main-only, QA and Azgaar map constraints.
- **[D2]** [`config/water-visual.yaml`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/config/water-visual.yaml#L83-L209) — real water.sea/optics/surf YAML, offshore FFT feature owner.
- **[D3]** [`src/editor/water/WaterVisualConfig.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterVisualConfig.js#L1-L49) — current compiled YAML application and validation.
- **[D4]** [`src/editor/water/WaterQuality.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterQuality.js#L1-L136) — low/medium/high/ultra features and water config validators.
- **[D5]** [`src/editor/water/SeaConfig.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/SeaConfig.js#L1-L50) — sea/surf/detail/optics configuration limits.
- **[D6]** [`src/editor/water/SeaSwell.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/SeaSwell.js#L1-L108) — five 42–7.5m analytic carrier waves, CPU/TSL twins and double-precision chunk phase origins.
- **[D7]** [`src/editor/water/seaState.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/seaState.js) — shared sea storm/time/sea level and CPU seaSurfaceOffset.
- **[D8]** [`src/editor/water/SeaSurf.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/SeaSurf.js#L1-L154) — nearshore surf model and CPU swell/surf blend.
- **[D9]** [`src/editor/water/SeaSurfMath.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/SeaSurfMath.js) — CPU carrier/refraction/diffraction/breaking math.
- **[D10]** [`src/editor/stylized/SeaSurfNodes.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SeaSurfNodes.js#L65-L158) — current directional surf/FFT boundary blend and foam source.
- **[D11]** [`src/editor/stylized/SeaSurfaceShading.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SeaSurfaceShading.js#L62-L160) — five-wave height/slope, sea normal, glint, offshore shading and whitecap.
- **[D12]** [`src/editor/stylized/StylizedWaterMaterial.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/StylizedWaterMaterial.js#L200-L747) — actual sea/rivers/lakes, optics/refraction/foam/swash, positionNode and glints.
- **[D13]** [`src/editor/stylized/StylizedWaterSlot.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/StylizedWaterSlot.js#L25-L269) — 65² water pages, per-slot double-precision phase, refraction range, bounds and dry skip.
- **[D14]** [`src/editor/stylized/SharedWaterMaterials.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SharedWaterMaterials.js) — one shared water material per refractive/nonrefractive variant.
- **[D15]** [`src/editor/stylized/StylizedSurfaceViewBase.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/StylizedSurfaceViewBase.js#L375-L435) — beforeMainRender and afterMainRender reflection hooks, owned water slots, lifecycle.
- **[D16]** [`src/editor/water/TerrainWaterQueries.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/TerrainWaterQueries.js#L92-L205) — canonical CPU water heights and water navigation, no GPU readbacks.
- **[D17]** [`docs/architecture/water-domain-contract.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/docs/architecture/water-domain-contract.md#L1-L40) — authoritative CPU water domain and hard no-runtime-GPU-readback requirement.
- **[D18]** [`src/editor/water/WaterVisualClock.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterVisualClock.js) — one synchronized water/swash and QA freeze clock.
- **[D19]** [`src/editor/water/WaterField.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterField.js#L180-L329) — page coverage/surface/depth/shore distance, half float origin encoding.
- **[D20]** [`src/editor/water/WaterTerrainModel.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterTerrainModel.js#L130-L172) — ocean seabed, still sea level, deterministic beach terrain.
- **[D21]** [`src/editor/water/OceanBathymetry.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/OceanBathymetry.js) — shore shelf and deep ocean bathymetry profile.
- **[D22]** [`src/editor/water/OceanDistanceField.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/OceanDistanceField.js) — bounded-distance ocean shore field, not kilometre geodesic.
- **[D23]** [`src/editor/stylized/SeaDetailShading.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SeaDetailShading.js) — existing packed detail ripples and wave slope/variance owner.
- **[D24]** [`src/editor/water/SeaDetailPolicy.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/SeaDetailPolicy.js) — medium/fine sea detail settings and LOD.
- **[D25]** [`src/editor/stylized/CoastSwashShading.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/CoastSwashShading.js) — existing shoreline wetness and foam.
- **[D26]** [`src/editor/stylized/CoastSwashForcingNodes.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/CoastSwashForcingNodes.js) — coastal swash time/directional carrier forcing.
- **[D27]** [`src/editor/stylized/CoastalRockImpact.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/CoastalRockImpact.js) — rock impact foam/spray timing from current surf.
- **[D28]** [`src/editor/water/SeaDiffraction.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/SeaDiffraction.js) — existing CPU diffraction and marine shelter ray sampler, matching the [D47] shader's shelter contract.
- **[D29]** [`src/editor/water/WaterAppearance.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterAppearance.js) — marine identity, sea exposure, region tint and existing shelter mask.
- **[D30]** [`src/editor/weather/wind/WorldWindPass.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/weather/wind/WorldWindPass.js#L1-L105) — weather prevailing wind and 128² near-ground gust field.
- **[D31]** [`src/editor/performance/qa/SeaSurfFixture.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/performance/qa/SeaSurfFixture.js#L1-L64) — actual 65² GPU sea fixture at canonical [-4226432,278528], time 127.3.
- **[D32]** [`test/sea-swell.test.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/test/sea-swell.test.js#L1-L143) — analytic waves/CPU–shader parity/border/negative world regression.
- **[D33]** [`docs/qa/coastal-review-2026-11-20/findings.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/docs/qa/coastal-review-2026-11-20/findings.md) — latest diffraction/CPU/worker coastal coherence controls.
- **[D34]** [`docs/qa/coastal-fix-review-2026-11-21/findings.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/docs/qa/coastal-fix-review-2026-11-21/findings.md) — 17m seabed angular-band fix and hardware water acceptance.
- **[D35]** [`docs/qa/coastal-fix-review-2026-11-21/performance.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/docs/qa/coastal-fix-review-2026-11-21/performance.md) — RTX 4080 native frame/render timing, GPU compute explicitly excluded.
- **[D36]** [`docs/perf-qa.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/docs/perf-qa.md) — native GPU movement/streaming/regression QA and viewport-copy traps.
- **[D37]** [`src/render/reflections/WaterReflectionController.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/render/reflections/WaterReflectionController.js) — reflection capture runtime and deferred work scheduling.
- **[D38]** [`src/editor/water/WaterQuality.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterQuality.js#L1-L136) — existing water tier policy, repeated deliberately for renderer constraints.
- **[D39]** [`src/editor/water/UnderwaterViewController.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/UnderwaterViewController.js) — underwater camera and render ownership.
- **[D40]** [`src/editor/stylized/sky/skyLight.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/sky/skyLight.js) — current authored sun/fill/reflection tint authority.
- **[D41]** [`package.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/package.json) — verified npm scripts and declared Three release.
- **[D42]** [`scripts/run-water-acceptance-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/scripts/run-water-acceptance-qa.mjs) — native water entry/swim/dive/surface/dry browser QA runner.
- **[D43]** [`src/editor/performance/qa/GpuPassProfiler.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/performance/qa/GpuPassProfiler.js) — GPU sampled render-pass profiler; compute visibility must be checked.
- **[D44]** [`src/editor/InfiniteTerrainView.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/InfiniteTerrainView.js#L478-L575) — active render routes and shared hooks.
- **[D45]** [`src/editor/stylized/SeaOpticsShading.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SeaOpticsShading.js) — spectral RGB water depth transport and Fresnel response.
- **[D46]** [`src/editor/stylized/SeaRefractionNodes.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SeaRefractionNodes.js) — nearshore finite-depth phase correction.
- **[D47]** [`src/editor/stylized/SeaDiffractionNodes.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SeaDiffractionNodes.js) — headland sheltered refracted/diffracted shore wave field.
- **[D48]** [`src/editor/water/WaterNavigation.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterNavigation.js) — player navigation water surface and immersion consumers.
- **[D49]** [`src/editor/water/WaterSample.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/WaterSample.js) — semantic water kind/body/depth sampling contract.
- **[D50]** [`src/editor/stylized/WaterPatternOrigins.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/WaterPatternOrigins.js) — canonical wave/pattern origin code and hashed repeat domains.

## 17. Immutable Ponlai source appendix — P1–P17

Each Ponlai link points to [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e) so the implementation AI can inspect a stable source; do not translate names as if the code lived in Drusniel already.

- **[P1]** [`packages/render/ocean/OceanFFT.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L1-L659) — mode/source generation, 256²/4 cascades, Stockham compute, packed texture arrays, workgroup optimization and lifecycle.
- **[P2]** [`packages/render/ocean/OceanSpectrum.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanSpectrum.ts#L1-L204) — wave spectrum CPU JONSWAP/TMA, seaState, finite-depth dispersion and variance integration.
- **[P3]** [`packages/render/ocean/WaveDamping.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/WaveDamping.ts#L1-L65) — per-cascade attenuation and lee/shelter/depth by shoreline.
- **[P4]** [`packages/render/ocean/Water.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/Water.ts#L1-L1492) — whole displaced sea shading, reflection/foam/velocity; *not* a drop-in replacement.
- **[P5]** [`packages/render/ocean/UnresolvedSlopes.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/UnresolvedSlopes.ts#L1-L378) — filtered spectral slope variance and LEAN inspired lobe.
- **[P6]** [`packages/render/ocean/SlopeLobe.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/SlopeLobe.ts) — Beckmann/Smith reflection and sun-glint statistics.
- **[P7]** [`packages/render/ocean/SeaDetail.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/SeaDetail.ts#L1-L245) — cat’s paws/slicks/windrows and weather wind coherence.
- **[P8]** [`packages/render/ocean/StormSea.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/StormSea.ts) — optional persistent storm foam.
- **[P9]** [`packages/render/ocean/WaveMaps.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/WaveMaps.ts) — optional underwater wave-derived caustics.
- **[P10]** [`packages/render/ocean/ShoreWaveField.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/ShoreWaveField.ts#L1-L302) — shore distance and shelter field computation.
- **[P11]** [`packages/render/ocean/ShoreWaves.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/ShoreWaves.ts) — near-rock wave and foam behavior.
- **[P12]** [`packages/render/ocean/SeaReflection.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/SeaReflection.ts) — sea reflection traced against bounded scene geometry.
- **[P13]** [`packages/render/ocean/SeaOptics.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/SeaOptics.ts) — seawater attenuation/scattering physics.
- **[P14]** [`packages/render/ocean/FoamPattern.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/FoamPattern.ts) — periodic foam shape generation.
- **[P15]** [`packages/render/ocean/ScreenReflection.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/ScreenReflection.ts) — alternative view-space sea reflection.
- **[P16]** [`packages/render/ocean/Refraction.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/Refraction.ts) — alternative sea refraction.
- **[P17]** [`packages/render/Quality.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/Quality.ts) — Ponlai tier/feature policy.

### 17.1 Essential pinpoint algorithm references

- [Ponlai FFT design and default cascade sizes, OceanFFT lines 19–130](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L19-L130).
- [Ponlai GPU JONSWAP/TMA directional wave energy and normalized Gaussian mode pairs, OceanFFT lines 150–204](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L150-L204).
- [Ponlai FFT setup, Hermitian mirror pair and wavenumber bands, OceanFFT lines 271–355](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L271-L355).
- [Ponlai Fourier time evolution and displacement/derivative/velocity complex packing, OceanFFT lines 346–390](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L346-L390).
- [Ponlai Stockham radix-2 and 2-pass shared-memory IFFT/barrier dispatch, OceanFFT lines 395–485](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L395-L485).
- [Ponlai 3 texture-array output channels, mips and waterfall of render layers, OceanFFT lines 486–535](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L486-L535).
- [Ponlai wind and sea state update, spectra rebuild, update/disposal, OceanFFT lines 536–659](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L536-L659).
- [Ponlai CPU JONSWAP/TMA spectrum, energy and variance source, OceanSpectrum lines 52–204](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanSpectrum.ts#L52-L204).
- [Ponlai shadow/coastal depth/cove wave attenuation, WaveDamping lines 7–65](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/WaveDamping.ts#L7-L65).
- [Ponlai unresolved slopes and LEAN variance filtering theory, UnresolvedSlopes lines 1–84](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/UnresolvedSlopes.ts#L1-L84).
- [Drusniel five canonical analytical waves, SeaSwell lines 1–108](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/SeaSwell.js#L1-L108).
- [Drusniel directional breakers and blend to offshore swell, SeaSurfNodes lines 65–158](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SeaSurfNodes.js#L65-L158).
- [Drusniel actual sea height, normal, whitecap and glint, SeaSurfaceShading lines 62–160](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/SeaSurfaceShading.js#L62-L160).
- [Drusniel actual sea fragment and vertex position stage, StylizedWaterMaterial lines 630–747](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/StylizedWaterMaterial.js#L630-L747).
- [Drusniel current material slots/64-vertex spacing and phase origin, StylizedWaterSlot lines 25–140](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/StylizedWaterSlot.js#L25-L140).
- [Drusniel CPU gameplay wave query and source kind, TerrainWaterQueries lines 92–130](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/water/TerrainWaterQueries.js#L92-L130).
- [Drusniel water-domain mandatory no-readback/CPU-height contract, lines 1–31](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/docs/architecture/water-domain-contract.md#L1-L31).
- [Drusniel actual sea configuration source, config/water-visual.yaml lines 83–209](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/config/water-visual.yaml#L83-L209).
- [Drusniel shared water phases/bounds/refraction setup, StylizedWaterSlot lines 203–269](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/StylizedWaterSlot.js#L203-L269).
- [Drusniel single shared before/after render hook and reflections, StylizedSurfaceViewBase lines 375–435](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/stylized/StylizedSurfaceViewBase.js#L375-L435).
- [Drusniel native coastal source diagnostics and 17m seabed-band fix](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/docs/qa/coastal-fix-review-2026-11-21/findings.md).
- [Drusniel native coastal GPU render-pass timings excluding GPU compute](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/docs/qa/coastal-fix-review-2026-11-21/performance.md).
- [Drusniel legacy CPU vs shader wave and planet-scale border regression tests](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/test/sea-swell.test.js).
- [Drusniel existing 65² actual GPU surf fixture with frozen clock and rebase](https://github.com/danielsobrado/drusniel-world-builder/blob/1ad7a8902517a6926ee79edf9e98bc62d2f404cd/src/editor/performance/qa/SeaSurfFixture.js).

### 17.2 Research, physics and third-party provenance

- [Tessendorf-style spectral ocean as implemented in Ponlai](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts#L19-L100) — verified source reference for Fourier/phase equations; consult original scholarly publications independently as appropriate.
- [Daniel Greenheck, *tidewater*](https://github.com/dgreenheck/tidewater) — credited by [P1–P4/P7] under MIT for FFT and seawater effects; preserve exact copyright/SPDX notices on adapted code.
- [Ponlai source at pinned commit](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e) — reference for its own MIT and third-party notices; check actual file headers before transplant.
- [Cox and Munk slope distribution, cited by OceanSpectrum](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanSpectrum.ts#L140-L204) — empirical mean square slope used as an art/energy reference, not an unconditional scene-physic setting.
- [Olano and Baker, LEAN Mapping, described in Ponlai UnresolvedSlopes](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/UnresolvedSlopes.ts#L1-L60) — slope filtering concept for subpixel glint.

**Immutable source references reviewed in this spec:** D1–D50 and P1–P17. Source titles/line ranges are for those exact commits; do not copy code or assets without file-level license verification. **PR I is a plan only**, with the minimum deliverable explicitly normal/roughness FFT detail unless the separate mandatory GPU/CPU geometric-parity gate has passed.

---
