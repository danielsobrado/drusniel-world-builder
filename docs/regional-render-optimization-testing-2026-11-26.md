# Regional rendering: second-pass acceptance

Original baseline: commit 076237ead80ea70ef9606087716d105fa8f9e3c0. Third-pass control: ee9c42692eb5762043935a81387873e253bead77. All five experimental controls default to false in config/render-enhancements.yaml until accepted. No GitHub Actions. Pin the actual candidate SHA before each run.

## Configuration and A/B runs

Keep seed, pose, viewport, render scale, weather, time of day, renderer backend and camera route fixed. Compare the original baseline, third-pass control, current main with all five flags off, each individual flag on, and all five on. Test both cold startup and warm revisit; save exact commit and query string.

```text
?regionalTerrainProfiles=1&regionalLazyTrees=1&regionalTreeSourceRelease=1&regionalResourceBudget=1&regionalDensityBudget=1
```

Use the existing QA entry points in performance-hitch-testing-2026-11-26.md and regional-render-residency-2026-11-26.md. Preserve existing query parameters when adding these flags.

```sh
npm ci
node --test test/regional-optimization.test.js test/regional-variant-residency.test.js test/water-feature-profile.test.js test/tree-impostor-integrity.test.js tests/treeImpostorRuntime.test.js tests/movementPrepared.test.js tests/treeLodCameraDistance.test.js tests/worldNoise.test.js test/stylized-tree-texture-lifecycle.test.js
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
| Scenery projected LOD factor under pressure | 0.85 |
| Protected focus/camera chunk radius | 1 |
| Recovery ratio | 0.75 |

Town-kit retirement is separate and may release multiple resources at once. A tree pool allocation/disposal is also indivisible. Tune these thresholds from measured hardware results, not assumed FPS.

## Visual and lifecycle matrix

| Route | Required checks |
| --- | --- |
| Dry desert to meadow to forest | Correct arid/grass material variant, seamless edges, no missing vegetation |
| Forest with rare species | Stable prototype indices, source signature and placement; near/proxy continuity; only demanded impostor atlases; source GLB release must not change alpha, normal, roughness, emissive or bark channels |
| Glacier, warm forest in snowstorm | Dynamic snow and rain remain; glacier shading only when required; no missing snow |
| Lake, coast, rivers | Existing water feature variants, reflections and shoreline unchanged |
| Dense city with surrounding meadow | Pressure can reduce far-card reach and distant tree/rock/bush detail; nearby grass, houses and collision unchanged |
| Leave city and forest for over 30 seconds, revisit | Idle resources retire and reload correctly; no stale materials or missing trees |
| Rapid teleport and floating-origin rebase | Late atlas completions released, active/pending resources protected |
| Cave entry and exit | Existing separate scene behavior, no surface resource regressions |
| Repeated cold/warm traversal | Memory plateaus or decreases; no device loss, shader errors, missing materials or sustained hitch regression |

Inspect actual WGSL/WebGPU validation and output of the new conditional atlas sampling branches, including steep surfaces, derivative-sensitive sampling and mixed boundaries. Do not enable the terrain option if validation or visuals regress.

Record renderer memory, texture and geometry counts, frame P50/P95/P99/P99.9, worst streaming frame, shader preparation failures, screenshots and resource counters:
- regionalRendererAccountedBytes, regionalRendererBudgetExceededBytes, regionalRendererAccountingAvailable
- regionalTrackedTextureBytes, regionalTextureBudgetExceededBytes, regionalTextureEvictions, regionalTextureBytesEvicted
- regionalIdleResourceRetirements, regionalTreePoolsAllocated, regionalImpostorAtlases, treeImpostorAtlasBytes, regionalTownKitEvictions
- regionalFarGrassReachFactor, regionalSceneryLodFactor, regionalTreeSourceLeasesReleased, draw calls and triangles

Accept only with no new failures, no visible regressions except explicitly enabled far-card reach reduction and distant LOD changes, no collision/placement changes, no unbounded memory increase and better or neutral frame tails. Use the existing RTX 4080 performance targets from the hitch testing guide. Test WebGL fallback separately.

## Third-pass acceptance

### Scenery pressure

The existing hysteretic pressure sample drives grass-card reach and a separate projected-LOD factor for trees, rocks and bushes. Higher near/proxy thresholds select cheaper representations before the baseline would, without moving the terminal visibility threshold. Where the configured radii collapse two bands, that layer may have no savings. The protected ring covers both streaming focus and actual canonical camera; the existing force-near policy is not overridden. Building, blade and physical placement systems are not modified. The controller is still a soft global pressure signal, not a hard per-cell quota.

1. Run the control and candidate on identical dense city/forest/rock routes, including a city approach with a camera offset from the predictive focus. Log the LOD counts by band, renderer draws and triangles, grass reach, scenery factor and frame tails.
2. Force pressure in a separate test YAML using low but valid triangle/draw thresholds; verify both factors enter pressure, remain stable through the hysteresis band, and recover on a low-load route. Restore production YAML afterwards.
3. Verify protected rings against an offset and rebased camera, close-up silhouette, trunk/root collision, rock and bush contact, near blade interaction, houses, and terrain grounding. Test LOD transitions with and without tree impostors.
4. Test disabled LOD and collapsed radius settings: no unintended representation changes, no changed placements and no new culling holes.

### Source scene ownership

With only regionalTreeSourceRelease enabled, bootstrap takes explicit reference-counted scene leases and builds the same ordered CPU prototypes. Standard source materials are detached, sharing decoded texture image data while owning distinct texture objects; source channels are deduplicated by source texture identity. Unknown node or shader materials conservatively retain source scene leases. Successful detached bootstrap releases its leases; any other cache consumer keeps its own reference. This does not eliminate initial GLB downloads or CPU prototype geometry.

Compare cold startup, prototype signatures, all authored tree species, snow on leaves, painted crowns, alpha cutouts, bark normal/height/roughness, deadwood and tree-impostor integrity with the flag off/on. Capture browser heap snapshots after initialization and after repeated world reloads; compare retained scene objects, buffer arrays and texture source objects, not only GPU bytes. Verify optional variant failures, abort during startup, shared GLBs also needed by rocks, and repeated disposal. Count releases as lease release attempts, not proof of unique scenes freed. Source-owned texture data still referenced by rendered prototypes must remain alive.

### Terrain atlas lifetime

The shared family atlas remains intact. It packs all four material families with five world-noise layers to stay inside the terrain sampler limit. Existing QA reports under docs/qa/ponlai-pr-i-phase-i3-2026-11-21/logs/perf-on.json and adjacent captures reported terrainMaterialFamilyAtlasBytes = 458752 (448 KiB). Duplicating the noise payload across regional atlases is therefore not justified without measured net savings.

The shared noise subscription now returns an unsubscribe callback; final atlas lease disposal and ground-contact disposal cancel pending subscriptions. Failed decoding clears subscribers, no-decoder environments retain neutral fields without registering callbacks, and a failing consumer does not prevent other consumers receiving the decoded noise. Test cold startup with delayed and failed noise fetches, immediate material disposal, rapid world transitions, and recovery. Verify a disposed atlas never receives a late upload and live atlases still receive their noise.

### Validation performed in editing environment

Isolated executions of the fetched JavaScript source passed: scenery threshold/terminal visibility, pressure hysteresis/recovery, canonical focus protection, detached texture identity/unsupported material fallback, configuration validation (mocked URLSearchParams), three world-noise lifecycle scenarios (mocked browser/texture APIs), and the extracted chunk-plan integration (distant near-to-proxy with protected ring intact). Repository regression tests were added or extended but the full Node/npm test runner, Three.js integration, production build, asset validation and GPU acceptance were not executed here. No FPS or memory improvement is claimed.

## Scope and outstanding work

Terrain profiles omit grass-detail, arid and glacier-specific nodes when eligible, but retain dynamic snow/weather and forest shading. The terrain family atlas remains shared: conditional sampling avoids unnecessary projections, not allocation of individual terrain layers. Owned inactive terrain/water slot textures may be retired and re-created. Tree renderer pools and impostor textures are demand-driven; source scene release removes unnecessary post-bootstrap GLB scene ownership but retains required prototype geometry and texture sources. Renderer-accounted memory is not driver VRAM and cannot enforce a hard cap on active allocations. Material disposal cannot guarantee immediate driver pipeline eviction.

- TODO: Only split terrain material families if a measured atlas inventory shows material memory savings exceed duplicated noise, pipeline and upload costs. Preserve the existing array sampler count and dynamic weather/unknown-biome fallback. Verify mixed biome boundaries, exact family variant indices and WebGL fallback before enabling.
- TODO: True on-demand tree source GLBs require a generated versioned metadata catalog before changing startup. Record stable prototype IDs/indices in the original authored order, species/tile/age eligibility, dimensions, placement/collision footprints, proxy geometry references, source hashes and impostor signatures. Build the catalog offline with the same extraction code. Start from catalog/proxies, stream detailed sources only when near-band demand appears, publish via the existing budgeted queue and discard superseded loads. Keep fallback for missing/stale catalog and preserve identity on retries and eviction. Do not replace collision shapes or re-number prototypes when a GLB is absent.
- TODO: Extend shared pressure into a spatial scenery budget by reporting per-cell cost and demand from town tiers, vegetation, rocks, and environmental effects. Select cheapest acceptable representation with protected gameplay geometry, stable priority/hysteresis, bounded publication and fair recovery. Measure candidate decisions, requested versus accepted triangles/draws, local over-budget reasons and visual results; don't hide required water, houses or nearby blades. This is not yet a hard regional quota.

Full browser and hardware acceptance remains required before enabling any experimental flags by default.
