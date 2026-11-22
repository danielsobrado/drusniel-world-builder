# PR I phase I.3 — Canonical world sampling and stable quality tiers

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-22.md). It follows [I.2 WebGPU FFT](ponlai-pr-i-phase-i2-webgpu-fft-2026-11-21.md). Evidence: [`docs/qa/ponlai-pr-i-phase-i3-2026-11-21/`](../qa/ponlai-pr-i-phase-i3-2026-11-21/README.md).

**Status:** done. I.4 can start.

- The FFT runs inside the scene, one per surface view, on the high and ultra water tiers, behind `?oceanFft=1` (default off).
- Every water chunk carries its cascade UV origins, computed on the CPU in double precision. A shared binding and a TSL sampling helper (`sampleOceanFftSlope`) are ready for I.4.
- **The water material does not sample the FFT yet.** Its shaders are byte-identical with and without the flag on all four tiers.
- Cascade tiles changed from 48 / 12 m to **57.3 / 15.45 m** (§4).

## 1. Source and prerequisites

First landed as `b5935abd` on top of I.2 (`6ff50d84`); this report covers that commit plus the gap pass that follows it. I.2 was committed and verified, and I.3 uses its real runtime (`OceanFftRuntime`: `configure`, `prepare`, `settled`, `output`, `diagnostics`, `dispose`). Three.js r187. Hardware: RTX 4080, Windows 11, Chromium, native WebGPU.

## 2. Files

| File | Role |
| --- | --- |
| `src/editor/water/fft/OceanFftCoordinates.js` | `positiveMod`, `cascadeUvOrigin`, `writeCascadeUvOrigins`, `cascadeUv` (CPU twin of the shader UV) |
| `src/editor/water/fft/OceanFftQuality.js` | `OCEAN_FFT_PROFILES`, `resolveOceanFftProfile` (tier, request and capability → effective profile) |
| `src/editor/water/fft/OceanFftFiltering.js` | The brief's "slope variance" module: `unresolvedSlopeVariance`, `footprintLod`, `interpolateLevel` |
| `src/editor/water/fft/OceanFftSampling.js` | The brief's "sampling nodes": `OceanFftBinding` (shared texture node, zero fallback, variance uniforms) and `sampleOceanFftSlope` (TSL) |
| `src/editor/water/fft/OceanFftController.js` | One runtime + binding per surface view; perf counters |
| `src/editor/water/fft/OceanFftConstants.js` | Final tile sizes; `OFFSHORE_FFT_WIND`, `OFFSHORE_FFT_SEED` |
| `src/config/RenderEnhancements.js` | `oceanFft` enhancement, default off, `?oceanFft=1` |
| `src/editor/stylized/StylizedSurfaceViewBase.js` | Builds the controller next to `SharedWaterMaterials`; `prepare(waterVisualClock.value)` first in `beforeMainRender`; disposes it |
| `src/editor/stylized/StylizedWaterSlot.js` | Per-slot `oceanFftOrigin` (vec4 uniform), written in the existing descriptor-change block |
| `src/editor/stylized/SharedWaterMaterials.js` | Carries the binding; `oceanFftOrigin` joins the existing `onObjectUpdate` list |
| `scripts/ocean-fft-qa/sampling.js`, `main.js`, `scripts/run-ocean-fft-qa.mjs` | GPU sampling cases, debug views, scenario captures, source metadata |
| `scripts/lib/ocean-fft-scene.mjs`, `scripts/run-coastal-review.mjs` | `--query` passthrough; `--ocean-fft-inspect` (runtime state, slot origins, water WGSL counts) |
| `test/ocean-fft-coordinates.test.js`, `test/ocean-fft-slope-variance.test.js`, `test/ocean-fft-quality.test.js` | Node tests (§11); the fake renderer and GPU now live in `test/helpers/oceanFftFixtures.js` |

The modules keep the names they shipped with, rather than the brief's `OceanFftSamplingNodes` / `OceanFftSlopeVariance`. Each is one responsibility, as listed above.

None of the protected water files changed: `SeaSwell`, `SeaSurf*`, `SeaSurfaceShading`, `StylizedWaterMaterial`, `TerrainWaterQueries`, `WaterVisualClock`, `WaterField`, `CoastSwashShading` and `CoastalRockImpact`.

