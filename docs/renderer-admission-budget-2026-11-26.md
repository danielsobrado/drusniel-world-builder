# Renderer-wide admission and transition reserve — implementation and acceptance

Control: 3a6519247f0904fb6063009a6a911560e499c2fe. Pin the candidate SHA before measurements. No GitHub Actions.

## Configuration

```yaml
rendererAdmissionBudget: false
regionalBudget:
  rendererAdmissionTriangleBudget: 4000000
  rendererAdmissionDrawBudget: 1500
  rendererAdmissionTransitionReserve: 0.15
  rendererAdmissionUploadHeadroom: 0.5
  rendererAdmissionMaxChanges: 8
```

All thresholds are initial estimates, not RTX 4080 measurements. The new flag enables local admission and geometry cost collection automatically, with renderer-wide admission taking precedence. Existing flags remain independent A/B controls. The limits are in effective triangle and draw-group units (main + shadow + weighted reflection). They are not identical to the renderer's actual draw or triangle counters. The steady-state limit leaves 15% of the configured global target for transitions: initially 3.4 million effective triangles and 1,275 estimated draw groups.

## Allocation

- Sample local cost alternatives using the existing canonical spatial controller. The shared planner starts with the local per-chunk decisions and further reduces them if the combined steady-state target is exceeded.
- Reserve fixed layers, protected camera/focus rings, and external resident demand. In renderer mode the collector also reads resident grass, town and wet slots outside the adaptive spatial radius, and available scenery manifests outside that radius. Cached manifests outside both the radius and an existing view plan are skipped. Outside-radius costs are reserved, not eligible for reductions. Views without a plan may overestimate retained manifests. The implementation does not cover every renderer object or shader pass.
- Choose additional demotions by ascending layer priority and decreasing distance from the nearer of focus and camera. Ties use stable canonical keys. Choose the finest affordable lower option or the minimum retained option if no alternative fits. Existing per-chunk limits and physical near guarantees are preserved as targets.
- The geometry sampler distinguishes currently selected positive-fade representations, current target, and active union (including a zero-fade incoming target). For each possible alternative it estimates the union of currently active bands plus that candidate. Grass cards reserve the greater of the current and requested prefix rather than summing the two. These are estimates, not a snapshot of all actual GPU buffers.
- At publication, apply demotions before promotions, retain previous factors for deferred changes, and grant at most eight layer/chunk factor changes per sample by default. Promotions require the lower steady-state recovery limit. Unknown active or mandatory cost anywhere in the sampled demand blocks discretionary promotions; an unknown candidate overlap blocks that change.
- A change must fit the transient target using the estimated union; no credit for retired geometry until a later sample. If already over capacity, demotions with no added overlap may proceed. One otherwise oversized demotion may proceed when there is no observed overlap or upload contention and no other change has been granted; the sample explicitly reports the overflow. No required geometry is removed to satisfy a quota.
- Read the live shared DeferredWorkBudget.remainingUploadBytes() immediately before publishing choices. Less than 50% of its allowance, or a pending/staged tree, rock or bush rebuild, suppresses optional quality increases and limits changes to one. This does not allocate another upload allowance, reserve bytes twice, or modify the existing mandatory-work policy. An oversized demotion may still proceed despite staged work if the measured upload allowance is not contended. The upload signal is the scheduler's tracked queued publication bytes, not physical GPU completion.
- Existing shared grass/water/town/preparation byte gates remain in place. The new controller throttles admission decisions; it does not yet estimate exact dirty-span bytes for each tree/rock/bush rebuild or impose a new atomic write cap on them. A single decision can rebuild a whole shared batch; no assertion of a hard upload-byte ceiling is made.
- Demand collection and local/global demotion search yield under the existing work allowance. Sorting and final transition selection/telemetry publication are synchronous; the candidate set is limited to the adaptive window and supported layers. Profile their actual overhead. Decisions publish only after complete samples. Large focus/camera jumps clear prior decisions. Protection is also checked live by the LOD/card consumers.

## Known limitations

The renderer-wide limits govern **estimated sampled resident scenery demand**. Untracked terrain, legacy grass, flowers, caves, separate geology, particle/effect passes, shader cost, frustum coverage, GPU culling and actual renderer-wide draw grouping remain outside this model. Shared batch draw groups are conservatively attributed to multiple chunks. Shadow and reflection costs remain approximations. Pending plan targets can differ from published mesh data; transitions due to camera movement are not blocked by this allocator. Local/steady targets can remain exceeded while changes wait, and protected/fixed reserves can be infeasible. Unknown and overflow diagnostics must be reviewed, not ignored. No measured FPS or memory improvement is claimed.

