# Location GPU restoration: offline and RTX 4080 acceptance

## Gate 0 — mandatory offline preflight

Use latest clean main; record exact SHA, Node/npm, locked Three r187 and hardware/driver/browser. Keep unrelated concurrent commits. No GitHub Actions. Run npm ci, npm run lint, npm run check:natural-ui, npm run validate:assets:production, npm test, npm run build. Run all location residency/warmup/early-retirement/transition-gate tests and FFT/reflection/post-processing tests individually if needed. Use actual package.json and scripts' supported arguments. Do not suppress or weaken failures; compare to pinned control 891188e (resolve exact commit and check compatibility), and record baseline-only failures separately. Fix candidate-only defects on main with regression coverage, then rerun. Stop hardware acceptance until required offline checks pass. No blanket waiver for stale asset fixtures.

## Gate 1 — controlled experiment

Create local worktrees/snapshots of candidate and same-SHA flag-off control, plus an optional prior-commit comparison. Same map seed, quality, camera, resolution, browser build, GPU, driver, power profile, time/weather, asset cache and route. Confirm actual NVIDIA WebGPU adapter, not SwiftShader or WebGL. Keep browser foreground; reject invalid/focus-lost captures. Use repository QA tooling (inspect scripts/capture-locations.mjs, scripts/run-perf-qa-windows.mjs, scripts/run-perf-qa.mjs and water/post/recovery harnesses). Add a local deterministic transition harness if existing scripts do not capture required evidence. Never claim unsupported flags or metrics.

A: all candidate restoration flags off (same commit).
B: reclamation only (enable surface reclamation and supported category flags).
C: reclamation + staged warmup + early retirement.
D: C + queue completion gate.
E: D + optional FFT compute. Compare one feature at a time when attribution is unclear.

URL query names (set =1; off =0):
- locationSurfaceReclamation
- locationSurfaceMeadowReclamation, locationSurfaceSceneryReclamation, locationSurfaceGpuImpostorReclamation, locationSurfaceTownReclamation, locationSurfaceTerrainBakeReclamation
- locationSurfaceOceanFftReclamation, locationSurfaceReflectionReclamation, locationSurfacePostReclamation, locationSurfaceAtmosphereReclamation, locationSurfaceShadowReclamation, locationSurfaceEnvironmentReclamation
- locationSurfaceAdaptiveReclamation, locationSurfaceExitWarmup
- locationSurfaceShadowWarmup, locationSurfacePostWarmup, locationSurfaceAtmosphereWarmup, locationSurfaceEnvironmentWarmup
- locationSurfaceOceanFftWarmup, locationSurfaceReflectionWarmup, locationSurfaceEarlyLocationRetirement, locationSurfaceTransitionGpuGate, locationSurfaceOceanFftWarmupCompute

Verify resolved configuration and observed admission/retirement counters. If natural memory pressure does not exercise adaptive features, use a documented test-only low/high threshold override without enabling it in production. Keep default-policy results separate from stress runs. Compare legacy fixed-cap reclamation and adaptive mode separately. Zero evictions/warmups is not a successful exercise.

## Gate 2 — scenarios

At least five valid repetitions per variant/scenario, interleaved control/candidate, 720p and native 1080p or actual target resolution. Include cold and warm cache runs separately. Record underground steady-state, approaching exit, full loading transition, first 120 surface frames, 30 seconds afterward and revisit. Inland mine/cave, Stonehold, Frostgard ice (SSR/AO/bloom), freshwater, coastal settlement with ocean FFT and planar/cube reflections; cinematic/volumetric/screen-space and standard post paths; shadow cascades and HDR metallic materials. Test linked location travel, abort before/after commitment, repeated returns (20 cycles), setting/resize while underground, low budget and memory pressure, device loss/recovery and foreground loss. Confirm both render paths held only during irreversible early return, no input lock, persisted anchor correct, no camera-cut deadlock. No speculative FFT inland or freshwater, no invalid capture publication, no stale history/shaft/shadow artifacts. Verify PMREM reuse, and account for first-frame regeneration of non-admitted resources. Run existing settlement, free-flight, water, weather, postprocessing and recovery regression scenarios.

## Gate 3 — measurements and decision

Record raw per-frame CPU/GPU timings where actually supported, frame-time median/p95/p99/max, >33.3 ms and >50 ms counts, loading duration, first-return window, renderer memory total/texture/buffer counts, external GPU process VRAM if available (label separately), peak overlap and retained memory after repeated cycles. Record all locationSurface counters plus compute/admission counters; capture console, uncaught errors, GPU validation and device-lost logs. Collect same-camera screenshots before/after for each visual path, especially metal reflections, shadows, cave SSR, water and dormant shafts. Do not conflate allocation charges, GPU time and VRAM. Proposed engineering acceptance thresholds (not measured guarantees): zero new correctness or validation errors; no systematic visual regression; p95/p99 steady-state and first-return regression no more than 5% versus matched control, with noise/repetition caveats; no unexplained monotonic residency increase across 20 cycles; report loading-time tradeoff explicitly. A claimed performance gain needs repeatable evidence of lower first-return tails or peak memory. For an unexercised feature or inconclusive timing, mark NOT TESTED or INCONCLUSIVE, not PASS. Tune or disable features whose benefit is absent; don't enable defaults without evidence and explicit recommendation.

## Evidence and commit

Store compact reproducible reports, configuration, commands, SHAs, raw JSON/CSV, logs and representative PNGs under docs/qa/location-gpu-restoration/<run-id>/; keep large traces/videos outside git with hashes and paths. Include summary.md with PASS/FAIL/INCONCLUSIVE per feature and scenario, blockers, decisions, numerical before/after, screenshots and remaining TODOs. Commit QA evidence and necessary targeted fixes to latest main, no force pushes or GitHub Actions. Return exact commit links. If offline failures remain, report them before hardware acceptance; do not mark the system production-ready. A global gameplay scheduler redesign is not part of acceptance unless profiling establishes a concrete bottleneck.

## Code review follow-up

The transition harness now rejects missing NVIDIA WebGPU identity, readiness, foreground focus, browser errors, incomplete cycles, missing accounted memory and fewer than 120 first-return frames. It records first-return from the runtime's actual release of scene ownership, including frames during camera-cut completion, rather than after the exit promise resolves. Version 2 raw frame rows add renderer-accounted memory (not physical VRAM). Partial captures retain diagnostic evidence but cannot pass the capture gate. The harness verdict is capture eligibility only; visual and performance acceptance still requires the complete protocol. Cancellation before early-return restoration now clears stale surface state; cancelled legacy restoration preserves remaining resource records for retry. Queue completion observes the time ceiling even if a fence resolves after it. Run targeted tests and full preflight before hardware acceptance.
