# Offshore FFT ocean

How the open sea gets its wind chop and long swell: a GPU FFT spectrum for normals and roughness, plus a wind-driven long swell that is real wave height on the CPU and the GPU alike. This document covers what shipped, how to switch it off, what it costs, and the contract a later PR can build on.

Built by PR I ([plan](../plans/ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-22.md)), phases I.0–I.9, all committed directly to `main`.

## 1. Status

| Feature | State | Switch (`config/water-visual.yaml`, `water.sea.offshoreFft`) |
| --- | --- | --- |
| **FFT normals and roughness:** a 128² × 2-cascade wind-sea spectrum on high and ultra | **Shipped, on** | `enabled` |
| **Long swell geometry:** 16 Fourier modes, 48–160 m, real wave height; the CPU water query and the vertex shader agree to 0.6 µm | **Shipped, on** | `geometry.enabled` (needs `enabled`) |
| **Weather coupling:** the spectrum and swell follow the world wind | **Shipped, on** | `weather.*` |
| **FFT caustics:** underwater bed lighting from the FFT slopes, on ocean beds deeper than 2–6 m | Built and tested, **off** (visible on the shelf; enabling it is an art call) | `caustics.enabled` |

Precisely, for the plan's question "normal/roughness only, or geometry?":
- **FFT output is normal and roughness only.** The 128² FFT never displaces vertices, so it has no height.
- **The geometry phase was implemented separately (I.6, approved by the user).** It is **not** FFT height. It is a sparse 16-mode long swell that both the CPU and the GPU evaluate in O(16), so swimming, wading and collisions follow the waves the player sees. There is no readback and no CPU FFT.
- Not implemented: FFT vertex displacement, choppy horizontal displacement, a Jacobian foam, velocity buffers, physical glint lobes, cat's paws, windrows (§9).

## 2. How it works

```text
world wind (WorldWindPass) ──► OceanFftController.setWeather ──► OceanFftSpectrumState
                          │       (deadband 0.5 m/s, 3°)          (JONSWAP × Donelan–Banner,
                          │                                        per-mode power eased over 2 s,
                          │                                        Gaussian phases fixed)
                          │                                              │ one cascade per frame
                          │                                              ▼
                          │                         OceanFftRuntime (WebGPU compute, once per frame)
                          │                           128² × 2, Stockham radix-2, absolute water time
                          │                           → RG16F 2-layer array with mips (∂h/∂x, ∂h/∂z)
                          │                                              │
                          │                         OceanFftBinding (zero fallback until published)
                          │                                              │
                          │      water fragment: sampleOceanFftSlope (footprint LOD, unresolved
                          │      slope variance → roughness 0.16·√σ²), composed with the authored
                          │      fine ripples, replacing the medium ones by the offshore weight
                          │
                          └────► updateSeaState ──► OceanSwellState (16 amplitudes eased, time phases)
                                                     ├─ CPU: seaSurfaceOffset = authored + swell
                                                     └─ vertex: same modes, per-chunk f64 origins
```

**Where it applies.** One geographic weight drives both the FFT normals and the swell:

```text
B = smoothstep(7, 14, depth) · smoothstep(24, 40, shoreDistance) · clamp(exposure) · clamp(ocean · coverage)
```

The FFT normals also multiply by `available`, which is 0 until the GPU publishes a result. The swell never does: gameplay height must not depend on whether the GPU initialized. The weight is zero in the surf zone, over the shelf, in the lee of headlands, and on lakes and rivers. So breakers, swash, foam lines, wet sand and rock impacts keep their original timing and height.

**Energy split.** Every wave band is owned by exactly one source, so nothing is counted twice:

| Band | Owner |
| --- | --- |
| 48–160 m | Long swell (I.6) |
| 42–7.5 m | The five authored carriers, unchanged |
| 7.5–0.5 m, offshore | FFT normals: cascade 0 (57.3 m tile) 7.5–2 m, cascade 1 (15.45 m tile) 2–0.5 m |
| 7.5–0.5 m, near shore | Authored medium ripples, cross-faded out by `B` |
| Below 0.5 m | Authored fine ripples, always; plus the unresolved-slope roughness |

**Planet scale.** Each chunk's cascade UVs and swell phases are computed in double precision on the CPU when the chunk's descriptor changes. The shader only adds chunk-local metres (|local| ≤ 64 m), and the repeat sampler wraps without `fract`. The field is stable at ±4.2 Mm, across chunk edges and through floating-origin rebases (I.3).