The global allocator is deterministic and greedy, not an optimal solver. The chosen priority order and headroom are configurable starting values. If the upload budget is disabled or not attached, the byte signal is unavailable (remainingUploadBytes = -1); pending rebuild checks still apply.

## Telemetry

- rendererAdmission.localTriangles/localDraws (local-only target)
- rendererAdmission.targetTriangles/targetDraws (combined desired target)
- rendererAdmission.admittedTriangles/admittedDraws (accepted factor decisions)
- rendererAdmission.activeTriangles/activeDraws, overlapTriangles/overlapDraws
- rendererAdmission.transientTriangles/transientDraws, fixedTriangles/fixedDraws
- rendererAdmission.steadyTriangleLimit/steadyDrawLimit
- rendererAdmission.changes/deferred/uploadDeferred/overlapDeferred/unknownDeferred/emergencyDemotions
- rendererAdmission.targetOverflow/admittedOverflow/transientOverflow
- rendererAdmission.unknownChunks/unknownActiveChunks/reducedChunks/chunks
- rendererAdmission.uploadContended/publicationBusy/remainingUploadBytes
- Existing regionalCostRequested.*, regionalCostSelected.*, regionalSpatialSamples, regionalSpatialSamplesCancelled, framePublicationUploadBytes, frameDeferredCpuMs, frameMaxDeferredUnitMs, frameDeferredUnitOverruns, renderer triangles/draws and GPU pass timings.

All gauges reflect the last complete sample. Compare estimates separately from actual GPU counters.

## Verification

44 isolated cases from renderer admission, regional admission, geometry and spatial regression files passed with mocked URL parser, performance counters and tree morphology dependency. Includes live controller publication with a one-item work allowance and teleport invalidation, external reserves, overlapping bands, zero-fade incoming bands, independent draw/triangle limits, priority and distance ordering, live upload state, unknown geometry and oversized progress. The actual Node test runner, lint, production build, browser, asset validation and RTX 4080 acceptance have not been run in this editing environment.

```sh
npm ci
node --test test/renderer-admission.test.js test/regional-admission.test.js test/regional-render-cost.test.js test/regional-spatial-budget.test.js tests/treeLodCameraDistance.test.js
npm run lint
npm test
npm run build
npm run validate:assets:production
```

Run matched control/candidate routes with identical seed, weather, camera, viewport, quality, backend and driver. Enable one mode at a time before combinations.

```text
?regionalAdmissionBudget=1
?rendererAdmissionBudget=1
?rendererAdmissionBudget=1&regionalDensityBudget=1
```

| Scenario | Acceptance |
| --- | --- |
| Dense forest + city + meadow | Combined target reduces low-priority distant layers before protected content; local pressure remains bounded |
| Multiple individually affordable chunks | Global target changes even when no individual chunk is overloaded |
| City approach and return | Compare requested, target, admitted, active and transient gauges with actual renderer and GPU workload |
| Rapid LOD changes | Count both representations; defer elective quality changes when overlap is excessive |
| Streaming / high upload load | Verify upload headroom gates promotions and mandatory shared publications continue |
| Sustained over-budget view | No indefinite stall from the transition gate when an eligible demotion can progress; emergency counter and overflow visible |
| Missing geometry | Unknown diagnostic; no unsafe uncosted promotion |
| Out-of-window residents | Fixed costs reserved, no reductions outside adaptive radius |
| Grass handoff / near ring / teleport / rebase | No missing required geometry, bald handoff or stale decisions |
| Flags off | Legacy output and behavior preserved |

Capture valid headed WebGPU RTX 4080 runs and WebGL fallback. Compare CPU/GPU P50/P95/P99/P99.9, worst streaming frame, draw counts, upload and deferred-work counters, memory, pending work and identical screenshots. Reject candidate-only failures, missing gameplay geometry, persistent visual artifacts, unbounded memory or frame-tail regressions. Calibrate thresholds only from valid hardware runs.

## Next work

- TODO: Integrate actual dirty-span byte estimates and safe resumable publication for tree/rock/bush batches, without delaying mandatory placement/interaction or adding a second allowance.
- TODO: Budget shadow cascade membership, reflection capture and environmental effects independently using measured GPU pass costs.
- TODO: Add optional distant town decoration, ground-detail, cave and geology alternatives with protected reserves.
- TODO: Add a spatial requested/reserved/target/admitted/selected and transition visualization to existing QA UI.
- TODO: Fully demand-driven source GLB loading requires a stable versioned prototype catalog.
