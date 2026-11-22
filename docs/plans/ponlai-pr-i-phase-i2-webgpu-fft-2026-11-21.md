# PR I phase I.2 — Native WebGPU FFT and output buffers

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-22.md). It follows [I.0 audit](ponlai-pr-i-phase-i0-audit-and-baseline-2026-11-21.md) and [I.1 spectrum](ponlai-pr-i-phase-i1-spectrum-and-reference-2026-11-21.md). Evidence: [`docs/qa/ponlai-pr-i-phase-i2-2026-11-21/`](../qa/ponlai-pr-i-phase-i2-2026-11-21/README.md).

**Status:** done.

- A deterministic GPU FFT reproduces Phase I.1's CPU reference on native hardware WebGPU: the worst relative error is 8.0e-7, against a 1e-5 tolerance.
- Its output is one RG16F slope texture array.
- The runtime is renderer-owned and fully isolated. Nothing in the scene, the water materials or the CPU water queries changed.

## 1. Source

Built on `main` at `f35b3507` (I.0 report), which includes I.1 (`d304aa53`, `c2360125`). The Ponlai reference is the pinned [`cca90564`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts). Three.js r187 (`three@0.187.0`, from the lockfile and `THREE.REVISION` at runtime).

## 2. Architecture

```text
CPU, on wind/seed change     OceanFftGpuLayout.buildCascadeSpectra → packCascadeSpectra → resources.upload
CPU, per prepare(t)          tick = waterTimeTick(t)   (double precision)   — skipped if tick/spectrum/field unchanged
GPU, one renderer.compute    evolve → 7 row stages → 7 column stages        (128²: 15 dispatches, one compute pass)
GPU, one render per cascade  output quad: f32 result → RG16F layer c; mip chain after the last layer
publish                      runtime.output = { texture, tick, spectrumRevision, configGeneration, … }
```

One runtime per renderer. It is not connected to `StylizedSurfaceViewBase` yet. I.0 Decision C places it there in I.3/I.4, and today only the QA fixture drives it.

## 3. Files

| File | Role |
| --- | --- |
| `src/editor/water/fft/OceanFftGpuLayout.js` | Topology validation, Float32 upload layout and validation, exact byte budget, time tick, cascade spectrum builder (CPU only) |
| `src/editor/water/fft/OceanFftGpuResources.js` | The four storage buffers and the RG16F output target; disposal |
| `src/editor/water/fft/OceanFftGpuKernels.js` | TSL evolution, Stockham row/column stages, output quads |
| `src/editor/water/fft/OceanFftRuntime.js` | Lifecycle, skip logic, publish-only-complete, failure, device loss, diagnostics |
| `ocean-fft-qa.html`, `scripts/ocean-fft-qa/{main,cases,bench,instrument,oracle}.js` | Isolated browser fixture: oracle comparisons, timings, instrumentation |
| `scripts/run-ocean-fft-qa.mjs` (`npm run qa:ocean-fft`) | Headed Playwright runner |
| `test/ocean-fft-gpu-contract.test.js`, `test/ocean-fft-resource-lifecycle.test.js` | Node tests: layout, tick exactness, oracle, kernel topology; lifecycle with a fake renderer |

No existing file was modified apart from `package.json` (one QA script line) and the PR I plan checklist. In particular, none of the protected water files (`SeaSwell`, `SeaSurf*`, `SeaSurfaceShading`, `StylizedWater*`, `TerrainWaterQueries`, `WaterVisualClock`, `WaterField`, `CoastSwashShading`, `CoastalRockImpact`) changed.

## 4. Reused I.1 functions

The task named `createModeTable`/`evolveModes`; those names do not exist on `main`. The actual exports are reused:

- **Runtime:**
  - `createModePowerTable`, `createGaussianModes`, `createInitialSpectrum`, `createWaveFrequencies` (in `buildCascadeSpectra`)
  - `packInitialSpectrum` (upload)
  - `assertFftSize`, `assertInRange`, `repeatFraction`
- **Oracle:** `evolveSpectrum`, `packedSlopeSpectrum`, `synthesize2d`, `mirrorIndex`, `expectedVariance`.

The GPU never draws random numbers or evaluates the spectrum.

## 5. GPU buffer layout

Cascade `c` owns the contiguous block `[c·N², (c+1)·N²)`, and global index `g = c·N² + q·N + p`. Here `p` is the kx index and `q` the kz index, row-major as in I.1. One kernel set therefore serves every cascade.

