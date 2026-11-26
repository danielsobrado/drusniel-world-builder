# Regional rendering admission — implementation and acceptance

Control: 153103a92126df3cc1b2a8cd7794f8047f4dea0e. Pin candidate SHA before measuring. No GitHub Actions.

## Enable

The new regionalAdmissionBudget flag defaults to false. It activates the geometry cost model and spatial controller by itself. Previous count-based and geometry-based modes remain independent A/B alternatives; when admission is enabled it takes precedence over those spatial modes.

```yaml
regionalAdmissionBudget: false
regionalBudget:
  spatialTriangleBudget: 200000
  spatialDrawBudget: 100
  spatialReflectionPassWeight: 0.25
  admissionFactors: [1, 0.85, 0.7, 0.5]
  admissionPriorities:
    tree: 4
    rock: 3
    bush: 2
    card: 1
```

These are initial uncalibrated settings. Factors for vegetation are projected LOD threshold factors, not percentage triangle cuts. Factors for cards are density prefixes. Config accepts 2–8 strictly descending factors starting at 1, minimum 0.5, and priorities 0–100. Existing sample interval, recovery ratio and protected radius apply.

## Algorithm

- Per canonical chunk, sample existing geometry costs and the feasible quality alternatives exposed by the live LOD planner. Planner alternatives respect existing projected thresholds, physical near guarantee, representation radii, data readiness and terminal cull policy. No additional source requests or renderer allocation.
- Far card alternatives use the raw compacted output and the same conservative tile eligibility check as publication. Tiles spanning a chunk boundary, inside either protected ring or potentially in the blade/card handoff are included at full density. At least one card remains for each nonempty eligible tile.
- Fixed layers (town, water, blades, ground details) and protected chunks are reserved before choosing scenery upgrades. Use the visible town tier estimate when available; otherwise reserve full near town demand. Unknown requested costs fail open for that chunk, rather than pretending to guarantee a cap. Unknown alternatives are not used.
- Retain only successive alternatives that are no more expensive in either effective triangles or draw groups, and strictly cheaper in at least one. Reserve the cheapest retained visible alternative per adaptive layer. Upgrade in descending configurable priority order, stable tie order tree/rock/bush/card. A candidate must fit both limits. Quality increases from a previous reduced factor use the recovery margin. Fresh requests that already fit keep full quality.
- If reserved minimum is over budget, choose the minimum available visible alternatives and report overflow. No hard rejection of gameplay objects, water, nearby scenery or an entire chunk.
- Demand collection and per-chunk admission both yield under the existing work item and frame-deadline scheduler. Publish only after the complete window is processed. Changed layer factors increment the revision and invalidate relevant plan caches. Large focus/camera jumps, missing camera transitions, and chunk-size changes invalidate the sample window. Live LOD and card paths recheck protection.
- Admission is per chunk, not a renderer-wide shared quota. Distance is represented by projected screen size, radii and the camera/focus protection rings; relative priorities within a chunk are fixed by layer, not per individual object. It is a deterministic greedy allocator, not globally optimal knapsack selection.
- When admission is active the old global LOD factor does not additionally change tree/rock/bush choices. The optional independent global density controller can still shorten far grass reach; compare admission alone first. Grass prefix changes retain existing page publication budgets; crossfades retain existing transition semantics.

## Budget guarantees and limits

The allocator enforces two limits on its **sampled steady-state estimates** when all mandatory and minimum visible costs fit. It does not enforce a hard GPU limit, actual draw submission count, actual triangle count, or hard frame-time bound. The cost model has the limitations documented in regional-geometry-cost-budget-2026-11-26.md. Shared batches can be over-attributed, cluster geometry is approximate, shadow and reflection membership is estimated, and sampling is not an atomic scene snapshot.

Camera movement, changing placement manifests, previous-band hysteresis, pending GPU page commits, and overlapping LOD crossfades can cause selected or submitted workload to differ from admitted cost. Neither overlapping transitions nor publication delays are explicitly admitted by this phase. The existing geometry requested/selected counters remain useful for comparison. Final summary evaluation and LOD plan alternative construction are synchronous bounded-window work and need CPU profiling. No performance improvement has been measured.

