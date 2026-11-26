# Atmospheric and post-processing pass admission

Control: 0fc7649c352a6681e413d6b3a35331ca6587d799. Compare flags off/on on the same final revision. No GitHub Actions.

## Activation

```text
?atmosphericPassAdmission=1
?atmosphericPassAdmission=1&environmentalFragmentAdmission=1&environmentalParticleAdmission=1&coastalSprayCompaction=1
```

```yaml
atmosphericPassAdmission: false
atmosphericPassBudget:
  targetFrameMs: 18
  recoveryFrameMs: 17
  pressureMs: 300
  recoveryMs: 2000
  minimumDwellMs: 3000
  maxFrameGapMs: 250
  ssrStepFactor: 0.65
  ssrMinimumSteps: 12
  shaftSampleFactor: 0.5
  shaftMinimumSamples: 8
  volumetricStepFactor: 0.6
  volumetricMinimumSteps: 16
  aoResolutionFactor: 0.75
  aoMinimumResolution: 0.25
  reduceBloomFilter: true
```

The feature is opt-in and does not enable any disabled effect. Separate controller instances for world, legacy god rays and instanced locations observe their own active render cadence. More than 18 ms per frame continuously for 300 ms requests reduced quality; recovery requires continuously less than 17 ms for 2000 ms and at least 3000 ms since a normal quality transition. Middle-band frames reset the relevant streak without changing quality. A gap above 250 ms, backward clock or world diagnostic debug view clears accumulated pressure and restores authored quality. Warmup is not counted as runtime admission. Cadence includes CPU, GPU, display refresh and browser scheduling; it is not a measured GPU bottleneck. A capped 30 FPS display may remain reduced; tune thresholds for the actual target refresh rate.

## Effects

- World post graph and location post chain: retain authored scene MRT resolution, AA/TAA/TAAU, tone mapping, exposure, SSR range, SSR binary refinement, bloom threshold and intensity, and all effect enablement. SSR trace steps become ceil(authored × 0.65) with a floor of 12, never exceeding authored steps. The larger march interval can miss thin reflections; temporal history is invalidated on tier transitions (world via existing render-path invalidation, location via SSR validity). No change to SSR render-target resolution or hierarchy topology.
- World screen-space shafts: optional runtime integer sample bound instead of the authored unrolled loop, minimum 8 and factor 0.5. Keep reach, compensate decay for larger sample spacing and normalize by accumulated weight. Zero-intensity shafts skip the sample loop, not the RTT or composite. The legacy screen-space scattering path uses the existing reference sample normalization with the active count, and the same zero-intensity loop guard.
- Cinematic Gods End shafts: optional dynamic integer loop bound, compensated decay and normalized energy. Preserve quarter-resolution mask and march targets and the existing dormant-pass scheduler. Volumetric legacy rays use the existing r187 raymarchSteps uniform (factor 0.6, floor 16) without changing height fog, cloud transmission, blur softness or scattering intensity.
- GTAO: lower only trace resolution to authored × 0.75, floor 0.25 (never above authored). Keep the authored sample count and full-resolution composite. This also applies to the legacy contact AO nodes. Three.js r187 GTAONode rebuilds its material when samples change; that knob is intentionally not adapted. The trace target may resize/reallocate on tier transitions; dwell avoids frequent reallocations but does not guarantee hitch-free resizing. See [GTAONode](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/tsl/display/GTAONode.js) and [GodraysNode](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/tsl/display/GodraysNode.js).
- Bloom: optional five-tap symmetric center/diagonal filter instead of thirteen-tap lowpass in prefilter and downsample. Both kernels normalize weights and retain Karis weighting in prefilter. Preserve the nine-tap tent upsample, pyramid levels, resolution, exposure, soft knee, material boost and final intensity. No added targets, graph rebuild or per-frame resize. Filter radius/shape and small highlights can change; set reduceBloomFilter=false to isolate bloom. The legacy cinematic finish bloom is not changed.

No attempt to change the sky's cloud representation, cloud shadow maps, atmospheric scattering, underwater fog, gameplay visibility, sun position, or scene lighting. The volumetric cloud plan is separate; do not interpret legacy cloud transmission as a volumetric-cloud raymarch implementation. DoF, sharpen and grain are unchanged. Debug view forces full authored quality for the world graph.

## Diagnostics

Counters use atmosphericAdmission.world/location/godRays.reduced and .transitions, with effective configured aoScale, ssrSteps, shaftSamples, bloomDownsampleTaps, screenSamples, volumetricSteps and cinematicSamples where applicable. These are quality settings, not actual fragment/sample execution counts or GPU time; inactive retained graph values can remain present. Transition deltas enter the existing performance report. World and location histories follow their existing ownership; a resumed path resets pressure on a long gap.

## Testing

Seven isolated regression cases passed against exact committed controller and configuration source with mocked URL parsing. Covers short/sustained pressure, recovery and dwell, interrupted recovery, gaps, backward clocks, bypass, path independence, quality floors and configuration validation. Three additional real Three.js graph tests are committed but were not executed in this environment. Full npm suite, lint, build, actual shader compilation, visual acceptance and GPU timings are pending.

```sh
npm ci
node --test test/atmospheric-pass-admission.test.js test/postprocessing/atmospheric-pass-graph.test.js test/postprocessing/bloom-reference.test.js test/postprocessing/screen-space-shafts-reference.test.js test/gods-end-weather.test.js
npm run lint
npm test
npm run build
```

A/B the same final SHA, identical seeds, quality, camera routes, backend, output resolution, display refresh and driver. Exercise all three paths, enabled effects individually and combined. Use headed WebGPU and WebGL fallback. Capture actual pass GPU timestamps, frame P50/P95/P99/P99.9, target memory and screenshots before/during/after a tier transition. Compare transition frames separately from steady state.

| Scenario | Acceptance |
| --- | --- |
| Stable forest and town at target cadence | Authored settings retained; no topology churn |
| Sustained dense settlement or weather | Reduced optional sampling; stable tone mapping, fog and AA |
| Ice cave/Stonehold | AO contact preserved, SSR valid history reset; no missing major reflections or bloom flicker |
| Sun in frame, high noon, sun behind camera | Correct shaft decay, energy and visibility; no stale mask or bright flashes |
| Volumetric rays with shadows and cloud transmission | Stable shafts, no banding, shadow alignment preserved |
| High contrast lights and small emissive geometry | Compare bloom filter radius, fireflies and brightness; no objectionable changes |
| Resize, camera cut, location transfer and debug views | No repeated resize/recompile loop, stale pressure or temporal ghosting |
| Recovery and 30/60/120 Hz displays | Expected hysteresis; tune cadence thresholds for actual refresh |
| Flags off | Legacy authored settings and topology retained |

Reject candidate-only shader failures, visible artifacts or frame-tail regressions. Keep the flag off by default until hardware acceptance.

## Remaining work

- TODO: measured GPU pass cost feedback and per-pass priority admission; frame cadence cannot identify the expensive effect or distinguish GPU pressure from CPU/display caps.
- TODO: reduce actual auxiliary pass count via verified zero-contribution scheduling, without stale textures or history.
- TODO: independent volumetric cloud/sky atmosphere budget once the relevant renderer exists; legacy finish bloom, DoF and other post effects need separate cost/visual contracts.
- TODO: spatial performance overlay and byte-exact GPU publication slicing.