## 3. Coordinates

For a chunk centred at canonical `(X, Z)` and cascade tile `L`:

```text
CPU, f64, once per descriptor change:   origin = (positiveMod(X, L) / L, positiveMod(Z, L) / L)    ∈ [0, 1)²
GPU, f32, per fragment:                  uv     = origin + localXZ / L                              (sampler repeats)
```

- **Negative coordinates.** `positiveMod` wraps JavaScript's signed `%` into `[0, L)`, turns `−0` into `0`, guards the rounding case where `r + L` rounds up to `L`, and rejects non-finite values or periods.
- **No `fract()`.** The brief proposed `fract(origin + local / L)`. The repeat sampler wraps instead, because a `fract` jump inside a pixel quad breaks the screen derivatives the mip selection needs. The `|uv| < 1 + 64 / L` bound keeps f32 exact enough.
- **Chunk borders.** Two chunks sharing an edge compute `origin_a + 64/L` and `origin_b − 64/L`, which are equal modulo 1 to f32 rounding (< 5e-7 of a tile), at any world position.
- **Floating origin and teleports.** Neither term contains the render origin, so a rebase or a teleport cannot move the pattern.
- **Orientation.** u follows canonical +X and v canonical +Z. The FFT texel row is z (I.2 §9), and WebGPU does not flip v for render-target textures, which the orientation case confirms.

## 4. Tile sizes (deviation from the brief's 48 / 12 m)

I.2's provisional 48 / 12 m had two problems:
- Their 4:1 ratio repeated the summed pattern exactly every 48 m.
- Cascade 1 lost 2.7 % of its band variance against a dense 512² lattice.

The chosen 57.3 / 15.45 m keep the same bands (7.5–2 m and 2–0.5 m), the I.1 phase convention and the single clock. They:

- give ≥ 4 texels per shortest band wavelength (4.47 at 2 m, 4.14 at 0.5 m);
- fit ≥ 7.6 periods of each band's longest wavelength, keeping band variance within **0.14 %** of the 512² reference;
- have a non-integer ratio (3.709), so the cascades never repeat together.

Ponlai's [733, 157] m would put the short-wave band far below 4 texels per wavelength at 128².

## 5. Quality tiers and fallback

| Water tier | Effective FFT |
| --- | --- |
| low | Off |
| medium | Off |
| high, ultra | 128² × 2 (57.3 m, 15.45 m), 1.29 MiB, only when requested and supported |
| verification | 64² × 1 stays a fixture configuration (`proof64`), not a shipped profile |

256² × 2 is not shipped. Until I.4 adds `water.sea.offshoreFft`, the request is `?oceanFft=1`; without it, no tier builds anything.

| Condition | Result |
| --- | --- |
| Not requested | `null` controller; the renderer is never touched |
| WebGL backend | "requires the WebGPU backend": original sea, one warning |
| WebGPU device missing | "renderer is not initialised" |
| No `renderer.compute` | "renderer has no compute" |
| Before the first transform | Binding holds a 1×1 zero array texture, `available = 0` |
| Device lost / runtime failed | Binding falls back to the zero texture, `available = 0` |
| Output of the wrong size or cascade count | Never bound |

The remaining capabilities the brief lists are guaranteed by WebGPU core. RG16F rendering, filtering and mips, `texture_2d_array` and the I.2 kernels' 64-thread workgroups are all in core. The sampled-texture budget is in §9.

## 6. Resource lifecycle

- **Ownership.** One `OceanFftController` per `StylizedSurfaceView`, which owns the single runtime (the runtime refuses a second one per renderer) and the binding. Slots hold only their origin uniform. The texture is never copied, rebuilt or disposed by a slot.
- **Tier changes.** In the app, a water tier change reloads the world: the coastal runner reloads the page per tier, and `StylizedSurfaceView` is built once in `main.js`. The tier is fixed for the view's lifetime. The controller is created in its constructor and disposed in `dispose()`.
  - The Node test cycles high → medium → ultra → low → high on one renderer. Each live controller refuses a second one, and nothing is left live after each dispose.
