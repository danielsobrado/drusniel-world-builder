# Measured GPU admission for shadows and water reflections

Base: 7cd08ad4226d71a9d8e77ffeed79b6ae793471d3. No GitHub Actions.

## Activation

```text
?measuredGpuAdmission=1&farShadowAdmission=1&reflectionAdmission=1
```

Enable existing cascaded shadows and water reflections in the quality settings. All three admission flags remain independently opt-in. No additional timestamp query owner. The runtime samples at alternating configured interval and interval+1 to reduce stride aliasing with captures. QA retains its configured cadence.

## Design

- Reuse GpuPassProfiler and the pinned r187 backend timestamp UID. Record a separate completed gameplay render window (main draw and existing after-main water capture), excluding pre-render shader warmup, asset baking and draw preparation. A missing query invalidates the gameplay sample, while the existing QA report remains available. No blocking readback or queue synchronization.
- Name actual cube-face and planar render targets. Only exact names and the existing far cascade label contribute to auxiliary cost; near shadows and generic depth targets are not attributed. No count-based cost estimate and no attribution of compute or upload time.
- AuxiliaryGpuFeedback is separate from atmospheric group selection but shares the profiler and existing render target/recovery, sample age, dwell and sample-count settings. Distinct expensive observations under high measured total render cost apply soft pressure to that pass only; low total observations of that same pass recover. Skipped passes are unknown, not free or recovery observations. Expire stale per-pass evidence; scope changes, debug, underwater, location mode, unsupported backend and query errors restore conventional CPU admission.
- Trial thresholds in YAML: far shadow 1.5 ms, cube face 1.5 ms, planar 2 ms. These are tuning values, not measured RTX 4080 costs. Far shadow pressure only extends the existing age interval to the configured maximum. Movement, sun, projection, origin, scene revisions, invalidation and near cascade behavior remain unchanged.
- Reflection measured pressure joins the existing soft deadline gate, independently by kind. Invalid or partial captures retain the shorter urgency deadline; queue-busy remains a hard gate. No resolution changes, no partial cube publication, no additional reflection targets.
- Diagnostics: auxiliaryGpuAdmission.fresh, auxiliaryGpuAdmission.<group>.ms/pressured/transitions, farShadowMeasuredPressureFrames, reflectionAdmissionMeasuredGpuDeferred.

## Limits

Sparse timestamp samples may miss captures or underestimate due to skipped/unsupported queries; QA fixed cadence can alias with capture stride. Per-pass expiry is deliberately fail-open. The sampled sum measures render passes, not frame GPU wall time, compute, upload or queue completion. No guarantee of GPU headroom or reflection latency under sustained queue backpressure. Existing near cascade and non-water environment capture behavior is unchanged. TODO: measure real hardware and tune thresholds; consider other independently controllable environment capture producers only if attribution and freshness can be proven. No hardware acceptance claimed.

## Verification

```sh
npm ci
node --test test/gpu-pass-feedback.test.js test/auxiliary-pass-admission.test.js test/reflection-capture-schedule.test.js
npm run lint
npm test
npm run build
```

Compare identical headed WebGPU coastal and settlement routes: flags off, CPU admission only, measured admission combined, forced WebGL and timestamp-unavailable devices. Include stationary views, movement, turns, sun changes, rebase, scene edits, water invalidation, partial cube captures, planar reflections, underwater transitions, location entry/exit and diagnostic views. Inspect actual named pass samples and pressure transitions, age deadlines, image continuity, near shadows, queue deferral, P95/P99 and readback overhead. Verify no gameplay measurements from preparation and no duplicate timestamp owner. Full npm/browser/hardware validation pending.
