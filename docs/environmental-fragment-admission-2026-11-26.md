# Environmental fragment admission and coastal spray compaction

Control before this phase: 071e1cc9b1f8997297b1d3e437df4678f12f1688. Concurrent fire-material changes arrived on main during development and were preserved. Use the same final revision with flags off/on for clean A/B testing. No GitHub Actions.

## Activation

```text
?environmentalFragmentAdmission=1
?coastalSprayCompaction=1
?environmentalFragmentAdmission=1&coastalSprayCompaction=1&environmentalParticleAdmission=1
```

```yaml
environmentalFragmentAdmission: false
coastalSprayCompaction: false
environmentalFragmentBudget:
  fogStepFactor: 0.5
  fogMinimumSteps: 3
  fogProtectedDistanceMeters: 20
  frameCpuPressureMs: 12
  recoveryMs: 800
  transparentAlphaCutoff: 0.003
```

Both flags default off. No fog configuration or water quality is enabled by these flags. Thresholds are initial tuning values, not measured GPU budgets.

## Valley mist

- The legacy shader path keeps its authored constant step count. When enabled, use a frame integer uniform for the active step count. Under previous-frame CPU or upload pressure, reduce distant ray steps to ceil(authored steps × factor), clamped to the configured minimum and authored maximum. Hold reduced quality for 800 ms after the last pressure frame. No per-frame shader recompilation.
- With the default six steps, the candidate uses three under pressure for rays beyond 20 metres. Near rays retain all six. Rescale the midpoint integration step to the actual sample count so the integrated ray length is retained.
- Before marching, skip rays within the clear start distance and beyond the maximum distance when farFade < 1. Move the distance fade outside the sample loop. Guard normalization at a zero-length ray. Preserve the region-weight gate, heightfield sampling, density, light, time, and the separate underwater fog. Height patch refresh stays on its existing path.
- The dynamic loop is supported by the [r187 LoopNode](https://github.com/mrdoob/three.js/blob/r187/src/nodes/utils/LoopNode.js). Shader graph assembly is not a guarantee of successful backend compilation. Reduced quadrature can change the visual result; inspect the near/distant step boundary and movement, especially across narrow terrain valleys. No global fog attenuation or changes to visibility-related settings.
- The default maximum range is 56 m, so terrain fragments beyond it can skip the valley-fog march entirely. The legacy farFade=1 corner case keeps its original distance evaluation rather than assuming its degenerate smoothstep has a defined value.

## Transparent fragment masking

Waterfall mist and coastal spray can reject fragments with opacity at or below 0.003 before material colour work using NodeMaterial.maskNode. Three.js r187 [NodeMaterial.setupDiffuseColor](https://github.com/mrdoob/three.js/blob/r187/src/materials/nodes/NodeMaterial.js) evaluates maskNode before colour. Texture sampling and opacity computation still run; the mask does not eliminate all fragment work or guarantee early hardware depth rejection. The cutoff introduces a small visual approximation. Keep blending, fog, depthWrite=false and render order unchanged. Set the cutoff to zero to isolate the fog optimization from the mask.

## Coastal spray

The legacy circular record buffer can reach its allocated draw count even with few live particles; its cursor can also encounter a live record while other slots have expired. The opt-in dense record path:

- Stable-compacts only the live records once per simulation timestamp, before emission; preserve order, birth times, deterministic seeds, position, size, trajectory and lifetime.
- Immediately reuse retired capacity while preserving the configured total and mist limits. Draw exactly the number of live records, not the allocation high-water mark. No extra GPU mesh, storage or texture.
- Re-encode only shifted surviving rows and new emissions. Rebase re-encodes all survivors from canonical coordinates. Submit a coalesced dirty span per attribute once at the normal update boundary, using the existing range accounting and custom attribute byte counter. No idle writes when the origin and record order are unchanged. Trailing expired rows require no upload.
- The wave impact history, wetness/foam field, site selection, near spray radius and effect intensity are unchanged. The new path may admit more droplets than the legacy blocked-cursor behavior; count bounds remain authoritative. The existing clock-jump/reset paths still clear records. The newly compacted buffer is published synchronously in the update; it contributes to shared queued-upload counters but does not independently wait on canPublish. Large rebases and many simultaneous impacts can still create CPU/upload spikes.
- This is live-count optimization, not a reduction in the allocated GPU capacity or a new pressure-aware spray emission quota.

## Diagnostics

- environmentFogSteps / environmentFogFullSteps (distant configured step bound, not total executed pixel samples)
- coastalSprayExpiredRecords / coastalSprayCompactedRows
- coastalSprayAttributeBytes, coastalSpraySubmittedInstances, coastalSprayAllocatedInstances
- Existing coastalRockImpacts, coastalRockDroplets, coastalRockFieldBytes, coastalRockSprayEmitted, publicationCustomAttributeBytes, renderer draw/triangle metrics

Counters are exposed in the performance QA report. Physical GPU upload costs may differ from incremental queued bytes. Fragment work cannot be inferred reliably from instance counts alone.

## Validation

Nine isolated regression cases passed using exact committed JavaScript logic with a mock URL parser and mock attribute/mesh objects. Covers pressure/recovery, minimum and authored maximum step limits, flag validation, stable compaction, capacity, mist bounds, idle uploads, dirty ranges, rebasing, reset and legacy path. Added two further integration cases using the real Three.js graph and Scene/attributes in tests/valleyFog.test.js and test/coastal-rock-impact.test.js; those require the actual dependency environment and were not executed here.

Full Node/npm tests, lint, build, shader compilation, browser visual tests and hardware benchmarks remain pending.

```sh
npm ci
node --test test/environmental-fragment-admission.test.js tests/valleyFog.test.js test/coastal-rock-impact.test.js
npm run lint
npm test
npm run build
```

A/B the same final SHA, flags independently and combined, matching seed, camera, quality, time, resolution, driver and backend. Use headed RTX 4080 WebGPU and WebGL fallback. Record actual GPU pass durations, CPU/GPU P95/P99/P99.9, dirty bytes and screenshots.

| Scenario | Acceptance |
| --- | --- |
| Fog-free terrain and distant horizon | No new fog or unintended coloration; shader march skips noncontributing rays |
| Dense gorge and snowy valley | Near detail unchanged; no visible step-boundary ring or abrupt density changes |
| Fast movement / teleport / rebase | No invalid shader values or stale spray placement; existing height-patch behavior maintained |
| Waterfalls against sun and dark terrain | No hard edges, halos or lost visible mist; compare cutoff=0 |
| Dense rocky surf / storm | Same foam and wetness behavior; exactly live submitted spray prefix; capacity and mist limits honored |
| Long idle / repeated bursts | Expired slots reused, zero live instances when empty, unchanged rows produce no uploads |
| Sustained upload pressure | Distant step count reduces, then recovers; compare final commit CPU and queued bytes |
| Underwater / cave / legacy flags | No changes to underwater fog or unrelated lighting, no new compilation errors |

Reject candidate-only visual defects or frame-tail regressions. Do not enable by default before accepted hardware evidence.

## Remaining work

- TODO: measured GPU-millisecond feedback for fragment admission; transparent overdraw profiling at multiple resolutions.
- TODO: jungle mist, volumetric clouds, atmospheric/post-processing and GPU snow compute admission require independent cost and visual contracts. They are not modified in this phase.
- TODO: optional distant spray emission quotas, if actual live compaction is insufficient, with explicit near protection and shared publication admission.
- TODO: cave and geology regional admission, then spatial QA overlay.
