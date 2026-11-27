# Shared GPU compute workload admission

Base: f75e282bddb404667da8f00cdf207f06bcef04c1. No GitHub Actions.

## Activation

```text
?gpuComputeAdmission=1
```

Opt-in, WebGPU only. Enable each existing workload in quality config for coverage. One renderer-scoped budget during world frames. Location mode, startup, standalone and non-WebGPU paths retain normal behavior.

## Policy

The existing CPU deferred-work budget does not model GPU dispatch workload. This trial adds weighted **credits**, not milliseconds or measured workgroups. Defaults: 32 credits/frame with 8 reserved for mandatory work. FFT charges one per kernel dispatch; snow three per step, Hi-Z eight per preparation attempt; impostor one, ripple/swash/deformation two per dispatch. These are provisional relative weights, not measurements. Accounting is conservative (attempts/reservations, not necessarily executed dispatches). Mandatory work can exceed the limit; the reserve is not a hard limit and deadline turns may also overflow. No queue waits, no GPU readback, no global renderer monkey patch.

- FFT: retain the complete last slope texture and its spectrum while an ordinary refresh waits (34 ms due-time deadline). Initial transforms, explicit weather settle, time seeks and device changes cannot wait. Resume at absolute water time; never split a transform or skip output publication validation. Weather elapsed time is accumulated through the existing clamped wall-clock calculation.
- Snow particles: cosmetic steps may wait for up to 34 ms of due time; accumulate elapsed simulation delta capped at 80 ms, preserve last submitted focus/player position and apply the whole shift on resume. First initialization, large focus displacement or reaching the delta cap force work. Clear waiting state when inactive. Existing floating-origin translation remains in place.
- Hi-Z: may skip a preparation attempt for up to 100 ms. Clear active indirect records and draw normally, never reuse a previous camera's cull. Existing diagnostic effectiveness cooldown remains independent. This may increase draw cost; compare actual frame GPU cost before production enablement.
- Impostor culls/resets (including first-use warmup), ripple ping-pong, persistent shoreline pairs and snow deformation pairs are mandatory and charged; never lose an impulse, use stale indirect arguments or split a solver step.
- Per-owner wait state uses weak keys, reset on clock gap, suspend/location entry and explicit cancellation. No global queue/fence.
- Diagnostics: gpuCompute.frameCredits, mandatoryCredits, optionalCredits, deferred, deadlineTurns, overflowCredits; per-kind gpuCompute.<kind>.credits/admitted/deferred/deadline. No measured savings claimed.

## Limits / TODO

Weights do not scale by all kernel sizes, memory bandwidth, depth pass or FFT output draw/mipmap cost. They are not GPU time estimates. Mandatory work is not throttled and optional deadlines are admission deadlines, not GPU completion guarantees. The policy is order-dependent; simultaneous deadline turns can exceed quota. World-wind render fields, voxel compute and third-party/other compute producers are not universally intercepted. TODO: collect real per-kernel timestamp evidence (including raw Hi-Z command encoders) and calibrate per-profile costs; audit whether Hi-Z bypass saves total GPU time. No blocking timing or new timestamp owner in this phase. The isolated regression harness exercises the budget plus real controller methods with mocked GPU and vector dependencies. Full npm, lint, build and hardware acceptance pending.

## Verification

```sh
npm ci
node --test test/gpu-compute-budget.test.js
npm run lint
npm test
npm run build
```

Run existing FFT, snow, ripple, coastal swash, impostor and occlusion suites as part of npm test. Compare headed WebGPU routes on the RTX 4080 with flags off/on, coast plus dense settlement, storm and alpine snow, rapid turns, rebase and teleports, pause/location entry/exit, camera cuts and GPU fallback. Lower frameCredits in a fixture to force contention. Verify first-use FFT, unchanged-time QA, explicit settle, snow delta/shift, continuous solver pairs and normal draws on skipped Hi-Z. Inspect counters and P95/P99/P99.9; validate image continuity and GPU errors. No actual GPU benchmark yet.