- **Frame order.** `prepare(waterVisualClock.value)` runs first in `beforeMainRender`, before the reflection captures, so they reuse that frame's output.
  - The binding swaps to a newly published output on the next `prepare`, one frame later. A swap keeps the binding layout, so no material recompiles.
  - The GPU fixture swaps output → fallback → output after compiling and renders correctly each way (§10).
- **Per frame:** no allocation. The perf counters read fields directly rather than building `diagnostics()`, a review fix.

## 7. Mip selection

`footprint = max(|dFdx(localXZ)|, |dFdy(localXZ)|)` in metres, using the longer axis so grazing views filter on their stretched side. Then, per cascade:

```text
texel = L / 128
lod   = clamp(log2(max(footprint, texel) / texel), 0, 7)
```

It uses an explicit `.level(lod)` on the array layer. There is no branch around the derivatives. No LOD bias was needed, so there is no bias setting (YAGNI). The GPU mip-level view ramps smoothly toward the horizon with no rings (§10).

## 8. Unresolved slope variance

For each cascade, `unresolvedSlopeVariance` sums `P(k)·|k|²` over the modes that mip `l` cannot represent, i.e. those with `max(|p|, |q|) ≥ N / 2^(l+1)`. The result is a `Float64Array(8)`, uploaded once per spectrum as a uniform array (2 × 8 floats).

- The shader interpolates it at the fractional LOD and sums both cascades. Units are mean-square slope `E[sx² + sz²]`.
- Entry 0 is 0 and the last entry is the cascade's total slope variance. The table is monotonic, finite and non-negative; a calm (zero) spectrum gives zeros.
- It is a spectral cut, approximating the box filter's gradual roll-off. LEAN second-moment mips are not built, since they would double the texture.
- `resolved = total − unresolved`.

The roughness is untouched in I.3. I.4 maps the variance onto the existing term `0.16·√variance`, which uses the same units as the donor `detail.variance`.

## 9. Samplers and varyings

From each variant's cached pipeline WGSL (`renderer.debug.getShaderAsync`), at the I.0 offshore pose, flag on and off:

| Tier | Variant | Sampled textures | Samplers | Vertex outputs (varyings) | Hash, off = on |
| --- | --- | --- | --- | --- | --- |
| high | plain | 15 | 12 | 12 | `6eb6cc2` |
| high | refraction | 20 | 13 | 12 | `6a9b2b63` |
| ultra | plain | 15 | 12 | 12 | `bd2026a2` |
| ultra | refraction | 20 | 13 | 12 | `563efbbb` |
| medium | both | 14 | 12 | 12 | `25f44842` |
| low | both | 6 | 5 | 4 | `ca02d814` |

- The flag changes no water shader on any tier. Material variants stay at 2.
- The sampling path adds **no varyings**: `localXZ` is rebuilt per fragment from the existing UV.
- I.4 adds **one** array texture and **one** sampler covering both cascades. That brings plain high/ultra to 16 textures, refraction to 21, and samplers to 13 / 14 (limit 16).
- **Portable limits.** The app already requests `maxSampledTexturesPerShaderStage: 32` (`src/render/deviceLimits.js`), because the terrain fragment stage needs 17 textures. A strict 16-texture device cannot run the world today, independently of water. The FFT texture therefore does not raise the app's minimum, and refraction water at 20 already depends on the same raised limit. The 16-interstage profile (`run-coastal-review.mjs --minimum-interstage-limit`) is unaffected, since the sampling adds no varyings.
- An earlier capture in this phase forced a rebuild and recorded only the first variant per page. The getShaderAsync probe fixes that. Its plain-variant hashes differ from that first capture because the render context differs; within one method, off and on agree.

## 10. GPU sampling QA (isolated fixture)

`npm run qa:ocean-fft` with benchmarks: every case passes with 0 validation errors. The one console error is the deliberate simulated device loss. The report records the commit, a working-tree-dirty flag, the adapter and the live GPU allocations.

