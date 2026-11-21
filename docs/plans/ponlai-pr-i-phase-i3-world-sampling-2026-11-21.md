# PR I phase I.3 — Canonical world sampling and stable quality tiers

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-21.md). It follows [I.2 WebGPU FFT](ponlai-pr-i-phase-i2-webgpu-fft-2026-11-21.md). Evidence: [`docs/qa/ponlai-pr-i-phase-i3-2026-11-21/`](../qa/ponlai-pr-i-phase-i3-2026-11-21/README.md).

**Status:** done.

- The FFT now runs inside the scene, one per surface view, on the high and ultra water tiers, behind `?oceanFft=1` (default off).
- Every water chunk carries its cascade UV origins, computed on the CPU in double precision. A shared binding and a TSL sampling helper are ready for I.4.
- **The water material does not sample the FFT yet.** Its shaders are byte-identical with and without the flag.
- Cascade tiles changed from 48 / 12 m to **57.3 / 15.45 m**.

## 1. Source

Built on `main` at `6ff50d84` (I.2). Three.js r187. Hardware: RTX 4080, Windows 11, Chromium, native WebGPU, 1600×900.

## 2. Files

| File | Role |
| --- | --- |
| `src/editor/water/fft/OceanFftCoordinates.js` | Double-precision positive modulo; per-chunk cascade UV origins; CPU twin of the shader UV |
| `src/editor/water/fft/OceanFftQuality.js` | Tier → profile: off on low/medium, 128²×2 on high/ultra; needs the opt-in |
| `src/editor/water/fft/OceanFftFiltering.js` | Unresolved slope variance per mip level; footprint LOD; CPU twins |
| `src/editor/water/fft/OceanFftSampling.js` | `OceanFftBinding` (shared texture node with a zero fallback, unresolved-variance uniform array) and `sampleOceanFftSlope` (TSL) |
| `src/editor/water/fft/OceanFftController.js` | One runtime + binding per surface view; perf counters |
| `src/editor/water/fft/OceanFftConstants.js` | Final tile sizes; offshore wind default and seed |
| `src/config/RenderEnhancements.js` | `oceanFft` enhancement, default off, `?oceanFft=1` |
| `StylizedSurfaceViewBase.js`, `StylizedWaterSlot.js`, `SharedWaterMaterials.js` | Controller construction, `prepare` in `beforeMainRender`, dispose; per-slot `oceanFftOrigin` uniform; shared-binding pass-through |
| `scripts/ocean-fft-qa/sampling.js`, `main.js`, `run-ocean-fft-qa.mjs` | Isolated GPU sampling cases, screenshots |
| `scripts/lib/ocean-fft-scene.mjs`, `run-coastal-review.mjs` | `--query` passthrough and `--ocean-fft-inspect` (runtime state, slot origins, water WGSL binding counts) |
| `test/ocean-fft-sampling.test.js` | Node tests: coordinates, quality policy, filtering table, controller gate |

None of the protected water files (`SeaSwell`, `SeaSurf*`, `SeaSurfaceShading`, `TerrainWaterQueries`, `WaterVisualClock`, `WaterField`, `CoastSwashShading`, `CoastalRockImpact`) changed.

## 3. Coordinates

A chunk's origin for cascade `c` is `positiveMod(centre, L_c) / L_c`, computed in f64 when the slot is placed. The shader adds `localXZ / L_c` and lets the repeat sampler wrap. There is no `fract()` in the shader, because its jump would break the mip derivatives.

- UV magnitudes stay below `1 + 64 / L_c`, so f32 is safe at any world position.
- u follows canonical +X and v canonical +Z. WebGPU does not flip v for render-target textures, as the orientation case confirms.
- Nothing depends on the render origin, so a floating-origin rebase cannot move the pattern.

## 4. Tile sizes

I.2's provisional 48 / 12 m had two problems: the 4:1 ratio repeated the summed pattern exactly every 48 m, and cascade 1 lost 2.7 % of its band variance against a dense 512² lattice. The chosen 57.3 / 15.45 m:

- give ≥ 4 texels per shortest band wavelength (4.47 at 2 m, 4.14 at 0.5 m), so bilinear slopes stay faithful;
- fit ≥ 7.6 periods of each band's longest wavelength, keeping band variance within **0.14 %** of the 512² reference;
- have a non-integer ratio (3.709), so the cascades never repeat together.

Ponlai's [733, 157] m were not used: at 128² they would put the short-wave band far below 4 texels per wavelength.

## 5. Quality tiers

| Water tier | FFT |
| --- | --- |
| low, medium | Off: the authored medium ripples stay |
| high, ultra | 128² × 2 cascades, 1.29 MiB, ~0.06 ms GPU (I.2) |

256² × 2 stays research-only (I.8). Until I.4 ships its material and its `offshoreFft` setting, the FFT also needs `?oceanFft=1`. Without it, no tier constructs anything.

A tier change already rebuilds the whole surface view. The controller is built in the view's constructor and disposed in `dispose()`, so a tier change is one clean rebuild of the target, with no per-slot instances and no extra material compiles.

## 6. Filtering

`sampleOceanFftSlope` picks the mip from the pixel footprint (the longer screen-space step of chunk-local metres, so grazing views filter on their long axis). It returns the summed slope plus the slope variance that level cannot show, from a per-cascade, per-level table built on the CPU from the spectrum. I.4 adds that variance to the roughness (Beckmann α² += σ²), so the far sea goes rough rather than glittery.

The model is a spectral cut at each level's Nyquist, an approximation of the box filter's gradual attenuation. Exact LEAN second-moment mips are deferred, since they would double the output texture.

## 7. GPU sampling QA (isolated fixture)

