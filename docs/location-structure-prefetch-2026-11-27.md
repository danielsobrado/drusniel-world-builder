# Predictive closed-location geometry prefetch

Base: 816543d1baad2c8e6af6ab092d8c01fe552ea0fc. No GitHub Actions.

## Activation

```text
?locationStructureStreaming=1&locationStructurePrefetch=1
```

Both flags default off. The second flag is independent and has no effect without structural streaming. YAML settings live under locationStructureBudget. The closed-location eligibility, reflector exclusions and pinned r187 WebGPU checks remain in place.

## Implementation

- Sample camera world position and structural bounds at the existing interval. Estimate one second of movement from the last two samples, capped at 28 m. Reject stale samples and teleport-sized deltas. Protect offscreen sections within the original protection distance plus 28 m, around the current or predicted position.
- Prioritize eligible uninitialized offscreen sections by proximity to either position. Keep one in-progress section. Recheck the actual camera frustum and distance every frame before advancing an upload. Cancel detached work on a turn into the frustum, a geometry initialized by Three, or a region/camera change. Normal rendering takes precedence and structural meshes are never hidden.
- Reuse StagedGeometryUploads with a static attribute threshold of one byte for this caller only. The surface scheduler retains its existing threshold and behavior. The separate cave render loop owns its own uploader; it does not execute the surface deferred-work scheduler while inside a location.
- Default limits: 256 KiB aligned writeBuffer payload, two new detached allocations and a cooperative 1 ms CPU deadline per location frame; 32 MiB tracked detached storage. One GPU allocation is indivisible. The deadline cannot interrupt a running driver call. These are prefetch budgets, not a hard cap on the renderer or urgent uploads.
- Before adoption, register the geometry with the r187 Geometries manager so disposal owns every installed attribute even if the section never appears in a draw. Only stage sections with supported complete attribute layouts. Capacity/layout failure rejects a section for the current location lifetime and falls back to ordinary rendering. A synchronous backend failure disables prefetch and cleans up detached work; residency remains available.
- Completed offscreen geometry is subject to the existing cold eviction rules once outside the predictive protection region. Scene disposal cancels detached work and disposes registered geometries. Neither CPU mesh generation nor material/shader preparation has been changed.

## Diagnostics

locationStructure.prefetchCandidates, locationStructure.prefetchCompleted, locationStructure.prefetchCancelled, locationStructure.prefetchFailures, locationStructure.prefetchDetachedBytes, locationStructure.prefetchAllocations, locationStructure.prefetchSlicedBytes, locationStructure.prefetchAdoptedBuffers, locationStructure.prefetchFallbacks and locationStructure.prefetchFallback.*. Generic stagedGeometry counters also include this work; do not double-count. The existing resident gauge is sampled before prefetch advancement.

## Validation

```sh
npm ci
node --test test/location-structure-streaming.test.js test/location-structure-prefetch.test.js test/staged-geometry-uploads.test.js
npm run lint
npm test
npm run build
```

Compare three runs on the same commit: both switches off, structural streaming alone, structural streaming with prefetch. Use identical seeds, route, renderer, resolution and browser focus. Record entry, first visit, backtracking, walking across section boundaries, abrupt 180-degree turns, teleport, exit/re-entry and repeated GPU eviction/recreation. Capture P50/P95/P99/P99.9 frame times, peak frame time, prefetch cancellations/fallbacks, actual upload bytes, allocations, detached bytes and renderer VRAM.

Acceptance: no missing walls, floors, ceilings or lighting differences; no GPU validation errors or unreleased detached buffers; prefetch slice and allocation counters within configured limits; fewer cold offscreen upload spikes without unacceptable memory growth. Check offscreen adopted sections that never receive a draw and repeated eviction/recreation on actual r187 WebGPU. Tests use mocked renderer ownership and real Three geometry types; they do not replace hardware validation.

## Remaining limitations

- Visible cold geometry still uses ordinary Three initialization. Sudden teleports, turns beyond the protection radius, initial entry and GPU allocation/shader costs can still hitch.
- The extended protection radius can increase resident VRAM; there is no hard total-resident-byte cap. Prefetch can also upload sections behind walls because the project has no validated visibility portals.
- CPU generation, baking, portal visibility and surface reclamation remain unchanged. Keep the flags off by default pending actual browser and hardware validation.