| Case | Result |
| --- | --- |
| Orientation | Max error 0 for both cascades; a v-flip would give 0.13 / 0.18 |
| Seams at −4.2 Mm | 128 shared-edge pairs, both axes, LOD 0–4.25: max difference **0** |
| Mips | Mip 1 equals its 2×2 box average; the 1×1 mip ≈ 0; unresolved variance matches the CPU table to 2.8e-8 relative |
| Floating-origin rebase | 518,400 channels, **0** differ after a rebase; 205,332 differ without the floating origin, so the check is not blind |
| Teleport and return | **0** differ after returning; 161,162 differ at the other place |
| Lifecycle | Second runtime rejected, WebGL reports unsupported, device loss and recovery, no leak |
| Disabled | 0 submits, 0 buffers, 0 pipelines |

**Captures** (`screenshots/`, 1280×720, seed 1234, water time 126 s, 128²×2). Each capture's metadata is in the report under `scene.captures`.

- **Top-down views.** `world-origin`, `negative-xz`, `top-down-chunk-corner` (four-chunk corner at −4.2 Mm), `huge-positive` (+4.2 Mm) and `rebased-render-origin` show no seam.
- **Other angles.** `low-altitude`, `grazing-horizon` and `high-altitude`: high altitude is uniform with no diagonal bands.
- **Grazing debug views.** `grazing-slope-x`, `-slope-z`, `-normal`, `-mip-level`, `-unresolved` and `-resolved`: the LOD rises smoothly, and resolved variance fades into unresolved with distance without a ring.
- **Disabled.** `fft-disabled` is the zero fallback and renders flat. Every later capture is detailed (per-image σ 37–119), which proves the swap back to live output.
- **Not captured:** a cascade-index view (the orientation case isolates each cascade numerically) and a quality-switch image (§6 covers it in Node, and the fixture lifecycle covers it on the GPU).

**Cost.** Timestamped at 1600×900, sampling both cascades with footprint LOD on a full-screen plane adds **0.016–0.019 ms** of render-pass GPU time across two runs. FFT compute is 0.055 ms plus 0.009–0.010 ms of output passes, matching I.2. The throughput figure (all work, CPU-bound) ranged 0.25–0.57 ms per transform between runs, because another session's dev server shared the machine. The timestamped numbers are the reliable ones.

**Resources.** The output array is 174,768 bytes: 128² × RG16F × 2 layers with mips, plus the 8-byte fallback. Per-slot cost is one vec4 uniform, written only on a descriptor change.

## 11. Node tests

| File | Covers |
| --- | --- |
| `test/ocean-fft-coordinates.test.js` | `positiveMod` (signed, ±1e12, `−0`, both sides of a far tile boundary, invalid input); origins at the brief's points (0,0) … (±4,226,432, ∓278,528), (1e7, −1e7) for 57.3/15.45 **and** 48/12 m; each point reconstructed from **every owning chunk**, including four-chunk corners and edge midpoints (f64 < 1e-9, f32 upload < 1e-6); all four shared edges over 400 chunks at −4.2 Mm; a check that a float32 position before the modulo **fails** the tolerance (> 1e-4); rebase/teleport invariance; incommensurate tiles |
| `test/ocean-fft-slope-variance.test.js` | Zero at full resolution, monotonic, finite, non-negative, ends at the total, most slope resolved at mip 1; zero spectrum → zeros; 64² vs 128² equivalent bands agree within 12 % of the total; LOD clamping, NaN-safe; continuity across mip boundaries; binding fallback, mismatch rejection, `update(null)`, graph builds |
| `test/ocean-fft-quality.test.js` | Tier policy; WebGL / no device / no compute fallbacks with reasons; feature off never touches the renderer; repeated tier rebuilds with one runtime per renderer and zero live resources after each dispose; device loss → zero fallback; wind default |

## 12. In-app performance (from `b5935abd`)

`run-coastal-review.mjs --perf` at the I.0 poses (`offshore-calm` high and ultra, `cove` high), 5 s settle then 8 s measured, live water clock, native foreground focus verified on every timing. Three back-to-back runs: flag off (A), `oceanFft=1` (FFT), off again (A′). The FFT runs every frame here, but nothing samples it. Values are p50 / p95 in ms; GPU is the sampled render passes, which exclude the FFT compute.

