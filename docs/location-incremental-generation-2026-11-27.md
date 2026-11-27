# Incremental closed-location surface generation — first stage

Base: 022425c74f5ba88f5a81c6fbb40a4a1e7fcbf466. No GitHub Actions.

## Activation

```text
?locationStructureStreaming=1&locationIncrementalGeneration=1
?locationStructureStreaming=1&locationIncrementalGeneration=1&locationGenerationWorker=0
```

The optional asynchronous path is limited to the existing eligible closed structural locations. It defaults off. The rolling surface-net index is used by both synchronous and asynchronous extraction, including existing open and ice generation paths; output parity is required.

## Implementation

- Replace the full-volume cell-to-vertex lookup (4 * nx * ny * nz bytes) with two rolling Z planes (8 * nx * ny bytes). Global vertex indices, scan order, winding, normals, degenerate rejection and shared boundary topology are unchanged. No duplicate boundary vertices or local normal approximations.
- Expose the same algorithm as a cooperative iterator. Yield after each voxel row, every 1024 normals and every 1024 triangles during winding and degenerate rejection. The synchronous API drains the same iterator.
- When enabled, generate a bounded density snapshot, copied in 1 MiB pieces with cooperative yields, then transfer its backing buffer to a dedicated module worker. Return positions, normals and indices through transferable arrays. The original density grid remains intact for collision, lighting, shading, and portals. No SharedArrayBuffer requirement or concurrent writes to the authoritative density field.
- Use a 64 MiB default density-copy cap. Larger volumes, disabled workers, worker initialization failure, malformed response, or a 120-second worker timeout use the same cooperative extraction on the main thread. Terminate the one-shot worker on success or failure.
- Supply the prepared surface to the existing builder, before the existing smoothing, material classification, lighting, prop baking and spatial partitioning. The loading screen remains active; publication still waits until all geometry is ready. No missing geometry at entry.
- Cooperative fallback targets a 4 ms slice. Row work, allocations, typed-array conversions and scheduler delays are indivisible, so this is not a strict maximum frame time.

## Validation

A source-level comparison executed the previous and updated surface extractors over 60 seeded synthetic density volumes with varying dimensions. Positions, normals and indices were exactly equal for every case. The comparison used deterministic synthetic gradient functions and did not exercise actual site generation or browser workers.

```sh
npm ci
node --test test/location-surface-preparation.test.js test/location-structure-streaming.test.js test/location-portal-visibility.test.js
npm run lint
npm test
npm run build
```

Compare identical site/seed/quality configurations using legacy activation, worker mode, and forced cooperative mode. Measure total loading time, longest main-thread task, loading UI responsiveness, peak process memory, worker startup/transfer time, mesh counts and exact geometry/lighting output. Check Mine, Cavern City, ice, open mountain, and reflective locations. Exercise worker creation failure, timeout and repeated location entry. Inspect boundaries and baked illumination at different Z slices. No hardware performance result is claimed.

Counters: locationGeneration.workerCompleted, locationGeneration.workerFallbacks, locationGeneration.cooperativeRuns, locationGeneration.surfaceMs (elapsed wall time including yields).

## Remaining work

This is the incremental **surface extraction** stage, not full progressive cave streaming. The authored generator still synchronously carves and roughens the complete authoritative density grid; navigation and props are still generated together. Worker mode adds a temporary density copy and does not cap total memory. The entire mesh remains available before entry, and the full lighting and prop bake is synchronous.

TODO: isolate deterministic authored density operations into a serializable generation contract before parallel or sparse density generation.
TODO: incremental lighting bake with global occlusion and bounce dependencies preserved.
TODO: entry-prioritized chunk readiness, navigation gating and staged geometry publication before allowing exploration of unprepared regions.
TODO: benchmark worker memory overhead and main-thread latency; measure the synchronous rolling-slice path for regressions before broad rollout.

## Lifecycle follow-up

Pending snapshot copying, cooperative extraction and worker execution now accept an AbortSignal owned by the location runtime. Disposing the runtime aborts preparation, terminates the worker without fallback, and prevents a stale prepared scene from activating. This does not interrupt synchronous generator or lighting code. Three cancellation regression cases are added; they have not been executed in the connector environment.