**Time.** Everything evaluates from the absolute water clock. FFT frequencies are quantized to whole cycles per 512 s, and swell phases are taken in double precision once per frame. Pause, seek, replay and any clock rate give the same sea at the same time.

## 3. Configuration and rollback

```yaml
water:
  sea:
    offshoreFft:
      enabled: true          # master switch: false restores the original sea, swell included
      slopeStrength: 1       # FFT slope gain, 0–2
      blend: { depthStartMeters: 7, depthEndMeters: 14, shoreStartMeters: 24, shoreEndMeters: 40 }
      weather: { referenceWindSpeed: 10, transitionSeconds: 2 }
      geometry: { enabled: true }
      caustics: { enabled: false, strength: 1, depthStartMeters: 2, depthEndMeters: 6 }
```

- Code defaults (`OFFSHORE_FFT_DEFAULTS`) are all off. The shipped YAML turns the normals and swell on.
- `resolveOffshoreFft` validates every field and rejects unknown keys. `shoreEndMeters` is capped at 48 m, where the shore-distance field saturates.
- Wind speed = `referenceWindSpeed` × weather intensity (1 = the authored breeze, 2.4 = a full storm). With weather off, the reference breeze blows along the primary swell.
- QA override: `?oceanFft=1` requests the FFT normals regardless of `enabled`, but does not turn on the swell.
- QA without editing the YAML: `run-coastal-review.mjs --water-patch '{"sea":{"offshoreFft":{"enabled":false}}}'`.

**Rollback** is `enabled: false`. It gives:
- **no FFT work:** no controller, 0 submits, 0 buffers, 0 pipelines, 0 transforms;
- **the pre-PR I water shaders:** 15 textures / 12 samplers / 12 varyings (plain) and 20 / 13 / 12 (refraction), with no FFT reference and no swell modes in the vertex stage;
- **the authored CPU sea:** `seaSurfaceOffset` returns the five carriers and surf only.

§6 has the evidence. Until I.9, `enabled: false` left the swell on if `geometry.enabled` was true; I.9 made `enabled` the master switch.

## 4. Tiers, backends and fallback

| Water tier | FFT normals | Long swell |
| --- | --- | --- |
| ultra, high | 128² × 2 cascades (~1.29 MiB GPU) | Yes |
| medium | Off: authored medium ripples | Yes, wherever the authored swell exists |
| low | Off | No (the shader is byte-identical to pre-PR I) |

`OceanFftQuality` is the single owner of sizes per tier; 256² stays research-only until it shows a measured visible gain.

| Condition | Behaviour |
| --- | --- |
| WebGL backend, or WebGPU without compute | `oceanFftUnsupportedReason` → no controller, warning logged once; the authored sea renders, the swell still runs |
| Before the first published output | The binding holds a 1×1 zero texture with `available = 0`, so the sea is the authored one |
| Device loss or a compute failure | Runtime fails, binding falls back to zero, then recovers to active (simulated in the GPU fixture) |
| Tier change | The surface view is rebuilt; the controller is disposed and recreated with it |
| Weather changes | Spectrum rebuilt one cascade per frame, power eased, phases fixed; no shader rebuilds |

## 5. Performance

Measured on an RTX 4080, Windows 11, Chromium 151, native WebGPU, 1600×900 ([I.8](../plans/ponlai-pr-i-phase-i8-qa-and-rollout-2026-11-21.md) §5). A/A′ noise floor 0.07 ms.

| | Cost |
| --- | --- |
| FFT compute | 0.055 ms + 0.010 ms output passes per frame (timestamped), one transform per frame regardless of slot count |
| GPU render, high/ultra, offshore and open coast | +0.07–0.19 ms (p50) |
| GPU render, sheltered cove (most refraction water near the camera) | +0.33–0.35 ms, above the plan's provisional 0.2 ms target, well inside the 60 FPS floor |
| medium / low | 0 |
| Per chunk | One vec4 FFT origin and four vec4 swell origins, written on descriptor change |
| Shader budget (on) | 16 / 13 / 12 plain, 21 / 14 / 12 refraction: +1 texture, +1 sampler, +0 varyings |
| CPU water query | O(16) sin/cos per query for the swell; no readbacks |