`npm run qa:ocean-fft -- --no-benchmark`: every case passes, 0 validation errors. The one console error is the deliberate simulated device loss.

| Case | Result |
| --- | --- |
| Orientation | Max error 0 for both cascades; a v-flip would give 0.13 / 0.18 |
| Seams at −4.2 Mm | 128 shared-edge pairs, max difference **0** |
| Mips | Mip 1 matches its box average exactly; unresolved variance matches the CPU table to 2.8e-8 relative |
| Floating-origin rebase | 518,400 channels, **0** differ after a rebase (205,332 differ without the floating origin) |
| Lifecycle | Second runtime rejected, WebGL fallback reports unsupported, device loss and recovery, no leak after a cycle |
| Disabled | 0 submits, 0 buffers, 0 pipelines |

Screenshots (slope visualization, not the water material): top-down at a chunk corner, grazing toward the horizon, high altitude. No seam at the corner, slopes fade smoothly toward the horizon with no glitter, high altitude is uniform.

**Sampling cost** (full run with benchmarks): a full-screen plane sampling both cascades with footprint LOD adds **0.016 ms** of render-pass GPU time at 1600×900 (median 0.041 ms with sampling vs 0.025 ms without, before and after). That is the helper alone on a flat plane. The water material's real cost is measured in I.4. The same run re-measured the 128²×2 FFT at 0.055 ms compute + 0.009 ms output, matching I.2.

## 8. In-app inspection

`run-coastal-review.mjs --only offshore-calm --ocean-fft-inspect`, with and without `--query oceanFft=1`, at the I.0 offshore pose:

- **Runtime:** with the flag, active on high and ultra; off on medium and low. Without the flag, off on every tier.
- **Chunk origins:** all 42 water chunks carry exactly the expected origins (max error 0), on both runs.
- **Water shaders unchanged:** identical length and hash with and without the flag.

| Tier | Variant | Textures | Samplers | Hash (off = on) |
| --- | --- | --- | --- | --- |
| high | plain | 15 | 12 | `b3c62d4e` |
| high | refraction | 20 | 13 | `6a9b2b63` |
| ultra | plain | 15 | 12 | `737edf92` |
| ultra | refraction | 20 | 13 | `563efbbb` |

The probe recorded no new water shader on medium and low, because those runs follow high/ultra in the same page and their variants were not rebuilt for capture.

### Binding limit — the main I.4 constraint

The plain water fragment shader already uses **15** sampled textures. Adding the FFT array brings it to exactly **16**, the portable WebGPU limit. The refraction variant already uses **20** today and only works because this device's limit is raised to 32. I.4 must therefore drop or reuse a binding to stay portable, and should bring the refraction variant under 16 too or document it as a raised-limit-only path.

## 9. Performance

`run-coastal-review.mjs --perf` at the I.0 poses (`offshore-calm` high and ultra, `cove` high), 5 s settle then 8 s measured, live water clock, native foreground focus verified on every timing. Three back-to-back runs against the same dev server: flag off (A), `oceanFft=1` (FFT), flag off again (A′). Here the FFT runs every frame but nothing samples it. Values are p50 / p95 in ms; GPU is the sampled render passes, which exclude the FFT's compute pass (0.055 ms, §7).

| Pose / tier | Frame A | Frame FFT | Frame A′ | GPU render A | GPU render FFT | GPU render A′ |
| --- | --- | --- | --- | --- | --- | --- |
| offshore-calm / high | 3.9 / 5.5 | 3.8 / 6.0 | 4.2 / 6.6 | 3.60 / 3.89 | 3.60 / 4.13 | 3.80 / 4.26 |
| offshore-calm / ultra | 3.8 / 5.8 | 4.0 / 6.0 | 3.9 / 5.9 | 3.64 / 3.77 | 3.67 / 4.19 | 3.64 / 4.78 |
| cove / high | 5.3 / 7.0 | 5.3 / 8.0 | 5.3 / 7.1 | 4.89 / 4.97 | 4.91 / 5.05 | 4.91 / 5.15 |

Every FFT value lies within or next to the A/A′ spread: the runtime adds no measurable frame cost, as I.2's 0.06 ms predicts. The cove p95 of 8.0 ms (vs 7.0 / 7.1) is one isolated p95 that the GPU render and CPU columns do not show. The A/A′ spread itself is up to 1 ms at p95, so this harness cannot resolve sub-0.1 ms costs; the timestamped fixture numbers in §7 are the authoritative ones. All runs: 0 failures, 0 timing failures.

## 10. Checks

| Check | Result |
| --- | --- |
| `npm test` | 5,039 pass, 0 fail |
| `npm run lint` | No issues |
| `npm run build` | Exit 0; existing chunk-size warnings only |
| `npm run qa:ocean-fft` (with benchmarks) | All cases pass, 0 validation errors |
| Coastal inspection, flag on and off | 0 failures |
| Coastal `--perf`, A / FFT / A′ | 0 failures, focus verified on all 9 timings |

## 11. Not verified

- **Other GPUs.** Only the RTX 4080 was run.
- **Portable 16-texture profile.** Not compiled with the limit forced to 16; the counts above come from the captured WGSL.
- **Water acceptance and world visual QA** were not run: the water material and CPU water queries are unchanged (shader hashes above).

## 12. Phase I.4 handoff

- Call `sampleOceanFftSlope(view.oceanFft.binding, { origin: slot.oceanFftOrigin, localXZ })` inside the sea detail slope, weighted by `binding.available`, and add `unresolved` to the roughness.
- Free a texture binding first (§8): the plain variant must stay ≤ 16.
- Replace ripple indices 0 and 1 rather than stacking on them (I.0 Decision A); no storm multiplier.
- Add the `offshoreFft` setting and retire the `?oceanFft=1` gate.
