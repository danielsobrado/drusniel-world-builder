# Independent shadow and reflection admission

Control before this phase: 16415dc9604a24be34dbb68a535f29715dad1618. Concurrent WSC QA evidence arrived on main during editing; compare the same final SHA with flags off/on for a clean A/B. No GitHub Actions.

## Activation

```text
?shadowCascades=2&farShadowAdmission=1
?reflectionAdmission=1
?shadowCascades=2&farShadowAdmission=1&reflectionAdmission=1
```

Both new flags default to false. Far-shadow admission is restricted to the actual WebGPU backend with the existing two-cascade rig. It does not activate a second cascade or change the default single-shadow path. Reflections still require the existing water-reflection configuration and residency checks.

```yaml
farShadowAdmission: false
reflectionAdmission: false
auxiliaryPassBudget:
  farShadowIntervalMs: 33
  farShadowMaxAgeMs: 100
  farShadowMoveMeters: 0.5
  farShadowTurnDegrees: 1
  farShadowSunDegrees: 0.15
  frameCpuPressureMs: 12
  cubeCaptureCpuBudgetMs: 1.5
  planarCaptureCpuBudgetMs: 2
  reflectionUrgentDeferralMs: 80
  reflectionMaxDeferralMs: 250
```

These initial thresholds are not hardware-calibrated.

## Far cascade

The stock r187 CSMShadowNode exposes its cascade lights in `lights`, each with its own LightShadow. ShadowNode.updateBefore checks autoUpdate or needsUpdate and clears needsUpdate after updating the shadow; renderShadow updates the shadow matrix during the render. See the verified upstream [CSMShadowNode](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/csm/CSMShadowNode.js) and [ShadowNode](https://github.com/mrdoob/three.js/blob/r187/src/nodes/lighting/ShadowNode.js). The implementation does not replace Three.js nodes, patch their methods, or change cascade split geometry.

FarCascadeAdmission scopes the second cascade's autoUpdate flag to the main draw, explicitly requests refreshes, and restores the original flag before auxiliary captures. It records a refresh only if the requested dirty flag was consumed and the map exists. An interrupted or failed render invalidates the cached state and forces refresh. Existing reflection capture shadow freezing remains authoritative outside the main draw.

Near cascade, single shadow, externally disabled updates, and uninitialized maps retain existing behavior. The far cascade refreshes on camera identity/projection/layer changes, cumulative camera displacement or turn, sun-direction change, canonical origin change, world/surface/object/construction revision or focus change, map replacement, external dirty flags, or the age limit. Small movements can reuse the old shadow matrix and map together. Stable scenes use the 33 ms interval, rising to at most 100 ms under observed publication or previous-frame CPU pressure. This is a bounded-age approximation for dynamic distant casters, not exact temporal shadow invalidation. No global shadow disable, shader recompilation, or changed castShadow flags.

The far shadow target is labeled ShadowMapFarCascade for the existing asynchronous GPU QA profiler. A refresh request is not proof of GPU completion or a measured pass duration.

## Reflection capture

ReflectionAdmission is evaluated before the existing capture reservation. It does not introduce another CPU reservation, GPU query owner, render target or capture pool.

- Separate CPU estimates from ReflectionCaptureSchedule for cube and planar passes are compared with their configured limits. Estimates include the existing safety multiplier; they are CPU submission estimates, not GPU pass durations.
- The first due frame starts the deferral clock, including frames between existing stride turns. Cost or upload/frame CPU contention can defer an otherwise eligible capture. Cheap, uncontended captures keep their current cadence.
- Invalid maps or an unfinished cube receive a shorter admission deferral (80 ms); normal refreshes receive 250 ms. After this deadline, the new gate allows the next eligible capture attempt. It cannot bypass the original CPU reservation, capture stride, interval, residency checks or GPU queue completion. Thus these are deadlines for the new gate, not hard bounds on total capture latency or reflection age.
- GPU busy always blocks capture, even when overdue. No synchronous wait or readback is added.
- The existing completed cube remains published until all six replacement faces are complete. Existing invalidation and analytic fallback still apply when the scene/camera/origin invalidates captures. Planar projection and water-body height gating are unchanged.
- A failed main draw cancels pending capture reservations and restores shadow flags; existing reflection state restoration still handles a capture that throws.

## Diagnostics

New measured counters:
- farShadowAdmissionRefresh, farShadowAdmissionReuse, farShadowAdmissionAgeMs, farShadowAdmissionReason.*
- reflectionAdmissionGpuDeferred, reflectionAdmissionPressureDeferred, reflectionAdmissionCostDeferred, reflectionAdmissionDeadlineTurns, reflectionAdmissionEligible.cube/planar, reflectionAdmissionWaitMs
- Existing waterProbeFaces, waterPlanarCaptures, waterProbeRestarts, waterReflectionCpuMs, reflectionCaptureDeferredFrames, reflectionGpuDeferredFrames, reflectionGpuQueueLatencyMs and capture ages

Use the existing GPU pass profiler with --gpuTimings 1 to measure ShadowMapFarCascade and compare other shadow/depth and reflection capture contexts. GPU queue latency is backpressure, not pass time. The runtime is not yet a closed-loop measured GPU-millisecond allocator; independent measured GPU feedback remains TODO. A later phase may use calibrated per-pass GPU costs without installing competing timestamp hooks.

## Tests

11 isolated committed cases passed against the actual controller/config source, using mock camera/light/shadow objects and URL parser. The full Node/npm suite, lint, build, actual Three.js renderer integration, visual verification and RTX 4080 acceptance were not run in this editing environment.

```sh
npm ci
node --test test/auxiliary-pass-admission.test.js test/reflection-shadow-registry.test.js
npm run lint
npm test
npm run build
```

Use the same final candidate SHA and matched routes; test flags independently and combined. Preserve the existing QA GPU profiling and native focus requirements. A/B both arms with the same cascade count (two for the far-cascade trial). Do not compare a two-cascade candidate against a single-cascade control.

| Scenario | Acceptance |
| --- | --- |
| Stationary forest with two cascades | Far reuse increases; near shadows unchanged; lower actual far shadow render frequency |
| Moving and turning camera | Refresh thresholds measured cumulatively; no persistent stale shadow, clipping or visible cascade seam |
| Sun movement, terrain edit, town changes, teleport, origin rebase | Forced refresh, correct shadow alignment, no retained stale map after invalidation |
| Single shadow / WebGL fallback | No far-cascade intervention |
| Dense coastal city, forest lake, ocean | Preserve prior complete cube and planar validity; cheaper captures not unnecessarily delayed |
| Streaming and upload contention | New gate defers optional expensive capture; mandatory work continues; GPU busy never bypassed |
| Initial invalid cube and unfinished cube | Shorter deferral; no partial cube publication or stale fallback after invalidation |
| Main draw / reflection failure | Flags, render target and reservation state restored |
| Combined renderer and instance admission | Compare main CPU/GPU P95/P99/P99.9, peak streaming frames, captured reflection ages and shadow frequency |

Reject any candidate-only visual defects or frame-tail regressions. Keep the flags opt-in until headed WebGPU/WebGL measurements and screenshots are accepted.

## Remaining work

- TODO: use verified measured GPU pass costs to adapt admission thresholds, including per-cascade visibility and actual submission coverage.
- TODO: introduce independently budgeted distant town decorations, ground details and environmental effects; preserve all gameplay and near geometry.
- TODO: address oversized atomic GPU instance publications and camera-driven CPU impostor uploads.
- TODO: spatial QA overlay showing requested/admitted/active costs and auxiliary-pass deferrals.
