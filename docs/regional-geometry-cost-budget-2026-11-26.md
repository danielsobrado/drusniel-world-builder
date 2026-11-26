# Regional geometry cost budgets — implementation and acceptance

Control: 61aa35cb71e967df47e5e9fdd82897bfd7a7795d. Pin the candidate SHA before measuring. No GitHub Actions. The new flag defaults to false.

## Implementation

Enable regionalGeometryCostBudget=1 to select geometry-based spatial pressure. This also activates the spatial controller, even if regionalSpatialBudget is false. The original count-weighted mode remains available independently for A/B comparison. The global density controller remains independent.

Geometry estimates use the index count or position attribute count and the geometry draw range. Each single-material prototype part is one estimated draw group. Instancing multiplies triangles but not draw groups within a cell. Shared batches spanning multiple chunks are attributed to each relevant chunk, so summing cell draw groups does not equal renderer draw calls. Groups, multi-material splits, internal compute, meshlet occlusion, frustum and shadow cascade coverage, shader complexity and fragment/overdraw costs are not modeled.

The existing deferred sampler reads resident manifests in bounded slices (up to 64 placements per iterator step), caches prototype geometry costs by identity and full near town costs by immutable town mesh/layout, and only publishes complete samples. Plan entries retain an independent unpressured projected baseline when this mode is enabled. Requested cost uses the baseline without transition hysteresis; selected cost includes each positive-fade representation at full triangle cost, even during crossfades. Tree impostors use existing billboard geometry when morphology-compatible and available; otherwise proxy geometry is charged. Cluster aggregation uses a per-tree proxy approximation, and deadwood extras/understory are not independently included. Rock/bush proxy bands may share actual draw groups; the estimator may overcount them. Missing or unavailable metadata contributes unknown counts, and affected chunks fall back to the previous weighted pressure in addition to known geometry limits.

Town demand reports full near kit, including published door modules. Selected costs read currently visible near/far instance rows, including split towns and interior subsets. Pressure reserves selected town cost when available, rather than charging every far building at near-tier cost; if selected metadata is unknown, full near demand is retained. The controller does not change town geometry, animation, collision, visibility or tier-selection policy.

Grass estimates use raw compacted outputs and their built template; selected far cards use the current regional prefix factor. These are selection estimates, not proof that every deferred GPU publication has completed. Water uses wet slot geometry and is excluded from the reflection re-render estimate. Ground detail uses prototype costs; legacy grass, flower slots, separate geology, cave objects, particle effects and explicit environmental effect passes remain outside scope.

Shadow workload multiplies eligible near tree trunks/crowns, rocks, shadow-enabled details and opaque near town parts by the configured cascade count. This is a potential pass workload, not actual cascade membership. Bushes, grass, proxies, impostors and far town tiers are not charged for shadow casting. Reflections model one auxiliary scene pass when reflections are enabled and wet slots are resident. The configurable reflection weight amortizes that estimate for pressure; actual capture scheduling, face coverage, exclusions, visibility, and GPU completion are not measured here.

## Initial settings (unmeasured)

```yaml
regionalGeometryCostBudget: false
regionalBudget:
  spatialTriangleBudget: 200000
  spatialDrawBudget: 100
  spatialReflectionPassWeight: 0.25
```

Effective triangles = main + shadow + reflection * spatialReflectionPassWeight. Effective draw groups use the same formula. Pressure enters if either threshold is exceeded, and recovers using existing recoveryRatio (0.75). Protected focus/camera rings, physical near requirements, terminal visibility, grass handoff, and local card density safeguards are unchanged. Global and spatial reductions still use the minimum LOD factor, not multiplication.

## Validation

The isolated editing environment executed 17 committed geometry/spatial test cases with mocked URL parser, performance counters and morphology dependency; all passed. An extracted actual chunk LOD planner integration check passed (requested near, selected proxy, neighbouring near unchanged). The repository Node/npm runner, lint, build, asset validation, Three.js browser integration and RTX 4080 hardware acceptance were not executed.

