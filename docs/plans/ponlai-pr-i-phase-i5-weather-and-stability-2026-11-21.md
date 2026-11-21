# PR I phase I.5 — Weather, visual stability and reflection integration

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-21.md). It follows [I.4 offshore normal integration](ponlai-pr-i-phase-i4-offshore-normal-integration-2026-11-21.md). Evidence: [`docs/qa/ponlai-pr-i-phase-i5-2026-11-21/`](../qa/ponlai-pr-i-phase-i5-2026-11-21/README.md).

**Status:** done. **Enabled by default** after I.5 (`water.sea.offshoreFft.enabled: true` in `config/water-visual.yaml`). It runs on the high and ultra water tiers with WebGPU; low, medium and WebGL keep the authored sea. A default load verified this: active on high with the I.4 shader hashes, off and unchanged on low.

- The offshore FFT spectrum now follows the world's resolved wind: the same direction and storm-curved intensity that drive every swaying plant.
- Weather changes cross-fade per-mode power over 2 s, with each mode's phase fixed. The sea never flashes, resets or rotates, and the roughness table always matches the uploaded spectrum.
- Fixed weather, seed and water time give a deterministic spectrum.
- Weather off gives exactly I.4's 10 m/s reference sea.
- Evolution stays on absolute water time, once per frame, and is never redone for a reflection capture.

## 1. Source and prerequisites

Built on `main` at `b9ab85b5` (I.4 complete), so I.4 was available and is used unchanged. No shader or material file changed in I.5. Three.js r187.

The I.5 brief was truncated at §6.1. The missing parts were taken from the main plan's I.5 checklist:
- weather wind and storm with normalized heading;
- rebuild only on meaningful revisions, with deterministic, bounded transitions;
- absolute water time, and no FFT per capture;
- calm, windy and storm across dawn, day, evening and night;
- the return-on-investment gate.

## 2. Files

| File | Change |
| --- | --- |
| `src/editor/water/fft/OceanFftWeather.js` (new) | `resolveFftWind` (weather → wind speed and heading), `windChanged` (deadband), `headingDelta` |
| `src/editor/water/fft/OceanFftSpectrumState.js` (new) | CPU spectrum state: cached Gaussians and cycles, one cascade built per update, per-mode power transition, `settle` |
| `src/editor/water/fft/OceanFftController.js` | `setWeather`, `settleWeather`; `prepare` advances the spectrum and uploads through `setSpectrum`; guarded, logged uploads |
| `src/editor/water/fft/OceanFftConfig.js`, `config/water-visual.yaml` | `offshoreFft.weather: { referenceWindSpeed: 10, transitionSeconds: 2 }`, validated |
| `src/editor/stylized/StylizedSurfaceViewBase.js` | Passes the weather settings; `setOceanWeather` |
| `src/main.js` | After `worldWind.update`, hands the resolved wind to the view, using one reused scratch object (no per-frame allocation) |
| `src/editor/performance/qa/WorldVisualQa.js` | `settleLighting` also settles the FFT spectrum; `setLighting` takes an optional `weatherIntensity` |
| `scripts/run-coastal-review.mjs`, `scripts/lib/ocean-fft-scene.mjs` | `weatherIntensity` per job; the probe records the FFT's spectrum wind and whether it is transitioning |
| `test/ocean-fft-weather.test.js` (new) | 8 tests (§10) |

Not modified: any shader, `SeaSurfaceShading`, `StylizedWaterMaterial`, `OceanFftRuntime`, the GPU layout and kernels, `WorldWindPass`, the storm system, CPU water queries, and the reflection controller.

## 3. Weather source

`WorldWindPass.update` already resolves one prevailing wind per frame from the weather settings and the storm's wind channel:
- `directionDegrees`, measured from +X toward +Z;
- `intensity`, which is 1 for the authored breeze, 0.45 at the floor for still air, and up to 2.4 in a full gale through `STORM_WIND`.

The FFT reads those two numbers and nothing else. A second interpretation of the weather would drift from the wind the grass shows.

```text
weather off (or non-finite input) → windSpeed = referenceWindSpeed (10 m/s), heading = primary swell (OFFSHORE_FFT_WIND)
weather on                        → windSpeed = referenceWindSpeed · clamp(intensity, 0, 2.4), heading = normalise(directionDegrees)
```

- **Speed** scales with the wind the world shows. A storm is 2.4× the breeze's wind (24 m/s), not a second gain on the slopes.
- **Heading** is normalized to (−π, π]. Deadband comparisons use the shortest signed angle, so 3.1 and −3.15 rad count as 0.033 rad apart.
- **The long swell stays authoritative.** Its five carriers and their direction are untouched, and only the short-wave band follows the wind.

