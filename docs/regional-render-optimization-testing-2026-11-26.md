# Regional rendering: second-pass acceptance

Baseline: commit 076237ead80ea70ef9606087716d105fa8f9e3c0. All four experimental controls default to false in config/render-enhancements.yaml until accepted. No GitHub Actions.

## Configuration and A/B runs

Keep seed, pose, viewport, render scale, weather, time of day, renderer backend and camera route fixed. Compare baseline, current main with all four flags off, each individual flag on, and all four on. Test both cold startup and warm revisit; save exact commit and query string.

```text
?regionalTerrainProfiles=1&regionalLazyTrees=1&regionalResourceBudget=1&regionalDensityBudget=1
```

Use the existing QA entry points in performance-hitch-testing-2026-11-26.md and regional-render-residency-2026-11-26.md. Preserve existing query parameters when adding these flags.

```sh
npm ci
node --test test/regional-optimization.test.js test/regional-variant-residency.test.js test/water-feature-profile.test.js test/tree-impostor-integrity.test.js tests/treeImpostorRuntime.test.js tests/movementPrepared.test.js
npm run lint
npm test
npm run build
npm run validate:assets:production
```

## Proposed starting budgets (not measured)

| Setting | Default |
| --- | --- |
| Renderer-accounted total | 4096 MiB |
| Tracked regional textures | 256 MiB |
| Idle grace period | 30000 ms |
| Sample interval | 1000 ms |
| Retirement budget | 1 item per update |
| Triangle pressure | 4000000 |
| Draw pressure | 1500 |
| Town instance pressure with vegetation | 3000 |
| Far grass card reach under pressure | 0.85 |
| Recovery ratio | 0.75 |

Town-kit retirement is separate and may release multiple resources at once. A tree pool allocation/disposal is also indivisible. Tune these thresholds from measured hardware results, not assumed FPS.

## Visual and lifecycle matrix

| Route | Required checks |
| --- | --- |
| Dry desert to meadow to forest | Correct arid/grass material variant, seamless edges, no missing vegetation |
| Forest with rare species | Stable prototype indices and placement, near geometry and proxy continuity, only demanded impostor atlases |
| Glacier, warm forest in snowstorm | Dynamic snow and rain remain; glacier shading only when required; no missing snow |
| Lake, coast, rivers | Existing water feature variants, reflections and shoreline unchanged |
| Dense city with surrounding meadow | Pressure can reduce far card reach only; nearby grass, houses and collision unchanged |
| Leave city and forest for over 30 seconds, revisit | Idle resources retire and reload correctly; no stale materials or missing trees |
| Rapid teleport and floating-origin rebase | Late atlas completions released, active/pending resources protected |
| Cave entry and exit | Existing separate scene behavior, no surface resource regressions |
| Repeated cold/warm traversal | Memory plateaus or decreases; no device loss, shader errors, missing materials or sustained hitch regression |

Inspect actual WGSL/WebGPU validation and output of the new conditional atlas sampling branches, including steep surfaces, derivative-sensitive sampling and mixed boundaries. Do not enable the terrain option if validation or visuals regress.

Record renderer memory, texture and geometry counts, frame P50/P95/P99/P99.9, worst streaming frame, shader preparation failures, screenshots and resource counters:
- regionalRendererAccountedBytes, regionalRendererBudgetExceededBytes, regionalRendererAccountingAvailable
- regionalTrackedTextureBytes, regionalTextureBudgetExceededBytes, regionalTextureEvictions, regionalTextureBytesEvicted
- regionalIdleResourceRetirements, regionalTreePoolsAllocated, regionalImpostorAtlases, treeImpostorAtlasBytes, regionalTownKitEvictions
- regionalFarGrassReachFactor, draw calls and triangles

Accept only with no new failures, no visible regressions except the explicitly enabled far-card reach reduction, no collision/placement changes, no unbounded memory increase and better or neutral frame tails. Use the existing RTX 4080 performance targets from the hitch testing guide. Test WebGL fallback separately.

## Scope and outstanding work

Terrain profiles omit grass-detail, arid and glacier-specific nodes when eligible, but retain dynamic snow/weather and forest shading. The terrain family atlas remains shared: conditional sampling avoids unnecessary projections, not allocation of individual terrain layers. Regional atlas streaming applies to tree impostors; owned inactive terrain/water slot textures may be retired and re-created. Full tree source GLBs and CPU prototypes remain loaded to preserve stable prototype ordering, collision and impostor signatures; only renderer pools and impostor textures are demand-driven. The memory budget uses renderer accounting, not driver VRAM, and cannot enforce a hard cap if active allocations exceed it. Material disposal releases Three-owned references, not guaranteed driver pipeline eviction. Density control changes far grass-card reach only; it does not allocate per-cell quotas across all scenery or change physical placements. Impostor failures retain proxies; inspect integrity diagnostics before acceptance. Full browser and GPU tests remain required.
