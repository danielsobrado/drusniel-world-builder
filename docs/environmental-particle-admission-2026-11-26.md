# Environmental particle admission

Control: 6516383c68012125438b93b0f8c4ea0578e13290. Compare the same final revision with the new flag off and on. No GitHub Actions.

## Activation

```text
?environmentalParticleAdmission=1
?environmentalParticleAdmission=1&rendererAdmissionBudget=1&regionalInstancePublicationBudget=1&townDecorationAdmission=1
```

```yaml
environmentalParticleAdmission: false
environmentalParticleBudget:
  particleBudget: 18000
  pressureFactor: 0.65
  frameCpuPressureMs: 12
  sampleMs: 200
  recoveryMs: 800
  protectWaterfallMeters: 60
  minimumShares:
    precipitation: 0.6
    dust: 0.5
    splash: 0.25
    waterfall: 0.25
    ambient: 0.15
```

These are initial configurable submitted-instance targets, not measured GPU capacity. The pressure target is 11700. The controller samples the prior completed frame's authored demand, not its already reduced count. It holds pressure for 800 ms after the last pressured frame, and samples every 200 ms. Pressure is based on previous fixed plus deferred CPU work or queued publication bytes above half the shared allowance. The existing EnvironmentalPassScheduler remains the owner of visual field refresh scheduling.

## Covered layers

- Rain and snowfall: scale each interleaved population's live density proportionally and trim the actual submitted instance prefix. Preserve original intensity, opacity fade, drift, fall speed, elapsed time, storm channels and snow accumulation. Legacy geometry uses a deterministic prefix. Layer rounding can introduce small differences between the estimated admitted count and the submitted prefix.
- Ground/water rain splashes: scale the authored count at the current rain level; do not change placement seeds or weather intensity. Existing placement generation still scans the allocated buffers.
- Sandstorm puffs: trim submitted count, leaving haze, physical intensity, wind integration and sand accumulation unchanged.
- Wind ribbons: retain all 2800 near ribbons; reduce the distant suffix first. This is an independent visual overlay, not the wind field used by vegetation or water.
- Waterfall mist: frustum-visible slots only, full authored density within 60 m of the camera, optional distant prefixes. Slot creation, waterfall geometry, lighting, time, water simulation and residency remain unchanged.
- Regional ambient fields: use the authored quality count and existing eased regional visibility, then reduce optional instances. Continue accounting for currently visible/eased fields during deferred sampling; preserve simulation time and region weights. Extras such as breath, ridge plumes, alpine snow shells and GPU snow compute fields are not included.

The quota first reserves the greater of the minimum share or explicit protected count per category. Optional capacity is then granted to precipitation, dust, splashes, waterfalls and ambient fields, in that order. Infeasible minimum reserves are reported as overflow. Untracked effects and actual GPU draw/fragment costs are not included. Particle counts are a rough proxy for geometry submission, not equivalent GPU cost; overdraw and quad area can dominate.

## Diagnostics

- environmentParticles.requested, admitted, reserved, limit, overflow, pressured
- environmentParticles.factor.precipitation/dust/splash/waterfall/ambient
- Existing weather stats, renderer draws/triangles, frameFixedCpuMs, frameDeferredCpuMs, framePublicationUploadBytes, environment:* scheduling counters.

The new aggregate gauges describe the most recent sampled allocation; rapidly changing weather can differ from the estimate between samples. No additional per-frame full scene traversal or GPU buffer allocation is introduced. Factors can step at sample boundaries; visual acceptance must check for visible popping.

## Validation

Eight isolated cases passed against the committed controller, config and precipitation-density source with a mock URL parser. They cover protected minimums, independent pressure recovery, unknown/inactive demand, count bounds, population proportions and preserved opacity, and flag/setting validation. Actual Node/npm tests, lint, build, shader compilation, browser visual checks and RTX 4080 acceptance were not run.

```sh
npm ci
node --test test/environmental-particle-budget.test.js test/environmental-pass-scheduler.test.js
npm run lint
npm test
npm run build
```

Compare identical camera routes, weather settings, world seed, quality, backend, viewport and driver on headed WebGPU and WebGL fallback. Capture weather transitions (off/rain/storm/snow/sandstorm/wind), mixed ambient region borders, waterfall approaches and camera cuts/rebases. Confirm the full near waterfall and wind populations, preserved storm intensity, accumulation, lightning, haze, water and wind effects, and return to baseline density after pressure clears. Record requested/admitted/reserved/overflow and actual draw/triangle counters, GPU pass timings, CPU/GPU frame P50/P95/P99/P99.9, and screenshots. Reject persistent visual holes, distracting density transitions, candidate-only errors or frame-tail regressions.

## Remaining work

- TODO: Coastal spray's existing circular buffer needs a safe live-record compaction/slot publication design before reducing emission can reliably reduce submitted geometry. Preserve wave impact history, foam, wetness and near spray.
- TODO: independent fog/mist raymarch and atmospheric/post-process admission based on fragment or measured GPU cost; preserve underwater fog, gameplay visibility and near effects.
- TODO: integrate other extras (meadow motes, snow powder, ridge plumes, GPU snow compute) only with suitable independent cost models.
- TODO: replace count-only quota with measured GPU feedback and regional relevance weights where profiling demonstrates benefit.
- TODO: cave/geology admission and spatial performance overlay.

The flag remains disabled by default until actual hardware and visual acceptance. No measured FPS savings are claimed.