Short-wave band slope RMS (both cascades, 128²) as a function of wind:

| Wind (m/s) | 2 | 4.5 | 6.1 (calm) | 10 (reference) | 14 | 24 (storm) |
| --- | --- | --- | --- | --- | --- | --- |
| slope RMS | 0.083 | 0.101 | ≈0.107 (interpolated) | 0.121 | 0.131 | 0.147 |

The band is the saturated spectral tail, so a gale roughens it by about 20 % over the breeze rather than doubling it. That rules out a doubled storm amplitude by construction.

## 4. Rebuild policy

- **Deadband** (`FFT_WIND_DEADBAND`): 0.5 m/s, or a 3° heading change. A smaller drift rebuilds nothing.
- **Cost.**
  - Built once per controller: the seeded Gaussians and the dispersion cycles, which are wind-independent.
  - Per rebuild, one cascade per frame: the power table plus h0, a median 1.23 ms per frame for two frames at 128², instead of one 2.6 ms hitch.
- **Startup.** The first weather sample snaps (`settleWeather`), so a session never fades in from the reference sea.
- **QA.** `settleLighting` also settles the FFT, so captures see the target spectrum, not a transition.

## 5. Transition

```text
P(a) = (1 − a)·P_from + a·P_to        per mode,  a: 0 → 1 over transitionSeconds (2 s)
h0   = g·√P(a)/2                      same seeded Gaussian g  ⇒ every mode keeps its phase
```

Uploads run every 0.25 s during a transition, about 8 per change, and the final one is exactly the target spectrum.

- **Power, not amplitude.** An amplitude crossfade drops modes owned by only one of the two winds to ¼ power mid-turn, a brief calm on a large heading change. Interpolating power makes slope variance move linearly, with no dip and no overshoot. A test checks this on a 120° turn.
- **Retargeting** mid-transition restarts from the spectrum on screen, so the motion stays continuous.
- **Roughness.** `binding.setSpectra` receives the same interpolated `power`, so the unresolved-variance table always describes the uploaded spectrum. `runtime.setSpectrum` and `binding.setSpectra` are updated together, never one without the other.
- **Real time, bounded.** The step uses frame time, capped at 0.25 s per frame, so a stall can't skip a transition. It doesn't use water time, because weather keeps moving when the water clock is frozen or seeking.

Measured CPU per upload step at 128²: blend 0.24 ms, pack 0.51 ms, roughness table 0.12 ms. That is about 0.9 ms per step, or ≈0.2 ms per frame on average, only while a transition runs.

## 6. Time, determinism and reflections

- **Clock.** Evolution is unchanged from I.2/I.3: `runtime.prepare(waterVisualClock.value)` on the absolute water clock, so pause, rewind, seek and replay stay exact. The spectrum state never touches time.
- **Determinism.** Fixed weather, seed and water time give the exact `buildCascadeSpectra` spectrum for that wind (test: bit-equal h0, power and cycles). A repeated weather sequence reproduces bit-equal spectra.
- **Reflections.** The FFT is prepared once, first in `beforeMainRender`. `WaterReflectionController` captures (cube faces, planar) render the same materials and read the same binding, with no FFT call per capture.

## 7. Failure handling

- **No resources** (failed, lost or unsupported): `upload` is skipped, the authored detail is showing (`available = 0`), and the CPU state keeps tracking the weather.
- **Rejected tables:** `setSpectrum` validates before uploading. A rejected table is logged (`[ocean-fft] weather spectrum rejected`), the previous spectrum stays live, and the binding is not updated, so the GPU and roughness tables never diverge.
- **Config:** a `referenceWindSpeed` outside [1, 25] m/s, which keeps 2.4× under the spectrum's 60 m/s limit, a `transitionSeconds` outside [0.25, 60], and unknown keys all throw at load.

## 8. Visual QA

The I.0 offshore pose, high tier, 1600×900, five weathers (§README table):
- calm, reference, wind and storm at dawn, day, evening and night;
- moderate at day only.

FFT on and off are matched, and each capture's settled spectrum wind is recorded: 6.1, 11.4, 10, 24 and 24 m/s, with `transitioning: false` on every capture.

Review at full resolution:

- **Calm → strong:** a visible but restrained progression of short chop, with no step between levels. Calm and moderate differ less than strong does, because of the saturated tail (§3).
- **Storm:** fog and rain dominate. There is no extra sparkle and no white streaking from the FFT, and the storm water is not noisier than the windy water.
- **Dawn and evening:** the smooth bright sun patch becomes glitter confined to the sun's reflection path. That is realistic glitter, not a permanently bright offshore sparkle; the rest of the sea is unchanged in brightness.
- **Night:** the moonlit patch is no brighter, only finer and irregular instead of the authored ripple's parallel bands.
- **Streaks in the night wind frame:** the two thin straight streaks over the water are wind-mode airborne particles. The same streaks fill that frame's sky and appear at random positions per run, so they are not the FFT.
- **Upwind windrows:** none visible in these captures. The FFT's heading follows `directionDegrees`.

Not captured as images: a live transition (direction or speed sweeping on screen). It is covered numerically (§10). Every weather switch in these runs went through the in-app transition and settle live on one page, with 0 failures and 0 GPU errors: off → wind → storm in the first run, then calm → moderate in the second.

## 9. Performance

- **Steady weather:** I.5 adds a constant-time wind resolve per frame and no GPU work, so the I.4 measurements stand: about +0.1 ms GPU render p50 for the water sampling, and 0.055 ms of FFT compute plus 0.009 ms of output passes.
- **During a weather change** (CPU, §4–5): two frames of ~1.2 ms, then ~0.9 ms every 0.25 s for 2 s. There is no GPU allocation; `setSpectrum` writes the existing buffers.
- **Return on investment** (plan gate): the short-wave detail is visible and filtered at 1600×900 in every weather and time of day (§8). The cost stays inside the budgets above. The gate passes and the approach is kept.

## 10. Tests

| Check | Result |
| --- | --- |
| `test/ocean-fft-weather.test.js` | 8 pass. Covered: wind mapping, including off, non-finite input, the storm cap and heading normalization. The deadband, including across ±π. Fixed wind bit-equal to `buildCascadeSpectra`. A speed change built one cascade per update, then a monotonic transition of ≤ 1/7 per upload in 8–10 uploads ending exactly on the target. A 120° direction change with no variance dip and a phase drift below 1e-9. Mid-transition retarget continuity and `settle`. The controller: first-sample snap, `setSpectrum` only (`configGeneration` unchanged), at most 10 uploads, a roughness table consistent with the GPU, and no throw without resources. Determinism of a repeated sequence |
| All FFT Node tests | 77 pass |
| `npm test` | 5,062 pass, 0 fail |
| `npm run lint` | No issues |
| `npm run build` | Exit 0; existing chunk-size warnings only |
| `npm run qa:ocean-fft -- --no-benchmark` | All cases pass, 0 validation errors (one deliberate simulated device loss) |
| Coastal captures, FFT on and off, 17 jobs each | 0 failures, 0 GPU or network alerts |

## 11. Reviews

**Correctness.**
- Single weather source.
- Heading normalization and shortest-angle deadband.
- Phases fixed by construction, with power interpolated linearly.
- Roughness table and GPU coefficients uploaded together.
- Absolute water time untouched; startup snap; QA settle.
- Config validated.

One fix during review: the first transition was an amplitude lerp. It would dip toward ¼ power on modes owned by one wind only, a brief calm mid-turn. It is now a per-mode power lerp, and a test guards it.

**Performance.**
- No per-frame allocation in the wind path (scratch object in `main.js`).
- Rebuilds are deadbanded and split per cascade.
- Uploads are rate-limited to 4 Hz, and only while transitioning.
- No reconfigure, recompile or new GPU resource for weather.
- No change to shaders or to dispatch counts.

## 12. Known limitations

- **Fetch is fixed at 50 km.** Coastal fetch-limited seas are not modelled; the coastal blend (I.4) already removes the FFT near shore.
- **Wind mode at full intensity equals storm.** The storm system drives its wind channel to a full gale in `wind` mode, so both reach 24 m/s, which is the world's own resolved wind. A gentler wind needs a lower weather intensity (QA: `weatherIntensity`).
- **Shipping.** Enabled in the shipped config, so the open sea looks different on high and ultra in every weather. To roll back, set `offshoreFft.enabled: false`: the shaders return byte-identical to the pre-FFT ones (I.4 §9). `resolveOffshoreFft` keeps `false` as the code default for worlds and fixtures without the setting.
- **Single GPU.** Only the RTX 4080 was run.

## 13. Phase I.6 handoff

- **Wind state:** read `OceanFftController.spectrum.wind` (settled) and `.transitioning`. Do not rebuild spectra outside `OceanFftSpectrumState`; call `setWeather` or `settleWeather`.
- **Uploads:** spectra reach the GPU and the roughness table together, through `controller.upload`.
- **Geometry:** any CPU-evaluable low-frequency wave source (I.6) must keep the five carriers authoritative and stay disjoint from this short-wave band (7.5–0.5 m).