## Telemetry

- regionalAdmission.chunks, reducedChunks, protectedChunks, overflowChunks, unknownChunks
- regionalAdmission.requestedTriangles, admittedTriangles, reservedTriangles
- regionalAdmission.requestedDraws, admittedDraws, reservedDraws
- regionalAdmission.treeReduced, rockReduced, bushReduced, cardReduced
- Existing regionalCostRequested.*, regionalCostSelected.*, regionalCost.<layer>.*, regionalSpatialSamples, regionalSpatialSamplesCancelled and regionalSpatialCardsRequested/Selected/Published
- Renderer triangles/draws, GPU pass timings, frame P50/P95/P99/P99.9, streaming tail, pending publication, dropped instances, resource residency, browser errors

The admission totals are sums of per-cell effective costs, not actual frame render counters. Unknown-chunk overflow counts represent known costs only. Counters are updated when a complete sample publishes; after cancellation they may describe the last completed sample until a new one publishes.

## Test

```sh
npm ci
node --test test/regional-admission.test.js test/regional-render-cost.test.js test/regional-spatial-budget.test.js tests/treeLodCameraDistance.test.js
npm run lint
npm test
npm run build
npm run validate:assets:production
```

Compare immutable control and candidate snapshots, same seed, camera route, viewport, render scale, weather, time, quality, driver and backend. Test flags off and modes separately before enabling combinations.

```text
?regionalSpatialBudget=1
?regionalGeometryCostBudget=1
?regionalAdmissionBudget=1
?regionalAdmissionBudget=1&regionalDensityBudget=1
```

| Route / case | Acceptance |
| --- | --- |
| Dense town at forest edge | Fixed town reserve; trees retain higher priority than bushes/cards when feasible |
| Low triangle / draw limits | Both dimensions enforce sampled steady-state feasibility; overflow diagnostic when reserves cannot fit |
| Sparse chunks beside dense ones | Sparse cells remain unmodified; independent layer factors only where needed |
| Physical near and predictive focus | Both protected rings and force-near radii respected |
| Fast approach, retreat and rebase | No persistent missing scenery; old-region decisions cleared on teleport; stable recovery |
| Grass tile edge and handoff | No thinning at protected boundaries; prefix recovery through normal publication |
| Impostor unavailable and cluster band | Safe fallback geometry and no new terminal culling |
| Missing or delayed prototype metadata | Unknown or fixed reserve behavior; no forced asset request |
| Stationary threshold stress | No oscillation with stable raw inputs; quality recovery respects hysteresis |
| Fixed mandatory cost over budget | Preserve essential geometry; report overflow |
| Shadow and reflection variants | Compare estimates with actual pass counters; verify no changes to water or shadows |
| Flags off | Legacy output unchanged; compare CPU and GPU baseline |

Run on headed WebGPU RTX 4080 and WebGL separately. Reject candidate-only shader failures, missing required geometry, changed collision, persistent visible holes, new frame-tail regressions or unbounded memory growth. Save exact SHA, query parameters, performance logs and matching screenshots.

## Validation here

29 isolated committed cases (new admission cases and earlier spatial/geometry tests) passed using mocked URL parser, counters and morphology dependency. One extracted real LOD planner integration check passed for per-layer factor, protected ring, independent neighbouring chunk and physical near guarantee. The full Node/npm runner, lint, production build, asset validation, browser and GPU acceptance were not run in the editing environment.

## Remaining work

- TODO: Add admission for transient LOD overlap and upload costs, renderer-wide quotas across chunks, and pass-specific visibility and measured GPU timings.
- TODO: Add adaptive distant town decoration and ground-detail alternatives without changing collision, interactive interiors or settlement identity.
- TODO: Incorporate environment effects, cave and geology costs; budget shadow cascades and reflection captures independently.
- TODO: Add requested/reserved/admitted/selected per-cell visualization to the existing QA overlay. Calibrate priorities and budgets with actual hardware measurements.
- TODO: Fully demand-driven tree GLB downloads still require stable versioned prototype metadata.