Every pose stays below 6 ms of GPU time.

## 6. Off-path verification (I.9)

Shader identity is checked in-app on a frozen snapshot of the commit that made `enabled` the master switch. Offshore and cove poses, high tier, with `getShaderAsync` hashes of both stages:

| Config | Plain water: textures / samplers / varyings, FFT referenced, fragment / vertex hash | Refraction water |
| --- | --- | --- |
| On (shipped) | 16 / 13 / 12, yes, `a95839db` / `5ae704e5` | 21 / 14 / 12, yes, `a48570fb` / `12c22c` |
| `enabled: false` alone (`geometry.enabled` still true) | 15 / 12 / 12, no, `9f1cc5ea` / `b7017c92` | 20 / 13 / 12, no, `6dee5f22` / `abad5550` |
| Both switches off | 15 / 12 / 12, no, `9f1cc5ea` / `b7017c92` | 20 / 13 / 12, no, `6dee5f22` / `abad5550` |

- **Both stages match** at all three poses (offshore calm, calm motion, cove). The off fragment hashes are the ones I.8 recorded at `8bb0106b`, whose counts are the pre-PR I ones. Evidence: [`docs/qa/ponlai-pr-i-phase-i9-2026-11-22/`](../qa/ponlai-pr-i-phase-i9-2026-11-22/).
- The first `enabled: false` run timed out loading the app while other sessions were using the GPU, and the re-run passed. Both runs are kept.

- The CPU side is covered by `test/ocean-swell-geometry.test.js`: with `enabled: false` and `geometry.enabled: true` the swell headroom is 0 and `oceanSwellOffset` is 0 in a storm.
- **One deliberate exception to "exactly as before PR I":** I.7 fixed two bugs that apply whether the FFT is on or off. The planar-reflection gate now uses the still water level, not displaced height (that removed the contour bands), and the whitecap foam reshapes about 3× faster. Five-wave heights, surf, rock impacts and their timing are unchanged.

## 7. Integration contract for a later PR

What a consumer can rely on, without any new global ocean, weather, atmosphere or simulation model:

| Need | Use | Notes |
| --- | --- | --- |
| Water height for gameplay | `seaSurfaceOffset` / `TerrainWaterQueries` | Already includes the swell; never read GPU data |
| Swell weight and bound | `oceanSwellWeight(depth, shore, exposure)`, `oceanSwellHeadroom()` | Headroom pads any culling bounds of displaced water (+3.34 m at the storm ceiling) |
| FFT slope in a shader | `sampleOceanFftSlope(binding, { origin, localXZ })` → `{ slope, unresolved, lods }` | Multiply by `binding.available`; `origin` is the per-chunk vec4 from `OceanFftCoordinates` |
| The FFT outside the surface view | `OceanFftBinding.mirror(stylizedSurface.oceanFft.binding)` | The view's binding is rebuilt on tier changes; mirror it each frame, as the caustics post does |
| Where the FFT owns the sea | `offshoreFftWeight` (TSL) / `offshoreFftWeightCpu` | Same geography as §2; pass `available: 1` for anything gameplay-visible |
| Wind | `{ enabled, directionDegrees, intensity }` from WorldWindPass, via `stylizedSurface.setOceanWeather` and `updateSeaState({ weather })` | `resolveFftWind` maps it to m/s and heading |
| Deterministic captures | `oceanFft.settleWeather()`, `settleOceanSwell()` | `WorldVisualQa.settleLighting` already calls them |

Rules for consumers:
- Do not create a second `OceanFftRuntime`: one per view, and a second is rejected.
- Do not add vertex FFT height without a CPU twin.
- Do not sample `viewport*Texture` for ocean effects (CLAUDE.md).
- Do not add scene lights.

## 8. Source and licensing