| Buffer | WGSL type | Contents |
| --- | --- | --- |
| `h0` | `array<vec4<f32>>`, C·N² | `(h0(k).re, h0(k).im, conj h0(−k).re, conj h0(−k).im)` (I.1 `packInitialSpectrum`) |
| `cycles` | `array<f32>`, C·N² | integer cycles per 512 s; upload rejects non-integers and values outside [0, 2²⁴], so `u32()` is exact |
| `ping` | `array<vec2<f32>>`, C·N² | evolved spectrum; after the even number of stages, the final f32 result |
| `pong` | `array<vec2<f32>>`, C·N² | IFFT scratch |
| uniforms | `u32` tick, `f32` field mode, `f32[C]` Δk | Δk in a uniform array, so cascades never need different shaders |

**Float64 → Float32 contract:**
- h0 is rounded once on upload, with relative error 6e-8.
- Cycles convert exactly.
- Upload validates every cascade before writing any of them, so a rejected spectrum leaves the live one untouched.

## 6. Fourier conventions (I.1's, unchanged)

- **Evolution:** `h(k,t) = h0(k)·e^{−iφ} + conj(h0(−k))·e^{+iφ}`. Waves travel toward +k (downwind); this is the opposite time sign to Ponlai's `+iφ`.
- **Slope packing:** `C(k) = i·kx·h − kz·h`, whose synthesis is `∂H/∂x + i·∂H/∂z` in **world** X/Z.
- **Synthesis:** `Σ_k C(k)·e^{+ik·x}` with **no 1/N²**. The Stockham transform is unnormalised and nothing compensates, so the output is `synthesize2d` exactly. No gain is applied anywhere.

**Phase.** I.1 proposed `φ = 2π·fract(cycles·τ)` in f32. Measured against the oracle, that leaves up to about 3e-5 cycle (2e-4 rad) of phase error at 128², roughly 300× the FFT's own rounding. I.2 therefore sends time as an integer **tick**, `τ = tick/2²²` (122 µs of water time). The kernel computes `(cycles·tick) mod 2²²` with wrapping `u32` multiplication, which is exact because 2²² divides 2³². The phase is then exact at any time and any cycle count.

- `waterTimeTick(t)` is computed in double precision.
- The oracle is evaluated at `tickTimeSeconds(tick)`.
- The public interface still takes absolute seconds.

**Verified signs:**
- Crest direction: for single modes (1,0) and (0,1) with `cycles = 1`, the crest sits at texel 0 at t = 0 and at **+N/4** after a quarter period on both axes. It would be at 3N/4 if the waves ran upwind.
- Amplitude: I.1's tabulated values match to ≤ 1.3e-7 relative. At N = 8, `field[0,0]` = 0.1170354187 against I.1's 0.1170354174, and the RMS is 0.0607242109.

## 7. Stockham stages

This is the radix-2 Stockham autosort, decimation-in-time, with **one thread per output element** per stage. For line position `i` and `sub = 2^s`:

```text
even = (i / sub)·(sub/2) + i mod (sub/2);   odd = even + N/2 (rows) or N²/2 (columns, ×N stride)
out[i] = in[even] + in[odd]·e^{+i·2π·(i mod sub)/sub}
```

- **Scheme:** Ponlai's (MIT, `OceanFFT.ts:397-425`), with one change. The twiddle angle is reduced to `i mod sub`, which keeps f32 `sin`/`cos` arguments in [0, 2π) instead of up to π·(N−1).
- **Order:** rows (along x) run first, then columns (along z).
- **Ping-pong:** each stage reads one buffer and writes the other, alternating. 2·log₂N is even, so the result always ends in `ping`.
- **Correctness:** verified against the full DFT on 8² and 16², with seeded random h0 on **every** bin, DC and both Nyquist lines included. In slope mode the IFFT input `i·kx·h − kz·h` is a general, non-Hermitian complex spectrum with non-zero Nyquist bins, so the transform is checked on complex input, not only on real fields.

## 8. Workgroups and barriers

