# Measured GPU pass admission

Starting main: 0248413b57658ac91e00e04a7064a56a315db03f. No concurrent commits preceded this phase. No GitHub Actions.

## Activation

Measurement alone (no new quality control enabled):

```text
?measuredGpuAdmission=1&spatialPerformanceOverlay=1
```

Selective adaptive post-processing:

```text
?measuredGpuAdmission=1&atmosphericPassAdmission=1&spatialPerformanceOverlay=1
```

```yaml
measuredGpuAdmission: false
gpuAdmissionBudget:
  sampleEvery: 8
  maxAgeMs: 1500
  targetRenderMs: 12
  recoveryRenderMs: 9
  pressureSamples: 3
  recoverySamples: 8
  minimumDwellMs: 2000
  passMs:
    ao: 1.2
    ssr: 1.5
    bloom: 1
    shafts: 1.2
    volumetric: 1.5
```

These are initial configurable millisecond thresholds, not RTX 4080 benchmarks. The total is the sum of available sampled render-context timestamps, not a guaranteed GPU wall-frame duration; compute, CPU submission, upload and unmeasured work are excluded. The feature is off by default and does not enable effects or existing atmospheric admission.

## Timestamp ownership

Reuse GpuPassProfiler and Three.js r187 WebGPU timestamp queries. Request timestamp capability when constructing the renderer; WebGPUBackend.init checks device support. Reuse an enabled QA profiler, including its existing sample cadence/history; otherwise install one runtime sampler around world or location rendering. Only one timestamp owner and outstanding asynchronous readback per renderer. Runtime retains one latest sample; QA retains its bounded history and updates latest even when history is full. No awaited readback in the animation loop. A synchronous or asynchronous readback failure stops sampling. Dispose restores the previous beginRender hook and disables tracking. Debug diagnostic aggregate timestamp resolution is suppressed while the shared feedback provider owns queries; use the spatial overlay or QA report for measurements.

Scope measurements to world post-processing, location post-processing, or the specific god-ray technique. A mixed-path sample cannot drive quality. Scope changes, debug bypass, stale/failed timestamps and clock discontinuity clear evidence. The same completed sample cannot count multiple times or restart a streak after bypass. Unsupported adapters and unavailable fresh measurements fall back to existing frame-cadence admission; no GPU duration is invented.

The existing render-context profiler labels exact render target texture names. Stable target names added for SSR trace, bloom prefilter/downsample and shaft radiance. GTAO and volumetric god rays use r187 names. Only known controllable pass names count towards each group. No guessed assignment of generic screen/offscreen passes. Multiple bloom downsample levels sum into one group. Other render contexts contribute to the available render total but cannot directly cause an unrelated group to demote.

## Control policy

Three distinct consecutive fresh samples must show both total render estimate above 12 ms and a named group above its own threshold before demoting. Choose highest normalized excess first, at most one group transition per completed sample. Groups have separate two-second minimum dwell. Eight consecutive low-total samples (below 9 ms) with measured group evidence permit recovery after dwell. Unknown/missing group timing is not zero and cannot establish recovery. When timestamps expire, restore authored quality before restarting the cadence fallback streak. Quality recovery can increase cost again; thresholds require hardware tuning. A fixed frame cap or heavy CPU alone does not cause demotion while a fresh measured profile is available and total render cost is low.

Each group uses the existing atmosphere quality factors: AO trace resolution only, SSR max steps only, bloom prefilter/downsample taps only, screen/cinematic shafts sample count only, volumetric god rays step count only. No enabling of disabled passes, change in exposure/scene resolution, new rendering targets or graph reconstruction. Existing SSR/TAA history invalidation is used when the effective group selection changes; location resets SSR validity. GTAO resize can still allocate targets on transitions.

## Diagnostics

- gpuAdmission.fresh: whether fresh scoped evidence drives the recommendation.
- gpuAdmission.sampleAgeMs, renderMs: last valid sample, interpret only when fresh.
- gpuAdmission.{ao,ssr,bloom,shafts,volumetric}.ms: last observed group cost; -1 means unknown when reported.
- gpuAdmission.<group>.reduced: feedback recommendation, applied only when atmosphericPassAdmission and the corresponding effect are enabled.
- gpuAdmission.transitions: measured policy changes; atmosphericAdmission.<path>.transitions tracks effective quality-profile changes, including fallback.
- Spatial overlay displays latest measured render total and top three contexts separately from regional estimates; export includes the raw latest sample. No per-chunk GPU attribution.

## Testing

18 isolated checks passed: 11 new feedback tests and 7 existing atmospheric cadence tests. Executed exact committed source logic in isolated JavaScript with mock URL parsing and mocked WebGPU backend/timestamp promises. Coverage: pass grouping, repeated samples, scene-only pressure, selective demotion, recovery/dwell, absent samples, stale/failed/mismatched evidence, bypass, render-path changes, binding ownership, async sample retention, mixed scopes, sync failure and config validation. Real device timestamp capture, full npm suite, lint, production build, shader compilation and browser visual validation were not performed.

```sh
npm ci
node --test test/gpu-pass-feedback.test.js test/atmospheric-pass-admission.test.js
npm run lint
npm test
npm run build
```

A/B same final SHA, driver, seed, route, resolution and refresh rate. Compare (1) flags off, (2) measurement only, (3) cadence atmosphere, (4) measured + atmosphere. Capture headed WebGPU with timestamp support and WebGL fallback. Use existing QA capture with gpuTimings=1 to verify single profiler ownership. Match rendered frames and collect GPU context durations, CPU/GPU P95/P99/P99.9, effective quality, sample age, transition counts, timestamp errors and screenshots.

| Scenario | Acceptance |
| --- | --- |
| CPU-bound town / capped display with low sampled GPU total | No measured quality reduction |
| Expensive AO alone | Only AO quality changes |
| Expensive SSR or bloom | Only corresponding sample/filter knob changes; histories reset |
| Legacy screen/cinematic/volumetric shafts | Known target names classified; unrelated effects retained |
| World / cave transition or debug view | Old samples never drive another path; full quality in debug |
| Missing support, failed readback, stale sample | Existing cadence fallback, no sync wait or stale measured profile |
| Stable recovery | Dwell and distinct-sample recovery honored |
| QA + runtime flag | One active timestamp hook, latest sample valid |
| Long session | Runtime history bounded; no pending readback growth |
| Flags off | Existing atmospheric cadence behavior remains |

Keep disabled by default until hardware acceptance. Measure profiling overhead itself, and reject excessive reallocations, flicker, shader errors, ghosting or frame-tail regression. Sampled context sums can omit repeated/unavailable contexts; validate classification against captured timestamps before calibration.

## Remaining work

- TODO: far-shadow and reflection admission using event-scoped capture timings. Sparse captures need explicit sampling/attribution, rather than treating missing samples as zero.
- TODO: compute timing, main-scene geometry/shader attribution, measured scenery/particle/geology budget calibration and actual per-region GPU attribution.
- TODO: avoid quality oscillation via hardware-calibrated thresholds, promotion probes and/or measured savings estimates if acceptance reveals cycling.
- TODO: byte-exact oversized instance publication slicing, rendering-layer isolation, expanded spatial diagnostics.
