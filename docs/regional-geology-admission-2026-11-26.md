# Regional geology and location decoration admission

Control: be466c281a14ec84f412e1f5f49ac002828353db. A/B the same final candidate SHA with flags off and on. No GitHub Actions.

## Activation

```text
?regionalGeologyAdmission=1
?locationDecorationAdmission=1
?regionalGeologyAdmission=1&locationDecorationAdmission=1
```

```yaml
regionalGeologyAdmission: false
locationDecorationAdmission: false
geologyAdmissionBudget:
  triangleBudget: 100000
  protectMeters: 64
  minimumScaleMultiplier: 24
  maxExtraDraws: 8
  recoveryRatio: 0.85
locationDecorationBudget:
  cellMeters: 24
  protectMeters: 24
  maxDistanceMeters: 100
  triangleBudget: 60000
  drawBudget: 24
  recoveryMeters: 4
  boundsPaddingMeters: 1
  refreshMeters: 1
```

Both flags are off by default. The geology flag independently enables the existing spatial geology LOD meshes; no separate geologyLod flag is required. Compare geologyLod=1 with regionalGeologyAdmission=0/1 to isolate adaptive selection from the existing spatial LOD implementation. Values are initial estimated geometry targets, not hardware-calibrated GPU limits.

## Outdoor geology

- AlpineRockView, GlacierSeracView and IcebergView retain existing CellResidency, path clearance, terrain placement, scale, seed, capacity, render order, materials, collision behavior and shared instance publication gate. No new placement removal.
- The existing near/far geometry and sector batches are reused. The planner computes triangle cost from actual geometry index or position counts and drawRange, retaining the original per-kind capacity and baseline placement iteration order.
- Preserve the existing baseline distance/scale hysteresis; extend the minimum near distance to 64 m plus the existing focus refresh margin. Under pressure, only known nonempty cheaper far representations are selected. Protect at least 64 m plus the refresh margin and a size-sensitive extent × 24 distance. Prefer the largest normalized distance, then triangle savings.
- The target is 100000 main-pass triangles per geology view (crags, icebergs, seracs independently), before frustum culling. Up to eight additional nonempty draw groups relative to baseline are permitted per view. Protected geometry can exceed the target: overflow is reported. Recovery uses an 85% threshold to reduce repeated switching; no guarantee against individual tier popping.
- Keep the baseline tier history separate from adaptive choices. The planner runs on the existing publication/write path, not every stationary frame. The existing write still estimates the maximum publication size and commits synchronously, so rebuild spikes and capacity headroom need measured acceptance. Unknown cost is counted, not treated as a basis for further demotion.
- Existing far-sector allocation can increase GPU memory/draw groups versus geologyLod=0. No new per-chunk lazy resource retirement or actual GPU-millisecond feedback is included. No global geology quota shared with vegetation or towns.

## Instanced locations

The existing LocationRuntime renders one separate LocationScene instead of the world and disposes the outgoing scene. Entrance, exit, density-grid surface, bake data, nav and collision ownership remain untouched.

Only three explicit non-colliding generated detail layers participate: hoarfrost needles, alpine tundra sedge and tundra lichen. Hero crystal clusters, cobbles, ice shards, authored props, mine support timbers, doors, terrain, water, lighting, particles and navigation retain their existing paths. This applies to sites that actually generate the eligible layers, not every cave.

- Partition the existing deterministic records into 24 m three-dimensional cells before instanced geometry creation. Preserve every record and its transform, per-instance baked lighting and material. Each batch gets a conservative computed bounding sphere with 1 m padding (including flora sway) and normal renderer frustum culling. Missing/invalid coordinates or bounds remain on a conservative non-admitted path.
- The controller collects only explicitly tagged generator-owned meshes once. At runtime it reserves batches whose sphere edge is within 24 m plus a 1 m movement margin, even if the budget is exceeded. Optional batches are selected nearest-first within 100 m, with 4 m retention hysteresis. Per-location quota: 60000 estimated triangles and 24 admitted batches. Protected overflows are reported rather than removing protected batches. Distances are 3D, allowing vertically separated cave levels to be treated independently.
- Reevaluate after 1 m cumulative camera movement, including teleports. Visibility changes do not regenerate geometry or upload instance matrices. Static cell batching adds draw groups and duplicates prototype geometry per cell; the draw quota limits only the admitted optional groups, not the whole location or initial allocation. Frustum culling is not room/portal occlusion. Unselected decoration may still affect SSR differently.
- Resource ownership remains with the location; disposal now also calls InstancedMesh.dispose to release instance-specific renderer resources. No mid-location texture/material/geometry eviction, asynchronous site preparation changes or portal occlusion is introduced.

## Diagnostics

World performance counters: geologyAdmission.crags/icebergs/seracs.{requested,selected,requestedDraws,selectedDraws,simplified,unknown,overflow}. These reflect the last published view selection and exclude other materials/passes and actual frustum visibility.

Location counters: locationDecoration.{requested,selected,draws,protectedCount,overflow,drawOverflow}. These are current admitted batch estimates before frustum culling. Reset on location disposal. The existing world perf capture path may not record active-location frames; use location renderer instrumentation and screenshots for actual location metrics.

## Validation

11 isolated regression cases passed against the committed config, geology planner, batch selection and location controller source with mocked mesh bounds and URL parsing. Covers cheaper geometry, protection and movement margin, unknown cost, capacity, draw limit, recovery, legacy flags, 3D partitioning, protected overflow, distance retention, structural exclusion, refresh/disposal and validation.

Full npm tests, lint, build, actual Three.js geometry construction, shader compilation, visual acceptance and hardware benchmarks were not run.

```sh
npm ci
node --test test/regional-geology-admission.test.js
npm run lint
npm test
npm run build
```

Use identical final SHA, scene seed, quality, route, viewport, driver and backend on RTX 4080 WebGPU and WebGL fallback. Test flags independently and together with existing admission flags. Record P50/P95/P99/P99.9, GPU pass timings, actual draws/triangles, memory/instance buffers, upload bytes, overflow counters and screenshots.

| Scenario | Acceptance |
| --- | --- |
| Mountain approach, snowy ridges and glaciers | No missing crags/seracs, preserve near detail, path clearance and silhouette |
| Cold coast and icebergs | Stable positions and water interactions; cheaper distant geometry only under the configured demand |
| Tight geometry/draw budget | Protected overflows reported; no additional placement omission |
| Movement and origin rebase | Correct transforms and eventual near detail; no persistent holes |
| Frostgard ice cave and alpine site | Needles/sedge/lichen spatially bounded; hero crystals, structures, bake, nav and exits unchanged |
| Multi-level cave and teleport | Nearest 3D batches recover; distant optional batches may be culled |
| Repeated location entry/exit | No instance resource leak; compare renderer memory and retained allocations |
| Flags off | Existing rendering and quality selection maintained |

Reject visual defects, navigation changes or frame-tail regressions. Keep flags opt-in until accepted hardware measurements.

## Remaining work

- TODO: region-aware lazy geometry/material retirement, actual GPU timing feedback, global admission across geology and other layers, and resumable/byte-exact geology publication.
- TODO: room/portal visibility and spatial structural mesh residency only with verified topology, collision separation and baked lighting continuity. Do not hide structural cave walls based on distance alone.
- TODO: atmospheric pass admission and spatial performance overlay.
