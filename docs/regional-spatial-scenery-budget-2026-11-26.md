# Spatial scenery budget — implementation and acceptance

Control: 0fda195a2c77bf251ff940373bedfe66b13144a1. Pin candidate SHA before running. No GitHub Actions. The independent regionalSpatialBudget flag defaults to false.

## Design

A single controller estimates the requested load for each canonical terrain chunk. It reads existing tree/rock/bush/detail manifests, completed raw grass tile outputs, town layout module positions and wet terrain slots. Counts are estimates, not actual renderer triangles, draw calls, GPU milliseconds or a hard resource cap. Retained manifests may overestimate demand, and missing/unprepared manifests can underestimate demand. Town module counts exclude doors and are independent of selected town tier. Grass tiles are assigned by center; wet slots are counted once. The scope excludes legacy non-meadow grass, separate flower slots, geology, individual shadow passes, cave objects and particle effects.

Town module indices are built incrementally from immutable layout arrays and cached by layout identity/chunk size. All collection work is sliced under the existing deferred-work deadline, with at most spatialWorkItems iterator advances per update. A town indexing step handles up to 64 module positions. The sampler visits only existing data and does not request additional manifests. It publishes no partial result. A sufficiently large focus jump or chunk-size change invalidates the sample window and resets local pressure. Resident maps can change during a sample; this is an advisory demand estimate, not an atomic scene snapshot. A moving camera may delay sample completion.

## Initial settings (unmeasured)

```yaml
regionalSpatialBudget: false
regionalBudget:
  spatialChunkRadius: 8
  spatialChunkBudget: 1200
  spatialLodFactor: 0.75
  spatialCardFactor: 0.8
  spatialWorkItems: 256
  spatialWeights:
    town: 1
    tree: 8
    rock: 3
    bush: 2
    blade: 0.01
    card: 0.15
    detail: 1
    water: 50
```

Existing sampleIntervalMs (1000), recoveryRatio (0.75) and protectedChunkRadius (1) also apply. The sampler covers a 17 by 17 focus-centered chunk window at default radius. Enter pressure when weighted demand exceeds 1200 units; recover at or below 900 units. These values must be tuned using hardware captures. No FPS gain is claimed.

Trees, bushes and rocks combine global and spatial factors by taking the minimum, not multiplying them. The existing projected LOD planner, radii and transition system remain authoritative. The protected focus and actual camera rings bypass additional pressure, and terminal visibility thresholds are unchanged. Collapsed representation radii can prevent savings. Houses, water, placement manifests, colliders, terrain and nearby blade geometry are not modified.

Far cards in pressured chunks publish a deterministic prefix of their existing compacted output through the normal page budget. Tiles crossing a chunk edge, within either protected ring or possibly within the blade/card overlap are excluded; the conservative handoff check uses the entire camera chunk. Raw card output remains available for recovery and demand estimation, avoiding feedback from the controller's own card reductions. Recovery may wait for existing publication budgets, including when the camera approaches a formerly pressured tile. Density changes can produce visible distant transitions; no new density fade is implemented. Compare those transitions visually. Card page capacity is unchanged, so reduced draw instances do not necessarily reduce allocated GPU bytes.

## Run

Use the existing acceptance instructions in regional-render-optimization-testing-2026-11-26.md and performance-hitch-testing-2026-11-26.md. Keep existing query parameters. Run flags off, spatial alone, global alone, and all flags together.

```text
?regionalSpatialBudget=1
?regionalTerrainProfiles=1&regionalLazyTrees=1&regionalTreeSourceRelease=1&regionalResourceBudget=1&regionalDensityBudget=1&regionalSpatialBudget=1
```

```sh
npm ci
node --test test/regional-spatial-budget.test.js test/regional-optimization.test.js tests/treeLodCameraDistance.test.js
npm run lint
npm test
npm run build
npm run validate:assets:production
```

Use an identical seed, weather, viewport, render scale, time of day and camera path. Save control/candidate exact SHA and all flags. Test headed WebGPU on the RTX 4080 and WebGL separately. Do not treat a backgrounded browser or a software adapter as acceptance.

## Telemetry

- regionalSpatialSamples, regionalSpatialSamplesCancelled, regionalSpatialSampledChunks, regionalSpatialPressuredChunks
- regionalSpatialDemandUnits, regionalSpatialPeakChunkUnits, regionalSpatialDemand.town/tree/rock/bush/blade/card/detail/water
- regionalSpatialCardsRequested, regionalSpatialCardsSelected, regionalSpatialCardsPublished
- rendererTriangles, rendererDrawCalls, frame P50/P95/P99/P99.9, worst streaming frame, page commits deferred, missing tile counts
- tree/rock/bush LOD counts; browser errors, GPU device loss, resource totals

The first two card gauges are full raw request and locally selected prefix across the entire card layer, not just sampled chunks. Published is the actual page instance tally, which may temporarily differ due to deferred commits. These are updated on card commits, not every frame. Counters are diagnostics, not evidence of GPU savings.

## Acceptance routes

| Route | Verify |
| --- | --- |
| Dense city beside forest and open meadow | Dense chunks choose cheaper scenery; open neighbours retain original LOD when only spatial flag enabled |
| Coastal town and river crossing | Water and terrain remain present; no broken shore effects |
| Forest approach and revisit | Same placement and collision; correct tree transition and impostor availability |
| Meadow handoff, chunk edges and reverse route | Blades and overlap intact; card density recovers; no persistent bald cells |
| Predictive focus offset, flying and rebase | Both protected rings respected; canonical chunk identities stable |
| Teleport and rapid world reload | Cancel superseded sample; no old-region pressure after new window; no resource leaks |
| Stationary dense scene | Hysteresis does not oscillate when the same raw demand stays constant |
| Forced low local budget | Budget engages only in selected chunks; verify diagnostics and recovery with sparse route |
| Flags off | No new local scenery changes; compare CPU overhead to control |

For stress tests use a separate local YAML with a low valid spatialChunkBudget, then restore production values. Capture identical screenshots and video across transitions. Reject candidate-only missing assets, invalid shaders, changed colliders, persistent visible holes, unbounded resource growth or frame-tail regressions. Compare measured benefit of spatial alone against global alone before enabling combined defaults.

## Remaining work

- TODO: Replace relative demand weights with cached per-prototype triangle and draw cost estimates, including shadow and reflection pass multiplicity; account for requested versus accepted cost by chunk and layer.
- TODO: Introduce shared hard admission quotas only after measured cost models and protected reserves exist. Do not hide required buildings, caves, water or interaction geometry.
- TODO: Integrate far town decorative tiers, ground-detail LOD, legacy grass, geology and environmental effect priorities with their existing schedulers. Add individual shadow/effect accounting and independent quality acceptance.
- TODO: Add per-chunk pressure and requested/accepted diagnostics to the existing QA overlay and spatial heatmap if needed. Preserve bounded sampler and publication work; profile full card layout invalidations on pressure changes.
- TODO: Consider density transition fades if distant card changes are visible. Verify prefix recovery after a rapid approach while upload work is deferred.
- TODO: True on-demand tree GLB downloads remain separate; the stable prototype catalog described in the previous acceptance guide is still required.

Validation here: seven focused repository test cases executed as isolated JavaScript with mocked URL parser and counters; one extracted actual chunk LOD planner check passed (protected near, pressured proxy, unpressured near). Node/npm runner, Three.js browser integration, asset validation, full lint/build and GPU acceptance were not executed.