```sh
npm ci
node --test test/regional-render-cost.test.js test/regional-spatial-budget.test.js test/regional-optimization.test.js tests/treeLodCameraDistance.test.js
npm run lint
npm test
npm run build
npm run validate:assets:production
```

Compare immutable control/candidate snapshots with the same world seed, camera route, weather, viewport, quality, backend and driver. Use the previous regional-spatial-scenery-budget-2026-11-26.md and performance-hitch-testing-2026-11-26.md acceptance guides. Capture flags off, count-weighted spatial alone, geometry spatial alone, and combined with the global controller.

```text
?regionalSpatialBudget=1
?regionalGeometryCostBudget=1
?regionalGeometryCostBudget=1&regionalDensityBudget=1
```

### Diagnostics

- regionalCostRequested.triangles/draws/shadowTriangles/shadowDraws/reflectionTriangles/reflectionDraws/unknown
- regionalCostSelected.* (same fields)
- regionalCostPeakEffectiveTriangles, regionalCostPeakEffectiveDraws, regionalCostFallbackChunks
- regionalCost.<layer>.requested.triangles/draws and regionalCost.<layer>.selected.triangles/draws
- regionalSpatialPressuredChunks, regionalSpatialSamples, regionalSpatialSamplesCancelled, regionalSpatialCardsRequested/Selected/Published
- rendererTriangles, rendererDrawCalls, GPU timestamps, CPU P50/P95/P99/P99.9, worst streaming frame, dropped impostor records, pending page commits and resource totals

Estimate counters are advisory and cover the sampled window. Peak effective counters use the cost actually evaluated for pressure, including selected town reserve. Do not compare summed per-chunk draw groups as exact renderer draw calls. Record capture and shadow settings with every measurement.

### Acceptance routes

| Route | Checks |
| --- | --- |
| Dense forest and sparse forest | Cost scales with geometry rather than raw count; expensive species differ; sparse neighbours unchanged |
| Tree LOD transition and atlas fallback | Both positive-fade representations accounted for; fallback remains visible; no new holes |
| Large settlement approach and revisit | Town split/interior tiers reflect visible rows; full near demand does not by itself pressure distant low-cost towns |
| Meadow blade/card handoff | Raw requests independent of local prefix; actual published count recovers; no persistent bald tiles |
| Coast and inland | Wet reflection estimate present only while eligible; no water changes |
| One/two shadow cascades and crown shadows off/on | Expected shadow cost differences; compare actual GPU captures, not just estimator |
| Low triangle/draw threshold test | Either threshold can engage pressure; recovery hysteresis and protected rings remain intact |
| Teleport/rebase and fast camera movement | Canonical coordinates, no stale pressure after window invalidation; bounded sampling and no visible regression |
| Missing prototype metadata and delayed manifest | Unknown/fallback diagnostics; no demand-driven asset loading; correct recovery |
| Flags off | Existing behavior and plan entry shape preserved; compare CPU overhead |

Use headed WebGPU on RTX 4080 and separate WebGL fallback. Reject candidate-only shader/asset failures, changed placement/colliders, persistent visual holes, unbounded memory growth and frame-tail regression. Calibrate thresholds and the reflection multiplier only from valid measured runs. No FPS or memory gain has been measured.

## Next work

- TODO: Calibrate the cost model against actual pass counters and GPU timestamps, including per-cell batch attribution, cluster counts, shadow membership, reflection visibility and fragment cost.
- TODO: Add a shared hard admission allocator with protected reserves, requested versus accepted representation costs, stable priorities and bounded publication. Never cull required gameplay geometry to satisfy a soft target.
- TODO: Add adaptive distant town decorations, separate ground detail/geology/effect budgets, and pass-specific shadow/reflection admission. Retain all near interactive geometry.
- TODO: Add spatial pressure/cost overlay for debugging and regression capture.
- TODO: Fully demand-driven tree GLB downloads still require a versioned stable metadata catalog.