- **Dispatch shape:** workgroup size 64. The device allows 256 invocations and 16 KiB of workgroup storage, and none of that storage is used.
- **Synchronisation:** every stage is its own dispatch, with no workgroup memory and no barriers. WebGPU makes one dispatch's storage writes visible to the next, so there is no read/write hazard between stages. No validation error was raised in any run.
- **Shared-memory variant (Ponlai's 2-dispatch line pass) not built.** At 128²×2, rows + columns take **0.054 ms** in total, so the most it could save is a few hundredths of a millisecond. The task allows it only when measurements justify the complexity, and they don't.

## 9. Output texture

| Property | Value |
| --- | --- |
| Object | `RenderTarget(N, N, { depth: C })`, `texture.name = 'ocean-fft-slope'` |
| Format | `RGFormat` + `HalfFloatType` (`rg16float`, core-renderable and filterable; no `texture-formats-tier1` needed) |
| Channels | R = ∂H/∂x, G = ∂H/∂z (world axes, dimensionless slope) |
| Texel | layer c, row z, column x ↔ world `(x·L_c/N, z·L_c/N)` within the tile; written from `screenCoordinate` |
| Sampling | `NoColorSpace`, repeat-wrapped S/T, `LinearMipmapLinearFilter`, full mip chain regenerated after the last layer |

The QA reads every layer back, and its dimensions, layer count and channel order match the f32 result. A QA-only height mode transforms `h` instead of `C` through the same kernels and buffers, with no extra allocation. It exists to check amplitude and the imaginary residual.

## 10. 64² proof

All 24 64² comparisons pass, each against the **full** 64² DFT:
- 2 fields × 9 times for cascade 0 (48 m, 7.5→2 m band)
- 2 fields × 3 times for I.1's 6 m full-band fixture

Times: 0, 1, 3.7, 11.2, 123.4, 126, 127.6, 31 536 000.25 and 999 999 999.5 s.

## 11. 128² × 2 results

- All 16 comparisons pass: 2 fields × 4 times × 2 cascades (48 m and 12 m), against direct summation at 256 deterministic texels per layer. The texels include corners, edges and diagonals.
- The f32 grid RMS matches Parseval's exact RMS to ≤ 3.9e-7 relative. All 2·128² texels are finite.
- **Spectral energy (slope RMS):**

  | Cascade | Observed, single realisation | Expected E[·] from `expectedVariance` |
  | --- | --- | --- |
  | 0 | 0.0817–0.0827 | 0.0815 |
  | 1 | 0.0864–0.0888 | 0.0895 |

- **Cascade isolation:** zeroing cascade 1's h0 leaves cascade 0 **bit-identical**, and layer 1 becomes exactly 0.
- **Spectrum rebuild** (U = 18, heading 1.1 rad, seed 777): 0 new compute or render pipelines, 0 shader modules, 0 buffers. CPU upload takes 1.2 ms, and the result matches the new oracle at ≤ 7.7e-7.

## 12. CPU vs GPU error

**f32 result.** Tolerance: `|gpu − cpu| ≤ 1e-5·max|cpu| + 1e-7` (I.1's proposal).

| Case (fields: height and slope) | Max abs error | RMS error | Max relative (to max\|cpu\|) |
| --- | --- | --- | --- |
| Zero mode (DC) 8², 16² | 0 | 0 | 0 |
| Single +x / +z 8², 16² | 2.7e-7 | 9.0e-8 | 3.0e-7 |
| Multi-mode 8², 16² | 7.2e-7 | 1.9e-7 | 4.6e-7 |
| Seeded I.1 fixture 8², 16² | 8.6e-8 | 3.0e-8 | 4.9e-7 |
| Random h0, every bin 8², 16² | 4.1e-6 (values to 11.8) | 1.2e-6 | 3.8e-7 |
| 64² cascade 0, 9 times | 1.4e-7 | 3.0e-8 | 6.3e-7 |
| 64² I.1 fixture, 3 times | 2.0e-7 | 4.8e-8 | 5.9e-7 |
| 128² × 2, 4 times | 1.6e-7 | 3.5e-8 | **8.0e-7** |

The imaginary residual of real (Hermitian) height fields is ≤ 1.7e-6 at amplitudes up to 5.6, and ≤ 1.1e-7 on the real spectra. It is FFT rounding only.

**RG16F texture.**
- Tolerance: `|half − f32| ≤ 2⁻¹⁰·|f32| + 2⁻²⁴`, which is one half-float ulp.
- The first run assumed round-to-nearest (half an ulp) and failed. On the RTX 4080, **100 % of inexact texels round toward zero**, so the error reaches exactly one ulp, and WebGPU permits that for attachment writes.
- The bound was corrected to what the hardware conversion allows. It was not tuned to pass: every texel of every case meets it.
- Against the oracle, the half output errs by at most 7.8e-4 relative to max|cpu|.

## 13. Hardware and backend

- **GPU and system:** NVIDIA GeForce RTX 4080 (adapter `nvidia` / `lovelace`, not a fallback adapter), Windows 11 Pro 26300, headed Chromium 151 (Playwright), backend `webgpu`.
- **Device features used:**
  - `timestamp-query` is present.
  - Limits: 8 storage buffers per stage (4 used), 128 MiB binding, `maxComputeWorkgroupStorageSize` 16,384 (unused).
- **Validation and fallback:** 0 uncaptured validation errors across the run. The WebGL fallback renderer (`forceWebGL`) gives state `unsupported` with reason "requires the WebGPU backend", and it never configures or dispatches.

## 14. Performance (RTX 4080, timestamp queries)

Times are medians of 120 frames, in milliseconds. Compute timings come from `resolveTimestampsAsync('compute')` and output timings from `resolveTimestampsAsync('render')` on the FFT's own passes. None of them is a scene render-pass time.

| Topology | Evolve | Rows | Columns | Compute total | Output passes | Throughput (all work incl. mips + CPU) | CPU `prepare` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 64² × 1 | 0.0041 | 0.0195 | 0.0195 | **0.039** | 0.005 | 0.19 | ~0.1 |
| **128² × 2** | 0.0051 | 0.0266 | 0.0276 | **0.055** | 0.008 | 0.23 | ~0.1 |
| 256² × 2 (research) | 0.0072 | 0.048 | 0.049 | 0.100 | 0.010 | 0.25 | ~0.1 |

- **Target met.** The candidate's timestamped GPU cost is **0.063 ms** (compute 0.055 + output 0.008), within the 0.5 ms target.
- **Mip generation** runs in Three's own passes, which carry no timestamp. Its cost lies inside the throughput figure: 300 back-to-back transforms, until `onSubmittedWorkDone`.
- **Throughput is an upper bound.** That figure includes CPU encode and submit, and it is CPU-bound at about 0.1 ms per `prepare` (the `performance.now()` resolution is 0.1 ms).
- **Paused clock:** 1,000 calls with the same time made 0 transforms, cost 0.3 µs of CPU each, and submitted nothing. The one submit in that window is the timestamp resolve itself.
- **Disabled runtime** (own instrumented renderer): 0 submits, 0 buffers, 0 pipelines and 0.1 µs per call.
- **Time jump** (+1000 s): one normal transform, 0.055 ms of compute. Cost does not depend on time.
- **Startup:**
  - Cold renderer restart: renderer init 28 ms, and first output after 59 ms including pipeline compilation.
  - Warm reconfigure on the same renderer: 12 ms.
  - First transform after configure: 6 ms at 64² and 128².
  - 256² is the exception: its first transform took 562 ms. It is a research tier only, and the cause was not investigated.
- **Spectrum rebuild:** CPU `buildCascadeSpectra` takes 1.66 ms for 128²×2 (I.0 measurement), plus 1.2 ms to pack and upload. The GPU needs no rebuild.

## 15. Memory and dispatches

| Topology | h0 | cycles | ping | pong | RG16F + mips | Total | Dispatches / transform | Render passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 64² × 1 | 64 KiB | 16 KiB | 32 KiB | 32 KiB | 21,844 B | 169,300 B | 13 | 1 + mips |
| **128² × 2** | 512 KiB | 128 KiB | 256 KiB | 256 KiB | 174,760 B | **1,354,408 B (1.29 MiB)** | 15 | 2 + mips |
| 256² × 2 | 2 MiB | 512 KiB | 1 MiB | 1 MiB | 699,048 B | 5,417,640 B | 17 | 2 + mips |

**Measured on the device** by instrumenting `createBuffer`/`createTexture`:
- 128²×2 storage is +1,179,920 B over the baseline: the budget's 1,179,648 B plus 272 B of FFT uniform buffers.
- The texture is exactly 174,760 B.
- This is close to I.0's estimate of about 1.2 MiB. The difference is the `cycles` buffer, which I.0 did not count.

## 16. Lifecycle and recovery

```text
disabled ─────────────────────────────────────────── (never does GPU work)
unsupported ──── (no WebGPU backend/device) ──────── configure() re-checks
initializing ─configure()─▶ ready ─first prepare + clean validation scope─▶ active
     any GPU error / device loss / renderer device changed ─▶ failed (GPU objects released, output null)
     failed ─configure()─▶ ready …        dispose() from any state ─▶ disposed
```

**What a consumer can see.** `runtime.output` is non-null only while `active`, and always describes a completed transform: `tick`, `timeSeconds`, `spectrumRevision`, `configGeneration` and `generation`.
- The first dispatch after any configure is validated asynchronously, and nothing is published until its error scope pops clean. A late warm-up from a replaced configuration is ignored.
- A changed `renderer.backend.device` fails the runtime instead of using stale objects.
- `device.lost` is observed directly, without overwriting the app's `renderer.onDeviceLost`.
- Resolution or cascade changes go through `configure`, which releases the old allocation first. A new spectrum goes through `setSpectrum`, with no recompilation.

**Verified on hardware:**
- A second runtime on the same renderer is rejected.
- Simulated device loss gives `failed` with no output; reconfiguring recovers to `active`.
- 12 runtimes × 2 configure cycles (64²×1, then 128²×2) and disposal return live buffers and textures **exactly** to baseline: 6 buffers, 65,544 B, 0 textures.
- **Known cost:** each configure builds new kernel nodes, so Three compiles their pipelines again (14 on average). Reconfiguration is a quality-tier change, not a per-frame event.

## 17. Licensing

- **Stockham scheme and output-pass pattern:** adapted from Ponlai `OceanFFT.ts` (MIT, © the Ponlai authors, after tidewater). The code was rewritten in this project's conventions, and the deviations are listed in §6–§8.
- **Spectrum mathematics:** I.1's, from the published literature. No Ponlai code is copied verbatim.
- **Dependencies:** none added.

## 18. Known limitations

- **No consumer yet.** I.3 adds canonical-world sampling and I.4 the material.
- **Texture contract not yet tested in a material.** The texel-to-world mapping (row z, column x) is set by the writer and verified by readback. I.3 must confirm the sampler's v orientation for render-target textures in a real material before relying on it.
- **Mip cost not separately timed** (no timestamp in r187's mip passes). The throughput figure bounds it from above.
- **Output precision.** Half-float output rounds toward zero on this GPU, about 1 ulp, roughly 1e-4 at the slopes observed. That is a slight bias toward smaller magnitude, invisible as a normal perturbation.
- **Time sampling.** Water time is shown at the nearest 122 µs tick.
- **Reconfigure recompiles** the topology's pipelines (§16).
- **Invalid time throws.** `prepare(t)` throws `RangeError` for non-finite or out-of-range time, the I.1 limit of ±1e9 s. This is deliberate validation at the input boundary.

## 19. Not verified

- **Other GPUs.** Only the RTX 4080 / Windows / Chromium was run. AMD, Intel, Apple and compatibility-mode devices are not measured.
- **Real device loss.** Device loss was simulated through `handleDeviceLost` and a swapped device object. A real `GPUDevice.destroy()` loss was not triggered.
- **Scene QA not run.** `qa:perf` and the coastal captures were not run, because nothing in the scene changed; the full `npm test` suite (5,030 tests) passes.

## 20. Phase I.3 handoff

- **Ownership:** construct `new OceanFftRuntime(renderer)` in `StylizedSurfaceViewBase` (I.0 Decision C), only on WebGPU and outside impostor bake mode.
- **Spectrum:**
  - Call `configure({ size: 128, tileSizes: [48, 12], spectra: buildCascadeSpectra({ size, seed, params }) })` once per quality change.
  - On a wind change (with a deadband), call `setSpectrum(...)`. The CPU build is about 1.7 ms, so do it inside the view's deferred-work budget.
- **Per frame:** call `prepare(waterVisualClock.value)` at the top of `beforeMainRender`. It is free when the clock is paused.
- **Sampling:**
  - Bind `runtime.output?.texture`. While it is null, keep the authored medium ripples.
  - Sample the layer for cascade `c` at `uv = fract(worldXZ / L_c)`, computed from a CPU double-precision positive modulo per chunk (I.3 checklist).
  - The channels are world-axis slopes; rotate nothing.
- **Do not:**
  - read the texture back on the CPU
  - stack it on the medium ripple group (I.0 Decision A: it replaces ripple indices 0 and 1)
  - apply the storm multiplier to it
- **Re-verify** after integration: `npm run qa:ocean-fft`, then the I.0 coastal poses A/B.