| Pose / tier | Frame A | Frame FFT | Frame A′ | GPU render A | GPU render FFT | GPU render A′ |
| --- | --- | --- | --- | --- | --- | --- |
| offshore-calm / high | 3.9 / 5.5 | 3.8 / 6.0 | 4.2 / 6.6 | 3.60 / 3.89 | 3.60 / 4.13 | 3.80 / 4.26 |
| offshore-calm / ultra | 3.8 / 5.8 | 4.0 / 6.0 | 3.9 / 5.9 | 3.64 / 3.77 | 3.67 / 4.19 | 3.64 / 4.78 |
| cove / high | 5.3 / 7.0 | 5.3 / 8.0 | 5.3 / 7.1 | 4.89 / 4.97 | 4.91 / 5.05 | 4.91 / 5.15 |

The FFT values sit within the A/A′ spread, which is up to 1 ms at p95. This harness cannot resolve sub-0.1 ms costs, so the timestamped fixture numbers (§10) are authoritative. All runs: 0 failures, 0 timing failures.

The 1-versus-49-slot comparison is structural: the slot count changes only how many vec4 uniforms are written on descriptor change. The FFT dispatch count is fixed (I.2: 15 per transform, 0 when the clock is unchanged).

## 13. Reviews

**Review 1 — numerics and visual precision.** Covered: double-precision modulo, negative and huge coordinates, X/Z orientation (GPU-verified), periodicity (sampler repeat and 2×2 box mips), no layer bleed (array layers), two-cascade sum, LOD and mip transitions, and variance bounds. The normal sign `normalize(−sx, 1, −sz)` is used only in the debug view; I.4 checks it under lighting. No defects found.

**Review 2 — architecture and performance.** Two fixes:
1. A per-frame `diagnostics()` allocation in `OceanFftController.prepare` is now direct field reads.
2. The WGSL probe forced a rebuild and saw only the first variant per page; it now reads cached pipelines.

Confirmed: one controller and one runtime per view; no per-slot textures or dispatches; flag-off shaders unchanged; two material variants; no new render passes or viewport copies; disposal and device-loss fall back to zero.

## 14. Checks

| Check | Result |
| --- | --- |
| `npm test` | 5,048 tests: 5,047 pass in the suite run. The one failure was `render-probe-lock`, because my coastal run held the shared hardware-QA lock; re-run alone, it passes. |
| `npm run lint` | No issues |
| `npm run build` | Exit 0; existing chunk-size warnings only |
| `npm run qa:ocean-fft` (with benchmarks) | All cases pass, 0 validation errors |
| Coastal inspection, flag on and off, 4 tiers | 0 failures; hashes equal |
| Existing water regressions (`water-floating-origin`, `water-pattern-precision`, `sea-swell`, `water-quality`, `water-shader-performance-contract`, `water-slot-bounds`, `water-visual-clock`) | Pass, inside `npm test` |

## 15. Not verified

- **Other GPUs.** Only the RTX 4080 was run.
- **Real device loss.** It was simulated, as in I.2.
- **Water acceptance and world visual QA** were not run: the water material and CPU water queries are unchanged (§9 hashes).

## 16. Phase I.4 handoff

- **Sample** with `sampleOceanFftSlope(binding, { origin: oceanFftOrigin, localXZ })` in `createSeaSurfaceNodes`, where `localXZ` is the existing chunk-local metres.
  - `binding` is `SharedWaterMaterials.oceanFft` and is null when the FFT is off. Pass nothing then, so the shader stays byte-identical.
  - `oceanFftOrigin` is already a per-object binding in `SharedWaterMaterials`.
- **Weight** by `binding.available`. While it is 0 (warming, failed or lost), the texture is the zero fallback and the authored medium detail must stay.
- **Slope:** replace ripple groups 0 and 1 (`mix(legacyMedium, fft, B)`); keep group 2; no storm multiplier on the FFT.
- **Roughness:** `fine + mix(medium, unresolved, B)` in variance units, through the existing `0.16·√variance`.
- **Budget:** +1 texture and +1 sampler (§9), within the app's raised limit; refraction stays at the same raised-limit dependency as today.
- **Config:** add `water.sea.offshoreFft` (default off). Keep `?oceanFft=1` as a QA override for A/B.