- The Stockham stage scheme and output-pass pattern in `OceanFftGpuKernels.js` / `OceanFftRuntime.js` are adapted from Ponlai [`packages/render/ocean/OceanFFT.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts), pinned at `cca90564`. It is MIT licensed, "Copyright (c) 2026 Hubery", and recorded in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).
- The spectrum (JONSWAP, Donelan–Banner spreading, Tessendorf evolution and small-wave fade, Cox–Munk as a reference prior) is written from the published formulas and cited in `OceanSpectrum.js` / `OceanFftConstants.js`.
- No Ponlai shader, texture or asset is used. The Drusniel water shader, refraction, spectral absorption, swamp/lake rules and swash are all kept.

## 9. Not implemented, not verified

**Not implemented** (each declined with a reason in [I.7](../plans/ponlai-pr-i-phase-i7-optics-evaluation-2026-11-21.md)):
- FFT vertex height and horizontal (choppy) displacement;
- a Jacobian foam (it would duplicate the existing whitecaps and streaks);
- physical glint lobes (current glitter stays confined to the sun and moon path);
- cat's paws (prototyped, no measurable effect, removed) and windrows;
- 256² or 4-cascade FFTs, motion vectors and SSR.

**Not verified:**
- GPUs other than the RTX 4080 (AMD, Intel, Apple, software);
- a real `GPUDevice.destroy()` device loss (only simulated);
- swimming in open deep water (the acceptance route is coastal);
- the CPU height ignores the vertex path's `swing` and ice factors (pre-existing; the swell's weight is 0 where they apply).

## 10. Files and QA

| Area | Files |
| --- | --- |
| Spectrum and reference | `src/editor/water/fft/OceanSpectrum.js`, `OceanGaussianModes.js`, `OceanFourierReference.js`, `OceanFftConstants.js` |
| GPU FFT | `OceanFftRuntime.js`, `OceanFftGpuKernels.js`, `OceanFftGpuLayout.js`, `OceanFftGpuResources.js` |
| World sampling and tiers | `OceanFftCoordinates.js`, `OceanFftFiltering.js`, `OceanFftSampling.js`, `OceanFftQuality.js`, `OceanFftController.js` |
| Blend, weather, config | `OceanFftBlendNodes.js`, `OceanFftWeather.js`, `OceanFftSpectrumState.js`, `OceanFftConfig.js` |
| Long swell | `src/editor/water/OceanSwellModes.js`, `OceanSwellState.js`, `src/editor/stylized/OceanSwellNodes.js` |
| Caustics (off) | `OceanFftCaustics.js`, `src/editor/water/UnderwaterViewController.js` |
| Material wiring | `SeaSurfaceShading.js`, `SeaRippleShading.js`, `SeaDetailShading.js`, `StylizedWaterMaterial.js`, `SharedWaterMaterials.js`, `StylizedWaterSlot.js`, `StylizedSurfaceViewBase.js`, `src/main.js` |

How to re-run the QA:
- Unit tests: `node --test test/ocean-fft-*.test.js test/ocean-swell-geometry.test.js test/water-planar-reflection-level.test.js`.
- GPU fixture (spectrum vs DFT oracle, sampling, swell parity, lifecycle, device loss): `npm run qa:ocean-fft`.
- In-app shaders and captures: `node scripts/run-coastal-review.mjs --ocean-fft-inspect [--water-patch …]`.
- Timing: `node scripts/run-coastal-review.mjs --perf --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json`, A/A′/off on a frozen snapshot (`scripts/serve-world-visual-snapshot.mjs <rev> <port>`) while other sessions edit the tree.
- Water acceptance: `npm run qa:water:acceptance -- --headed`.

Phase reports:
[I.0](../plans/ponlai-pr-i-phase-i0-audit-and-baseline-2026-11-21.md) ·
[I.1](../plans/ponlai-pr-i-phase-i1-spectrum-and-reference-2026-11-21.md) ·
[I.2](../plans/ponlai-pr-i-phase-i2-webgpu-fft-2026-11-21.md) ·
[I.3](../plans/ponlai-pr-i-phase-i3-world-sampling-and-quality-2026-11-21.md) ·
[I.4](../plans/ponlai-pr-i-phase-i4-offshore-normal-integration-2026-11-21.md) ·
[I.5](../plans/ponlai-pr-i-phase-i5-weather-and-stability-2026-11-21.md) ·
[I.6](../plans/ponlai-pr-i-phase-i6-long-swell-geometry-2026-11-21.md) ·
[I.7](../plans/ponlai-pr-i-phase-i7-optics-evaluation-2026-11-21.md) ·
[I.8](../plans/ponlai-pr-i-phase-i8-qa-and-rollout-2026-11-21.md) ·
[FFT caustics](../plans/ponlai-pr-i-fft-caustics-2026-11-22.md)
